import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import DemoCallClient from "./demo-call-client";

export default async function DemoCallPage({
  params,
}: {
  params: Promise<{ pipelineRunId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/api/auth/signin");

  const { pipelineRunId } = await params;

  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: {
      call: {
        include: {
          analysis: {
            include: {
              buildSpecs: {
                orderBy: { version: "desc" },
                take: 1,
                include: {
                  prototypes: {
                    orderBy: { version: "desc" },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
      tracker: {
        include: { booking: { select: { businessName: true, name: true } } },
      },
    },
  });

  if (!run) notFound();

  // resolve the latest prototype preview URL
  const latestPrototype =
    run.call?.analysis?.buildSpecs?.[0]?.prototypes?.[0] ?? null;
  const previewUrl = latestPrototype?.previewUrl ?? null;

  const businessName =
    run.tracker?.booking?.businessName ?? "unknown business";
  const clientName = run.tracker?.booking?.name ?? "client";

  return (
    <DemoCallClient
      pipelineRunId={pipelineRunId}
      businessName={businessName}
      clientName={clientName}
      previewUrl={previewUrl}
    />
  );
}
