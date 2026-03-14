import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { createCalendarEvent } from "@/lib/google-calendar";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { meetingTime } = body;

  if (!meetingTime) {
    return NextResponse.json({ error: "meetingTime is required" }, { status: 400 });
  }

  const meetingDate = new Date(meetingTime);
  if (isNaN(meetingDate.getTime()) || meetingDate < new Date()) {
    return NextResponse.json({ error: "meeting time must be in the future" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { tracker: { select: { currentStep: true, id: true } } },
  });

  if (!booking) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  // can only reschedule during step 1 (meeting confirmed)
  if (!booking.tracker || booking.tracker.currentStep > 1) {
    return NextResponse.json(
      { error: "can only reschedule before your meeting starts" },
      { status: 400 }
    );
  }

  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "booking is cancelled" }, { status: 400 });
  }

  // check for conflicts
  const existing = await prisma.booking.findFirst({
    where: {
      meetingTime: meetingDate,
      status: "CONFIRMED",
      id: { not: id },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "this time slot was just taken. please pick another." },
      { status: 409 }
    );
  }

  // create new calendar event
  const planLabels: Record<string, string> = {
    SINGLE_SCOOP: "single scoop",
    DOUBLE_BLEND: "double blend",
    TRIPLE_FREEZE: "triple freeze",
  };

  try {
    const calendarEventId = await createCalendarEvent({
      summary: `slushie blend — ${booking.businessName} (${planLabels[booking.plan]}) [rescheduled]`,
      description: `customer: ${booking.name} (${booking.email})\nbusiness: ${booking.businessName}\nplan: ${planLabels[booking.plan]}\n\nworkflow description:\n${booking.description}`,
      startTime: meetingTime,
      attendeeEmail: booking.email,
    });

    await prisma.booking.update({
      where: { id },
      data: {
        meetingTime: meetingDate,
        calendarEventId,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "failed to reschedule. please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, meetingTime: meetingDate.toISOString() });
}
