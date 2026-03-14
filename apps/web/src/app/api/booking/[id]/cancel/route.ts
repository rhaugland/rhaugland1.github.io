import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { tracker: { select: { currentStep: true, id: true } } },
  });

  if (!booking) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  // can only cancel during step 1 (meeting confirmed)
  if (!booking.tracker || booking.tracker.currentStep > 1) {
    return NextResponse.json(
      { error: "can only cancel before your meeting starts" },
      { status: 400 }
    );
  }

  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "already cancelled" }, { status: 400 });
  }

  await prisma.booking.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ ok: true });
}
