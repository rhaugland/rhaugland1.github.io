import Redis from "ioredis";
import type { SlushieEvent } from "@slushie/events";
import { logger } from "./logger";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

export async function publishEvent(event: SlushieEvent): Promise<void> {
  const channel = `events:${event.pipelineRunId}`;
  const payload = JSON.stringify(event);

  await redis.publish(channel, payload);

  logger.info(
    {
      type: event.type,
      pipelineRunId: event.pipelineRunId,
    },
    "event published"
  );
}
