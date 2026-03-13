import Redis from "ioredis";
import { createEvent } from "@slushie/events";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";

const CONSULTATION_MAX_ROUNDS = 15;
const CONSULTATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 min per round

export interface ConsultationContext {
  pipelineRunId: string;
  currentRound: number;
}

/**
 * sends a design question to the analyst and waits for the answer via redis pub/sub.
 * returns the analyst's answer string, or null if max rounds exceeded.
 */
export async function askAnalyst(
  context: ConsultationContext,
  question: string,
  questionContext: string
): Promise<string | null> {
  const log = createAgentLogger("builder-consultation", context.pipelineRunId);

  if (context.currentRound >= CONSULTATION_MAX_ROUNDS) {
    log.warn(
      { round: context.currentRound },
      "consultation cap reached — builder will use best judgment"
    );
    return null;
  }

  context.currentRound++;
  const roundNumber = context.currentRound;

  log.info({ roundNumber, question }, "builder asking analyst");

  // publish the question
  await publishEvent(
    createEvent("build.design.question", context.pipelineRunId, {
      question,
      context: questionContext,
      roundNumber,
    })
  );

  // wait for the answer via redis pub/sub
  const answer = await waitForAnswer(context.pipelineRunId, roundNumber);

  log.info({ roundNumber, answerLength: answer?.length ?? 0 }, "builder received answer");

  return answer;
}

async function waitForAnswer(
  pipelineRunId: string,
  roundNumber: number
): Promise<string | null> {
  return new Promise((resolve) => {
    const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    const channel = `events:${pipelineRunId}`;

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, CONSULTATION_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      redis.unsubscribe(channel).catch(() => {});
      redis.disconnect();
    }

    redis.subscribe(channel, (err) => {
      if (err) {
        cleanup();
        resolve(null);
      }
    });

    redis.on("message", (_ch: string, message: string) => {
      try {
        const event = JSON.parse(message);
        if (
          event.type === "build.design.answer" &&
          event.data.roundNumber === roundNumber
        ) {
          cleanup();
          resolve(event.data.answer);
        }
      } catch {
        // ignore parse errors
      }
    });
  });
}

export function createConsultationContext(pipelineRunId: string): ConsultationContext {
  return {
    pipelineRunId,
    currentRound: 0,
  };
}
