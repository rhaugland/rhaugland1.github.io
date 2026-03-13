import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import Redis from "ioredis";
import pino from "pino";

const logger = pino({ name: "api:revise" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const run = await prisma.pipelineRun.findUnique({
    where: { id },
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
                    include: {
                      gapReports: {
                        orderBy: { version: "desc" },
                        take: 1,
                      },
                    },
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

  if (run.status !== "RUNNING") {
    return NextResponse.json(
      { error: `cannot request revisions — status is ${run.status.toLowerCase()}` },
      { status: 400 }
    );
  }

  const latestGapReport =
    run.call.analysis?.buildSpecs[0]?.prototypes[0]?.gapReports[0] ?? null;

  // phase 2 stub: publishes review.complete to trigger gap resolution cycle
  // in phase 2 this will support a manual revision notes field
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const channel = `events:${id}`;

  const revisionEvent = JSON.stringify({
    type: "review.complete",
    pipelineRunId: id,
    timestamp: Date.now(),
    data: {
      gapReportId: latestGapReport?.id ?? "",
      version: (latestGapReport?.version ?? 0) + 1,
      coverageScore: latestGapReport?.coverageScore ?? 0,
      gapCount: Array.isArray(latestGapReport?.gaps)
        ? (latestGapReport.gaps as unknown[]).length
        : 0,
      triggeredBy: "manual_revision",
      requestedBy: session.user.email,
    },
  });

  await redis.publish(channel, revisionEvent);
  await redis.disconnect();

  logger.info(
    { pipelineRunId: id, requestedBy: session.user.email },
    "manual revision requested"
  );

  return NextResponse.json({
    success: true,
    message: "revision cycle triggered",
    requestedBy: session.user.email,
  });
}
