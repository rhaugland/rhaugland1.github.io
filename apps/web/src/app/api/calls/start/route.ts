import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { clientId, clientName, industry } = body;

  if (!clientName) {
    return NextResponse.json(
      { error: "clientName is required" },
      { status: 400 }
    );
  }

  // create or find client
  let client;
  if (clientId) {
    client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return NextResponse.json({ error: "client not found" }, { status: 404 });
    }
  } else {
    client = await prisma.client.create({
      data: {
        name: clientName,
        industry: industry ?? "unknown",
      },
    });
  }

  // create call record
  const call = await prisma.call.create({
    data: {
      clientId: client.id,
      startedAt: new Date(),
      coachingLog: [],
    },
  });

  // create pipeline run
  const pipelineRun = await prisma.pipelineRun.create({
    data: {
      clientId: client.id,
      callId: call.id,
      status: "RUNNING",
    },
  });

  return NextResponse.json({
    callId: call.id,
    clientId: client.id,
    pipelineRunId: pipelineRun.id,
    startedAt: call.startedAt,
  });
}
