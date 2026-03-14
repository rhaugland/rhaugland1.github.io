import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const codebases = await prisma.codebase.findMany({
    where: { clientId: id },
    select: {
      id: true,
      name: true,
      source: true,
      filename: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ codebases });
}
