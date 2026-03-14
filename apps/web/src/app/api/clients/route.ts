import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, industry, contactName, contactEmail, owner } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const client = await prisma.client.create({
    data: {
      name,
      industry: industry ?? "other",
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      owner: owner || session.user?.name || session.user?.email || null,
    },
  });

  return NextResponse.json({
    id: client.id,
    name: client.name,
    industry: client.industry,
  });
}
