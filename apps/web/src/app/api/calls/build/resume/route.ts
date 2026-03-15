import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { getRedisPublisher } from "@/lib/redis";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { pipelineRunId } = await request.json();

  if (!pipelineRunId) {
    return NextResponse.json(
      { error: "pipelineRunId is required" },
      { status: 400 }
    );
  }

  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    select: { id: true },
  });

  if (!run) {
    return NextResponse.json({ error: "pipeline run not found" }, { status: 404 });
  }

  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: { buildPaused: false },
  });

  const redis = getRedisPublisher();
  const event = {
    type: "build.resumed",
    pipelineRunId,
    timestamp: Date.now(),
    data: { resumedBy: session.user?.email ?? "unknown" },
  };
  await redis.publish(`events:${pipelineRunId}`, JSON.stringify(event));

  // publish catch-up control signal so the incremental analyst scheduler re-checks
  await redis.publish("control:incremental-analyst", JSON.stringify({
    action: "catchup",
    pipelineRunId,
  }));

  return NextResponse.json({ ok: true });
}
