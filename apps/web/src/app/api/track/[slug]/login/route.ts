import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import bcrypt from "bcryptjs";
import { setTrackerSession } from "@/lib/tracker-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await request.json();
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400 }
    );
  }

  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    include: { booking: { select: { email: true } } },
  });

  if (!tracker || !tracker.booking) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  // verify email matches the booking
  if (tracker.booking.email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  // verify password
  if (!tracker.passwordHash) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, tracker.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  // set auth cookie
  await setTrackerSession(slug, email.toLowerCase());

  return NextResponse.json({
    ok: true,
    mustChangePassword: tracker.mustChangePassword,
  });
}
