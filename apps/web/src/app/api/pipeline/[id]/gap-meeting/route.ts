import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import Redis from "ioredis";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new Redis(url);
}

// POST — start or complete the gap meeting
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action, notes } = body;

  if (action !== "start" && action !== "complete") {
    return NextResponse.json(
      { error: "action must be 'start' or 'complete'" },
      { status: 400 }
    );
  }

  const run = await prisma.pipelineRun.findUnique({
    where: { id },
    include: {
      call: {
        include: {
          analysis: {
            include: {
              buildSpecs: {
                orderBy: { version: "desc" },
                take: 1,
                include: { prototypes: { orderBy: { version: "desc" }, take: 1 } },
              },
            },
          },
        },
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "pipeline run not found" }, { status: 404 });
  }

  if (action === "start") {
    if (run.gapMeetingStartedAt) {
      return NextResponse.json({ error: "meeting already started" }, { status: 400 });
    }

    await prisma.pipelineRun.update({
      where: { id },
      data: { gapMeetingStartedAt: new Date() },
    });

    return NextResponse.json({ ok: true, action: "started" });
  }

  // action === "complete"
  if (!run.gapMeetingStartedAt) {
    return NextResponse.json({ error: "meeting not started yet" }, { status: 400 });
  }

  if (run.gapMeetingCompletedAt) {
    return NextResponse.json({ error: "meeting already completed" }, { status: 400 });
  }

  await prisma.pipelineRun.update({
    where: { id },
    data: {
      gapMeetingCompletedAt: new Date(),
      gapMeetingNotes: notes?.trim() || null,
    },
  });

  // trigger gap resolution by adding prototype.ready to the pipeline queue
  // find the v1 prototype
  const v1Spec = run.call.analysis?.buildSpecs[0];
  const v1Proto = v1Spec?.prototypes[0];

  if (!v1Proto) {
    return NextResponse.json({ error: "no v1 prototype found" }, { status: 400 });
  }

  const redis = getRedisConnection();
  const pipelineEvent = {
    type: "gap.meeting.complete",
    pipelineRunId: id,
    data: {
      prototypeId: v1Proto.id,
      version: v1Proto.version,
      meetingNotes: notes?.trim() || null,
    },
    timestamp: Date.now(),
  };

  // publish to pipeline queue via BullMQ
  const { Queue } = await import("bullmq");
  const pipelineQueue = new Queue("pipeline", {
    connection: {
      host: redis.options.host ?? "localhost",
      port: redis.options.port ?? 6379,
      password: redis.options.password,
    },
  });

  await pipelineQueue.add("gap.meeting.complete", pipelineEvent);
  await pipelineQueue.close();
  await redis.quit();

  return NextResponse.json({ ok: true, action: "completed" });
}
