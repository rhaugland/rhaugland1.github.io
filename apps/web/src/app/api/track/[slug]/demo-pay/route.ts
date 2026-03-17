import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { getRedisPublisher } from "@/lib/redis";
import { sendSurveyOpen } from "@/lib/email";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    include: { booking: { select: { name: true, email: true, businessName: true } } },
  });

  if (!tracker) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (tracker.paidAt) {
    return NextResponse.json({ error: "already paid" }, { status: 400 });
  }

  // mark as paid and advance to step 7
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
    data: {
      paidAt: new Date(),
      currentStep: 7,
      steps: updatedSteps,
    },
  });

  // publish SSE update
  const redis = getRedisPublisher();
  await redis.publish(
    `tracker:${tracker.pipelineRunId ?? tracker.id}`,
    JSON.stringify({
      type: "tracker.update",
      step: 7,
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
      slug,
    }).catch((err) => console.error("[email] survey open (demo-pay) failed:", err));
  }

  return NextResponse.json({ ok: true });
}
