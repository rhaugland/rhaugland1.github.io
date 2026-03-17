import { Worker, Job, Queue } from "bullmq";
import { prisma } from "@slushie/db";
import {
  createEvent,
  type SlushieEvent,
  type CallEndedEvent,
} from "@slushie/events";
import { publishEvent } from "../publish";
import { createAgentLogger, logger } from "../logger";
import { createWorkspace, getWorkspace, writeWorkspaceFile } from "./workspace";
import { initResolution, handleResolutionReview, isInResolution } from "./gap-resolution";
import {
  analystQueue,
  builderQueue,
  reviewerQueue,
  PHASE_TIMEOUTS,
} from "../queues";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

async function isBuildPaused(pipelineRunId: string): Promise<boolean> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    select: { buildPaused: true },
  });
  return run?.buildPaused ?? false;
}

/**
 * the pipeline orchestrator is a single worker that subscribes to all lifecycle events
 * and routes them to the appropriate agent queues.
 *
 * event flow:
 *   call.ended → analyst queue
 *   build.spec.ready → builder queue
 *   prototype.ready (v1) → reviewer queue + init gap resolution
 *   review.complete (during resolution) → gap-resolution orchestrator → analyst queue
 *   build.spec.updated → builder queue
 *   prototype.patched → reviewer queue
 *   resolution.complete → final review trigger
 *   final.review.complete → internal.preview.ready
 */
