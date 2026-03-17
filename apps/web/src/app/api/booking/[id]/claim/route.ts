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
  const { employeeId } = body;

  if (!employeeId) {
    return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
  });
  if (!booking) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  if (booking.assigneeId) {
    return NextResponse.json({ error: "already claimed" }, { status: 409 });
  }

  // claim the booking — just assigns the employee, does NOT trigger pipeline
  await prisma.booking.update({
    where: { id },
    data: { assigneeId: employeeId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  await prisma.booking.update({
    where: { id },
    data: { assigneeId: null },
  });

  return NextResponse.json({ ok: true });
}
