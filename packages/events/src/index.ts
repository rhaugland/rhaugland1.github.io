import { Queue, Worker, Job } from "bullmq";
import { nanoid } from "nanoid";
import type { SlushieEvent, EventType } from "./types";

export * from "./types";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const DEFAULT_REDIS = getRedisConnection();

export function createEventQueue(name: string) {
  return new Queue<SlushieEvent>(name, {
    connection: DEFAULT_REDIS,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "custom",
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
    settings: {
      backoffStrategy: (attemptsMade: number) => {
        // spec: 1s, 10s, 60s
        const delays = [1000, 10000, 60000];
        return delays[attemptsMade - 1] ?? 60000;
      },
    },
  });
}

export function createEventWorker(
  name: string,
  handler: (event: SlushieEvent) => Promise<void>
) {
  return new Worker<SlushieEvent>(
    name,
    async (job: Job<SlushieEvent>) => {
      await handler(job.data);
    },
    { connection: DEFAULT_REDIS }
  );
}

export function createEvent<T extends SlushieEvent>(
  type: T["type"],
  pipelineRunId: string,
  data: T["data"]
): T {
  return {
    type,
    pipelineRunId,
    timestamp: Date.now(),
    data,
  } as T;
}

export function generateSlug(): string {
  return nanoid(21);
}
