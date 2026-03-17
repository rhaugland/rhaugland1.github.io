import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { createCalendarEvent } from "@/lib/google-calendar";
import { sendDemoScheduling } from "@/lib/email";
import { getRedisPublisher } from "@/lib/redis";

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
  const { action, meetingTime, emailBody } = body;

  if (!["send_email", "mark_responded", "schedule_demo"].includes(action)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { tracker: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  if (!booking.tracker) {
    return NextResponse.json({ error: "no tracker for this booking" }, { status: 404 });
  }

  const tracker = booking.tracker;

  if (action === "send_email") {
    // send the demo scheduling email
    sendDemoScheduling({
      to: booking.email,
      name: booking.name,
      businessName: booking.businessName,
      slug: tracker.slug,
      customBody: emailBody,
    }).catch((err) => console.error("[email] demo scheduling failed:", err));

    await prisma.tracker.update({
      where: { id: tracker.id },
      data: {
        demoEmailStatus: "sent",
        demoEmailSentAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, status: "sent" });
  }

  if (action === "mark_responded") {
    await prisma.tracker.update({
      where: { id: tracker.id },
      data: { demoEmailStatus: "responded" },
    });

    return NextResponse.json({ ok: true, status: "responded" });
  }

  if (action === "schedule_demo") {
    if (!meetingTime) {
      return NextResponse.json({ error: "meetingTime is required" }, { status: 400 });
    }

    const meetingDate = new Date(meetingTime);
    if (isNaN(meetingDate.getTime())) {
      return NextResponse.json({ error: "invalid meetingTime" }, { status: 400 });
    }

    // create calendar event
    const planLabels: Record<string, string> = {
      SINGLE_SCOOP: "single scoop",
      DOUBLE_BLEND: "double blend",
      TRIPLE_FREEZE: "triple freeze",
    };

    let calendarEventId: string | null = null;
    try {
      calendarEventId = await createCalendarEvent({
        summary: `slushie demo — ${booking.businessName} (${planLabels[booking.plan] ?? booking.plan})`,
        description: `demo call with ${booking.name} (${booking.email})\nbusiness: ${booking.businessName}`,
        startTime: meetingTime,
        attendeeEmail: booking.email,
      });
    } catch (calErr) {
      console.error("calendar event creation failed:", calErr);
    }

    // update booking with demo meeting time
    await prisma.booking.update({
      where: { id },
      data: {
        demoMeetingTime: meetingDate,
        ...(calendarEventId ? { demoCalendarEventId: calendarEventId } : {}),
      },
    });

    // update tracker: mark demo email as scheduled, advance to step 6
    const steps = tracker.steps as Array<{
      step: number; label: string; subtitle: string; status: string; completedAt: string | null;
    }>;
    const updatedSteps = steps.map((s, i) => ({
      ...s,
      status: i <= 4 ? "done" : i === 5 ? "active" : s.status,
      completedAt: i <= 4 && !s.completedAt ? new Date().toISOString() : s.completedAt,
    }));

    await prisma.tracker.update({
      where: { id: tracker.id },
      data: {
        demoEmailStatus: "scheduled",
        demoMeetingTime: meetingDate,
        currentStep: 6,
        steps: updatedSteps,
      },
    });

    // publish SSE update
    const redis = getRedisPublisher();
    await redis.publish(
      `tracker:${tracker.pipelineRunId ?? tracker.id}`,
      JSON.stringify({
        type: "tracker.update",
        step: 6,
        label: "demo meeting",
        subtitle: "let's walk through your build together.",
        steps: updatedSteps,
        timestamp: Date.now(),
      })
    );

    return NextResponse.json({ ok: true, status: "scheduled" });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
