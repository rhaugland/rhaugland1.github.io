import Redis from "ioredis";
import { logger } from "./logger";
import { listenerQueue, analystQueue, builderQueue, reviewerQueue, postmortemQueue } from "./queues";

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

  // workers will be registered here as they're built in plans 2-5
  logger.info("slushie worker is running. waiting for events...");

  // graceful shutdown
  const shutdown = () => {
    logger.info("shutting down workers...");
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error(err, "worker failed to start");
  process.exit(1);
});
