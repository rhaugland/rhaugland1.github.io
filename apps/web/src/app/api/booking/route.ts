import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { sendBookingConfirmed } from "@/lib/email";
import { generateTempPassword } from "@/lib/tracker-auth";
import { createEventQueue, createEvent } from "@slushie/events";

const pipelineQueue = createEventQueue("pipeline");

const BOOKING_STEPS = [
  { step: 1, label: "intake build", subtitle: "we're already building your first prototype." },
  { step: 2, label: "schedule discovery", subtitle: "your rep will reach out to schedule a discovery call." },
  { step: 3, label: "discovery meeting", subtitle: "let's walk through your workflow together." },
  { step: 4, label: "discovery build", subtitle: "building an improved version based on our conversation." },
  { step: 5, label: "client build approval", subtitle: "your turn. take a look and let us know." },
  { step: 6, label: "plug-in", subtitle: "connecting to your tools. almost there." },
  { step: 7, label: "billing", subtitle: "invoice sent. simple and transparent." },
  { step: 8, label: "satisfaction survey", subtitle: "how'd we do? we want to keep getting better." },
];

const VALID_PLANS = ["SINGLE_SCOOP", "DOUBLE_BLEND", "TRIPLE_FREEZE"] as const;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, businessName, plan, description } = body;

    // validate required fields (meetingTime no longer required)
    if (!name || !email || !businessName || !plan || !description) {
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

    const planLabels: Record<string, string> = {
      SINGLE_SCOOP: "single scoop",
      DOUBLE_BLEND: "double blend",
      TRIPLE_FREEZE: "triple freeze",
    };

    // 1. create Client record
    const client = await prisma.client.create({
      data: {
        name: businessName,
        industry: "pending",
        contactName: name,
        contactEmail: email,
      },
    });

    // 2. create Booking record (no meetingTime — scheduled later via discovery)
    const booking = await prisma.booking.create({
      data: {
        name,
        email,
        businessName,
        plan,
        description,
        clientId: client.id,
      },
    });

    // 3. create Call record with booking description as transcript
    const call = await prisma.call.create({
      data: {
        clientId: client.id,
        startedAt: new Date(),
        endedAt: new Date(),
        transcript: description,
        coachingLog: [],
      },
    });

    // 4. create PipelineRun
    const pipelineRun = await prisma.pipelineRun.create({
      data: {
        clientId: client.id,
        callId: call.id,
        status: "RUNNING",
      },
    });

    // 5. create Tracker with 8 steps, step 1 active (building intake prototype)
    const slug = nanoid(21);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const steps = BOOKING_STEPS.map((s, i) => ({
      ...s,
      status: i === 0 ? "active" : "pending",
      completedAt: null as string | null,
    }));

    const tracker = await prisma.tracker.create({
      data: {
        bookingId: booking.id,
        pipelineRunId: pipelineRun.id,
        slug,
        currentStep: 1,
        steps,
        expiresAt,
        passwordHash,
        mustChangePassword: true,
      },
    });

    // 6. dispatch call.ended event to trigger the analyst → builder pipeline
    await pipelineQueue.add(
      "call.ended",
      createEvent("call.ended", pipelineRun.id, {
        callId: call.id,
        clientId: client.id,
        duration: 0,
      })
    );

    // send confirmation email — updated message about immediate build
    sendBookingConfirmed({
      to: email,
      name,
      businessName,
      planLabel: planLabels[plan] ?? plan,
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
