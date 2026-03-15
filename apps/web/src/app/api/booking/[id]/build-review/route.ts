import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { createEventQueue, createEvent } from "@slushie/events";
import { getRedisPublisher } from "@/lib/redis";
import { sendBuildReadyForApproval } from "@/lib/email";

const builderQueue = createEventQueue("builder");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action, feedback } = body;

  if (action !== "approve" && action !== "request_changes") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'request_changes'" },
      { status: 400 }
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { tracker: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  if (!booking.tracker) {
    return NextResponse.json({ error: "no tracker for this booking" }, { status: 404 });
  }

  const tracker = booking.tracker;

  if (action === "approve") {
    // advance tracker from slushie review (step 3) to client build approval (step 4)
    const steps = tracker.steps as Array<{
      step: number; label: string; subtitle: string; status: string; completedAt: string | null;
    }>;

    const nextStep = tracker.currentStep + 1;
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
      data: { currentStep: nextStep, steps: updatedSteps },
    });

    // publish SSE update
    const redis = getRedisPublisher();
    await redis.publish(
      `tracker:${tracker.id}`,
      JSON.stringify({
        type: "tracker.update",
        step: nextStep,
        label: steps[nextStep - 1].label,
        subtitle: steps[nextStep - 1].subtitle,
        steps: updatedSteps,
        timestamp: Date.now(),
      })
    );

    // email client: build is ready for their review (step 4)
    if (nextStep === 4 && booking.email && tracker.slug) {
      sendBuildReadyForApproval({
        to: booking.email,
        name: booking.name,
        businessName: booking.businessName,
        slug: tracker.slug,
      }).catch((err) => console.error("[email] build ready failed:", err));
    }

    return NextResponse.json({ ok: true, action: "approved", currentStep: nextStep });
  }

  // action === "request_changes"
  if (!feedback || typeof feedback !== "string" || feedback.trim().length === 0) {
    return NextResponse.json({ error: "feedback is required for change requests" }, { status: 400 });
  }

  if (!tracker.pipelineRunId) {
    return NextResponse.json({ error: "no pipeline run linked to this booking" }, { status: 400 });
  }

  // send feedback to builder via build.message event
  await builderQueue.add(
    "build.message",
    createEvent("build.message", tracker.pipelineRunId, {
      text: feedback.trim(),
      sentBy: session.user.email,
    })
  );

  return NextResponse.json({ ok: true, action: "changes_requested" });
}
