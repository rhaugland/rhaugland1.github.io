import Redis from "ioredis";
import { logger } from "./logger";
import {
  subscribeToTranscript,
  clearTranscriptBuffer,
  getFullTranscript,
} from "./coaching";
import {
  startCoachingScheduler,
  stopCoachingScheduler,
} from "./coaching-scheduler";
import { prisma } from "@slushie/db";

const transcriptSubscriptions = new Map<string, Redis>();

interface CoachingControlMessage {
  action: "start" | "stop";
  pipelineRunId: string;
  callId?: string;
  clientIndustry?: string;
}

export function startCoachingControlListener(): void {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const controlChannel = "control:coaching";

  redis.subscribe(controlChannel);

  redis.on("message", async (_ch: string, message: string) => {
    try {
      const msg: CoachingControlMessage = JSON.parse(message);

      if (msg.action === "start" && msg.callId && msg.clientIndustry) {
        logger.info(
          { pipelineRunId: msg.pipelineRunId, callId: msg.callId },
          "coaching control: starting"
        );

        // subscribe to transcript events for this pipeline run
        const sub = subscribeToTranscript(msg.pipelineRunId);
        transcriptSubscriptions.set(msg.pipelineRunId, sub);

        // start the 30-second coaching scheduler
        startCoachingScheduler(
          msg.pipelineRunId,
          msg.callId,
          msg.clientIndustry
        );
      }

      if (msg.action === "stop") {
        logger.info(
          { pipelineRunId: msg.pipelineRunId },
          "coaching control: stopping"
        );

        // stop the coaching scheduler
        stopCoachingScheduler(msg.pipelineRunId);

        // save full transcript to database before clearing buffer
        const fullTranscript = getFullTranscript(msg.pipelineRunId);
        if (fullTranscript) {
          // find the call associated with this pipeline run
          const run = await prisma.pipelineRun.findUnique({
            where: { id: msg.pipelineRunId },
            select: { callId: true },
          });

          if (run) {
            await prisma.call.update({
              where: { id: run.callId },
              data: { transcript: fullTranscript },
            });
            logger.info(
              { pipelineRunId: msg.pipelineRunId, callId: run.callId },
              "final transcript saved to database"
            );
          }
        }

        // clean up transcript buffer
        clearTranscriptBuffer(msg.pipelineRunId);

        // unsubscribe from transcript events
        const sub = transcriptSubscriptions.get(msg.pipelineRunId);
        if (sub) {
          sub.unsubscribe();
          sub.disconnect();
          transcriptSubscriptions.delete(msg.pipelineRunId);
        }
      }
    } catch (err) {
      logger.error({ error: err, message }, "failed to process coaching control message");
    }
  });

  logger.info("coaching control listener started on channel: control:coaching");
}
