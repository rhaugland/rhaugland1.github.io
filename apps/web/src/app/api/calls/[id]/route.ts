import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // delete pipeline runs associated with this call first
  await prisma.pipelineRun.deleteMany({ where: { callId: id } });

  // delete the call
  await prisma.call.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
