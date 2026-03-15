import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import Redis from "ioredis";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await request.json();
  const { credentials } = body;

  if (!credentials || !Array.isArray(credentials) || credentials.length === 0) {
    return NextResponse.json(
      { error: "credentials are required" },
      { status: 400 }
    );
  }

  // validate each credential has service and value
  for (const cred of credentials) {
    if (!cred.service || !cred.value) {
      return NextResponse.json(
        { error: "each credential needs a service name and login details" },
        { status: 400 }
      );
    }
  }

  const tracker = await prisma.tracker.findUnique({
    where: { slug },
  });

  if (!tracker) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (tracker.currentStep !== 5) {
    return NextResponse.json(
      { error: "not currently at the plug-in step" },
      { status: 400 }
    );
  }

  await prisma.tracker.update({
    where: { id: tracker.id },
    data: {
      pluginCredentials: credentials,
      pluginStatus: "credentials_received",
    },
  });

  // notify team via SSE
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    await redis.publish(
      `tracker:${tracker.pipelineRunId ?? tracker.id}`,
      JSON.stringify({
        type: "credentials.received",
        timestamp: Date.now(),
      })
    );
  } finally {
    redis.disconnect();
  }

  return NextResponse.json({ ok: true });
}
