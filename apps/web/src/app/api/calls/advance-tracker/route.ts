import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { sendTeamReviewing } from "@/lib/email";

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

  // advance to step 3 (slushie build review) after call ends
  const steps = tracker.steps as Array<{
    step: number; label: string; subtitle: string; status: string; completedAt: string | null;
  }>;
  const updatedSteps = steps.map((s, i) => ({
    ...s,
    status: i <= 1 ? "done" : i === 2 ? "active" : s.status,
    completedAt: i <= 1 && s.status !== "done" ? new Date().toISOString() : s.completedAt,
  }));

  await prisma.tracker.update({
    where: { id: tracker.id },
    data: { currentStep: 3, steps: updatedSteps },
  });

  // email client: team is reviewing (step 3)
  if (tracker.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: tracker.bookingId },
      select: { name: true, email: true, businessName: true },
    });
    if (booking?.email) {
      sendTeamReviewing({
        to: booking.email,
        name: booking.name,
        businessName: booking.businessName,
      }).catch((err) => console.error("[email] team reviewing failed:", err));
    }
  }

  return NextResponse.json({ ok: true, currentStep: 3 });
}
