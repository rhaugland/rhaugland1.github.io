import { Worker, Job, Queue } from "bullmq";
import { prisma } from "@slushie/db";
import {
  createEvent,
  type SlushieEvent,
  type CallEndedEvent,
} from "@slushie/events";
import { publishEvent } from "../publish";
import { createAgentLogger, logger } from "../logger";
import { createWorkspace, writeWorkspaceFile } from "./workspace";
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
          log.info("pipeline: build spec ready — starting phase 3 (initial build)");
          await builderQueue.add("build.spec.ready", event);
          break;
        }

        case "prototype.ready": {
          const { version } = event.data as { version: number; prototypeId: string; previewUrl: string };
          if (version === 1) {
            log.info("pipeline: prototype v1 ready — starting phase 4 (gap resolution)");
            initResolution(event.pipelineRunId);
            await reviewerQueue.add("prototype.ready", event);
          }
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
          log.info("pipeline: spec updated — triggering builder patch");
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
            "pipeline: gap resolution complete — starting phase 5 (final review)"
          );

          // trigger final review: send the final prototype to reviewer
          // find the latest prototype
          const pipelineRun = await prisma.pipelineRun.findUniqueOrThrow({
            where: { id: event.pipelineRunId },
            include: {
              call: {
                include: {
                  analysis: {
                    include: {
                      buildSpecs: {
                        include: { prototypes: true },
                        orderBy: { version: "desc" },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          });

          const latestPrototype =
            pipelineRun.call.analysis?.buildSpecs[0]?.prototypes[0];

          if (latestPrototype) {
            // send to reviewer for final review
            await reviewerQueue.add(
              "prototype.patched",
              createEvent("prototype.patched", event.pipelineRunId, {
                prototypeId: latestPrototype.id,
                version: latestPrototype.version,
                patchSummary: "final review",
              })
            );
          }
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

          break;
        }

        default:
          log.debug({ type: event.type }, "pipeline: unhandled event type");
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 3,
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
}
