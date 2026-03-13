import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { invokeClaudeCode } from "./claude";
import { publishEvent } from "./publish";
import { createAgentLogger } from "./logger";
import { buildCoachingPrompt } from "./prompts/coaching";
import { PHASE_TIMEOUTS } from "./queues";
import type { CoachingSuggestionEvent } from "@slushie/events";
import { createEvent } from "@slushie/events";
import { prisma } from "@slushie/db";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface CoachingJobData {
  pipelineRunId: string;
  callId: string;
  clientIndustry: string;
}

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

// in-memory transcript buffer per pipeline run
// populated by subscribing to transcript.chunk events via redis
const transcriptBuffers = new Map<string, Array<{ text: string; speaker: string; timestamp: number }>>();

/**
 * subscribe to transcript chunks for a given pipeline run.
 * this populates the in-memory buffer that the coaching worker reads.
 */
export function subscribeToTranscript(pipelineRunId: string): Redis {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const channel = `events:${pipelineRunId}`;

  if (!transcriptBuffers.has(pipelineRunId)) {
    transcriptBuffers.set(pipelineRunId, []);
  }

  redis.subscribe(channel);
  redis.on("message", (_ch: string, message: string) => {
    try {
      const event = JSON.parse(message);
      if (event.type === "transcript.chunk" && event.data.isFinal) {
        const buffer = transcriptBuffers.get(pipelineRunId);
        if (buffer) {
          buffer.push({
            text: event.data.text,
            speaker: event.data.speaker,
            timestamp: event.timestamp,
          });
        }
      }
    } catch {}
  });

  return redis;
}

/**
 * get the last N minutes of transcript for a pipeline run.
 */
function getRecentTranscript(
  pipelineRunId: string,
  windowMinutes: number = 5
): string {
  const buffer = transcriptBuffers.get(pipelineRunId);
  if (!buffer || buffer.length === 0) return "";

  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  const recent = buffer.filter((chunk) => chunk.timestamp >= cutoff);

  if (recent.length === 0) return "";

  return recent
    .map((chunk) => `[${chunk.speaker}]: ${chunk.text}`)
    .join("\n");
}

/**
 * clean up transcript buffer when a call ends.
 */
export function clearTranscriptBuffer(pipelineRunId: string): void {
  transcriptBuffers.delete(pipelineRunId);
}

/**
 * get the full transcript for final storage.
 */
export function getFullTranscript(pipelineRunId: string): string {
  const buffer = transcriptBuffers.get(pipelineRunId);
  if (!buffer || buffer.length === 0) return "";
  return buffer
    .map((chunk) => `[${chunk.speaker}]: ${chunk.text}`)
    .join("\n");
}

export function createCoachingWorker(): Worker {
  const worker = new Worker<CoachingJobData>(
    "coaching",
    async (job: Job<CoachingJobData>) => {
      const { pipelineRunId, callId, clientIndustry } = job.data;
      const log = createAgentLogger("coaching", pipelineRunId);

      log.info({ callId }, "coaching cycle triggered");

      // get last 5 minutes of transcript
      const transcriptContext = getRecentTranscript(pipelineRunId, 5);

      if (!transcriptContext) {
        log.info("no transcript context yet — skipping coaching cycle");
        return;
      }

      // create temp working directory for claude code
      const workDir = await mkdtemp(join(tmpdir(), "slushie-coaching-"));

      try {
        // write transcript context to a file for claude code
        await writeFile(
          join(workDir, "transcript.txt"),
          transcriptContext,
          "utf-8"
        );

        const prompt = buildCoachingPrompt(transcriptContext, clientIndustry);

        const result = await invokeClaudeCode({
          prompt,
          workingDirectory: workDir,
          timeoutMs: 30_000, // coaching must respond quickly — 30 second timeout
          pipelineRunId,
        });

        // parse claude code output — extract json array from the response
        let suggestions: Array<{
          category: "dig_deeper" | "gap_spotted" | "suggested";
          text: string;
          monetaryEstimate?: string;
        }> = [];

        try {
          // claude code with --output-format json wraps the result
          const parsed = JSON.parse(result.output);
          const content = parsed.result ?? parsed.content ?? result.output;
          const jsonStr = typeof content === "string" ? content : JSON.stringify(content);

          // extract json array from potential surrounding text
          const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            suggestions = JSON.parse(arrayMatch[0]);
          }
        } catch (parseErr) {
          log.warn(
            { output: result.output.slice(0, 500) },
            "failed to parse coaching suggestions from claude output"
          );
          return;
        }

        if (!Array.isArray(suggestions) || suggestions.length === 0) {
          log.info("no coaching suggestions generated this cycle");
          return;
        }

        // publish each suggestion as a coaching.suggestion event
        for (const suggestion of suggestions) {
          const event = createEvent<CoachingSuggestionEvent>(
            "coaching.suggestion",
            pipelineRunId,
            {
              category: suggestion.category,
              text: suggestion.text,
              monetaryEstimate: suggestion.monetaryEstimate,
            }
          );

          await publishEvent(event);
          log.info(
            { category: suggestion.category },
            "coaching suggestion published"
          );
        }

        // append to call's coaching log in database
        const call = await prisma.call.findUnique({
          where: { id: callId },
          select: { coachingLog: true },
        });

        const existingLog = Array.isArray(call?.coachingLog)
          ? (call.coachingLog as Array<Record<string, unknown>>)
          : [];

        await prisma.call.update({
          where: { id: callId },
          data: {
            coachingLog: JSON.parse(JSON.stringify([
              ...existingLog,
              ...suggestions.map((s) => ({
                ...s,
                generatedAt: new Date().toISOString(),
              })),
            ])),
          },
        });
      } finally {
        // clean up temp directory
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1, // one coaching invocation at a time per worker
    }
  );

  worker.on("failed", (job, err) => {
    console.error(
      `coaching job failed for pipeline ${job?.data.pipelineRunId}:`,
      err.message
    );
  });

  return worker;
}
