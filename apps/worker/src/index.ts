import Redis from "ioredis";
import { logger } from "./logger";
import {
  listenerQueue,
  analystQueue,
  builderQueue,
  reviewerQueue,
  postmortemQueue,
} from "./queues";
import { createAnalystWorker } from "./agents/analyst";
import { createBuilderWorker } from "./agents/builder";
import { createReviewerWorker } from "./agents/reviewer";
import { createPipelineOrchestrator } from "./agents/pipeline";
import { createTrackerWorker } from "./workers/tracker.worker";
import { createNotificationWorker } from "./workers/notification.worker";
import { createTrackerInitWorker } from "./workers/tracker-init.worker";

async function main() {
  logger.info("slushie worker starting...");

  // verify redis connectivity
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    await redis.ping();
    logger.info("redis connected");
  } catch (err) {
    logger.error(err, "failed to connect to redis");
    process.exit(1);
  } finally {
    redis.disconnect();
  }

  // log registered queues
  const queues = [listenerQueue, analystQueue, builderQueue, reviewerQueue, postmortemQueue];
  logger.info({ queues: queues.map((q) => q.name) }, "queues registered");

  // start agent workers
  const analystWorker = createAnalystWorker();
  const builderWorker = createBuilderWorker();
  const reviewerWorker = createReviewerWorker();
  const pipelineOrchestrator = createPipelineOrchestrator();

  // register tracker, notification, and tracker-init workers
  const trackerWorker = createTrackerWorker();
  const notificationWorker = createNotificationWorker();
  const trackerInitWorker = createTrackerInitWorker();

  const workers = [analystWorker, builderWorker, reviewerWorker, pipelineOrchestrator, trackerWorker, notificationWorker, trackerInitWorker];

  for (const w of workers) {
    w.on("failed", (job, err) => {
      logger.error(
        { queue: w.name, jobId: job?.id, error: err.message },
        "worker job failed"
      );
    });

    w.on("completed", (job) => {
      logger.info(
        { queue: w.name, jobId: job?.id },
        "worker job completed"
      );
    });
  }

  logger.info(
    { workers: workers.map((w) => w.name) },
    "slushie worker is running. all agents registered."
  );

  // graceful shutdown
  const shutdown = async () => {
    logger.info("shutting down workers...");
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error(err, "worker failed to start");
  process.exit(1);
});
