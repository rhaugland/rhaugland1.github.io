# slushie internal review + postmortem implementation plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build the internal preview page where slushie team members approve or revise prototypes, the builds list page, the postmortem review page with per-agent scorecards and employee feedback, the postmortem agent worker that generates versioned skill updates, and the agent skill management system — the final human gates in the pipeline.

**Architecture:** next.js pages for internal preview (split view: gap report + prototype embed) and postmortem review (per-agent scorecards + feedback). api routes for approve/revise/submit-postmortem actions. approve publishes `team.approved` event, updates tracker, notifies client via dev chat. postmortem submit enqueues a bullmq job. the postmortem agent worker spawns a claude code session via `invokeClaudeCode`, analyzes all pipeline artifacts + employee feedback, identifies patterns, creates new AgentSkill versions (never overwrites), and commits changes to git. all events flow through the existing redis event bus. all ui follows slushie brand rules (lowercase, inter, no emojis).

**Tech Stack:** next.js, typescript, tailwind css, prisma, bullmq, claude code cli, redis pub/sub, pino

**Spec:** `docs/superpowers/specs/2026-03-13-slushie-platform-design.md`

**Depends on:** plan 1 (foundation), plan 2 (listener + live call dashboard), plan 3 (agent pipeline + prototype kit), plan 4 (client tracker + dev chat)

**Produces:** builds list page, internal preview page with gap report + prototype embed, approve/revise flows with event publishing and dev chat notification, postmortem review page with per-agent scorecards and employee feedback, postmortem agent worker with skill analysis and git commits, and agent skill versioning linked to postmortem records.

---

## Chunk 1: Builds List + Internal Preview Page

### Task 1: Create the builds list page

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/builds/page.tsx`

- [ ] **Step 1: create builds list page**

Create `apps/web/src/app/(dashboard)/dashboard/builds/page.tsx`:

```tsx
import { prisma } from "@slushie/db";
import Link from "next/link";

