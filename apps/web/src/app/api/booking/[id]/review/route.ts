import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";

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

  if (action !== "confirm" && action !== "release") {
    return NextResponse.json({ error: "action must be 'confirm' or 'release'" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  if (action === "confirm") {
    await prisma.booking.update({
      where: { id },
      data: { needsReview: false },
    });
  } else {
    await prisma.booking.update({
      where: { id },
      data: { needsReview: false, assigneeId: null },
    });
  }

  return NextResponse.json({ ok: true });
}
