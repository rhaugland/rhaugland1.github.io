import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import Redis from "ioredis";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pipelineRunId } = body;

  if (!pipelineRunId) {
    return NextResponse.json(
      { error: "pipelineRunId is required" },
      { status: 400 }
    );
  }

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const controlChannel = "control:coaching";

  await redis.publish(
    controlChannel,
    JSON.stringify({
      action: "stop",
      pipelineRunId,
    })
  );

  redis.disconnect();

  return NextResponse.json({ ok: true });
}
