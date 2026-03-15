import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
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

    // meeting time = now (so start call button appears)
    const meetingTime = new Date();

    // create booking — no calendar event, just a demo marker
    const booking = await prisma.booking.create({
      data: {
        name: data.name,
        email: data.email,
        businessName: data.businessName,
        plan: data.plan,
        description: data.description,
        meetingTime,
        calendarEventId: `demo-${nanoid(10)}`,
        clientId: client.id,
      },
    });

    // create tracker with password auth — NO pipeline run yet
    // the real pipeline gets triggered when someone claims the booking
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

    await prisma.tracker.create({
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

    return NextResponse.json({
      ok: true,
      trackingSlug: slug,
      bookingId: booking.id,
      tempPassword,
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
