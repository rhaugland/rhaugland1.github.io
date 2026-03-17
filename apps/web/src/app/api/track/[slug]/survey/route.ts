import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { getRedisPublisher } from "@/lib/redis";
import { verifyTrackerAccess } from "@/lib/tracker-auth";
import { sendFreeAddonReady, sendThankYou } from "@/lib/email";

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
  const { score, feedback } = body;

  if (typeof score !== "number" || score < 0 || score > 10) {
    return NextResponse.json(
      { error: "score must be a number between 0 and 10" },
      { status: 400 }
    );
  }

  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    include: { booking: { select: { id: true, name: true, email: true, businessName: true, plan: true, workflowNumber: true } } },
  });

  if (!tracker) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (tracker.currentStep !== 7) {
    return NextResponse.json(
      { error: "survey is not available at this step" },
      { status: 400 }
    );
  }

  if (tracker.npsCompletedAt) {
    return NextResponse.json({ error: "survey already completed" }, { status: 400 });
  }

  // mark all steps done
  const steps = tracker.steps as Array<{
    step: number; label: string; subtitle: string; status: string; completedAt: string | null;
  }>;

  const updatedSteps = steps.map((s) => ({
    ...s,
    status: "done",
    completedAt: s.completedAt ?? new Date().toISOString(),
  }));

  await prisma.tracker.update({
    where: { id: tracker.id },
    data: {
      npsScore: score,
      npsFeedback: feedback?.trim() || null,
      npsCompletedAt: new Date(),
      steps: updatedSteps,
    },
  });

  // mark the booking as earning a free add-on
  if (tracker.booking) {
    await prisma.booking.update({
      where: { id: tracker.booking.id },
      data: { freeAddonEarned: true, status: "COMPLETED" },
    });

    // email: your free add-on is ready to redeem
    sendFreeAddonReady({
      to: tracker.booking.email,
      name: tracker.booking.name,
      businessName: tracker.booking.businessName,
    }).catch((err) => console.error("[email] free addon ready failed:", err));

    // email: thank you + book next workflow (for double/triple scoop)
    const PLAN_WORKFLOW_COUNT: Record<string, number> = {
      SINGLE_SCOOP: 1,
      DOUBLE_BLEND: 2,
      TRIPLE_FREEZE: 3,
    };
    const totalWorkflows = PLAN_WORKFLOW_COUNT[tracker.booking.plan] ?? 1;

    sendThankYou({
      to: tracker.booking.email,
      name: tracker.booking.name,
      businessName: tracker.booking.businessName,
      slug,
      workflowNumber: tracker.booking.workflowNumber,
      totalWorkflows,
    }).catch((err) => console.error("[email] thank you failed:", err));
  }

  // publish SSE to update tracker live
  const redis = getRedisPublisher();
  await redis.publish(
    `tracker:${tracker.pipelineRunId ?? tracker.id}`,
    JSON.stringify({
      type: "tracker.update",
      step: 7,
      label: "satisfaction survey",
      subtitle: "complete!",
      steps: updatedSteps,
      timestamp: Date.now(),
    })
  );

  return NextResponse.json({ ok: true, freeAddon: true });
}
