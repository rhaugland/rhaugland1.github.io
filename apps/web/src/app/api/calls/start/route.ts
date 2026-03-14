import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/tmp/slushie-workspaces";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { clientId, clientName, industry, contactName, contactEmail, owner, codebaseId } = body;

  if (!clientId && !clientName) {
    return NextResponse.json(
      { error: "clientId or clientName is required" },
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
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        owner: owner || session.user?.name || session.user?.email || null,
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

  // seed workspace from codebase if provided
  if (codebaseId) {
    const codebase = await prisma.codebase.findUnique({
      where: { id: codebaseId },
      select: { path: true },
    });

    if (codebase) {
      const sourcePath = path.resolve(WORKSPACE_ROOT, codebase.path);
      if (!sourcePath.startsWith(path.resolve(WORKSPACE_ROOT))) {
        return NextResponse.json({ error: "invalid codebase path" }, { status: 400 });
      }
      const destPath = path.join(WORKSPACE_ROOT, pipelineRun.id);
      await fs.mkdir(destPath, { recursive: true });
      await fs.cp(sourcePath, destPath, { recursive: true });
    }
  }

  return NextResponse.json({
    callId: call.id,
    clientId: client.id,
    pipelineRunId: pipelineRun.id,
    startedAt: call.startedAt,
  });
}
