import { Worker, Job } from "bullmq";
import { prisma } from "@slushie/db";
import type { TeamApprovedEvent, ClientNotifiedEvent, TrackerUpdateEvent } from "@slushie/events";
import { createEventQueue } from "@slushie/events";
import { logger } from "../logger";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const trackerQueue = createEventQueue("tracker");
const notificationQueue = createEventQueue("notification");

export function createDeliveryWorker() {
  const worker = new Worker<TeamApprovedEvent>(
    "delivery",
    async (job: Job<TeamApprovedEvent>) => {
      const event = job.data;
      const { pipelineRunId } = event;

      const workerLogger = logger.child({ pipelineRunId });
      workerLogger.info("processing delivery after team approval");

      // get tracker for prototype nanoid
      const tracker = await prisma.tracker.findUnique({
        where: { pipelineRunId },
      });

      if (!tracker) {
        workerLogger.error("no tracker found");
        throw new Error(`no tracker found for pipeline run ${pipelineRunId}`);
      }

      // get client name
      const pipelineRun = await prisma.pipelineRun.findUnique({
        where: { id: pipelineRunId },
        include: { client: { select: { name: true } } },
      });

      const clientName = pipelineRun?.client.name ?? "client";
      const prototypeUrl = tracker.prototypeNanoid
        ? `app.slushie.agency/preview/${tracker.prototypeNanoid}`
        : null;

      // update tracker to step 5 — "ready to serve"
      const trackerEvent: TrackerUpdateEvent = {
        type: "tracker.update",
        pipelineRunId,
        timestamp: Date.now(),
        data: {
          step: 5,
          label: "ready to serve",
          subtitle: "your tool is live. take a sip.",
        },
      };
      await trackerQueue.add("tracker.update", trackerEvent);

      // send delivery notification to dev chat — spec copy
      const notificationEvent: ClientNotifiedEvent = {
        type: "client.notified",
        pipelineRunId,
        timestamp: Date.now(),
        data: {
          clientName,
          trackerUrl: `slushie.agency/track/${tracker.slug}`,
          prototypeUrl: prototypeUrl ?? undefined,
          message: prototypeUrl
            ? `your tool is ready! take a look: ${prototypeUrl}`
            : "your tool is ready! your slushie contact will share the link with you.",
        },
      };
      await notificationQueue.add("client.notified", notificationEvent);

      // mark pipeline as completed
      await prisma.pipelineRun.update({
        where: { id: pipelineRunId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      workerLogger.info("delivery complete — tracker updated and client notified");
    },
    { connection: getRedisConnection() }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "delivery worker job failed");
  });

  logger.info("delivery worker registered");
  return worker;
}
