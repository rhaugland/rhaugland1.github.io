import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
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

const DEMO_EMAIL = "ryanrhaugland@gmail.com";

const DESCRIPTION = `I manage 12 rental properties and track everything in a Google Sheet — tenant info, lease dates, rent payments, maintenance requests. Every month I manually check Stripe to see who paid, update the sheet, calculate totals, and email my partner a summary. Maintenance requests come in via text and I copy them into the sheet. I need a dashboard that syncs with my Google Sheet and Stripe account to show occupancy, revenue, overdue payments, and maintenance status in real time. Auto-generate monthly reports.

tools/tech stack: google sheets, stripe`;

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let employee = await prisma.employee.findFirst({
    where: { email: { equals: session.user.email, mode: "insensitive" } },
  });

  if (!employee) {
    employee = await prisma.employee.create({
      data: {
        name: session.user.name ?? session.user.email.split("@")[0],
        email: session.user.email,
      },
    });
  }

  // 1. Client
  const client = await prisma.client.create({
    data: {
      name: "Haugland Property Management",
      industry: "Property Management",
      contactName: "Ryan Haugland",
      contactEmail: DEMO_EMAIL,
    },
  });

  // 2. Booking
  const booking = await prisma.booking.create({
    data: {
      name: "Ryan Haugland",
      email: DEMO_EMAIL,
      businessName: "Haugland Property Management",
      plan: "SINGLE_SCOOP",
      description: DESCRIPTION,
      clientId: client.id,
      assigneeId: employee.id,
    },
  });

  // 3. Call
  const call = await prisma.call.create({
    data: {
      clientId: client.id,
      startedAt: new Date(),
      endedAt: new Date(),
      transcript: DESCRIPTION,
      coachingLog: [],
    },
  });

  // 4. PipelineRun
  const pipelineRun = await prisma.pipelineRun.create({
    data: {
      clientId: client.id,
      callId: call.id,
      status: "RUNNING",
    },
  });

  // 5. Tracker with step 1 active
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

  // 6. Dispatch call.ended to trigger analyst → builder pipeline
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
    seeded: { businessName: "Haugland Property Management", bookingId: booking.id, pipelineRunId: pipelineRun.id },
  });
}
