import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import Redis from "ioredis";
import pino from "pino";

const logger = pino({ name: "api:approve" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  logger.info({ pipelineRunId: id, approver: session.user.email }, "approval request received");

  const run = await prisma.pipelineRun.findUnique({
    where: { id },
    include: {
      client: true,
      tracker: true,
      call: {
        include: {
          analysis: {
            include: {
              buildSpecs: {
                orderBy: { version: "desc" },
                take: 1,
                include: {
                  prototypes: {
                    orderBy: { version: "desc" },
                    take: 1,
                  },
                },
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

  if (run.status !== "RUNNING") {
    return NextResponse.json(
      { error: `cannot approve — status is ${run.status.toLowerCase()}` },
      { status: 400 }
    );
  }

  const latestPrototype = run.call.analysis?.buildSpecs[0]?.prototypes[0] ?? null;

  // 1. update pipeline run to completed
  await prisma.pipelineRun.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  // 2. update tracker to final step (step 5: "ready to serve")
  if (run.tracker) {
    await prisma.tracker.update({
      where: { id: run.tracker.id },
      data: { currentStep: 5 },
    });
  }

  // 3. create a postmortem record stub (scores will be populated later)
  await prisma.postmortem.create({
    data: {
      pipelineRunId: id,
      agentScores: {},
    },
  });

  // 4. publish typed events via redis pub/sub
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const channel = `events:${id}`;

  const teamApprovedEvent = JSON.stringify({
    type: "team.approved",
    pipelineRunId: id,
    timestamp: Date.now(),
    data: {
      approvedBy: session.user.email,
      prototypeVersion: latestPrototype?.version ?? 0,
    },
  });

  const trackerCompleteEvent = JSON.stringify({
    type: "tracker.complete",
    pipelineRunId: id,
    timestamp: Date.now(),
    data: {
      trackerId: run.tracker?.id ?? "",
      slug: run.tracker?.slug ?? "",
    },
  });

  // 5. notify client via dev chat — prototype link goes live
  const prototypeUrl = latestPrototype?.previewUrl ?? "";
  const clientNotifiedEvent = JSON.stringify({
    type: "client.notified",
    pipelineRunId: id,
    timestamp: Date.now(),
    data: {
      clientName: run.client.name,
      trackerUrl: "",
      prototypeUrl,
      message: `your tool is ready! take a look: ${prototypeUrl}`,
    },
  });

  await redis.publish(channel, teamApprovedEvent);
  await redis.publish(channel, trackerCompleteEvent);
  await redis.publish(channel, clientNotifiedEvent);
  await redis.disconnect();

  logger.info(
    { pipelineRunId: id, approvedBy: session.user.email },
    "pipeline approved and delivered"
  );

  return NextResponse.json({
    success: true,
    status: "COMPLETED",
    approvedBy: session.user.email,
  });
}
