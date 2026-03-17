import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { createCalendarEvent } from "@/lib/google-calendar";
import { sendDiscoveryScheduling } from "@/lib/email";
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
  const { action, meetingTime } = body;

  if (!["send_email", "mark_responded", "schedule_meeting"].includes(action)) {
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
    // send the discovery scheduling email
    sendDiscoveryScheduling({
      to: booking.email,
      name: booking.name,
      businessName: booking.businessName,
      slug: tracker.slug,
    }).catch((err) => console.error("[email] discovery scheduling failed:", err));

    await prisma.tracker.update({
      where: { id: tracker.id },
      data: {
        discoveryEmailStatus: "sent",
        discoveryEmailSentAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, status: "sent" });
  }

  if (action === "mark_responded") {
    await prisma.tracker.update({
      where: { id: tracker.id },
      data: { discoveryEmailStatus: "responded" },
    });

    return NextResponse.json({ ok: true, status: "responded" });
  }

  if (action === "schedule_meeting") {
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
        summary: `slushie discovery — ${booking.businessName} (${planLabels[booking.plan] ?? booking.plan})`,
        description: `discovery call with ${booking.name} (${booking.email})\nbusiness: ${booking.businessName}`,
        startTime: meetingTime,
        attendeeEmail: booking.email,
      });
    } catch (calErr) {
      console.error("calendar event creation failed:", calErr);
    }

    // update booking with meeting time
    await prisma.booking.update({
      where: { id },
      data: {
        meetingTime: meetingDate,
        ...(calendarEventId ? { calendarEventId } : {}),
      },
    });

    // update tracker: mark discovery email as scheduled, advance to step 3
    const steps = tracker.steps as Array<{
      step: number; label: string; subtitle: string; status: string; completedAt: string | null;
    }>;
    const updatedSteps = steps.map((s, i) => ({
      ...s,
      status: i <= 1 ? "done" : i === 2 ? "active" : s.status,
      completedAt: i <= 1 && !s.completedAt ? new Date().toISOString() : s.completedAt,
    }));

    await prisma.tracker.update({
      where: { id: tracker.id },
      data: {
        discoveryEmailStatus: "scheduled",
        currentStep: 3,
        steps: updatedSteps,
      },
    });

    // publish SSE update
    const redis = getRedisPublisher();
    await redis.publish(
      `tracker:${tracker.pipelineRunId ?? tracker.id}`,
      JSON.stringify({
        type: "tracker.update",
        step: 3,
        label: "discovery meeting",
        subtitle: "let's walk through your workflow together.",
        steps: updatedSteps,
        timestamp: Date.now(),
      })
    );

    return NextResponse.json({ ok: true, status: "scheduled" });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
