import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { notFound, redirect } from "next/navigation";
import { PostmortemForm } from "./postmortem-form";

interface AgentScore {
  agentType: string;
  score: number;
  summary: string;
  suggestions: string[];
}

export default async function PostmortemPage({
  params,
}: {
  params: Promise<{ pipelineRunId: string }>;
}) {
  // admin-only access to postmortem submission
  const session = await auth();
  if (!session) redirect("/api/auth/signin");
  if (session.user.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <h2 className="text-2xl font-bold">access denied</h2>
        <p className="mt-2 text-sm text-muted">
          only admins can access postmortem reviews
        </p>
      </div>
    );
  }

  const { pipelineRunId } = await params;

  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: {
      client: true,
      postmortem: true,
    },
  });

  if (!run) notFound();

  if (run.status !== "COMPLETED") {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <h2 className="text-2xl font-bold">build not yet complete</h2>
        <p className="mt-2 text-sm text-muted">
          approve the build before starting the postmortem
        </p>
      </div>
    );
  }

  const postmortem = run.postmortem;
  const agentScores = (postmortem?.agentScores as AgentScore[] | null) ?? [];
  const existingFeedback =
    (postmortem?.employeeFeedback as Record<string, string> | null) ?? null;
  const isSubmitted = existingFeedback !== null && Object.keys(existingFeedback).length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      {/* header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold">postmortem review</h2>
        <p className="mt-1 text-sm text-muted">
          {run.client.name} — pipeline {pipelineRunId.slice(0, 8)}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          review each agent's performance and provide feedback to improve future builds
        </p>
      </div>

      <PostmortemForm
        pipelineRunId={pipelineRunId}
        agentScores={agentScores}
        existingFeedback={existingFeedback}
        isSubmitted={isSubmitted}
      />
    </div>
  );
}
