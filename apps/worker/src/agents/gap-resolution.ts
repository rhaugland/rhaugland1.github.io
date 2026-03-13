import { Queue } from "bullmq";
import { prisma } from "@slushie/db";
import { createEvent, type SlushieEvent } from "@slushie/events";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";
import Redis from "ioredis";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const MAX_STANDARD_CYCLES = 2;
const MAX_EXTRA_CYCLES = 1; // 1 extra if score < 60
const LOW_SCORE_THRESHOLD = 60;

interface ResolutionState {
  pipelineRunId: string;
  cyclesCompleted: number;
  maxCycles: number;
  scores: number[];
}

// in-memory state per pipeline run
const resolutionStates = new Map<string, ResolutionState>();

/**
 * called by the pipeline orchestrator after the initial prototype.ready event.
 * starts the gap resolution loop.
 */
export function initResolution(pipelineRunId: string): void {
  resolutionStates.set(pipelineRunId, {
    pipelineRunId,
    cyclesCompleted: 0,
    maxCycles: MAX_STANDARD_CYCLES,
    scores: [],
  });
}

/**
 * called when a review.complete event arrives during gap resolution.
 * decides whether to continue resolution or finalize.
 */
export async function handleResolutionReview(
  event: SlushieEvent,
  analystQueue: Queue<SlushieEvent>,
  reviewerQueue: Queue<SlushieEvent>
): Promise<void> {
  const log = createAgentLogger("gap-resolution", event.pipelineRunId);
  const { coverageScore, version, gapReportId } = event.data as {
    coverageScore: number;
    version: number;
    gapReportId: string;
    gapCount: number;
  };

  let state = resolutionStates.get(event.pipelineRunId);
  if (!state) {
    // initialize if not found (recovery case)
    state = {
      pipelineRunId: event.pipelineRunId,
      cyclesCompleted: 0,
      maxCycles: MAX_STANDARD_CYCLES,
      scores: [],
    };
    resolutionStates.set(event.pipelineRunId, state);
  }

  state.cyclesCompleted++;
  state.scores.push(coverageScore);

  log.info(
    {
      cycle: state.cyclesCompleted,
      maxCycles: state.maxCycles,
      coverageScore,
      version,
    },
    "gap resolution cycle completed"
  );

  // check if we need an extra cycle for low scores
  if (
    coverageScore < LOW_SCORE_THRESHOLD &&
    state.maxCycles === MAX_STANDARD_CYCLES
  ) {
    state.maxCycles = MAX_STANDARD_CYCLES + MAX_EXTRA_CYCLES;
    log.warn(
      { coverageScore, newMaxCycles: state.maxCycles },
      "low coverage score — adding extra resolution cycle"
    );
  }

  // check if we're done
  if (state.cyclesCompleted >= state.maxCycles) {
    log.info(
      {
        cyclesCompleted: state.cyclesCompleted,
        finalScore: coverageScore,
        allScores: state.scores,
      },
      "gap resolution complete"
    );

    // if still below 60 after all cycles, flag for human review
    if (coverageScore < LOW_SCORE_THRESHOLD) {
      log.warn(
        { coverageScore },
        "coverage still below 60 after max cycles — escalating to human review"
      );
    }

    await publishEvent(
      createEvent("resolution.complete", event.pipelineRunId, {
        cyclesCompleted: state.cyclesCompleted,
        finalPrototypeVersion: version,
      })
    );

    resolutionStates.delete(event.pipelineRunId);
    return;
  }

  // continue: send review.complete to analyst to update spec
  // the analyst worker listens for review.complete and produces build.spec.updated
  // the builder worker listens for build.spec.updated and produces prototype.patched
  // the reviewer worker listens for prototype.patched and produces review.complete
  // this chain is already wired — we just need to enqueue the review.complete for the analyst
  log.info(
    { nextCycle: state.cyclesCompleted + 1 },
    "continuing gap resolution — triggering analyst spec update"
  );

  await analystQueue.add("review.complete", event);
}

/**
 * returns true if the given pipeline run is currently in gap resolution.
 */
export function isInResolution(pipelineRunId: string): boolean {
  return resolutionStates.has(pipelineRunId);
}

export function getResolutionState(pipelineRunId: string): ResolutionState | undefined {
  return resolutionStates.get(pipelineRunId);
}
