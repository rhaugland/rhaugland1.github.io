import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { createEventQueue, createEvent } from "@slushie/events";

const pipelineQueue = createEventQueue("pipeline");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { message } = await request.json();

  if (!message?.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { tracker: { include: { pipelineRun: true } } },
  });

  if (!booking?.tracker?.pipelineRun) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  const tracker = booking.tracker;
  const existingMessages =
    (tracker.reviewMessages as Array<{ from: string; text: string; at: string }>) ?? [];

  const updatedMessages = [
    ...existingMessages,
    { from: "employee", text: message.trim(), at: new Date().toISOString() },
  ];

  await prisma.tracker.update({
    where: { id: tracker.id },
    data: {
      reviewMessages: updatedMessages,
      reviewStatus: "building",
    },
  });

  await pipelineQueue.add(
    "review.requested",
    createEvent("review.requested", tracker.pipelineRun!.id, {
      message: message.trim(),
      clientId: booking.clientId!,
    })
  );

  return NextResponse.json({ ok: true, messages: updatedMessages });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      tracker: { select: { reviewMessages: true, reviewStatus: true } },
    },
  });

  if (!booking?.tracker) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    messages: booking.tracker.reviewMessages ?? [],
    status: booking.tracker.reviewStatus,
  });
}
