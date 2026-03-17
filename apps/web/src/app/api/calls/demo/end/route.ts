import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { createEventQueue, createEvent } from "@slushie/events";

const pipelineQueue = createEventQueue("pipeline");

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { pipelineRunId, transcript } = await request.json();
  if (!pipelineRunId || !transcript) {
    return NextResponse.json(
      { error: "pipelineRunId and transcript required" },
      { status: 400 }
    );
  }

  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: { tracker: true },
  });

  if (!run?.tracker) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // store demo transcript on the pipeline run
  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: { transcriptSnapshot: transcript },
  });

  // advance tracker to step 7 (demo build) — steps i<=5 done, i===6 active
  const steps = run.tracker.steps as Array<{
    step: number;
    label: string;
    subtitle: string;
    status: string;
    completedAt: string | null;
  }>;
  const updatedSteps = steps.map((s, i) => ({
    ...s,
    status: i <= 5 ? "done" : i === 6 ? "active" : s.status,
    completedAt:
      i <= 5 && !s.completedAt ? new Date().toISOString() : s.completedAt,
  }));

  await prisma.tracker.update({
    where: { id: run.tracker.id },
    data: { currentStep: 7, steps: updatedSteps },
  });

  // dispatch demo.call.complete to trigger analyst + builder for v3
  await pipelineQueue.add(
    "demo.call.complete",
    createEvent("demo.call.complete", pipelineRunId, {
      callId: run.callId,
      clientId: run.clientId,
      transcript,
    })
  );

  return NextResponse.json({ ok: true });
}
