import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { getAvailableSlots } from "@/lib/google-calendar";

export async function GET() {
  try {
    const slots = await getAvailableSlots();

    // also subtract already-booked meeting times
    const bookedMeetings = await prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        meetingTime: { gte: new Date() },
      },
      select: { meetingTime: true },
    });

    const bookedTimes = new Set(
      bookedMeetings.map((b) => b.meetingTime.toISOString())
    );

    const filtered = slots
      .map((day) => ({
        ...day,
        times: day.times.filter((t) => !bookedTimes.has(new Date(t.start).toISOString())),
      }))
      .filter((day) => day.times.length > 0);

    return NextResponse.json({ slots: filtered });
  } catch (err) {
    console.error("failed to fetch booking slots:", err);
    return NextResponse.json(
      { error: "failed to fetch available slots" },
      { status: 500 }
    );
  }
}
