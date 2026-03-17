import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { nanoid } from "nanoid";
import { createEventQueue, createEvent } from "@slushie/events";

const pipelineQueue = createEventQueue("pipeline");

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

interface DemoPreset {
  name: string;
  email: string;
  businessName: string;
  plan: "SINGLE_SCOOP" | "DOUBLE_BLEND" | "TRIPLE_FREEZE";
  description: string;
  industry: string;
}

const PRESETS: Record<string, DemoPreset> = {
  ryan: {
    name: "Ryan Haugland",
    email: "ryanrhaugland@gmail.com",
    businessName: "Haugland Consulting",
    plan: "DOUBLE_BLEND",
    description:
      "We run a consulting business and track all our client projects in Google Sheets. " +
      "Every week I manually pull data from QuickBooks invoices, cross-reference with our " +
      "Sheets tracker, and send a summary email to each client. This takes 3+ hours every " +
      "Monday. I want a system that auto-syncs invoices, updates the tracker, and sends " +
      "branded status emails to clients automatically.\n\n" +
      "tools/tech stack: quickbooks, google sheets",
    industry: "Consulting",
  },
  adam: {
    name: "Adam Roozen",
    email: "aroozen@gmail.com",
    businessName: "Roozen Media",
    plan: "TRIPLE_FREEZE",
    description:
      "We're a media agency managing 15+ social media accounts. Right now we copy-paste " +
      "analytics from Instagram, TikTok, and YouTube into a master Google Sheet every Friday, " +
      "then manually build client reports in Google Slides. Each report takes 45 minutes. " +
      "I need a pipeline that pulls analytics from all platforms, aggregates them into a " +
      "dashboard, and auto-generates branded PDF reports for each client.\n\n" +
      "tools/tech stack: google sheets, google drive, slack",
    industry: "Digital Marketing",
  },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { preset } = body;

    const data = PRESETS[preset];
    if (!data) {
      return NextResponse.json(
        { error: "invalid preset — use 'ryan' or 'adam'" },
        { status: 400 }
      );
    }

    // create client
    const client = await prisma.client.create({
      data: {
        name: data.businessName,
        industry: data.industry,
        contactName: data.name,
        contactEmail: data.email,
      },
    });

    // create booking — no meetingTime, no calendar event
    const booking = await prisma.booking.create({
      data: {
        name: data.name,
        email: data.email,
        businessName: data.businessName,
        plan: data.plan,
        description: data.description,
        calendarEventId: `demo-${nanoid(10)}`,
        clientId: client.id,
      },
    });

    // create call record with description as transcript
    const call = await prisma.call.create({
      data: {
        clientId: client.id,
        startedAt: new Date(),
        endedAt: new Date(),
        transcript: data.description,
        coachingLog: [],
      },
    });

    // create pipeline run
    const pipelineRun = await prisma.pipelineRun.create({
      data: {
        clientId: client.id,
        callId: call.id,
        status: "RUNNING",
      },
    });

    // create tracker at step 1 (active — intake build in progress)
    const slug = nanoid(21);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const steps = BOOKING_STEPS.map((s, i) => ({
      ...s,
      status: i === 0 ? "active" : "pending",
      completedAt: null as string | null,
    }));

    await prisma.tracker.create({
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
        clientId: client.id,
        duration: 0,
      })
    );

    return NextResponse.json({
      ok: true,
      bookingId: booking.id,
      email: data.email,
      name: data.name,
      businessName: data.businessName,
    });
  } catch (err) {
    console.error("demo booking creation failed:", err);
    return NextResponse.json(
      { error: "something went wrong creating the demo" },
      { status: 500 }
    );
  }
}
