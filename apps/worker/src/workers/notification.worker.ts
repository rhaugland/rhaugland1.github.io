import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { prisma } from "@slushie/db";
import type { ClientNotifiedEvent } from "@slushie/events";
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

const pubRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

export function createNotificationWorker() {
  const worker = new Worker<ClientNotifiedEvent>(
    "notification",
    async (job: Job<ClientNotifiedEvent>) => {
      const event = job.data;
      const { pipelineRunId } = event;
      const { clientName, message, trackerUrl, prototypeUrl } = event.data;

      const workerLogger = logger.child({ pipelineRunId, clientName });
      workerLogger.info("processing client notification");

      // store notification message in database
      const notification = await prisma.notificationMessage.create({
        data: {
          pipelineRunId,
          clientName,
          message,
          trackerUrl: trackerUrl ?? null,
          prototypeUrl: prototypeUrl ?? null,
        },
      });

      // publish to dev chat channel via redis pub/sub
      const ssePayload = JSON.stringify({
        type: "client.notified",
        id: notification.id,
        pipelineRunId,
        clientName,
        message,
        trackerUrl,
        prototypeUrl,
        createdAt: notification.createdAt.toISOString(),
        timestamp: Date.now(),
      });

      await pubRedis.publish("dev:chat", ssePayload);
      workerLogger.info({ notificationId: notification.id }, "notification stored and published to dev chat");
    },
    { connection: getRedisConnection() }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "notification worker job failed");
  });

  logger.info("notification worker registered");
  return worker;
}
