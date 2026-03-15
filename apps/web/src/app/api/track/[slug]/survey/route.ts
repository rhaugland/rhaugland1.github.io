import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import Redis from "ioredis";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
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
    include: { booking: { select: { id: true, email: true } } },
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
  }

  // publish SSE to update tracker live
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
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
  } finally {
    redis.disconnect();
  }

  return NextResponse.json({ ok: true, freeAddon: true });
}
