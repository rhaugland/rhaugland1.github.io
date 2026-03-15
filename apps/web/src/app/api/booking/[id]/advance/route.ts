import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { getRedisPublisher } from "@/lib/redis";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // check direction — default is forward
  let direction: "forward" | "back" = "forward";
  try {
    const body = await request.json();
    if (body.direction === "back") direction = "back";
  } catch {
    // no body = forward
  }

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

  if (direction === "back") {
    if (tracker.currentStep <= 1) {
      return NextResponse.json(
        { error: "already at the first step" },
        { status: 400 }
      );
    }

    const prevStep = tracker.currentStep - 1;

    const updatedSteps = steps.map((s, i) => {
      if (i < prevStep - 1) {
        return { ...s, status: "done", completedAt: s.completedAt };
      }
      if (i === prevStep - 1) {
        return { ...s, status: "active", completedAt: null };
      }
      return { ...s, status: "pending", completedAt: null };
    });

    const updated = await prisma.tracker.update({
      where: { id: tracker.id },
      data: { currentStep: prevStep, steps: updatedSteps },
    });

    // if we moved back from COMPLETED, reopen the booking
    if (booking.status === "COMPLETED") {
      await prisma.booking.update({
        where: { id },
        data: { status: "CONFIRMED" },
      });
    }

    // publish SSE
    const redis = getRedisPublisher();
    await redis.publish(
      `tracker:${tracker.pipelineRunId ?? tracker.id}`,
      JSON.stringify({
        type: "tracker.update",
        step: prevStep,
        label: steps[prevStep - 1].label,
        subtitle: steps[prevStep - 1].subtitle,
        steps: updatedSteps,
        timestamp: Date.now(),
      })
    );

    return NextResponse.json({
      currentStep: updated.currentStep,
      steps: updatedSteps,
    });
  }

  // direction === "forward"
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

  return NextResponse.json({
    currentStep: updated.currentStep,
    steps: updatedSteps,
  });
}
