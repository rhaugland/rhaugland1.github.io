import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import Redis from "ioredis";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      tracker: true,
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  if (!booking.tracker) {
    return NextResponse.json({ error: "no tracker for this booking" }, { status: 404 });
  }

  const tracker = booking.tracker;
  const steps = tracker.steps as Array<{
    step: number;
    label: string;
    subtitle: string;
    status: string;
    completedAt: string | null;
  }>;

  if (!steps || tracker.currentStep >= steps.length) {
    return NextResponse.json(
      { error: "tracker is already at the final step" },
      { status: 400 }
    );
  }

  const nextStep = tracker.currentStep + 1;

  // update step statuses
  const updatedSteps = steps.map((s, i) => {
    if (i < nextStep - 1) {
      return { ...s, status: "done", completedAt: s.completedAt ?? new Date().toISOString() };
    }
    if (i === nextStep - 1) {
      // if final step, mark as done immediately
      if (nextStep === steps.length) {
        return { ...s, status: "done", completedAt: new Date().toISOString() };
      }
      return { ...s, status: "active" };
    }
    return { ...s, status: "pending" };
  });

  const updated = await prisma.tracker.update({
    where: { id: tracker.id },
    data: {
      currentStep: nextStep,
      steps: updatedSteps,
    },
  });

  // mark booking as COMPLETED when reaching the final step
  if (nextStep === steps.length) {
    await prisma.booking.update({
      where: { id },
      data: { status: "COMPLETED" },
    });
  }

  // publish SSE update via Redis
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const channel = `tracker:${tracker.id}`;
    const payload = JSON.stringify({
      type: "tracker.update",
      step: nextStep,
      label: steps[nextStep - 1].label,
      subtitle: steps[nextStep - 1].subtitle,
      steps: updatedSteps,
      timestamp: Date.now(),
    });

    await redis.publish(channel, payload);
  } finally {
    redis.disconnect();
  }

  return NextResponse.json({
    currentStep: updated.currentStep,
    steps: updatedSteps,
  });
}
