import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { getRedisPublisher } from "@/lib/redis";
import { sendNextWorkflowReady } from "@/lib/email";
import { Queue } from "bullmq";
import pino from "pino";

const PLAN_WORKFLOW_COUNT: Record<string, number> = {
  SINGLE_SCOOP: 1,
  DOUBLE_BLEND: 2,
  TRIPLE_FREEZE: 3,
};

const logger = pino({ name: "api:postmortem-submit" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pipelineRunId: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // any authenticated team member can submit postmortems

  const { pipelineRunId } = await params;

  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: { postmortem: true },
  });

  if (!run) {
    return NextResponse.json({ error: "pipeline run not found" }, { status: 404 });
  }

  if (run.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "can only submit postmortem for completed builds" },
      { status: 400 }
    );
  }

  let body: { feedback: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!body.feedback || typeof body.feedback !== "object") {
    return NextResponse.json(
      { error: "feedback object is required" },
      { status: 400 }
    );
  }

  // validate feedback has entries for all 4 agent types (nps_insights is optional)
  const validAgentTypes = ["listener", "analyst", "builder", "reviewer"];
  for (const agentType of validAgentTypes) {
    if (typeof body.feedback[agentType] !== "string") {
      return NextResponse.json(
        { error: `feedback for ${agentType} must be a string` },
        { status: 400 }
      );
    }
  }

  // upsert postmortem record with employee feedback
  const postmortem = await prisma.postmortem.upsert({
    where: { pipelineRunId },
    create: {
      pipelineRunId,
      employeeFeedback: body.feedback,
      agentScores: run.postmortem?.agentScores ?? {},
    },
    update: {
      employeeFeedback: body.feedback,
    },
  });

  // enqueue postmortem job via bullmq — triggers the postmortem agent worker
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(redisUrl);
  const connection = {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };

  const postmortemQueue = new Queue("postmortem", { connection });

  await postmortemQueue.add("postmortem-run", {
    type: "postmortem.complete" as const,
    pipelineRunId,
    timestamp: Date.now(),
    data: {
      postmortemId: postmortem.id,
      agentScores: (postmortem.agentScores as Record<string, number>) ?? {},
    },
  });

  // notify dashboard via redis pub/sub
  const redis = getRedisPublisher();
  const channel = `events:${pipelineRunId}`;

  const postmortemEvent = JSON.stringify({
    type: "postmortem.submitted",
    pipelineRunId,
    timestamp: Date.now(),
    data: {
      postmortemId: postmortem.id,
      submittedBy: session.user.email,
    },
  });

  await redis.publish(channel, postmortemEvent);
  await postmortemQueue.close();

  logger.info(
    { pipelineRunId, postmortemId: postmortem.id, submittedBy: session.user.email },
    "postmortem submitted — agent worker enqueued"
  );

  // check if this booking has more workflows remaining (double blend = 2, triple freeze = 3)
  const tracker = await prisma.tracker.findUnique({
    where: { pipelineRunId },
    include: {
      booking: { select: { id: true, name: true, email: true, businessName: true, plan: true, workflowNumber: true } },
    },
  });

  if (tracker?.booking) {
    const totalWorkflows = PLAN_WORKFLOW_COUNT[tracker.booking.plan] ?? 1;
    const currentWorkflow = tracker.booking.workflowNumber;

    if (currentWorkflow < totalWorkflows) {
      const nextWorkflow = currentWorkflow + 1;
      sendNextWorkflowReady({
        to: tracker.booking.email,
        name: tracker.booking.name,
        businessName: tracker.booking.businessName,
        bookingId: tracker.booking.id,
        workflowNumber: nextWorkflow,
        totalWorkflows,
      }).catch((err) => console.error("[email] next workflow ready failed:", err));
    }
  }

  return NextResponse.json({
    success: true,
    postmortemId: postmortem.id,
  });
}
