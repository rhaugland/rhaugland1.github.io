import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import bcrypt from "bcryptjs";
import { verifyTrackerAccess } from "@/lib/tracker-auth";
import { sendPasswordUpdated } from "@/lib/email";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // must be logged in
  const hasAccess = await verifyTrackerAccess(slug);
  if (!hasAccess) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "current and new password are required" },
      { status: 400 }
    );
  }

  if (newPassword.length < 6) {
    return NextResponse.json(
      { error: "new password must be at least 6 characters" },
      { status: 400 }
    );
  }

  const tracker = await prisma.tracker.findUnique({
    where: { slug },
  });

  if (!tracker || !tracker.passwordHash) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, tracker.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "current password is incorrect" }, { status: 401 });
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  await prisma.tracker.update({
    where: { id: tracker.id },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  // send email with updated credentials + tracker link
  const booking = await prisma.booking.findFirst({
    where: { tracker: { id: tracker.id } },
    select: { name: true, email: true },
  });

  if (booking) {
    sendPasswordUpdated({
      to: booking.email,
      name: booking.name,
      slug,
      newPassword,
    }).catch((err) => console.error("[email] password updated failed:", err));
  }

  return NextResponse.json({ ok: true });
}
