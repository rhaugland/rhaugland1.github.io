import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { nanoid } from "nanoid";
import { sendBookingConfirmed } from "@/lib/email";
import { createEventQueue, createEvent } from "@slushie/events";

const pipelineQueue = createEventQueue("pipeline");

const PLAN_WORKFLOW_COUNT: Record<string, number> = {
  SINGLE_SCOOP: 1,
  DOUBLE_BLEND: 2,
  TRIPLE_FREEZE: 3,
};

const BOOKING_STEPS = [
  { step: 1, label: "intake build", subtitle: "we're already building your first prototype." },
  { step: 2, label: "schedule discovery", subtitle: "your rep will reach out to schedule a discovery call." },
  { step: 3, label: "discovery meeting", subtitle: "let's walk through your workflow together." },
  { step: 4, label: "discovery build", subtitle: "building an improved version based on our conversation." },
  { step: 5, label: "schedule demo", subtitle: "your rep will reach out to schedule a demo of what we've built." },
  { step: 6, label: "demo call", subtitle: "let's walk through the build together." },
  { step: 7, label: "demo build", subtitle: "incorporating your feedback from the demo." },
  { step: 8, label: "internal review", subtitle: "our team is reviewing and polishing." },
  { step: 9, label: "client approval", subtitle: "take a look and let us know what you think." },
  { step: 10, label: "plug-in", subtitle: "connecting to your tools. almost there." },
  { step: 11, label: "payment", subtitle: "invoice sent. simple and transparent." },
  { step: 12, label: "satisfaction survey", subtitle: "how'd we do? we want to keep getting better." },
];

const planLabels: Record<string, string> = {
  SINGLE_SCOOP: "single scoop",
  DOUBLE_BLEND: "double blend",
  TRIPLE_FREEZE: "triple freeze",
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { parentBookingId, description } = body;

    if (!parentBookingId || !description) {
      return NextResponse.json(
        { error: "parentBookingId and description are required" },
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

    // create follow-up booking (no meetingTime — scheduled later via discovery)
    const booking = await prisma.booking.create({
      data: {
        name: parent.name,
        email: parent.email,
        businessName: parent.businessName,
        plan: parent.plan,
        description,
        clientId: parent.clientId,
        workflowNumber: nextWorkflowNumber,
        parentBookingId: parent.id,
      },
    });

    // create call record with description as transcript
    const clientId = parent.clientId!;
    const call = await prisma.call.create({
      data: {
        clientId,
        startedAt: new Date(),
        endedAt: new Date(),
        transcript: description,
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

    // create tracker at step 1 (active — intake build)
    const slug = nanoid(21);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

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
      },
    });

    // dispatch call.ended to trigger analyst → builder pipeline
    await pipelineQueue.add(
      "call.ended",
      createEvent("call.ended", pipelineRun.id, {
        callId: call.id,
        clientId,
        duration: 0,
      })
    );

    // send confirmation email
    sendBookingConfirmed({
      to: parent.email,
      name: parent.name,
      businessName: parent.businessName,
      planLabel: `${planLabels[parent.plan]} — workflow ${nextWorkflowNumber} of ${totalWorkflows}`,
    }).catch((err) => console.error("[email] next workflow booking confirmed failed:", err));

    return NextResponse.json({
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
