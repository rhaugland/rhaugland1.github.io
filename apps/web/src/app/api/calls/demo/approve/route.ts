import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";
import { getRedisPublisher } from "@/lib/redis";
import { createEventQueue, createEvent } from "@slushie/events";

const pipelineQueue = createEventQueue("pipeline");

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pipelineRunId, transcript } = body;

  if (!pipelineRunId || !transcript) {
    return NextResponse.json(
      { error: "pipelineRunId and transcript are required" },
      { status: 400 }
    );
  }

  const pipelineRun = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: { call: true },
  });

  if (!pipelineRun || !pipelineRun.call) {
    return NextResponse.json({ error: "pipeline run or call not found" }, { status: 404 });
  }

  // save transcript to the call record
  const now = new Date();
  await prisma.call.update({
    where: { id: pipelineRun.call.id },
    data: {
      transcript,
      endedAt: now,
    },
  });

  // advance tracker to step 3 (slushie build review)
  const tracker = await prisma.tracker.findUnique({
    where: { pipelineRunId },
  });

  if (tracker) {
    const steps = tracker.steps as Array<{
      step: number; label: string; subtitle: string; status: string; completedAt: string | null;
    }>;
    const updatedSteps = steps.map((s, i) => ({
      ...s,
      status: i <= 1 ? "done" : i === 2 ? "active" : s.status,
      completedAt: i <= 1 && s.status !== "done" ? now.toISOString() : s.completedAt,
    }));

    await prisma.tracker.update({
      where: { id: tracker.id },
      data: { currentStep: 3, steps: updatedSteps },
    });
  }

  // dispatch call.ended to both Redis pub/sub (for SSE) and BullMQ (for pipeline worker)
  const callEndedEvent = createEvent("call.ended", pipelineRunId, {
    callId: pipelineRun.call.id,
    clientId: pipelineRun.clientId,
    duration: 1200,
  });

  const redis = getRedisPublisher();
  await redis.publish(`events:${pipelineRunId}`, JSON.stringify(callEndedEvent));
  await pipelineQueue.add("call.ended", callEndedEvent);

  return NextResponse.json({ ok: true, currentStep: 3 });
}
