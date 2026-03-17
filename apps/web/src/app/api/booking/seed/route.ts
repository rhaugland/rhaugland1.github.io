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

const DEMO_DESCRIPTION = `I run a property management company called Bennett Properties. We manage 47 rental units across 3 buildings in downtown Portland.

Right now our entire operation runs through Google Sheets. I have one master sheet that tracks every unit — tenant name, lease dates, monthly rent, maintenance requests, payment status. Every month I manually go through each row, check if rent came in via our Stripe account, mark it paid or overdue, then calculate our revenue and send a summary to my business partner.

Maintenance requests come in through email or text. I copy-paste them into another tab of the same spreadsheet, assign them to our handyman, and track completion manually. I often lose track of requests or forget to follow up.

What I need:
1. A property management dashboard that pulls data from our Google Sheets master tracker and displays it beautifully — unit status, occupancy rates, revenue by building, upcoming lease renewals
2. Integration with Stripe so I can see which tenants have paid, which are overdue, and total revenue in real-time without manually checking
3. A maintenance request system that connects to the Google Sheet — new requests show up in the dashboard, I can assign them, track progress, and tenants get notified when complete
4. Monthly reports auto-generated from the sheet data — revenue breakdown, occupancy trends, maintenance costs
5. A tenant portal where renters can see their lease info, submit maintenance requests, and see payment history

tools/tech stack: google sheets, stripe

I need this to actually connect to our Google Sheet and Stripe account. The sheet has columns: Unit Number, Building, Tenant Name, Tenant Email, Lease Start, Lease End, Monthly Rent, Payment Status, Last Payment Date, Notes. Right now I have 47 rows of active tenants.`;

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // find or create the employee for the logged-in user
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

  // create client
  const client = await prisma.client.create({
    data: {
      name: "Bennett Properties",
      industry: "Property Management",
      contactName: "Marcus Bennett",
      contactEmail: "marcus@bennettproperties.com",
    },
  });

  // create the booking — assigned to the current user, no meetingTime
  const booking = await prisma.booking.create({
    data: {
      name: "Marcus Bennett",
      email: "marcus@bennettproperties.com",
      businessName: "Bennett Properties",
      plan: "TRIPLE_FREEZE",
      description: DEMO_DESCRIPTION,
      calendarEventId: `demo-event-${nanoid(10)}`,
      clientId: client.id,
      assigneeId: employee.id,
    },
  });

  // create a call record (transcript = booking description)
  const call = await prisma.call.create({
    data: {
      clientId: client.id,
      startedAt: new Date(),
      endedAt: new Date(),
      transcript: DEMO_DESCRIPTION,
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

  // dispatch call.ended event to trigger the analyst → builder pipeline
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
    trackingSlug: slug,
    pipelineRunId: pipelineRun.id,
    description: "Bennett Properties — property management with Google Sheets + Stripe integration",
  });
}
