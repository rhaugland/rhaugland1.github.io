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
  const body = await request.json();
  const { employeeId } = body;

  if (!employeeId) {
    return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { tracker: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  if (booking.assigneeId) {
    return NextResponse.json({ error: "already claimed" }, { status: 409 });
  }

  // claim the booking
  await prisma.booking.update({
    where: { id },
    data: { assigneeId: employeeId },
  });

  // trigger the analyst → builder pipeline if not already running
  if (booking.tracker && !booking.tracker.pipelineRunId) {
    try {
      // ensure booking has a client
      let clientId = booking.clientId;
      if (!clientId) {
        const client = await prisma.client.create({
          data: {
            name: booking.businessName,
            industry: "pending",
            contactName: booking.name,
            contactEmail: booking.email,
          },
        });
        clientId = client.id;
        await prisma.booking.update({
          where: { id },
          data: { clientId },
        });
      }

      // create a call record with the booking description as transcript
      const call = await prisma.call.create({
        data: {
          clientId,
          startedAt: new Date(),
          endedAt: new Date(),
          transcript: booking.description,
          coachingLog: [],
        },
      });

      // create pipeline run
      const pipelineRun = await prisma.pipelineRun.create({
        data: {
          clientId,
          callId: call.id,
          status: "RUNNING",
        },
      });

      // link pipeline run to the booking's tracker
      await prisma.tracker.update({
        where: { id: booking.tracker.id },
        data: { pipelineRunId: pipelineRun.id },
      });

      // dispatch call.ended event to trigger the analyst
      await pipelineQueue.add(
        "call.ended",
        createEvent("call.ended", pipelineRun.id, {
          callId: call.id,
          clientId,
          duration: 0,
        })
      );
    } catch (err) {
      console.error("failed to trigger pipeline for booking:", err);
      // claim succeeded even if pipeline trigger fails
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  await prisma.booking.update({
    where: { id },
    data: { assigneeId: null },
  });

  return NextResponse.json({ ok: true });
}
