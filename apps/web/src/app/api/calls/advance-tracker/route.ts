import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pipelineRunId } = body;

  if (!pipelineRunId) {
    return NextResponse.json({ error: "pipelineRunId is required" }, { status: 400 });
  }

  // find tracker linked to this pipeline run
  const tracker = await prisma.tracker.findUnique({
    where: { pipelineRunId },
  });

  if (!tracker || !tracker.bookingId) {
    return NextResponse.json({ ok: true, message: "no booking tracker to advance" });
  }

  // advance to step 3 (build completion) after call ends
  const steps = tracker.steps as Array<{
    step: number; label: string; subtitle: string; status: string; completedAt: string | null;
  }>;
  const updatedSteps = steps.map((s, i) => ({
    ...s,
    status: i <= 2 ? "done" : i === 3 ? "active" : s.status,
    completedAt: i <= 2 && s.status !== "done" ? new Date().toISOString() : s.completedAt,
  }));

  await prisma.tracker.update({
    where: { id: tracker.id },
    data: { currentStep: 3, steps: updatedSteps },
  });

  return NextResponse.json({ ok: true, currentStep: 3 });
}
