import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { getRedisPublisher } from "@/lib/redis";
import { sendCredentialsNeeded } from "@/lib/email";
import { verifyTrackerAccess } from "@/lib/tracker-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const hasAccess = await verifyTrackerAccess(slug);
  if (!hasAccess) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action, feedback } = body;

  if (action !== "approve" && action !== "request_revision") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'request_revision'" },
      { status: 400 }
    );
  }

  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    include: { booking: { select: { id: true, name: true, email: true, businessName: true } } },
  });

  if (!tracker) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (tracker.currentStep !== 4) {
    return NextResponse.json(
      { error: "build is not currently awaiting your approval" },
      { status: 400 }
    );
  }

  if (action === "approve") {
    // advance to step 5 (plug-in)
    const steps = tracker.steps as Array<{
      step: number; label: string; subtitle: string; status: string; completedAt: string | null;
    }>;

    const nextStep = 5;
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
        currentStep: nextStep,
        steps: updatedSteps,
        clientFeedback: null,
        revisionStatus: null,
      },
    });

    // publish SSE update
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

    // email client: credentials needed (step 5)
    if (tracker.booking?.email) {
      sendCredentialsNeeded({
        to: tracker.booking.email,
        name: tracker.booking.name,
        businessName: tracker.booking.businessName,
        slug,
      }).catch((err) => console.error("[email] credentials needed failed:", err));
    }

    return NextResponse.json({ ok: true, action: "approved", currentStep: nextStep });
  }

  // action === "request_revision"
  if (!feedback || typeof feedback !== "string" || feedback.trim().length === 0) {
    return NextResponse.json(
      { error: "please describe the changes you'd like" },
      { status: 400 }
    );
  }

  await prisma.tracker.update({
    where: { id: tracker.id },
    data: {
      clientFeedback: feedback.trim(),
      revisionStatus: "revision_received",
    },
  });

  // publish SSE so the dashboard updates
  const redis2 = getRedisPublisher();
  await redis2.publish(
    `tracker:${tracker.pipelineRunId ?? tracker.id}`,
    JSON.stringify({
      type: "client.revision",
      feedback: feedback.trim(),
      timestamp: Date.now(),
    })
  );

  return NextResponse.json({ ok: true, action: "revision_requested" });
}
