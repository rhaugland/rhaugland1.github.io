import Redis from "ioredis";
import { prisma } from "@slushie/db";
import { createEvent } from "@slushie/events";
import type { AnalystIncrementalEvent } from "@slushie/events";
import { analystQueue } from "./queues";
import { logger } from "./logger";
import { getFullTranscript } from "./coaching";

const WARMUP_MS = 5 * 60 * 1000; // 5 minutes
const RERUN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const GROWTH_THRESHOLD = 0.2; // 20%

interface SchedulerState {
  pipelineRunId: string;
  warmupTimer: ReturnType<typeof setTimeout> | null;
  rerunInterval: ReturnType<typeof setInterval> | null;
  started: boolean;
}

const activeSessions = new Map<string, SchedulerState>();
let catchupRedis: Redis | null = null;

export function startIncrementalAnalyst(pipelineRunId: string): void {
  if (activeSessions.has(pipelineRunId)) {
    logger.warn({ pipelineRunId }, "incremental analyst already active");
    return;
  }

  const state: SchedulerState = {
    pipelineRunId,
    warmupTimer: null,
    rerunInterval: null,
    started: false,
  };

  // start warm-up timer — first analyst run after 5 minutes
  state.warmupTimer = setTimeout(async () => {
    state.started = true;
    await dispatchAnalystRun(pipelineRunId);

    // start re-run interval after first run
    state.rerunInterval = setInterval(async () => {
      await maybeDispatchRerun(pipelineRunId);
    }, RERUN_INTERVAL_MS);
  }, WARMUP_MS);

  activeSessions.set(pipelineRunId, state);
  logger.info({ pipelineRunId }, "incremental analyst scheduler started, warm-up in 5 min");
}

export function stopIncrementalAnalyst(pipelineRunId: string): void {
  const state = activeSessions.get(pipelineRunId);
  if (!state) return;

  if (state.warmupTimer) clearTimeout(state.warmupTimer);
  if (state.rerunInterval) clearInterval(state.rerunInterval);
  activeSessions.delete(pipelineRunId);
  logger.info({ pipelineRunId }, "incremental analyst scheduler stopped");
}

async function dispatchAnalystRun(pipelineRunId: string): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    select: { buildPaused: true, status: true },
  });

  if (!run || run.status !== "RUNNING") {
    logger.info({ pipelineRunId }, "pipeline not running, skipping analyst run");
    return;
  }

  if (run.buildPaused) {
    logger.info({ pipelineRunId }, "build paused, skipping analyst run");
    return;
  }

  const transcript = getFullTranscript(pipelineRunId);
  if (!transcript || transcript.trim().length === 0) {
    logger.info({ pipelineRunId }, "no transcript yet, skipping analyst run");
    return;
  }

  // save snapshot and timestamp
  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: {
      transcriptSnapshot: transcript,
      lastAnalystRunAt: new Date(),
    },
  });

  // dispatch as analyst.incremental — distinct from call.ended to avoid
  // triggering the full post-call pipeline (workspace setup, tracker init, etc.)
  const event = createEvent<AnalystIncrementalEvent>(
    "analyst.incremental",
    pipelineRunId,
    { transcript, pipelineRunId }
  );

  await analystQueue.add(`incremental-analyst-${pipelineRunId}`, event, {
    attempts: 3,
    backoff: { type: "custom" },
  });

  logger.info(
    { pipelineRunId, transcriptLength: transcript.length },
    "dispatched incremental analyst run"
  );
}

async function maybeDispatchRerun(pipelineRunId: string): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    select: {
      buildPaused: true,
      transcriptSnapshot: true,
      lastAnalystRunAt: true,
      status: true,
    },
  });

  if (!run || run.status !== "RUNNING" || run.buildPaused) return;

  const currentTranscript = getFullTranscript(pipelineRunId);
  if (!currentTranscript) return;

  const previousLength = run.transcriptSnapshot?.length ?? 0;
  const currentLength = currentTranscript.length;

  if (previousLength === 0) {
    await dispatchAnalystRun(pipelineRunId);
    return;
  }

  const growth = (currentLength - previousLength) / previousLength;
  if (growth >= GROWTH_THRESHOLD) {
    logger.info(
      { pipelineRunId, growth: `${(growth * 100).toFixed(1)}%` },
      "transcript grew enough, dispatching analyst re-run"
    );
    await dispatchAnalystRun(pipelineRunId);
  } else {
    logger.debug(
      { pipelineRunId, growth: `${(growth * 100).toFixed(1)}%` },
      "transcript growth below threshold, skipping"
    );
  }
}

// handle catch-up signal from resume endpoint
export function setupCatchupListener(): void {
  catchupRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  catchupRedis.subscribe("control:incremental-analyst");

  catchupRedis.on("message", async (_channel: string, message: string) => {
    try {
      const msg = JSON.parse(message);
      if (msg.action === "catchup" && msg.pipelineRunId) {
        const state = activeSessions.get(msg.pipelineRunId);
        if (state?.started) {
          logger.info({ pipelineRunId: msg.pipelineRunId }, "catch-up analyst run on resume");
          await dispatchAnalystRun(msg.pipelineRunId);
        }
      }
    } catch (err) {
      logger.error(err, "failed to process incremental-analyst control message");
    }
  });
}

// cleanup for graceful shutdown
export function stopCatchupListener(): void {
  if (catchupRedis) {
    catchupRedis.unsubscribe("control:incremental-analyst").catch(() => {});
    catchupRedis.disconnect();
    catchupRedis = null;
  }
  // stop all active sessions (spread to array to avoid mutating during iteration)
  for (const id of [...activeSessions.keys()]) {
    stopIncrementalAnalyst(id);
  }
}