const statusColors: Record<string, string> = {
  RUNNING: "bg-blue-100 text-blue-700",
  STALLED: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function BuildsPage() {
  const runs = await prisma.pipelineRun.findMany({
    include: {
      client: true,
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
                    include: {
                      gapReports: {
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
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold">builds</h2>
      <p className="mt-1 text-sm text-muted">all pipeline runs</p>

      {runs.length === 0 ? (
        <p className="mt-8 text-sm text-muted">no builds yet. run a discovery call to start.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted">client</th>
                <th className="px-4 py-3 text-left font-medium text-muted">status</th>
                <th className="px-4 py-3 text-left font-medium text-muted">coverage</th>
                <th className="px-4 py-3 text-left font-medium text-muted">started</th>
                <th className="px-4 py-3 text-left font-medium text-muted">completed</th>
                <th className="px-4 py-3 text-left font-medium text-muted">actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {runs.map((run) => {
                const latestGapReport =
                  run.call.analysis?.buildSpecs[0]?.prototypes[0]?.gapReports[0] ?? null;
                const coverageScore = latestGapReport?.coverageScore ?? null;

                return (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{run.client.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[run.status] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {run.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {coverageScore !== null ? (
                        <span
                          className={`text-sm font-bold ${
                            coverageScore >= 90
                              ? "text-green-600"
                              : coverageScore >= 70
                                ? "text-yellow-500"
                                : "text-red-600"
                          }`}
                        >
                          {coverageScore}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(run.startedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {run.completedAt
                        ? new Date(run.completedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "--"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/preview/${run.id}`}
                        className="text-secondary hover:underline"
                      >
                        preview
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/\(dashboard\)/dashboard/builds/page.tsx
git commit -m "feat: add builds list page with status badges and coverage scores"
```

---

### Task 2: Create the gap report panel component

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/preview/[pipelineRunId]/gap-report-panel.tsx`

- [ ] **Step 1: create gap report panel**

Create `apps/web/src/app/(dashboard)/dashboard/preview/[pipelineRunId]/gap-report-panel.tsx`:

```tsx
"use client";

interface Gap {
  type: "missed" | "simplified" | "deferred";
  feature: string;
  description: string;
  reason: string;
  severity: "high" | "medium" | "low";
}

interface Tradeoff {
  decision: string;
  chose: string;
  alternative: string;
  rationale: string;
}

interface GapReportPanelProps {
  coverageScore: number;
  gaps: Gap[];
  tradeoffs: Tradeoff[];
}

const gapTypeColors: Record<string, { bg: string; text: string; label: string }> = {
  missed: { bg: "bg-red-100", text: "text-red-700", label: "missed" },
  simplified: { bg: "bg-yellow-100", text: "text-yellow-700", label: "simplified" },
  deferred: { bg: "bg-blue-100", text: "text-blue-700", label: "deferred" },
};

const severityColors: Record<string, string> = {
  high: "text-red-600",
  medium: "text-yellow-600",
  low: "text-muted",
};

function getCoverageColor(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 80) return "text-green-500";
  if (score >= 70) return "text-yellow-500";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

export function GapReportPanel({
  coverageScore,
  gaps,
  tradeoffs,
}: GapReportPanelProps) {
  const missedGaps = gaps.filter((g) => g.type === "missed");
  const simplifiedGaps = gaps.filter((g) => g.type === "simplified");
  const deferredGaps = gaps.filter((g) => g.type === "deferred");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* coverage score */}
      <div className="border-b border-gray-200 p-6">
        <p className="text-sm text-muted">coverage score</p>
        <p className={`text-6xl font-extrabold ${getCoverageColor(coverageScore)}`}>
          {coverageScore}
        </p>
        <p className="mt-1 text-xs text-muted">out of 100</p>
      </div>

      {/* categorized gaps */}
      <div className="border-b border-gray-200 p-6">
        <h3 className="text-sm font-bold">gaps ({gaps.length})</h3>
        <div className="mt-2 flex gap-3 text-xs">
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
            {missedGaps.length} missed
          </span>
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-yellow-700">
            {simplifiedGaps.length} simplified
          </span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
            {deferredGaps.length} deferred
          </span>
        </div>

        {gaps.length === 0 ? (
          <p className="mt-3 text-sm text-muted">no gaps found</p>
        ) : (
          <div className="mt-3 space-y-3">
            {gaps.map((gap, i) => {
              const typeStyle = gapTypeColors[gap.type] ?? gapTypeColors.missed;
              return (
                <div key={i} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeStyle.bg} ${typeStyle.text}`}
                    >
                      {typeStyle.label}
                    </span>
                    <span
                      className={`text-xs font-medium ${severityColors[gap.severity] ?? "text-muted"}`}
                    >
                      {gap.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium">{gap.feature}</p>
                  <p className="mt-0.5 text-sm text-muted">{gap.description}</p>
                  <p className="mt-1 text-xs text-muted">
                    <span className="font-medium">reason:</span> {gap.reason}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* tradeoffs */}
      {tradeoffs.length > 0 && (
        <div className="p-6">
          <h3 className="text-sm font-bold">tradeoff explanations ({tradeoffs.length})</h3>
          <div className="mt-3 space-y-3">
            {tradeoffs.map((tradeoff, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-medium">{tradeoff.decision}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="font-medium text-green-600">chose</p>
                    <p className="text-muted">{tradeoff.chose}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted">alternative</p>
                    <p className="text-muted">{tradeoff.alternative}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted">
                  <span className="font-medium">rationale:</span> {tradeoff.rationale}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/\(dashboard\)/dashboard/preview/
git commit -m "feat: add gap report panel with categorized gaps and coverage score"
```

---

### Task 3: Create the action bar component

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/preview/[pipelineRunId]/action-bar.tsx`

- [ ] **Step 1: create action bar**

Create `apps/web/src/app/(dashboard)/dashboard/preview/[pipelineRunId]/action-bar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ActionBarProps {
  pipelineRunId: string;
  status: string;
}

export function ActionBar({ pipelineRunId, status }: ActionBarProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "revise" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isActionable = status === "RUNNING";

  async function handleApprove() {
    setLoading("approve");
    setError(null);

    try {
      const res = await fetch(`/api/pipeline/${pipelineRunId}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "approval failed" }));
        setError(body.error ?? "approval failed");
        return;
      }

      router.refresh();
    } catch {
      setError("network error — try again");
    } finally {
      setLoading(null);
    }
  }

  async function handleRevise() {
    setLoading("revise");
    setError(null);

    try {
      const res = await fetch(`/api/pipeline/${pipelineRunId}/revise`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "revision request failed" }));
        setError(body.error ?? "revision request failed");
        return;
      }

      router.refresh();
    } catch {
      setError("network error — try again");
    } finally {
      setLoading(null);
    }
  }

  if (status === "COMPLETED") {
    return (
      <div className="flex items-center justify-between border-t border-gray-200 bg-green-50 px-6 py-4">
        <p className="text-sm font-medium text-green-700">approved and delivered</p>
        <a
          href={`/dashboard/postmortems/${pipelineRunId}`}
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          start postmortem
        </a>
      </div>
    );
  }

  if (!isActionable) {
    return (
      <div className="flex items-center border-t border-gray-200 bg-gray-50 px-6 py-4">
        <p className="text-sm text-muted">
          {status === "STALLED"
            ? "pipeline is stalled — check the worker logs"
            : status === "CANCELLED"
              ? "pipeline was cancelled"
              : "waiting for pipeline to complete..."}
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-4">
      {error && (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={handleApprove}
          disabled={loading !== null}
          className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {loading === "approve" ? "approving..." : "approve and deliver"}
        </button>
        <button
          onClick={handleRevise}
          disabled={loading !== null}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-foreground hover:bg-gray-50 disabled:opacity-50"
        >
          {loading === "revise" ? "requesting..." : "request revisions"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/\(dashboard\)/dashboard/preview/\[pipelineRunId\]/action-bar.tsx
git commit -m "feat: add action bar with approve and deliver / request revisions buttons"
```

---

### Task 4: Create the internal preview page

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/preview/[pipelineRunId]/page.tsx`

- [ ] **Step 1: create internal preview page**

Create `apps/web/src/app/(dashboard)/dashboard/preview/[pipelineRunId]/page.tsx`:

```tsx
import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import { GapReportPanel } from "./gap-report-panel";
import { ActionBar } from "./action-bar";

interface Gap {
  type: "missed" | "simplified" | "deferred";
  feature: string;
  description: string;
  reason: string;
  severity: "high" | "medium" | "low";
}

interface Tradeoff {
  decision: string;
  chose: string;
  alternative: string;
  rationale: string;
}

interface Decision {
  description: string;
  context: string;
  flagged: boolean;
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ pipelineRunId: string }>;
}) {
  const { pipelineRunId } = await params;

  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: {
      client: true,
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
                    include: {
                      gapReports: {
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
      },
    },
  });

  if (!run) notFound();

  const latestSpec = run.call.analysis?.buildSpecs[0] ?? null;
  const latestPrototype = latestSpec?.prototypes[0] ?? null;
  const latestGapReport = latestPrototype?.gapReports[0] ?? null;

  const coverageScore = latestGapReport?.coverageScore ?? 0;
  const gaps = (latestGapReport?.gaps as Gap[] | null) ?? [];
  const tradeoffs = (latestGapReport?.tradeoffs as Tradeoff[] | null) ?? [];
  const decisionLog = (latestPrototype?.decisionLog as Decision[] | null) ?? [];
  const previewUrl = latestPrototype?.previewUrl ?? null;
  const flaggedDecisions = decisionLog.filter((d) => d.flagged);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h2 className="text-xl font-bold">{run.client.name}</h2>
          <p className="text-sm text-muted">
            internal preview
            {latestPrototype
              ? ` — prototype v${latestPrototype.version}`
              : ""}
            {latestGapReport
              ? ` — gap report v${latestGapReport.version}`
              : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            run.status === "COMPLETED"
              ? "bg-green-100 text-green-700"
              : run.status === "RUNNING"
                ? "bg-blue-100 text-blue-700"
                : run.status === "STALLED"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-red-100 text-red-700"
          }`}
        >
          {run.status.toLowerCase()}
        </span>
      </div>

      {/* split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* left panel: final gap report with coverage score, categorized gaps, reasons, tradeoffs */}
        <div className="w-1/2 overflow-y-auto border-r border-gray-200 bg-white">
          {latestGapReport ? (
            <GapReportPanel
              coverageScore={coverageScore}
              gaps={gaps}
              tradeoffs={tradeoffs}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted">
                no gap report yet — waiting for reviewer agent
              </p>
            </div>
          )}
        </div>

        {/* right panel: embedded prototype preview + builder's flagged decisions */}
        <div className="w-1/2 flex flex-col bg-gray-100">
          {previewUrl ? (
            <>
              <iframe
                src={previewUrl}
                title="prototype preview"
                className="flex-1 border-0"
                sandbox="allow-scripts allow-same-origin"
              />
              {flaggedDecisions.length > 0 && (
                <div className="border-t border-gray-200 bg-yellow-50 p-4">
                  <h4 className="text-xs font-bold text-yellow-700">
                    flagged decisions ({flaggedDecisions.length})
                  </h4>
                  <div className="mt-2 space-y-2">
                    {flaggedDecisions.map((decision, i) => (
                      <div key={i} className="rounded border border-yellow-200 bg-white p-2">
                        <p className="text-xs font-medium">{decision.description}</p>
                        <p className="mt-0.5 text-xs text-muted">{decision.context}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted">
                no prototype yet — waiting for builder agent
              </p>
            </div>
          )}
        </div>
      </div>

      {/* action bar: "approve and deliver" / "request revisions" */}
      <ActionBar pipelineRunId={pipelineRunId} status={run.status} />
    </div>
  );
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/\(dashboard\)/dashboard/preview/
git commit -m "feat: add internal preview page with split view gap report and prototype embed"
```

---

## Chunk 2: Approval + Revision API Routes

### Task 5: Create the approval API route

**Files:**
- Create: `apps/web/src/app/api/pipeline/[id]/approve/route.ts`

- [ ] **Step 1: create approval route**

"approve and deliver" publishes `team.approved` event, updates tracker to final step, notifies client via dev chat, and sets prototype link live.

Create `apps/web/src/app/api/pipeline/[id]/approve/route.ts`:

```typescript
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
      trackerUrl: run.tracker?.slug
        ? `slushie.agency/track/${run.tracker.slug}`
        : "",
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
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/api/pipeline/
git commit -m "feat: add approval api route with event publishing and dev chat notification"
```

---

### Task 6: Create the revision API route

**Files:**
- Create: `apps/web/src/app/api/pipeline/[id]/revise/route.ts`

- [ ] **Step 1: create revision route**

"request revisions" creates a manual revision request. this is a phase 2 feature stub — for now it publishes a `review.complete` event to trigger another gap resolution cycle.

Create `apps/web/src/app/api/pipeline/[id]/revise/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import Redis from "ioredis";
import pino from "pino";

const logger = pino({ name: "api:revise" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

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
                include: {
                  prototypes: {
                    orderBy: { version: "desc" },
                    take: 1,
                    include: {
                      gapReports: {
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
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "pipeline run not found" }, { status: 404 });
  }

  if (run.status !== "RUNNING") {
    return NextResponse.json(
      { error: `cannot request revisions — status is ${run.status.toLowerCase()}` },
      { status: 400 }
    );
  }

  const latestGapReport =
    run.call.analysis?.buildSpecs[0]?.prototypes[0]?.gapReports[0] ?? null;

  // phase 2 stub: publishes review.complete to trigger gap resolution cycle
  // in phase 2 this will support a manual revision notes field
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const channel = `events:${id}`;

  const revisionEvent = JSON.stringify({
    type: "review.complete",
    pipelineRunId: id,
    timestamp: Date.now(),
    data: {
      gapReportId: latestGapReport?.id ?? "",
      version: (latestGapReport?.version ?? 0) + 1,
      coverageScore: latestGapReport?.coverageScore ?? 0,
      gapCount: Array.isArray(latestGapReport?.gaps)
        ? (latestGapReport.gaps as unknown[]).length
        : 0,
      triggeredBy: "manual_revision",
      requestedBy: session.user.email,
    },
  });

  await redis.publish(channel, revisionEvent);
  await redis.disconnect();

  logger.info(
    { pipelineRunId: id, requestedBy: session.user.email },
    "manual revision requested"
  );

  return NextResponse.json({
    success: true,
    message: "revision cycle triggered",
    requestedBy: session.user.email,
  });
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/api/pipeline/\[id\]/revise/
git commit -m "feat: add revision api route (phase 2 feature stub)"
```

---

## Chunk 3: Postmortem Review Page + Submit API

### Task 7: Create the agent scorecard component

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/postmortems/[pipelineRunId]/agent-scorecard.tsx`

- [ ] **Step 1: create agent scorecard**

Create `apps/web/src/app/(dashboard)/dashboard/postmortems/[pipelineRunId]/agent-scorecard.tsx`:

```tsx
"use client";

interface AgentScorecardProps {
  agentType: string;
  score: number;
  summary: string;
  suggestions: string[];
  feedback: string;
  onFeedbackChange: (value: string) => void;
  disabled: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 8) return "text-green-600";
  if (score >= 6) return "text-yellow-500";
  return "text-red-600";
}

function getScoreBgColor(score: number): string {
  if (score >= 8) return "bg-green-50 border-green-200";
  if (score >= 6) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

export function AgentScorecard({
  agentType,
  score,
  summary,
  suggestions,
  feedback,
  onFeedbackChange,
  disabled,
}: AgentScorecardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* header with score */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <div>
          <h3 className="text-sm font-bold">{agentType} agent</h3>
          <p className="mt-0.5 text-xs text-muted">{summary}</p>
        </div>
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-lg border ${getScoreBgColor(score)}`}
        >
          <span className={`text-2xl font-extrabold ${getScoreColor(score)}`}>
            {score}
          </span>
        </div>
      </div>

      {/* postmortem agent's pattern-based improvement suggestions */}
      {suggestions.length > 0 && (
        <div className="border-b border-gray-200 p-4">
          <p className="text-xs font-medium text-muted">suggested improvements</p>
          <ul className="mt-2 space-y-1">
            {suggestions.map((suggestion, i) => (
              <li key={i} className="text-sm text-foreground">
                <span className="mr-2 text-muted">--</span>
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* employee feedback textarea */}
      <div className="p-4">
        <label
          htmlFor={`feedback-${agentType}`}
          className="text-xs font-medium text-muted"
        >
          your feedback on {agentType}
        </label>
        <textarea
          id={`feedback-${agentType}`}
          value={feedback}
          onChange={(e) => onFeedbackChange(e.target.value)}
          disabled={disabled}
          placeholder={`what did the ${agentType} agent do well? what should it improve?`}
          rows={3}
          className="mt-1 w-full rounded-lg border border-gray-200 bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary disabled:opacity-60"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/\(dashboard\)/dashboard/postmortems/
git commit -m "feat: add agent scorecard component with auto-generated summaries and feedback"
```

---

### Task 8: Create the postmortem form component

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/postmortems/[pipelineRunId]/postmortem-form.tsx`

- [ ] **Step 1: create postmortem form**

Create `apps/web/src/app/(dashboard)/dashboard/postmortems/[pipelineRunId]/postmortem-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AgentScorecard } from "./agent-scorecard";

interface AgentScore {
  agentType: string;
  score: number;
  summary: string;
  suggestions: string[];
}

interface PostmortemFormProps {
  pipelineRunId: string;
  agentScores: AgentScore[];
  existingFeedback: Record<string, string> | null;
  isSubmitted: boolean;
}

const AGENT_ORDER = ["listener", "analyst", "builder", "reviewer"];

export function PostmortemForm({
  pipelineRunId,
  agentScores,
  existingFeedback,
  isSubmitted,
}: PostmortemFormProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Record<string, string>>(
    existingFeedback ?? Object.fromEntries(AGENT_ORDER.map((a) => [a, ""]))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(isSubmitted);

  function handleFeedbackChange(agentType: string, value: string) {
    setFeedback((prev) => ({ ...prev, [agentType]: value }));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/postmortem/${pipelineRunId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "submission failed" }));
        setError(body.error ?? "submission failed");
        return;
      }

      setSubmitted(true);
      router.refresh();
    } catch {
      setError("network error — try again");
    } finally {
      setLoading(false);
    }
  }

  // sort scores by the defined agent order
  const sortedScores = AGENT_ORDER.map((agentType) => {
    const found = agentScores.find((s) => s.agentType === agentType);
    return (
      found ?? {
        agentType,
        score: 0,
        summary: "no data available",
        suggestions: [],
      }
    );
  });

  return (
    <div>
      <div className="space-y-4">
        {sortedScores.map((agentScore) => (
          <AgentScorecard
            key={agentScore.agentType}
            agentType={agentScore.agentType}
            score={agentScore.score}
            summary={agentScore.summary}
            suggestions={agentScore.suggestions}
            feedback={feedback[agentScore.agentType] ?? ""}
            onFeedbackChange={(value) =>
              handleFeedbackChange(agentScore.agentType, value)
            }
            disabled={submitted}
          />
        ))}
      </div>

      {/* submit postmortem button — triggers the skill update loop */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {submitted ? (
          <div className="text-center">
            <p className="text-sm font-medium text-green-700">
              postmortem submitted — skill update agent is running
            </p>
            <p className="mt-1 text-xs text-muted">
              the postmortem agent will analyze feedback and update agent skills
            </p>
          </div>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "submitting postmortem..." : "submit postmortem"}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/\(dashboard\)/dashboard/postmortems/\[pipelineRunId\]/postmortem-form.tsx
git commit -m "feat: add postmortem form with submit button that triggers skill update loop"
```

---

### Task 9: Create the postmortem review page

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/postmortems/[pipelineRunId]/page.tsx`
- Create: `apps/web/src/app/(dashboard)/dashboard/postmortems/page.tsx`

- [ ] **Step 1: create postmortem review page**

Create `apps/web/src/app/(dashboard)/dashboard/postmortems/[pipelineRunId]/page.tsx`:

```tsx
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
```

- [ ] **Step 2: create postmortems list page**

Create `apps/web/src/app/(dashboard)/dashboard/postmortems/page.tsx`:

```tsx
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function PostmortemsListPage() {
  // admin-only access
  const session = await auth();
  if (!session) redirect("/api/auth/signin");
  if (session.user.role !== "admin") {
    return (
      <div className="py-12 text-center">
        <h2 className="text-2xl font-bold">access denied</h2>
        <p className="mt-2 text-sm text-muted">
          only admins can access postmortem reviews
        </p>
      </div>
    );
  }

  const completedRuns = await prisma.pipelineRun.findMany({
    where: { status: "COMPLETED" },
    include: {
      client: true,
      postmortem: true,
    },
    orderBy: { completedAt: "desc" },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold">postmortems</h2>
      <p className="mt-1 text-sm text-muted">review agent performance on completed builds</p>

      {completedRuns.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          no completed builds yet. approve a build to enable postmortem review.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {completedRuns.map((run) => {
            const hasPostmortem =
              run.postmortem?.employeeFeedback !== null &&
              run.postmortem?.employeeFeedback !== undefined;

            return (
              <Link
                key={run.id}
                href={`/dashboard/postmortems/${run.id}`}
                className="block rounded-lg border border-gray-200 p-4 hover:border-secondary hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{run.client.name}</p>
                    <p className="text-xs text-muted">
                      completed{" "}
                      {run.completedAt
                        ? new Date(run.completedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "unknown"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      hasPostmortem
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {hasPostmortem ? "reviewed" : "pending"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: commit**

```bash
git add apps/web/src/app/\(dashboard\)/dashboard/postmortems/
git commit -m "feat: add postmortem review page with admin-only access and postmortems list"
```

---

### Task 10: Create the postmortem submit API route

**Files:**
- Create: `apps/web/src/app/api/postmortem/[pipelineRunId]/submit/route.ts`

- [ ] **Step 1: create postmortem submit route**

Admin-only. Saves employee feedback, enqueues postmortem job via bullmq to trigger the postmortem agent worker.

Create `apps/web/src/app/api/postmortem/[pipelineRunId]/submit/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import Redis from "ioredis";
import { Queue } from "bullmq";
import pino from "pino";

const logger = pino({ name: "api:postmortem-submit" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pipelineRunId: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // admin role required for postmortem submission
  if (session.user.role !== "admin") {
    return NextResponse.json(
      { error: "only admins can submit postmortems" },
      { status: 403 }
    );
  }

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

  // validate feedback has entries for all 4 agent types
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
  const redis = new Redis(redisUrl);
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
  await redis.disconnect();
  await postmortemQueue.close();

  logger.info(
    { pipelineRunId, postmortemId: postmortem.id, submittedBy: session.user.email },
    "postmortem submitted — agent worker enqueued"
  );

  return NextResponse.json({
    success: true,
    postmortemId: postmortem.id,
  });
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/api/postmortem/
git commit -m "feat: add admin-only postmortem submit api with bullmq job enqueue"
```

---

## Chunk 4: Postmortem Agent Worker + Skill Versioning

### Task 11: Create the postmortem agent worker

**Files:**
- Create: `apps/worker/src/workers/postmortem.ts`

- [ ] **Step 1: create postmortem worker**

The postmortem agent reads all pipeline events, reviewer gap reports, employee feedback, and historical postmortem data. it identifies patterns across builds, edits agent prompt files in `packages/agents/`, creates new skill versions (never overwrites), and commits changes to git. uses `invokeClaudeCode` wrapper with appropriate timeout.

Create `apps/worker/src/workers/postmortem.ts`:

```typescript
import { Worker, Job } from "bullmq";
import { prisma } from "@slushie/db";
import { invokeClaudeCode } from "../claude";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";
import { PHASE_TIMEOUTS } from "../queues";
import { createEvent } from "@slushie/events";
import type { SkillsUpdatedEvent } from "@slushie/events";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

interface PostmortemJobData {
  type: string;
  pipelineRunId: string;
  timestamp: number;
  data: {
    postmortemId: string;
    agentScores: Record<string, number>;
  };
}

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

export function createPostmortemWorker() {
  return new Worker<PostmortemJobData>(
    "postmortem",
    async (job: Job<PostmortemJobData>) => {
      const { pipelineRunId, data } = job.data;
      const log = createAgentLogger("postmortem", pipelineRunId);

      log.info({ postmortemId: data.postmortemId }, "postmortem agent starting");

      // 1. load all pipeline data — events, gap reports, transcript, analysis
      const run = await prisma.pipelineRun.findUnique({
        where: { id: pipelineRunId },
        include: {
          client: true,
          postmortem: true,
          call: {
            include: {
              analysis: {
                include: {
                  buildSpecs: {
                    include: {
                      prototypes: {
                        include: {
                          gapReports: true,
                        },
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
        log.error("pipeline run not found");
        throw new Error(`pipeline run ${pipelineRunId} not found`);
      }

      if (!run.postmortem) {
        log.error("postmortem record not found");
        throw new Error(`postmortem for ${pipelineRunId} not found`);
      }

      // 2. load current agent skills (versioned — get latest per type)
      const currentSkills = await prisma.agentSkill.findMany({
        orderBy: [{ agentType: "asc" }, { version: "desc" }],
      });

      const latestSkills: Record<
        string,
        { id: string; version: number; promptTemplate: string; config: unknown }
      > = {};
      for (const skill of currentSkills) {
        if (
          !latestSkills[skill.agentType] ||
          skill.version > latestSkills[skill.agentType].version
        ) {
          latestSkills[skill.agentType] = {
            id: skill.id,
            version: skill.version,
            promptTemplate: skill.promptTemplate,
            config: skill.config,
          };
        }
      }

      // 3. load historical postmortem data for pattern detection
      const historicalPostmortems = await prisma.postmortem.findMany({
        where: {
          id: { not: data.postmortemId },
          employeeFeedback: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          pipelineRun: {
            include: {
              client: true,
            },
          },
        },
      });

      // 4. prepare working directory with all artifacts
      const workDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `slushie-postmortem-${pipelineRunId}-`)
      );

      // write pipeline data
      fs.writeFileSync(
        path.join(workDir, "pipeline-data.json"),
        JSON.stringify(
          {
            pipelineRunId,
            client: run.client,
            transcript: run.call.transcript,
            coachingLog: run.call.coachingLog,
            analysis: run.call.analysis,
            buildSpecs: run.call.analysis?.buildSpecs ?? [],
            prototypes:
              run.call.analysis?.buildSpecs.flatMap((s) => s.prototypes) ?? [],
            gapReports:
              run.call.analysis?.buildSpecs.flatMap((s) =>
                s.prototypes.flatMap((p) => p.gapReports)
              ) ?? [],
          },
          null,
          2
        )
      );

      // write employee feedback
      fs.writeFileSync(
        path.join(workDir, "employee-feedback.json"),
        JSON.stringify(run.postmortem.employeeFeedback, null, 2)
      );

      // write current agent scores
      fs.writeFileSync(
        path.join(workDir, "agent-scores.json"),
        JSON.stringify(run.postmortem.agentScores, null, 2)
      );

      // write current skills
      fs.writeFileSync(
        path.join(workDir, "current-skills.json"),
        JSON.stringify(latestSkills, null, 2)
      );

      // write historical postmortem data for pattern identification
      fs.writeFileSync(
        path.join(workDir, "historical-postmortems.json"),
        JSON.stringify(
          historicalPostmortems.map((pm) => ({
            id: pm.id,
            clientName: pm.pipelineRun.client.name,
            agentScores: pm.agentScores,
            employeeFeedback: pm.employeeFeedback,
            skillUpdates: pm.skillUpdates,
            createdAt: pm.createdAt,
          })),
          null,
          2
        )
      );

      // 5. invoke claude code for postmortem analysis
      const prompt = `you are the slushie postmortem agent. your job is to analyze agent performance across a completed pipeline run and suggest concrete skill/prompt improvements.

read these files in the working directory:
- pipeline-data.json: full pipeline data including transcript, analysis, build specs, prototypes, and gap reports
- employee-feedback.json: human feedback on each agent (listener, analyst, builder, reviewer)
- agent-scores.json: auto-generated performance scores for each agent
- current-skills.json: current prompt templates and configs for each agent
- historical-postmortems.json: past postmortem data for identifying cross-build patterns

your analysis should:
1. identify patterns in agent performance — what worked, what didn't
2. compare with historical data to find recurring issues (e.g., "builder consistently struggles with scheduling uis")
3. suggest specific, actionable prompt modifications for each agent
4. prioritize improvements by impact

write your output to a file called "postmortem-result.json" with this exact structure:
{
  "agentAnalysis": {
    "listener": { "strengths": [...], "weaknesses": [...], "promptChanges": [...] },
    "analyst": { "strengths": [...], "weaknesses": [...], "promptChanges": [...] },
    "builder": { "strengths": [...], "weaknesses": [...], "promptChanges": [...] },
    "reviewer": { "strengths": [...], "weaknesses": [...], "promptChanges": [...] }
  },
  "patterns": [...],
  "skillUpdates": [
    {
      "agentType": "builder",
      "change": "description of what to change in the prompt",
      "newPromptSection": "the actual text to add/modify"
    }
  ]
}

be specific. do not give vague suggestions like "improve accuracy." instead say exactly what prompt text to add or modify and why.`;

      const result = await invokeClaudeCode({
        prompt,
        workingDirectory: workDir,
        timeoutMs: PHASE_TIMEOUTS.reviewer, // 10 min
        pipelineRunId,
      });

      log.info(
        { outputLength: result.output.length },
        "claude code postmortem analysis complete"
      );

      // 6. read and parse the result
      const resultPath = path.join(workDir, "postmortem-result.json");
      if (!fs.existsSync(resultPath)) {
        log.error("postmortem agent did not produce postmortem-result.json");
        throw new Error("postmortem agent failed to produce output");
      }

      const postmortemResult = JSON.parse(
        fs.readFileSync(resultPath, "utf-8")
      );

      // 7. create new skill versions — never overwrite existing versions
      const skillUpdates: Array<{
        agentType: string;
        version: number;
        change: string;
      }> = [];

      if (Array.isArray(postmortemResult.skillUpdates)) {
        for (const update of postmortemResult.skillUpdates) {
          const current = latestSkills[update.agentType];
          const newVersion = current ? current.version + 1 : 1;
          const basePrompt = current?.promptTemplate ?? "";

          // append new prompt section — never overwrite, always version
          const updatedPrompt = basePrompt
            ? `${basePrompt}\n\n# skill update from postmortem ${data.postmortemId}\n${update.newPromptSection}`
            : `# initial skill from postmortem ${data.postmortemId}\n${update.newPromptSection}`;

          await prisma.agentSkill.create({
            data: {
              agentType: update.agentType,
              version: newVersion,
              promptTemplate: updatedPrompt,
              config: current?.config ?? {},
              updatedByPostmortemId: data.postmortemId,
            },
          });

          skillUpdates.push({
            agentType: update.agentType,
            version: newVersion,
            change: update.change,
          });

          log.info(
            { agentType: update.agentType, version: newVersion },
            "agent skill version created"
          );
        }
      }

      // 8. update postmortem record with skill updates
      await prisma.postmortem.update({
        where: { id: data.postmortemId },
        data: {
          skillUpdates: skillUpdates,
        },
      });

      // 9. write skill files to packages/agents/ and commit to git
      const agentsDir = path.resolve(process.cwd(), "packages/agents");
      if (fs.existsSync(agentsDir)) {
        // write postmortem result for version control
        const postmortemDir = path.join(agentsDir, "postmortems");
        if (!fs.existsSync(postmortemDir)) {
          fs.mkdirSync(postmortemDir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(postmortemDir, `${pipelineRunId}.json`),
          JSON.stringify(postmortemResult, null, 2)
        );

        // write updated skill prompt files
        const skillsDir = path.join(agentsDir, "skills");
        if (!fs.existsSync(skillsDir)) {
          fs.mkdirSync(skillsDir, { recursive: true });
        }
        for (const update of skillUpdates) {
          const skill = await prisma.agentSkill.findFirst({
            where: {
              agentType: update.agentType,
              version: update.version,
            },
          });
          if (skill) {
            fs.writeFileSync(
              path.join(
                skillsDir,
                `${skill.agentType}-v${skill.version}.md`
              ),
              skill.promptTemplate
            );
          }
        }

        // commit versioned skill updates to git
        const { execSync } = await import("node:child_process");
        try {
          execSync(
            "git add packages/agents/postmortems/ packages/agents/skills/",
            {
              cwd: path.resolve(process.cwd()),
              stdio: "pipe",
            }
          );
          execSync(
            `git commit -m "chore: skill updates from postmortem ${pipelineRunId.slice(0, 8)}"`,
            {
              cwd: path.resolve(process.cwd()),
              stdio: "pipe",
            }
          );
          log.info("skill updates committed to git");
        } catch (gitError) {
          log.warn(
            { error: gitError },
            "git commit failed — changes may already be committed or repo is dirty"
          );
        }
      }

      // 10. publish skills.updated event
      const skillsEvent = createEvent<SkillsUpdatedEvent>(
        "skills.updated",
        pipelineRunId,
        {
          updatedAgents: skillUpdates.map((u) => u.agentType),
          postmortemId: data.postmortemId,
        }
      );
      await publishEvent(skillsEvent);

      // 11. cleanup temp directory
      fs.rmSync(workDir, { recursive: true, force: true });

      log.info(
        { skillUpdatesCount: skillUpdates.length },
        "postmortem agent completed"
      );
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    }
  );
}
```

- [ ] **Step 2: commit**

```bash
git add apps/worker/src/workers/
git commit -m "feat: add postmortem agent worker with skill analysis and git version control"
```

---

### Task 12: Register postmortem worker in the worker entry point

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: update worker index to register postmortem worker**

Add the import at the top of `apps/worker/src/index.ts`:

```typescript
import { createPostmortemWorker } from "./workers/postmortem";
```

Add after the line `logger.info({ queues: queues.map((q) => q.name) }, "queues registered");`:

```typescript
  // register workers
  const postmortemWorker = createPostmortemWorker();
  logger.info("postmortem worker registered");
```

Update the shutdown handler to close the worker:

```typescript
  const shutdown = async () => {
    logger.info("shutting down workers...");
    await postmortemWorker.close();
    process.exit(0);
  };
```

The full updated `apps/worker/src/index.ts` should be:

```typescript
import Redis from "ioredis";
import { logger } from "./logger";
import { listenerQueue, analystQueue, builderQueue, reviewerQueue, postmortemQueue } from "./queues";
import { createPostmortemWorker } from "./workers/postmortem";

async function main() {
  logger.info("slushie worker starting...");

  // verify redis connectivity
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    await redis.ping();
    logger.info("redis connected");
  } catch (err) {
    logger.error(err, "failed to connect to redis");
    process.exit(1);
  } finally {
    redis.disconnect();
  }

  // log registered queues
  const queues = [listenerQueue, analystQueue, builderQueue, reviewerQueue, postmortemQueue];
  logger.info({ queues: queues.map((q) => q.name) }, "queues registered");

  // register workers
  const postmortemWorker = createPostmortemWorker();
  logger.info("postmortem worker registered");

  logger.info("slushie worker is running. waiting for events...");

  // graceful shutdown
  const shutdown = async () => {
    logger.info("shutting down workers...");
    await postmortemWorker.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error(err, "worker failed to start");
  process.exit(1);
});
```

- [ ] **Step 2: commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat: register postmortem worker in worker entry point"
```

---

## Chunk 5: Integration Verification

### Task 13: Verify all files compile and build

- [ ] **Step 1: verify web app compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 2: verify worker compiles**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: verify turbo build**

```bash
npx turbo build
```

Expected: all packages build without errors.

- [ ] **Step 4: verify web app starts and pages load**

```bash
cd apps/web && npm run dev
```

Open http://localhost:3000/dashboard/builds and verify the builds list page renders.

- [ ] **Step 5: commit any fixes**

```bash
git add -A
git commit -m "fix: resolve compilation issues from plan 5"
```

---

## Summary

**What Plan 5 produces:**
- builds list page at `/dashboard/builds` showing all pipeline runs with status badges (running/stalled/completed/cancelled), coverage scores, client names, and links to the preview page
- internal preview page at `/dashboard/preview/[pipelineRunId]` with split view: gap report panel (left) showing coverage score, categorized gaps (missed/simplified/deferred), reasons, tradeoffs + embedded prototype preview with builder's flagged decisions (right)
- action bar with "approve and deliver" / "request revisions" buttons
- approval api route (`POST /api/pipeline/[id]/approve`) that sets status to COMPLETED, publishes `team.approved` + `tracker.complete` + `client.notified` events, updates tracker to final step, creates postmortem stub, notifies client via dev chat with prototype link
- revision api route (`POST /api/pipeline/[id]/revise`) that publishes `review.complete` event to trigger gap resolution cycle (phase 2 feature stub for manual revision notes)
- postmortems list page at `/dashboard/postmortems` showing completed builds with reviewed/pending badges (admin-only)
- postmortem review page at `/dashboard/postmortems/[pipelineRunId]` with per-agent scorecards (color-coded scores: green >=8, yellow >=6, red <6), auto-generated performance summaries, pattern-based improvement suggestions from the postmortem agent, and employee feedback text areas for all 4 agents (listener, analyst, builder, reviewer)
- "submit postmortem" button triggers skill update loop via bullmq job enqueue (admin-only)
- postmortem submit api (`POST /api/postmortem/[pipelineRunId]/submit`) validates admin role, saves feedback, enqueues postmortem agent job
- postmortem agent worker spawns claude code session via `invokeClaudeCode` wrapper to analyze all pipeline artifacts + employee feedback + historical postmortem data, identifies patterns across builds, generates versioned skill updates
- AgentSkill model stores versioned prompt templates — postmortem agent creates new versions (never overwrites), linked to postmortem via `updatedByPostmortemId`
- skill changes written to `packages/agents/skills/` and `packages/agents/postmortems/` and committed to git for diffing and rollback
- all ui follows slushie brand: lowercase text, inter font, cherry red primary (#DC2626), berry blue secondary (#3B5BDB), arctic white background (#F8FAFC), no emojis

**File inventory:**
- `apps/web/src/app/(dashboard)/dashboard/builds/page.tsx` — builds list
- `apps/web/src/app/(dashboard)/dashboard/preview/[pipelineRunId]/page.tsx` — internal preview
- `apps/web/src/app/(dashboard)/dashboard/preview/[pipelineRunId]/gap-report-panel.tsx` — gap report panel
- `apps/web/src/app/(dashboard)/dashboard/preview/[pipelineRunId]/action-bar.tsx` — approve/revise action bar
- `apps/web/src/app/api/pipeline/[id]/approve/route.ts` — approval api
- `apps/web/src/app/api/pipeline/[id]/revise/route.ts` — revision api
- `apps/web/src/app/(dashboard)/dashboard/postmortems/page.tsx` — postmortems list
- `apps/web/src/app/(dashboard)/dashboard/postmortems/[pipelineRunId]/page.tsx` — postmortem review
- `apps/web/src/app/(dashboard)/dashboard/postmortems/[pipelineRunId]/agent-scorecard.tsx` — agent scorecard
- `apps/web/src/app/(dashboard)/dashboard/postmortems/[pipelineRunId]/postmortem-form.tsx` — postmortem form
- `apps/web/src/app/api/postmortem/[pipelineRunId]/submit/route.ts` — postmortem submit api
- `apps/worker/src/workers/postmortem.ts` — postmortem agent worker
- `apps/worker/src/index.ts` — updated with postmortem worker registration

**What comes next:**
- this is the final plan. with plans 1-5 complete, the full slushie pipeline is operational: live call -> analysis -> build -> gap resolution -> final review -> internal preview + approval -> client delivery -> postmortem + skill improvement loop.
