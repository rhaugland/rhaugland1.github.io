import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { createEventQueue, createEvent } from "@slushie/events";
import Redis from "ioredis";

const builderQueue = createEventQueue("builder");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action, feedback } = body;

  if (action !== "push_to_bot" && action !== "push_to_client") {
    return NextResponse.json(
      { error: "action must be 'push_to_bot' or 'push_to_client'" },
      { status: 400 }
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { tracker: true },
  });

  if (!booking?.tracker) {
    return NextResponse.json({ error: "booking or tracker not found" }, { status: 404 });
  }

  const tracker = booking.tracker;

  if (action === "push_to_bot") {
    if (!feedback || typeof feedback !== "string" || feedback.trim().length === 0) {
      return NextResponse.json({ error: "feedback is required" }, { status: 400 });
    }

    if (!tracker.pipelineRunId) {
      return NextResponse.json({ error: "no pipeline run linked" }, { status: 400 });
    }

    // update tracker status to building
    await prisma.tracker.update({
      where: { id: tracker.id },
      data: { revisionStatus: "building", clientFeedback: feedback.trim() },
    });

    // send to builder bot
    await builderQueue.add(
      "build.message",
      createEvent("build.message", tracker.pipelineRunId, {
        text: `Client revision request: ${feedback.trim()}`,
        sentBy: session.user.email,
      })
    );

    return NextResponse.json({ ok: true, action: "pushed_to_bot" });
  }

  // action === "push_to_client"
  // clear revision state so client can review again
  await prisma.tracker.update({
    where: { id: tracker.id },
    data: { revisionStatus: null, clientFeedback: null },
  });

  // publish SSE so the client tracker resets to review mode
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    await redis.publish(
      `tracker:${tracker.pipelineRunId ?? tracker.id}`,
      JSON.stringify({
        type: "revision.ready",
        timestamp: Date.now(),
      })
    );
  } finally {
    redis.disconnect();
  }

  return NextResponse.json({ ok: true, action: "pushed_to_client" });
}