export function createPipelineOrchestrator() {
  return new Worker<SlushieEvent>(
    "pipeline",
    async (job: Job<SlushieEvent>) => {
      const event = job.data;
      const log = createAgentLogger("pipeline", event.pipelineRunId);

      switch (event.type) {
        case "call.ended": {
          log.info("pipeline: call ended — starting phase 2 (analysis)");
          await setupWorkspace(event as CallEndedEvent);
          await analystQueue.add("call.ended", event);
          break;
        }

        case "build.spec.ready": {
          if (await isBuildPaused(event.pipelineRunId)) {
            log.info({ pipelineRunId: event.pipelineRunId }, "build paused, skipping builder dispatch");
            break;
          }
          log.info("pipeline: build spec ready — starting phase 3 (initial build)");
          await builderQueue.add("build.spec.ready", event);
          break;
        }

        case "prototype.ready": {
          const { version } = event.data as { version: number; prototypeId: string; previewUrl: string };
          if (version === 1) {
            log.info("pipeline: prototype v1 ready — advancing tracker to step 2 (schedule discovery)");

            // advance tracker from step 1 (intake build) to step 2 (schedule discovery)
            const tracker = await prisma.tracker.findFirst({
              where: { pipelineRunId: event.pipelineRunId },
            });
            if (tracker) {
              const steps = tracker.steps as Array<{
                step: number; label: string; subtitle: string; status: string; completedAt: string | null;
              }>;
              const updatedSteps = steps.map((s, i) => ({
                ...s,
                status: i === 0 ? "done" : i === 1 ? "active" : s.status,
                completedAt: i === 0 && !s.completedAt ? new Date().toISOString() : s.completedAt,
              }));
              await prisma.tracker.update({
                where: { id: tracker.id },
                data: { currentStep: 2, steps: updatedSteps },
              });
            }

            // notify the client that v1 is ready for review
            try {
              const webUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
              await fetch(`${webUrl}/api/internal/notify-v1-ready`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pipelineRunId: event.pipelineRunId }),
              });
            } catch (emailErr) {
              log.error(emailErr, "pipeline: failed to send v1 ready email");
            }

            // don't auto-start gap resolution — wait for employee to complete a review meeting
            // the gap analysis will be triggered via gap.meeting.complete event
          }
          break;
        }

        case "gap.meeting.complete": {
          const { prototypeId, meetingNotes } = event.data as {
            prototypeId: string;
            version: number;
            meetingNotes: string | null;
          };

          log.info("pipeline: gap meeting complete — starting gap resolution");

          // write meeting notes to workspace so reviewer can use them
          if (meetingNotes) {
            const workspace = await getWorkspace(event.pipelineRunId);
            await writeWorkspaceFile(
              `${workspace.root}/gap-meeting-notes.txt`,
              `CLIENT REVIEW MEETING NOTES:\n${meetingNotes}\n`
            );
          }

          // now start gap resolution
          initResolution(event.pipelineRunId);

          // create prototype.ready event for the reviewer
          const reviewEvent = createEvent("prototype.ready", event.pipelineRunId, {
            prototypeId,
            version: 1,
            previewUrl: `app.slushie.agency/preview/${event.pipelineRunId}`,
          });
          await reviewerQueue.add("prototype.ready", reviewEvent);
          break;
        }

        case "prototype.patched": {
          log.info("pipeline: prototype patched — sending to reviewer");
          await reviewerQueue.add("prototype.patched", event);
          break;
        }

        case "review.complete": {
          const { version, coverageScore } = event.data as {
            version: number;
            coverageScore: number;
            gapReportId: string;
            gapCount: number;
          };

          if (isInResolution(event.pipelineRunId)) {
            log.info(
              { version, coverageScore },
              "pipeline: review complete during gap resolution"
            );
            await handleResolutionReview(event, analystQueue, reviewerQueue);
          } else {
            log.info(
              { version, coverageScore },
              "pipeline: review complete — not in resolution, ignoring"
            );
          }
          break;
        }

        case "build.spec.updated": {
          if (await isBuildPaused(event.pipelineRunId)) {
            log.info({ pipelineRunId: event.pipelineRunId }, "build paused, skipping builder patch dispatch");
            break;
          }
          log.info("pipeline: spec updated — triggering builder patch");
          // note: mid-call builder timeout (15 min vs 45 min) is enforced at the
          // worker level via invokeClaudeCode timeoutMs, not here
          await builderQueue.add("build.spec.updated", event);
          break;
        }

        case "resolution.complete": {
          const { finalPrototypeVersion } = event.data as {
            cyclesCompleted: number;
            finalPrototypeVersion: number;
          };

          log.info(
            { finalPrototypeVersion },
            "pipeline: gap resolution complete — v2 ready, advancing to step 5 (client build approval)"
          );

          // update pipeline run status
          await prisma.pipelineRun.update({
            where: { id: event.pipelineRunId },
            data: { status: "COMPLETED" },
          });

          // advance tracker to step 5 (client build approval)
          const trackerRecord = await prisma.tracker.findFirst({
            where: { pipelineRunId: event.pipelineRunId },
          });
          if (trackerRecord) {
            const steps = trackerRecord.steps as Array<{
              step: number; label: string; subtitle: string; status: string; completedAt: string | null;
            }>;
            const updatedSteps = steps.map((s, i) => ({
              ...s,
              status: i <= 3 ? "done" : i === 4 ? "active" : s.status,
              completedAt: i <= 3 && !s.completedAt ? new Date().toISOString() : s.completedAt,
            }));
            await prisma.tracker.update({
              where: { id: trackerRecord.id },
              data: { currentStep: 5, steps: updatedSteps },
            });
          }

          // send email: v2 build ready for client approval
          try {
            const webUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            await fetch(`${webUrl}/api/internal/notify-v1-ready`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pipelineRunId: event.pipelineRunId }),
            });
          } catch (emailErr) {
            log.error(emailErr, "pipeline: failed to send v2 ready email");
          }

          // auto-create generated codebase record
          try {
            const completedRun = await prisma.pipelineRun.findUnique({
              where: { id: event.pipelineRunId },
              select: { clientId: true, callId: true },
            });
            if (completedRun) {
              await prisma.codebase.create({
                data: {
                  clientId: completedRun.clientId,
                  callId: completedRun.callId,
                  source: "generated",
                  path: event.pipelineRunId,
                },
              });
            }
          } catch (err) {
            log.error(err, "pipeline: failed to create generated codebase record");
          }

          log.info("pipeline: build complete and ready to serve");
          break;
        }

        case "final.review.complete": {
          const { gapReportId, coverageScore } = event.data as {
            gapReportId: string;
            coverageScore: number;
            unresolvedGapCount: number;
          };

          log.info(
            { gapReportId, coverageScore },
            "pipeline: final review complete — ready for internal preview"
          );

          await publishEvent(
            createEvent("internal.preview.ready", event.pipelineRunId, {
              prototypeUrl: `app.slushie.agency/preview/${event.pipelineRunId}`,
              gapReportId,
            })
          );

          // update tracker
          await publishEvent(
            createEvent("tracker.update", event.pipelineRunId, {
              step: 5,
              label: "ready to serve",
              subtitle: "your tool is live. take a sip.",
            })
          );

          // auto-create generated codebase record
          try {
            const completedRun = await prisma.pipelineRun.findUnique({
              where: { id: event.pipelineRunId },
              select: { clientId: true, callId: true },
            });
            if (completedRun) {
              await prisma.codebase.create({
                data: {
                  clientId: completedRun.clientId,
                  callId: completedRun.callId,
                  source: "generated",
                  path: event.pipelineRunId,
                },
              });
            }
          } catch (err) {
            log.error(err, "pipeline: failed to create generated codebase record");
          }

          break;
        }

        default:
          log.debug({ type: event.type }, "pipeline: unhandled event type");
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 3,
      settings: {
        backoffStrategy: (attemptsMade: number) => [1000, 10000, 60000][attemptsMade - 1] ?? 60000,
      },
    }
  );
}

async function setupWorkspace(event: CallEndedEvent): Promise<void> {
  const workspace = await createWorkspace(event.pipelineRunId);

  // load call data and write to workspace files
  const call = await prisma.call.findUniqueOrThrow({
    where: { id: event.data.callId },
    include: { client: true },
  });

  await writeWorkspaceFile(
    workspace.transcriptPath,
    call.transcript ?? ""
  );

  await writeWorkspaceFile(
    workspace.coachingLogPath,
    JSON.stringify(call.coachingLog ?? [], null, 2)
  );

  // load team directives for agent context
  const pipelineRun = await prisma.pipelineRun.findUnique({
    where: { id: event.pipelineRunId },
    select: { teamDirectives: true },
  });
  const directives = pipelineRun?.teamDirectives as Array<{ text: string; timestamp: number; sentBy: string }> | null;
  if (directives && directives.length > 0) {
    const directivesText = directives
      .map((d) => `[${new Date(d.timestamp).toISOString()}] ${d.sentBy}: ${d.text}`)
      .join("\n");
    await writeWorkspaceFile(
      `${workspace.root}/team-directives.txt`,
      `TEAM MEMBER FEEDBACK:\n${directivesText}\n`
    );
  }
}
