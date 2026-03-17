import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Delete all analysis, build specs, prototypes, gap reports for this pipeline
  const PIPELINE_RUN_ID = "cmms10guw0003s97uhmekgox9";

  const run = await prisma.pipelineRun.findUnique({
    where: { id: PIPELINE_RUN_ID },
    include: { call: true },
  });

  if (!run) {
    console.log("pipeline run not found");
    return;
  }

  // Delete gap reports, prototypes, build specs, analysis
  if (run.callId) {
    const analysis = await prisma.analysis.findUnique({
      where: { callId: run.callId },
      include: { buildSpecs: { include: { prototypes: true } } },
    });

    if (analysis) {
      for (const spec of analysis.buildSpecs) {
        for (const proto of spec.prototypes) {
          await prisma.gapReport.deleteMany({ where: { prototypeId: proto.id } });
        }
        await prisma.prototype.deleteMany({ where: { buildSpecId: spec.id } });
      }
      await prisma.buildSpec.deleteMany({ where: { analysisId: analysis.id } });
      await prisma.analysis.delete({ where: { id: analysis.id } });
    }
  }

  // Reset pipeline run status
  await prisma.pipelineRun.update({
    where: { id: PIPELINE_RUN_ID },
    data: { status: "RUNNING" },
  });

  console.log("pipeline reset complete");
  await prisma.$disconnect();
}

main().catch(console.error);
