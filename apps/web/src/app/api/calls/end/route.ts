import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";
import Redis from "ioredis";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { callId, pipelineRunId, transcript } = body;

  if (!callId || !pipelineRunId) {
    return NextResponse.json(
      { error: "callId and pipelineRunId are required" },
      { status: 400 }
    );
  }

  // update call with end time and final transcript
  const endedAt = new Date();
  const call = await prisma.call.update({
    where: { id: callId },
    data: {
      endedAt,
      transcript: transcript ?? null,
    },
    include: { client: true },
  });

  if (!call) {
    return NextResponse.json({ error: "call not found" }, { status: 404 });
  }

  const durationMs = call.startedAt
    ? endedAt.getTime() - call.startedAt.getTime()
    : 0;

  // publish call.ended event to redis
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
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
  redis.disconnect();

  return NextResponse.json({
    callId: call.id,
    endedAt: call.endedAt,
    duration: Math.round(durationMs / 1000),
    clientName: call.client.name,
  });
}
