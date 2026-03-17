import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import Stripe from "stripe";
import { getRedisPublisher } from "@/lib/redis";
import { sendSurveyOpen, sendPaymentFailed } from "@/lib/email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const trackerId = session.metadata?.trackerId;

    if (!trackerId) {
      return NextResponse.json({ ok: true, message: "no tracker metadata" });
    }

    const tracker = await prisma.tracker.findUnique({
      where: { id: trackerId },
      include: { booking: { select: { name: true, email: true, businessName: true } } },
    });

    if (!tracker || tracker.paidAt) {
      return NextResponse.json({ ok: true, message: "already processed" });
    }

    // mark as paid and advance to step 7 (satisfaction survey)
    const steps = tracker.steps as Array<{
      step: number; label: string; subtitle: string; status: string; completedAt: string | null;
    }>;

    const nextStep = 7;
    const updatedSteps = steps.map((s, i) => {
      if (i < nextStep - 1) {
        return { ...s, status: "done", completedAt: s.completedAt ?? new Date().toISOString() };
      }
      if (i === nextStep - 1) {
        return { ...s, status: "active" };
      }
      return { ...s, status: "pending" };
    });

    await prisma.tracker.update({
      where: { id: tracker.id },
      data: {
        paidAt: new Date(),
        currentStep: nextStep,
        steps: updatedSteps,
      },
    });

    // publish SSE update so tracker page updates live
    const redis = getRedisPublisher();
    await redis.publish(
      `tracker:${tracker.pipelineRunId ?? tracker.id}`,
      JSON.stringify({
        type: "tracker.update",
        step: nextStep,
        label: steps[nextStep - 1].label,
        subtitle: steps[nextStep - 1].subtitle,
        steps: updatedSteps,
        timestamp: Date.now(),
      })
    );

    // email client: survey is open (step 7)
    if (tracker.booking?.email) {
      sendSurveyOpen({
        to: tracker.booking.email,
        name: tracker.booking.name,
        businessName: tracker.booking.businessName,
      }).catch((err) => console.error("[email] survey open failed:", err));
    }
  }

  // handle expired/abandoned checkout sessions
  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const trackerId = session.metadata?.trackerId;
    const sessionSlug = session.metadata?.slug;

    if (trackerId && sessionSlug) {
      const tracker = await prisma.tracker.findUnique({
        where: { id: trackerId },
        include: { booking: { select: { name: true, email: true, businessName: true, plan: true } } },
      });

      if (tracker && !tracker.paidAt && tracker.booking?.email) {
        // clear the expired session ID so they can try again
        await prisma.tracker.update({
          where: { id: tracker.id },
          data: { stripeSessionId: null },
        });

        const planLabels: Record<string, string> = {
          SINGLE_SCOOP: "single scoop",
          DOUBLE_BLEND: "double blend",
          TRIPLE_FREEZE: "triple freeze",
        };

        sendPaymentFailed({
          to: tracker.booking.email,
          name: tracker.booking.name,
          businessName: tracker.booking.businessName,
          planLabel: planLabels[tracker.booking.plan] ?? tracker.booking.plan,
        }).catch((err) => console.error("[email] payment failed notification failed:", err));
      }
    }
  }

  return NextResponse.json({ ok: true });
}
