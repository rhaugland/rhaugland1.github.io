import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import Redis from "ioredis";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { pipelineRunId, text } = await request.json();

  if (!pipelineRunId || !text?.trim()) {
    return NextResponse.json(
      { error: "pipelineRunId and text are required" },
      { status: 400 }
    );
  }

  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    select: { teamDirectives: true },
  });

  if (!run) {
    return NextResponse.json({ error: "pipeline run not found" }, { status: 404 });
  }

  const directive = {
    text: text.trim(),
    timestamp: Date.now(),
    sentBy: session.user?.email ?? "unknown",
  };

  const existing = (run.teamDirectives as Array<Record<string, unknown>>) ?? [];
  existing.push(directive);

  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: { teamDirectives: existing },
  });

  // publish after db write succeeds — avoids redis leak on db error
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const event = {
      type: "build.message",
      pipelineRunId,
      timestamp: Date.now(),
      data: { text: text.trim(), sentBy: directive.sentBy },
    };
    await redis.publish(`events:${pipelineRunId}`, JSON.stringify(event));
  } finally {
    redis.disconnect();
  }

  return NextResponse.json({ ok: true });
}
