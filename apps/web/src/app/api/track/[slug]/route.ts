import { prisma } from "@slushie/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    include: {
      pipelineRun: {
        include: {
          client: { select: { name: true } },
        },
      },
    },
  });

  if (!tracker) {
    return new Response("not found", { status: 404 });
  }

  if (tracker.expiresAt && tracker.expiresAt < new Date()) {
    return Response.json({ expired: true }, { status: 410 });
  }

  return Response.json({
    slug: tracker.slug,
    currentStep: tracker.currentStep,
    steps: tracker.steps,
    clientName: tracker.pipelineRun.client.name,
    prototypeNanoid: tracker.prototypeNanoid,
    createdAt: tracker.createdAt.toISOString(),
  });
}
