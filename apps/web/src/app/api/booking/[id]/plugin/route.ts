import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { createEventQueue, createEvent } from "@slushie/events";
import Redis from "ioredis";

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
  const { action } = body;

  if (action !== "connect" && action !== "complete") {
    return NextResponse.json(
      { error: "action must be 'connect' or 'complete'" },
      { status: 400 }
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { tracker: true },
  });

  if (!booking?.tracker) {
    return NextResponse.json({ error: "booking or tracker not found" }, { status: 404 });
  }

  const tracker = booking.tracker;

  if (action === "connect") {
    if (!tracker.pipelineRunId) {
      return NextResponse.json({ error: "no pipeline run linked" }, { status: 400 });
    }

    const credentials = tracker.pluginCredentials as Array<{ service: string; value: string }> | null;
    if (!credentials || credentials.length === 0) {
      return NextResponse.json({ error: "no credentials to connect with" }, { status: 400 });
    }

    // update status to connecting
    await prisma.tracker.update({
      where: { id: tracker.id },
      data: { pluginStatus: "connecting" },
    });

    // send credentials to builder bot for integration
    const credentialSummary = credentials
      .map((c) => `${c.service}: ${c.value}`)
      .join("\n");

    await builderQueue.add(
      "build.message",
      createEvent("build.message", tracker.pipelineRunId, {
        text: `PLUGIN INTEGRATION REQUEST:\nConnect the approved build to the client's workflow using these credentials:\n${credentialSummary}`,
        sentBy: session.user.email,
      })
    );

    return NextResponse.json({ ok: true, action: "connecting" });
  }

  // action === "complete" — mark plug-in done and advance to step 6
  const steps = tracker.steps as Array<{
    step: number; label: string; subtitle: string; status: string; completedAt: string | null;
  }>;

  const nextStep = 6;
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
      pluginStatus: "connected",
    },
  });

  // publish SSE update
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
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
  } finally {
    redis.disconnect();
  }

  return NextResponse.json({ ok: true, action: "completed", currentStep: nextStep });
}
