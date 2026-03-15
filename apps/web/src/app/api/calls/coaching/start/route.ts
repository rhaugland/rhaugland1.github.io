import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getRedisPublisher } from "@/lib/redis";

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
  const redis = getRedisPublisher();
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

  return NextResponse.json({ ok: true, pipelineRunId });
}
