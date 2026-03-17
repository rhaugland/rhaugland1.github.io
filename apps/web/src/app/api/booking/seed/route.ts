import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";

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

const BUSINESSES = [
  { name: "Bennett Properties", industry: "Property Management", contact: "Marcus Bennett", description: "Property management dashboard with Google Sheets + Stripe integration.\n\ntools/tech stack: google sheets, stripe" },
  { name: "Greenleaf Nursery", industry: "Retail", contact: "Sarah Greenleaf", description: "Inventory and order management for a plant nursery.\n\ntools/tech stack: shopify, google sheets" },
  { name: "Apex Fitness", industry: "Fitness", contact: "Jake Torres", description: "Member check-in and billing automation for a gym.\n\ntools/tech stack: stripe, google calendar" },
  { name: "Coastal Catering", industry: "Food Service", contact: "Priya Patel", description: "Event booking and invoice pipeline for a catering company.\n\ntools/tech stack: quickbooks, google sheets" },
  { name: "Northstar Tutoring", industry: "Education", contact: "David Kim", description: "Student scheduling and progress tracking for a tutoring service.\n\ntools/tech stack: google calendar, notion" },
  { name: "Riverwalk Realty", industry: "Real Estate", contact: "Amy Chen", description: "Lead tracking and showing scheduler for a real estate team.\n\ntools/tech stack: google sheets, google calendar" },
  { name: "Bolt Electrical", industry: "Trades", contact: "Mike Duran", description: "Job scheduling and estimate generation for an electrician.\n\ntools/tech stack: google sheets, quickbooks" },
  { name: "Sunrise Bakery", industry: "Food & Bev", contact: "Lisa Nguyen", description: "Wholesale order tracking and delivery route planning.\n\ntools/tech stack: google sheets, stripe" },
  { name: "Peak Consulting", industry: "Consulting", contact: "Tom Richards", description: "Client project tracker and automated status report emails.\n\ntools/tech stack: notion, google sheets" },
  { name: "Harbor Marine", industry: "Marine Services", contact: "Dan Kowalski", description: "Boat maintenance scheduling and parts inventory.\n\ntools/tech stack: google sheets, quickbooks" },
  { name: "Wildflower Events", industry: "Events", contact: "Megan Liu", description: "Event planning timeline and vendor coordination dashboard.\n\ntools/tech stack: google sheets, slack" },
  { name: "Atlas Accounting", industry: "Finance", contact: "Rachel Stone", description: "Client document collection and tax prep workflow.\n\ntools/tech stack: quickbooks, google drive" },
];

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

  const results = [];

  for (let stepNum = 1; stepNum <= 12; stepNum++) {
    const biz = BUSINESSES[stepNum - 1];

    const client = await prisma.client.create({
      data: {
        name: biz.name,
        industry: biz.industry,
        contactName: biz.contact,
        contactEmail: DEMO_EMAIL,
      },
    });

    const booking = await prisma.booking.create({
      data: {
        name: biz.contact,
        email: DEMO_EMAIL,
        businessName: biz.name,
        plan: "SINGLE_SCOOP",
        description: biz.description,
        clientId: client.id,
        assigneeId: employee.id,
      },
    });

    const call = await prisma.call.create({
      data: {
        clientId: client.id,
        startedAt: new Date(),
        endedAt: new Date(),
        transcript: biz.description,
        coachingLog: [],
      },
    });

    const pipelineRun = await prisma.pipelineRun.create({
      data: {
        clientId: client.id,
        callId: call.id,
        status: stepNum >= 12 ? "COMPLETED" : "RUNNING",
      },
    });

    // build steps array with correct statuses for this step
    const steps = BOOKING_STEPS.map((s, i) => ({
      ...s,
      status: i < stepNum - 1 ? "done" : i === stepNum - 1 ? "active" : "pending",
      completedAt: i < stepNum - 1 ? new Date().toISOString() : null,
    }));

    const slug = nanoid(21);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.tracker.create({
      data: {
        bookingId: booking.id,
        pipelineRunId: pipelineRun.id,
        slug,
        currentStep: stepNum,
        steps,
        expiresAt,
        // set discovery fields for steps past 2
        ...(stepNum > 2 && {
          discoveryEmailStatus: "scheduled",
          discoveryEmailSentAt: new Date(),
        }),
        // set demo fields for steps past 5
        ...(stepNum > 5 && {
          demoEmailStatus: "scheduled",
          demoEmailSentAt: new Date(),
          demoMeetingTime: new Date(),
        }),
        // set review fields for step 8
        ...(stepNum === 8 && {
          reviewMessages: [
            { from: "employee", text: "can we make the charts more prominent on the dashboard?", at: new Date().toISOString() },
            { from: "system", text: "updated — charts are now the hero section of the dashboard.", at: new Date().toISOString() },
          ],
          reviewStatus: "ready",
        }),
      },
    });

    // mark completed bookings
    if (stepNum > 12) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "COMPLETED" },
      });
    }

    results.push({ step: stepNum, label: BOOKING_STEPS[stepNum - 1].label, businessName: biz.name });
  }

  return NextResponse.json({ ok: true, seeded: results });
}
