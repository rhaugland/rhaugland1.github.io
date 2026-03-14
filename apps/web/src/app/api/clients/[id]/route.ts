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
  const { owner, stage, name, industry, contactName, contactEmail } = body;

  const data: Record<string, unknown> = {};
  if (owner !== undefined) data.owner = owner;
  if (name !== undefined) data.name = name;
  if (industry !== undefined) data.industry = industry;
  if (contactName !== undefined) data.contactName = contactName;
  if (contactEmail !== undefined) data.contactEmail = contactEmail;
  if (stage !== undefined) {
    data.stage = stage;
    // set doneAt when marking done, clear it when moving back to working
    data.doneAt = stage === "DONE" ? new Date() : null;
  }

  const client = await prisma.client.update({
    where: { id },
    data,
  });

  return NextResponse.json(client);
}
