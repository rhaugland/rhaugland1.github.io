import { Queue } from "bullmq";
import { logger } from "./logger";

interface ActiveCoachingSession {
  pipelineRunId: string;
  callId: string;
  clientIndustry: string;
  intervalId: NodeJS.Timeout;
}

const activeSessions = new Map<string, ActiveCoachingSession>();

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const coachingQueue = new Queue("coaching", {
  connection: getRedisConnection(),
});

/**
 * start coaching for a call — enqueues a coaching job every 30 seconds.
 */
export function startCoachingScheduler(
  pipelineRunId: string,
  callId: string,
  clientIndustry: string
): void {
  if (activeSessions.has(pipelineRunId)) {
    logger.warn({ pipelineRunId }, "coaching scheduler already active");
    return;
  }

  logger.info({ pipelineRunId, callId }, "starting coaching scheduler (30s interval)");

  const intervalId = setInterval(async () => {
    try {
      await coachingQueue.add(
        `coaching-${pipelineRunId}-${Date.now()}`,
        {
          pipelineRunId,
          callId,
          clientIndustry,
        },
        {
          attempts: 1, // coaching is best-effort — don't retry stale context
          removeOnComplete: 100,
          removeOnFail: 100,
        }
      );
    } catch (err) {
      logger.error(
        { pipelineRunId, error: err },
        "failed to enqueue coaching job"
      );
    }
  }, 30_000); // every 30 seconds per spec

  activeSessions.set(pipelineRunId, {
    pipelineRunId,
    callId,
    clientIndustry,
    intervalId,
  });
}

/**
 * stop coaching for a call.
 */
export function stopCoachingScheduler(pipelineRunId: string): void {
  const session = activeSessions.get(pipelineRunId);
  if (session) {
    clearInterval(session.intervalId);
    activeSessions.delete(pipelineRunId);
    logger.info({ pipelineRunId }, "coaching scheduler stopped");
  }
}
