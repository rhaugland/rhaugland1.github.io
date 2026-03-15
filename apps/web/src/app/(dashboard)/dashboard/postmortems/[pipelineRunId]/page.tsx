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
      tracker: {
        select: {
          npsScore: true,
          npsFeedback: true,
          booking: {
            select: {
              assigneeId: true,
              assignee: { select: { id: true, name: true } },
            },
          },
        },
      },
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

  // compute assignee's avg NPS across all their bookings
  const assignee = run.tracker?.booking?.assignee ?? null;
  let assigneeAvgNps: number | null = null;
  let assigneeNpsCount = 0;
  if (assignee) {
    const assigneeNpsData = await prisma.booking.findMany({
      where: {
        assigneeId: assignee.id,
        tracker: { npsScore: { not: null } },
      },
      select: { tracker: { select: { npsScore: true } } },
    });
    if (assigneeNpsData.length > 0) {
      assigneeNpsCount = assigneeNpsData.length;
      assigneeAvgNps =
        Math.round(
          (assigneeNpsData.reduce((s, b) => s + b.tracker!.npsScore!, 0) /
            assigneeNpsData.length) *
            10
        ) / 10;
    }
  }

  const postmortem = run.postmortem;
  const agentScores = (postmortem?.agentScores as AgentScore[] | null) ?? [];
  const existingFeedback =
    (postmortem?.employeeFeedback as Record<string, string> | null) ?? null;
  const isSubmitted = existingFeedback !== null && Object.keys(existingFeedback).length > 0;

  const clientNps = run.tracker?.npsScore ?? null;
  const clientNpsFeedback = run.tracker?.npsFeedback ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      {/* header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold">postmortem review</h2>
        <p className="mt-1 text-sm text-muted">
          {run.client.name} — pipeline {pipelineRunId.slice(0, 8)}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          review each agent&apos;s performance and provide feedback to improve future builds
        </p>
      </div>

      {/* NPS context card */}
      {(clientNps != null || assignee) && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-bold text-foreground">client satisfaction</h3>
          </div>
          <div className="p-4 space-y-4">
            {/* client NPS score */}
            {clientNps != null && (
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-lg border ${
                    clientNps >= 9
                      ? "bg-green-50 border-green-200"
                      : clientNps >= 7
                      ? "bg-yellow-50 border-yellow-200"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <span
                    className={`text-2xl font-extrabold ${
                      clientNps >= 9
                        ? "text-green-600"
                        : clientNps >= 7
                        ? "text-yellow-500"
                        : "text-red-600"
                    }`}
                  >
                    {clientNps}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    client NPS: {clientNps}/10
                    <span className="ml-2 text-xs text-muted">
                      {clientNps >= 9
                        ? "(promoter)"
                        : clientNps >= 7
                        ? "(passive)"
                        : "(detractor)"}
                    </span>
                  </p>
                  {clientNpsFeedback && (
                    <p className="mt-1 text-xs text-muted italic">
                      &ldquo;{clientNpsFeedback}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* assignee context */}
            {assignee && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-secondary/20 flex items-center justify-center text-[10px] font-bold text-secondary">
                      {assignee.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">{assignee.name}</p>
                      <p className="text-[10px] text-muted">claimed this booking</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {assigneeAvgNps != null ? (
                      <>
                        <p
                          className={`text-sm font-extrabold ${
                            assigneeAvgNps >= 9
                              ? "text-green-600"
                              : assigneeAvgNps >= 7
                              ? "text-yellow-500"
                              : "text-red-600"
                          }`}
                        >
                          {assigneeAvgNps} avg
                        </p>
                        <p className="text-[10px] text-muted">{assigneeNpsCount} reviews</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted">no NPS data yet</p>
                    )}
                  </div>
                </div>
                {clientNps != null && assigneeAvgNps != null && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-[10px] text-muted">
                      {clientNps > assigneeAvgNps
                        ? `this client scored ${(clientNps - assigneeAvgNps).toFixed(1)} points above ${assignee.name}'s average`
                        : clientNps < assigneeAvgNps
                        ? `this client scored ${(assigneeAvgNps - clientNps).toFixed(1)} points below ${assignee.name}'s average`
                        : `this client scored exactly at ${assignee.name}'s average`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <PostmortemForm
        pipelineRunId={pipelineRunId}
        agentScores={agentScores}
        existingFeedback={existingFeedback}
        isSubmitted={isSubmitted}
        clientNps={clientNps}
        assigneeName={assignee?.name ?? null}
        assigneeAvgNps={assigneeAvgNps}
      />
    </div>
  );
}
