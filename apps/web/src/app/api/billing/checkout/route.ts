import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import Stripe from "stripe";
import { sendSurveyOpen } from "@/lib/email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PLAN_PRICES: Record<string, number> = {
  SINGLE_SCOOP: 3500_00, // $3,500 in cents
  DOUBLE_BLEND: 6000_00, // $6,000 in cents
  TRIPLE_FREEZE: 8500_00, // $8,500 in cents
};

const PLAN_LABELS: Record<string, string> = {
  SINGLE_SCOOP: "single scoop",
  DOUBLE_BLEND: "double blend",
  TRIPLE_FREEZE: "triple freeze",
};

export async function POST(request: Request) {
  const body = await request.json();
  const { slug } = body;

  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    include: {
      booking: { select: { id: true, name: true, plan: true, businessName: true, email: true } },
    },
  });

  if (!tracker || !tracker.booking) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (tracker.paidAt) {
    return NextResponse.json({ error: "already paid" }, { status: 400 });
  }

  const plan = tracker.booking.plan;
  const price = PLAN_PRICES[plan];
  if (!price) {
    return NextResponse.json({ error: "invalid plan" }, { status: 400 });
  }

  // check if this email earned a free add-on from a previous booking
  const hasFreeAddon = await prisma.booking.findFirst({
    where: {
      email: tracker.booking.email,
      freeAddonEarned: true,
      id: { not: tracker.booking.id },
    },
    select: { id: true },
  });

  // free single scoop for returning clients with earned add-on
  if (hasFreeAddon && plan === "SINGLE_SCOOP") {
    // mark all steps up to step 6 as done, step 7 as active
    const steps = tracker.steps as Array<{
      step: number; label: string; subtitle: string; status: string; completedAt: string | null;
    }>;
    const updatedSteps = steps.map((s, i) => ({
      ...s,
      status: i < 6 ? "done" : i === 6 ? "active" : s.status,
      completedAt: i < 6 && !s.completedAt ? new Date().toISOString() : s.completedAt,
    }));

    await prisma.tracker.update({
      where: { id: tracker.id },
      data: { paidAt: new Date(), currentStep: 7, steps: updatedSteps },
    });

    // email client: survey is open
    sendSurveyOpen({
      to: tracker.booking.email,
      name: tracker.booking.name,
      businessName: tracker.booking.businessName,
    }).catch((err) => console.error("[email] survey open (free) failed:", err));

    return NextResponse.json({ free: true });
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: tracker.booking.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `slushie ${PLAN_LABELS[plan]}`,
            description: `custom workflow tool for ${tracker.booking.businessName}`,
          },
          unit_amount: price,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      receipt_email: tracker.booking.email,
    },
    metadata: {
      trackerId: tracker.id,
      bookingId: tracker.booking.id,
      slug: tracker.slug,
    },
    success_url: `${origin}/?paid=true`,
    cancel_url: `${origin}/`,
    expires_at: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
  });

  // store session ID on tracker
  await prisma.tracker.update({
    where: { id: tracker.id },
    data: { stripeSessionId: session.id },
  });

  return NextResponse.json({ url: session.url });
}
