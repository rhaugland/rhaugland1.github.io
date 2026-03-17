import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";
import { getRedisPublisher } from "@/lib/redis";
import { createEventQueue, createEvent } from "@slushie/events";
import path from "path";
import fs from "fs/promises";

const pipelineQueue = createEventQueue("pipeline");

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/tmp/slushie-workspaces";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { clientName, industry, contactName, contactEmail, owner, transcript, clientId, codebaseId } = body;

  if (!transcript) {
    return NextResponse.json(
      { error: "transcript is required" },
      { status: 400 }
    );
  }

  if (!clientId && !clientName) {
    return NextResponse.json(
      { error: "clientId or clientName is required" },
      { status: 400 }
    );
  }

  try {
    const now = new Date();
    const startedAt = new Date(now.getTime() - 20 * 60 * 1000);

    // reuse existing client or create new
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
          industry: industry || "other",
          contactName: contactName || null,
          contactEmail: contactEmail || null,
          owner: owner || session.user?.name || session.user?.email || null,
        },
      });
    }

    const call = await prisma.call.create({
      data: {
        clientId: client.id,
        startedAt,
        endedAt: now,
        transcript,
        coachingLog: [],
      },
    });

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

    // publish call.ended to both Redis (SSE) and BullMQ (pipeline worker)
    const redis = getRedisPublisher();
    const event = createEvent("call.ended", pipelineRun.id, {
      callId: call.id,
      clientId: client.id,
      duration: 1200,
    });
    await redis.publish(`events:${pipelineRun.id}`, JSON.stringify(event));
    await pipelineQueue.add("call.ended", event);

    return NextResponse.json({
      pipelineRunId: pipelineRun.id,
      callId: call.id,
      clientId: client.id,
    });
  } catch (err) {
    console.error("demo execute failed:", err);
    return NextResponse.json(
      { error: "failed to execute demo call" },
      { status: 500 }
    );
  }
}
