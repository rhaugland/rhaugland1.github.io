import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import Redis from "ioredis";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pipelineRunId, callId, clientIndustry } = body;

  if (!pipelineRunId || !callId) {
    return NextResponse.json(
      { error: "pipelineRunId and callId are required" },
      { status: 400 }
    );
  }

  // publish a coaching.start control event that the worker listens for
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const controlChannel = "control:coaching";

  await redis.publish(
    controlChannel,
    JSON.stringify({
      action: "start",
      pipelineRunId,
      callId,
      clientIndustry: clientIndustry ?? "unknown",
    })
  );

  redis.disconnect();

  return NextResponse.json({ ok: true, pipelineRunId });
}
