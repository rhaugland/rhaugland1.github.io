import { Worker, Job } from "bullmq";
import { prisma } from "@slushie/db";
import {
  createEvent,
  type PrototypeReadyEvent,
  type PrototypePatchedEvent,
  type SlushieEvent,
} from "@slushie/events";
import { reviewerPrompt } from "@slushie/agents";
import { invokeClaudeCode } from "../claude";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";
import fs from "node:fs/promises";
import { getWorkspace, readWorkspaceFile, writeWorkspaceFile } from "./workspace";
import { PHASE_TIMEOUTS, pipelineQueue } from "../queues";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

export function createReviewerWorker() {
  return new Worker<SlushieEvent>(
    "reviewer",
    async (job: Job<SlushieEvent>) => {
      const event = job.data;

      if (event.type === "prototype.ready" || event.type === "prototype.patched") {
        await handlePrototypeReady(event);
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
      settings: {
        backoffStrategy: (attemptsMade: number) => [1000, 10000, 60000][attemptsMade - 1] ?? 60000,
      },
    }
  );
}

async function handlePrototypeReady(event: SlushieEvent): Promise<void> {
  const log = createAgentLogger("reviewer", event.pipelineRunId);
  const { prototypeId, version } = event.data as {
    prototypeId: string;
    version: number;
  };

  log.info({ prototypeId, version }, "reviewer starting review");

  // update tracker
  await publishEvent(
    createEvent("tracker.update", event.pipelineRunId, {
      step: 4,
      label: "quality check",
      subtitle: "making sure everything blends right.",
    })
  );

  const workspace = await getWorkspace(event.pipelineRunId);

  // ensure manifest content is available in workspace
  const prototype = await prisma.prototype.findUniqueOrThrow({
    where: { id: prototypeId },
  });

  // write manifest to workspace if not already there
  const manifestPath = workspace.manifestPath(version);
  await writeWorkspaceFile(manifestPath, JSON.stringify(prototype.manifest, null, 2));

  // write decision log
  const decisionLogPath = workspace.decisionLogPath(version);
  await writeWorkspaceFile(decisionLogPath, JSON.stringify(prototype.decisionLog, null, 2));

  // check if gap meeting notes exist
  const meetingNotesPath = `${workspace.root}/gap-meeting-notes.txt`;
  let hasMeetingNotes = false;
  try {
    await fs.access(meetingNotesPath);
    hasMeetingNotes = true;
  } catch {}

  const prompt = reviewerPrompt({
    transcriptPath: workspace.transcriptPath,
    buildSpecPath: workspace.buildSpecPath(version),
    manifestPath,
    decisionLogPath,
    outputPath: workspace.gapReportPath(version),
    reviewVersion: version,
    meetingNotesPath: hasMeetingNotes ? meetingNotesPath : undefined,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: PHASE_TIMEOUTS.reviewer,
    pipelineRunId: event.pipelineRunId,
  });

  log.info({ exitCode: result.exitCode }, "reviewer claude code session completed");

  // read gap report
  const reportContent = await readWorkspaceFile(workspace.gapReportPath(version));
  const report = JSON.parse(reportContent);

  // save to database
  const gapReport = await prisma.gapReport.create({
    data: {
      prototypeId,
      version,
      coverageScore: report.coverageScore,
      gaps: report.gaps,
      tradeoffs: report.tradeoffs,
      revisions: report.revisions,
    },
  });

  // publish review.complete
  const reviewCompleteEvent = createEvent("review.complete", event.pipelineRunId, {
      gapReportId: gapReport.id,
      version,
      coverageScore: report.coverageScore,
      gapCount: report.gaps?.length ?? 0,
    });
  await publishEvent(reviewCompleteEvent);
  await pipelineQueue.add("review.complete", reviewCompleteEvent);

  log.info(
    {
      gapReportId: gapReport.id,
      coverageScore: report.coverageScore,
      gapCount: report.gaps?.length ?? 0,
    },
    "reviewer complete"
  );
}
