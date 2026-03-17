import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pipelineRunId = searchParams.get("pipelineRunId");

  if (!pipelineRunId) {
    return NextResponse.json({ error: "pipelineRunId is required" }, { status: 400 });
  }

  const tracker = await prisma.tracker.findUnique({
    where: { pipelineRunId },
    include: {
      booking: {
        select: {
          businessName: true,
          name: true,
          plan: true,
          description: true,
        },
      },
    },
  });

  if (!tracker?.booking) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  return NextResponse.json({
    businessName: tracker.booking.businessName,
    name: tracker.booking.name,
    plan: tracker.booking.plan,
    description: tracker.booking.description,
  });
}
