import { Worker, Job } from "bullmq";
import { prisma } from "@slushie/db";
import { nanoid } from "nanoid";
import type { CallEndedEvent, ClientNotifiedEvent } from "@slushie/events";
import { createEventQueue } from "@slushie/events";
import { logger } from "../logger";
import { TRACKER_STEPS } from "./tracker.worker";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const notificationQueue = createEventQueue("notification");
const trackerQueue = createEventQueue("tracker");

export function createTrackerInitWorker() {
  const worker = new Worker<CallEndedEvent>(
    "tracker-init",
    async (job: Job<CallEndedEvent>) => {
      const event = job.data;
      const { pipelineRunId } = event;
      const { callId, clientId } = event.data;

      const workerLogger = logger.child({ pipelineRunId, callId });
      workerLogger.info("initializing tracker for pipeline run");

      // generate unguessable slugs — nanoid 21 chars per spec
      const slug = nanoid(21);
      const prototypeNanoid = nanoid(21);

      // set expiry 30 days from now per spec
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // initialize all steps as pending with step 1 active
      const initialSteps = TRACKER_STEPS.map((s, i) => ({
        ...s,
        status: i === 0 ? "active" : "pending",
        completedAt: null,
      }));

      // create tracker record
      const tracker = await prisma.tracker.create({
        data: {
          pipelineRunId,
          slug,
          prototypeNanoid,
          currentStep: 1,
          steps: initialSteps,
          expiresAt,
        },
      });

      workerLogger.info({ trackerId: tracker.id, slug }, "tracker created");

      // look up client name
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { name: true },
      });
      const clientName = client?.name ?? "client";

      const trackerUrl = `slushie.agency/track/${slug}`;

      // fire tracker.update for step 1
      await trackerQueue.add("tracker.update", {
        type: "tracker.update",
        pipelineRunId,
        timestamp: Date.now(),
        data: {
          step: 1,
          label: "call complete",
          subtitle: "we heard what you need.",
        },
      } as any);

      // fire client.notified to dev chat — spec copy: cold/blending metaphor
      const notificationEvent: ClientNotifiedEvent = {
        type: "client.notified",
        pipelineRunId,
        timestamp: Date.now(),
        data: {
          clientName,
          trackerUrl,
          message: `hey! thanks for chatting with us today. we're blending your custom tool right now. track the progress here: ${trackerUrl}`,
        },
      };

      await notificationQueue.add("client.notified", notificationEvent);
      workerLogger.info({ trackerUrl }, "initial notification queued");
    },
    { connection: getRedisConnection() }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "tracker-init worker job failed");
  });

  logger.info("tracker-init worker registered");
  return worker;
}
