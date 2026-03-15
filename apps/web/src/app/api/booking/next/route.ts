import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { createCalendarEvent } from "@/lib/google-calendar";
import { sendBookingConfirmed } from "@/lib/email";
import { generateTempPassword } from "@/lib/tracker-auth";

const PLAN_WORKFLOW_COUNT: Record<string, number> = {
  SINGLE_SCOOP: 1,
  DOUBLE_BLEND: 2,
  TRIPLE_FREEZE: 3,
};

const BOOKING_STEPS = [
  { step: 1, label: "meeting confirmed", subtitle: "your blend is scheduled. we'll see you there." },
  { step: 2, label: "meeting", subtitle: "we're on the call. workflow discovery in progress." },
  { step: 3, label: "slushie build review", subtitle: "our team is reviewing the build for quality." },
  { step: 4, label: "client build approval", subtitle: "your turn. take a look and let us know." },
  { step: 5, label: "plug-in", subtitle: "connecting to your tools. almost there." },
  { step: 6, label: "billing", subtitle: "invoice sent. simple and transparent." },
  { step: 7, label: "satisfaction survey", subtitle: "how'd we do? we want to keep getting better." },
];

const planLabels: Record<string, string> = {
  SINGLE_SCOOP: "single scoop",
  DOUBLE_BLEND: "double blend",
  TRIPLE_FREEZE: "triple freeze",
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { parentBookingId, description, meetingTime } = body;

    if (!parentBookingId || !description || !meetingTime) {
      return NextResponse.json(
        { error: "all fields are required" },
        { status: 400 }
      );
    }

    // look up the parent booking
    const parent = await prisma.booking.findUnique({
      where: { id: parentBookingId },
      select: {
        id: true,
        name: true,
        email: true,
        businessName: true,
        plan: true,
        clientId: true,
        workflowNumber: true,
        status: true,
      },
    });

    if (!parent) {
      return NextResponse.json({ error: "booking not found" }, { status: 404 });
    }

    if (parent.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "previous workflow must be completed first" },
        { status: 400 }
      );
    }

    const totalWorkflows = PLAN_WORKFLOW_COUNT[parent.plan] ?? 1;
    const nextWorkflowNumber = parent.workflowNumber + 1;

    if (nextWorkflowNumber > totalWorkflows) {
      return NextResponse.json(
        { error: "all workflows for this plan have been completed" },
        { status: 400 }
      );
    }

    // check that a follow-up hasn't already been created
    const existingNext = await prisma.booking.findFirst({
      where: { parentBookingId: parent.id },
      select: { id: true },
    });

    if (existingNext) {
      return NextResponse.json(
        { error: "a follow-up workflow has already been scheduled" },
        { status: 409 }
      );
    }

    const meetingDate = new Date(meetingTime);
    if (isNaN(meetingDate.getTime()) || meetingDate < new Date()) {
      return NextResponse.json(
        { error: "meeting time must be in the future" },
        { status: 400 }
      );
    }

    // check slot availability
    const existingBooking = await prisma.booking.findFirst({
      where: { meetingTime: meetingDate, status: "CONFIRMED" },
    });

    if (existingBooking) {
      return NextResponse.json(
        { error: "this time slot was just taken. please pick another." },
        { status: 409 }
      );
    }

    // create calendar event
    let calendarEventId: string | null = null;
    try {
      calendarEventId = await createCalendarEvent({
        summary: `slushie blend — ${parent.businessName} (${planLabels[parent.plan]} #${nextWorkflowNumber})`,
        description: `customer: ${parent.name} (${parent.email})\nbusiness: ${parent.businessName}\nplan: ${planLabels[parent.plan]} — workflow ${nextWorkflowNumber} of ${totalWorkflows}\n\nworkflow description:\n${description}`,
        startTime: meetingTime,
        attendeeEmail: parent.email,
      });
    } catch (calErr: unknown) {
      const message = calErr instanceof Error ? calErr.message : "unknown error";
      console.error("google calendar event creation failed:", message);
      return NextResponse.json(
        { error: "failed to schedule meeting. please try again." },
        { status: 500 }
      );
    }

    // create follow-up booking
    const booking = await prisma.booking.create({
      data: {
        name: parent.name,
        email: parent.email,
        businessName: parent.businessName,
        plan: parent.plan,
        description,
        meetingTime: meetingDate,
        calendarEventId,
        clientId: parent.clientId,
        workflowNumber: nextWorkflowNumber,
        parentBookingId: parent.id,
      },
    });

    // create tracker with temp password
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

    // send confirmation email
    sendBookingConfirmed({
      to: parent.email,
      name: parent.name,
      businessName: parent.businessName,
      planLabel: `${planLabels[parent.plan]} — workflow ${nextWorkflowNumber} of ${totalWorkflows}`,
      meetingTime,
      slug,
      tempPassword,
    }).catch((err) => console.error("[email] next workflow booking confirmed failed:", err));

    return NextResponse.json({
      trackingSlug: tracker.slug,
      bookingId: booking.id,
      workflowNumber: nextWorkflowNumber,
    });
  } catch (err) {
    console.error("next workflow booking failed:", err);
    return NextResponse.json(
      { error: "something went wrong. please try again." },
      { status: 500 }
    );
  }
}
