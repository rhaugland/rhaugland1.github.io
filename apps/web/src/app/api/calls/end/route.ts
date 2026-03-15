import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";
import { getRedisPublisher } from "@/lib/redis";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pipelineRunId, transcript } = body;

  if (!pipelineRunId) {
    return NextResponse.json(
      { error: "pipelineRunId is required" },
      { status: 400 }
    );
  }

  // find the pipeline run and its call
  const pipelineRun = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: { call: { include: { client: true } } },
  });

  if (!pipelineRun || !pipelineRun.call) {
    return NextResponse.json({ error: "call not found" }, { status: 404 });
  }

  const endedAt = new Date();

  // update call with end time and transcript
  const call = await prisma.call.update({
    where: { id: pipelineRun.call.id },
    data: {
      endedAt,
      transcript: transcript ?? null,
    },
    include: { client: true },
  });

  const durationMs = call.startedAt
    ? endedAt.getTime() - call.startedAt.getTime()
    : 0;

  // publish call.ended event to redis
  const redis = getRedisPublisher();
  const channel = `events:${pipelineRunId}`;
  const callEndedEvent = {
    type: "call.ended",
    pipelineRunId,
    timestamp: Date.now(),
    data: {
      callId: call.id,
      clientId: call.clientId,
      duration: Math.round(durationMs / 1000),
    },
  };

  await redis.publish(channel, JSON.stringify(callEndedEvent));

  return NextResponse.json({
    callId: call.id,
    endedAt: call.endedAt,
    duration: Math.round(durationMs / 1000),
    clientName: call.client.name,
  });
}
