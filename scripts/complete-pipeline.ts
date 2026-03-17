import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PIPELINE_RUN_ID = "cmms10guw0003s97uhmekgox9";

async function main() {
  // Update pipeline run status
  await prisma.pipelineRun.update({
    where: { id: PIPELINE_RUN_ID },
    data: { status: "COMPLETED" },
  });

  // Update tracker to final step
  const tracker = await prisma.tracker.findFirst({
    where: { pipelineRunId: PIPELINE_RUN_ID },
  });

  if (tracker) {
    const steps = tracker.steps as Array<{
      step: number; label: string; subtitle: string; status: string; completedAt: string | null;
    }>;

    const updatedSteps = steps.map((s) => ({
      ...s,
      status: "done",
      completedAt: s.completedAt || new Date().toISOString(),
    }));

    await prisma.tracker.update({
      where: { id: tracker.id },
      data: {
        currentStep: 5,
        steps: updatedSteps,
      },
    });

    console.log("tracker updated to step 5 (complete)");
  }

  // Check for prototype with preview URL
  const run = await prisma.pipelineRun.findUnique({
    where: { id: PIPELINE_RUN_ID },
    include: {
      call: {
        include: {
          analysis: {
            include: {
              buildSpecs: {
                include: { prototypes: true },
                orderBy: { version: "desc" },
              },
            },
          },
        },
      },
    },
  });

  const latestSpec = run?.call.analysis?.buildSpecs[0];
  const latestPrototype = latestSpec?.prototypes[0];
  console.log("pipeline status:", run?.status);
  console.log("latest build spec version:", latestSpec?.version);
  console.log("latest prototype:", latestPrototype?.id, "version:", latestPrototype?.version);

  await prisma.$disconnect();
}

main().catch(console.error);
