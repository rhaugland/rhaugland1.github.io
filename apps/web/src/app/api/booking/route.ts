import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { createCalendarEvent } from "@/lib/google-calendar";
import { sendBookingConfirmed } from "@/lib/email";
import { generateTempPassword } from "@/lib/tracker-auth";

const BOOKING_STEPS = [
  { step: 1, label: "meeting confirmed", subtitle: "your blend is scheduled. we'll see you there." },
  { step: 2, label: "meeting", subtitle: "we're on the call. workflow discovery in progress." },
  { step: 3, label: "slushie build review", subtitle: "our team is reviewing the build for quality." },
  { step: 4, label: "client build approval", subtitle: "your turn. take a look and let us know." },
  { step: 5, label: "plug-in", subtitle: "connecting to your tools. almost there." },
  { step: 6, label: "billing", subtitle: "invoice sent. simple and transparent." },
  { step: 7, label: "satisfaction survey", subtitle: "how'd we do? we want to keep getting better." },
];

const VALID_PLANS = ["SINGLE_SCOOP", "DOUBLE_BLEND", "TRIPLE_FREEZE"] as const;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, businessName, plan, description, meetingTime } = body;

    // validate required fields
    if (!name || !email || !businessName || !plan || !description || !meetingTime) {
      return NextResponse.json(
        { error: "all fields are required" },
        { status: 400 }
      );
    }

    if (!VALID_PLANS.includes(plan)) {
      return NextResponse.json(
        { error: "invalid plan selection" },
        { status: 400 }
      );
    }

    // basic email validation
    if (!email.includes("@") || !email.includes(".")) {
      return NextResponse.json(
        { error: "invalid email address" },
        { status: 400 }
      );
    }

    // validate meeting time is in the future
    const meetingDate = new Date(meetingTime);
    if (isNaN(meetingDate.getTime()) || meetingDate < new Date()) {
      return NextResponse.json(
        { error: "meeting time must be in the future" },
        { status: 400 }
      );
    }

    const planLabels: Record<string, string> = {
      SINGLE_SCOOP: "single scoop",
      DOUBLE_BLEND: "double blend",
      TRIPLE_FREEZE: "triple freeze",
    };

    // 1. check for existing booking at this time (race condition guard)
    const existingBooking = await prisma.booking.findFirst({
      where: {
        meetingTime: meetingDate,
        status: "CONFIRMED",
      },
    });

    if (existingBooking) {
      return NextResponse.json(
        { error: "this time slot was just taken. please pick another." },
        { status: 409 }
      );
    }

    // 2. create Google Calendar event (sends invite to customer)
    let calendarEventId: string | null = null;
    try {
      calendarEventId = await createCalendarEvent({
        summary: `slushie blend — ${businessName} (${planLabels[plan]})`,
        description: `customer: ${name} (${email})\nbusiness: ${businessName}\nplan: ${planLabels[plan]}\n\nworkflow description:\n${description}`,
        startTime: meetingTime,
        attendeeEmail: email,
      });
    } catch (calErr: unknown) {
      const message = calErr instanceof Error ? calErr.message : "unknown error";
      console.error("google calendar event creation failed:", message);
      return NextResponse.json(
        { error: "failed to schedule meeting. please try again." },
        { status: 500 }
      );
    }

    // 3. create Client record
    const client = await prisma.client.create({
      data: {
        name: businessName,
        industry: "pending",
        contactName: name,
        contactEmail: email,
      },
    });

    // 4. create Booking record
    const booking = await prisma.booking.create({
      data: {
        name,
        email,
        businessName,
        plan,
        description,
        meetingTime: meetingDate,
        calendarEventId,
        clientId: client.id,
      },
    });

    // 5. create Tracker with 7 steps, step 1 done + temp password
    const slug = nanoid(21);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const steps = BOOKING_STEPS.map((s, i) => ({
      ...s,
      status: i === 0 ? "done" : "pending",
      completedAt: i === 0 ? new Date().toISOString() : null,
    }));

    const tracker = await prisma.tracker.create({
      data: {
        bookingId: booking.id,
        slug,
        currentStep: 1,
        steps,
        expiresAt,
        passwordHash,
        mustChangePassword: true,
      },
    });

    // send confirmation email with tracker link + temp password
    sendBookingConfirmed({
      to: email,
      name,
      businessName,
      planLabel: planLabels[plan] ?? plan,
      meetingTime,
      slug,
      tempPassword,
    }).catch((err) => console.error("[email] booking confirmed failed:", err));

    return NextResponse.json({
      trackingSlug: tracker.slug,
      bookingId: booking.id,
    });
  } catch (err) {
    console.error("booking creation failed:", err);
    return NextResponse.json(
      { error: "something went wrong. please try again." },
      { status: 500 }
    );
  }
}
