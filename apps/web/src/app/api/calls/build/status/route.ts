import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pipelineRunId = searchParams.get("pipelineRunId");

  if (!pipelineRunId) {
    return NextResponse.json({ error: "pipelineRunId is required" }, { status: 400 });
  }

  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    select: {
      status: true,
      call: {
        select: {
          analysis: {
            select: {
              buildSpecs: {
                orderBy: { version: "desc" as const },
                take: 1,
                select: {
                  prototypes: {
                    orderBy: { version: "desc" as const },
                    take: 1,
                    select: { previewUrl: true, version: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "pipeline run not found" }, { status: 404 });
  }

  const prototype = run.call?.analysis?.buildSpecs?.[0]?.prototypes?.[0];

  return NextResponse.json({
    status: run.status,
    previewUrl: prototype?.previewUrl ?? null,
    prototypeVersion: prototype?.version ?? null,
  });
}
