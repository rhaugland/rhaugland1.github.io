import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { prisma } from "@slushie/db";
import type { TrackerUpdateEvent } from "@slushie/events";
import { logger } from "../logger";

const TRACKER_STEPS = [
  { step: 1, label: "call complete", subtitle: "we heard what you need." },
  { step: 2, label: "analyzing your workflow", subtitle: "finding the gaps that cost you money." },
  { step: 3, label: "building your prototype", subtitle: "pouring the ingredients together." },
  { step: 4, label: "quality check", subtitle: "making sure everything blends right." },
  { step: 5, label: "ready to serve", subtitle: "your tool is live. take a sip." },
];

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const pubRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

export function createTrackerWorker() {
  const worker = new Worker<TrackerUpdateEvent>(
    "tracker",
    async (job: Job<TrackerUpdateEvent>) => {
      const event = job.data;
      const { pipelineRunId } = event;
      const { step } = event.data;

      const workerLogger = logger.child({ pipelineRunId, step });
      workerLogger.info("processing tracker update");

      // find tracker for this pipeline run
      const tracker = await prisma.tracker.findUnique({
        where: { pipelineRunId },
      });

      if (!tracker) {
        workerLogger.error("no tracker found for pipeline run");
        throw new Error(`no tracker found for pipeline run ${pipelineRunId}`);
      }

      // validate step number — use tracker's step count (5 for pipeline, 8 for booking)
      const trackerSteps = tracker.steps as Array<{ step: number }> | null;
      const maxStep = trackerSteps?.length ?? TRACKER_STEPS.length;
      if (step < 1 || step > maxStep) {
        workerLogger.error({ step, maxStep }, "invalid tracker step");
        throw new Error(`invalid tracker step: ${step} (max: ${maxStep})`);
      }

      // look up step metadata — null-safe for steps beyond TRACKER_STEPS (booking has 8)
      const stepMeta = TRACKER_STEPS[step - 1] ?? null;
      const label = event.data.label || stepMeta?.label || `step ${step}`;
      const subtitle = event.data.subtitle || stepMeta?.subtitle || "";

      // update tracker in database
      const updatedSteps = (tracker.steps as Array<{
        step: number;
        label: string;
        subtitle: string;
        status: string;
        completedAt: string | null;
      }>) ?? TRACKER_STEPS.map((s) => ({
        ...s,
        status: "pending",
        completedAt: null,
      }));

      // mark all steps up to current as done, current as active
      for (let i = 0; i < updatedSteps.length; i++) {
        if (i < step - 1) {
          updatedSteps[i].status = "done";
          updatedSteps[i].completedAt = updatedSteps[i].completedAt ?? new Date().toISOString();
        } else if (i === step - 1) {
          updatedSteps[i].status = "active";
          updatedSteps[i].label = label;
          updatedSteps[i].subtitle = subtitle;
        } else {
          updatedSteps[i].status = "pending";
        }
      }

      // if final step, mark it as done too
      if (step === maxStep) {
        updatedSteps[step - 1].status = "done";
        updatedSteps[step - 1].completedAt = new Date().toISOString();
      }

      await prisma.tracker.update({
        where: { id: tracker.id },
        data: {
          currentStep: step,
          steps: updatedSteps,
        },
      });

      // publish to redis pub/sub for SSE
      const ssePayload = JSON.stringify({
        type: "tracker.update",
        pipelineRunId,
        step,
        label,
        subtitle,
        steps: updatedSteps,
        timestamp: Date.now(),
      });

      await pubRedis.publish(`tracker:${pipelineRunId ?? tracker.id}`, ssePayload);
      workerLogger.info({ step, label }, "tracker updated and published");
    },
    { connection: getRedisConnection() }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "tracker worker job failed");
  });

  logger.info("tracker worker registered");
  return worker;
}

export { TRACKER_STEPS };
