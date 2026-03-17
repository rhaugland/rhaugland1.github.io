import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { sendMeetingConfirmed } from "@/lib/email";

// Called by the worker pipeline when prototype v1 is ready.
// Sends the client a meeting reminder email with time/date and join link.
export async function POST(request: Request) {
  try {
    const { pipelineRunId } = await request.json();
    if (!pipelineRunId) {
      return NextResponse.json({ error: "pipelineRunId required" }, { status: 400 });
    }

    const tracker = await prisma.tracker.findFirst({
      where: { pipelineRunId },
      include: {
        booking: {
          select: { name: true, email: true, businessName: true, meetingTime: true },
        },
      },
    });

    if (!tracker?.booking) {
      return NextResponse.json({ error: "tracker/booking not found" }, { status: 404 });
    }

    const { booking } = tracker;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    sendMeetingConfirmed({
      to: booking.email,
      name: booking.name,
      meetingTime: booking.meetingTime?.toISOString() ?? "",
      callUrl: `${baseUrl}/call/${tracker.bookingId}`,
    }).catch((err) => console.error("[email] v1 ready meeting notification failed:", err));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notify-v1-ready failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
