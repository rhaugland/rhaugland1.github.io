import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ clients: [] });
  }

  const clients = await prisma.client.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      industry: true,
      contactName: true,
      contactEmail: true,
      owner: true,
    },
    take: 10,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ clients });
}
