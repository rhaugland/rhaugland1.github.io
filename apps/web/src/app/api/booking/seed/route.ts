import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";

const BOOKING_STEPS = [
  { step: 1, label: "meeting confirmed", subtitle: "your blend is scheduled. we'll see you there." },
  { step: 2, label: "meeting", subtitle: "we're on the call. workflow discovery in progress." },
  { step: 3, label: "build completion", subtitle: "your tool is built. time for a taste test." },
  { step: 4, label: "slushie build review", subtitle: "our team is reviewing the build for quality." },
  { step: 5, label: "client build approval", subtitle: "your turn. take a look and let us know." },
  { step: 6, label: "plug-in", subtitle: "connecting to your tools. almost there." },
  { step: 7, label: "billing", subtitle: "invoice sent. simple and transparent." },
  { step: 8, label: "satisfaction survey", subtitle: "how'd we do? we want to keep getting better." },
];

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

  // create a dummy client
  const client = await prisma.client.create({
    data: {
      name: "Acme Corp",
      industry: "SaaS",
      contactName: "Jane Smith",
      contactEmail: "jane@acmecorp.com",
    },
  });

  // schedule meeting for today at the next whole hour
  const now = new Date();
  const meetingTime = new Date(now);
  meetingTime.setHours(now.getHours() + 1, 0, 0, 0);

  // create the booking
  const booking = await prisma.booking.create({
    data: {
      name: "Jane Smith",
      email: "jane@acmecorp.com",
      businessName: "Acme Corp",
      plan: "DOUBLE_BLEND",
      description:
        "We use HubSpot for CRM, Slack for comms, and Google Sheets for tracking orders. " +
        "Every day our sales team manually copies deal data from HubSpot into a Google Sheet, " +
        "then posts a summary in Slack. This takes about 2 hours daily. We want an automated " +
        "pipeline that syncs HubSpot deals to a dashboard and posts daily summaries to Slack.",
      meetingTime,
      calendarEventId: `demo-event-${nanoid(10)}`,
      clientId: client.id,
      assigneeId: employee.id,
    },
  });

  // create tracker
  const slug = nanoid(21);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

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
    },
  });

  return NextResponse.json({
    ok: true,
    bookingId: booking.id,
    trackingSlug: slug,
    meetingTime: meetingTime.toISOString(),
  });
}
