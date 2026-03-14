import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const codebase = await prisma.codebase.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!codebase) {
    return NextResponse.json({ error: "codebase not found" }, { status: 404 });
  }

  const updated = await prisma.codebase.update({
    where: { id },
    data: { name: name.trim() },
    select: { id: true, name: true },
  });

  return NextResponse.json(updated);
}
