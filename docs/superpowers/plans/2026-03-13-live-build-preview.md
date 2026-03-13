# live build preview implementation plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add a live build preview panel to the call page so the team member can watch the prototype being built during the call, send suggestions, and pause/resume the build.

**Architecture:** the analyst starts processing the transcript incrementally after a 5-minute warm-up and re-runs every 5 minutes. the builder patches the prototype as new specs arrive. a third draggable panel on the live call page shows an activity log + iframe preview. team messages are stored as directives and injected into agent prompts. pause/resume is a flag on PipelineRun that the orchestrator checks before dispatching jobs.

**Tech Stack:** next.js, prisma, bullmq, redis pub/sub, sse, react, typescript

**Spec:** `docs/superpowers/specs/2026-03-13-live-build-preview-design.md`

---

## file structure

### new files
- `apps/web/src/app/api/calls/build/message/route.ts` — POST endpoint for team directives
- `apps/web/src/app/api/calls/build/pause/route.ts` — POST endpoint for pausing build
- `apps/web/src/app/api/calls/build/resume/route.ts` — POST endpoint for resuming build
- `apps/web/src/components/call/build-preview-panel.tsx` — build preview panel component (activity log + iframe + chat + controls)
- `apps/worker/src/incremental-analyst.ts` — incremental analyst scheduler (warm-up timer, re-run cadence, transcript growth check)

### modified files
- `packages/events/src/types.ts` — add 3 new event types (`build.message`, `build.paused`, `build.resumed`) + add `analyst.incremental` for mid-call dispatch + update EventType and SlushieEvent unions
- `packages/db/prisma/schema.prisma` — add 4 fields to PipelineRun model
- `apps/web/src/app/(dashboard)/dashboard/calls/live/[pipelineRunId]/page.tsx` — add build preview panel + wire up new events
- `apps/worker/src/agents/pipeline.ts` — add pause-aware dispatch + team directives injection
- `apps/worker/src/agents/analyst.ts` — add handler for `analyst.incremental` event type
- `apps/worker/src/coaching-control.ts` — trigger incremental analyst on coaching start
- `apps/worker/src/index.ts` — register incremental analyst scheduler + cleanup on shutdown

---

## Chunk 1: Events + Database + API Routes

### Task 1: Add new event types

**Files:**
- Modify: `packages/events/src/types.ts`

- [ ] **Step 1: Add new event type strings to EventType union**

In `packages/events/src/types.ts`, add four new entries to the `EventType` type union (after `"skills.updated"`):

```typescript
  | "build.message"
  | "build.paused"
  | "build.resumed"
  | "analyst.incremental";
```

- [ ] **Step 2: Add event interfaces**

After the `SkillsUpdatedEvent` interface (the last one before the `SlushieEvent` union), add:

```typescript
export interface BuildMessageEvent extends BaseEvent {
  type: "build.message";
  data: {
    text: string;
    sentBy: string;
  };
}

export interface BuildPausedEvent extends BaseEvent {
  type: "build.paused";
  data: {
    pausedBy: string;
  };
}

export interface BuildResumedEvent extends BaseEvent {
  type: "build.resumed";
  data: {
    resumedBy: string;
  };
}

export interface AnalystIncrementalEvent extends BaseEvent {
  type: "analyst.incremental";
  data: {
    transcript: string;
    pipelineRunId: string;
  };
}
```

- [ ] **Step 3: Add new types to SlushieEvent union**

At the end of the `SlushieEvent` type union, add:

```typescript
  | BuildMessageEvent
  | BuildPausedEvent
  | BuildResumedEvent
  | AnalystIncrementalEvent;
```

- [ ] **Step 4: Verify types compile**

```bash
cd packages/events && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/events/src/types.ts
git commit -m "feat: add build.message, build.paused, build.resumed, analyst.incremental event types"
```

---

### Task 2: Add new database fields to PipelineRun

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add fields to PipelineRun model**

In `packages/db/prisma/schema.prisma`, add these fields to the `PipelineRun` model (after the `completedAt` field, before the relation fields):

```prisma
  buildPaused         Boolean   @default(false)
  teamDirectives      Json?
  lastAnalystRunAt    DateTime?
  transcriptSnapshot  String?   @db.Text
```

- [ ] **Step 2: Push schema changes**

```bash
cd packages/db && npx prisma db push
```

Expected: schema changes applied without errors.

- [ ] **Step 3: Generate prisma client**

```bash
cd packages/db && npx prisma generate
```

Expected: client generated successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat: add buildPaused, teamDirectives, lastAnalystRunAt, transcriptSnapshot to PipelineRun"
```

---

### Task 3: Create build message API route

**Files:**
- Create: `apps/web/src/app/api/calls/build/message/route.ts`

- [ ] **Step 1: Create the route file**

Create `apps/web/src/app/api/calls/build/message/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import Redis from "ioredis";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { pipelineRunId, text } = await request.json();

  if (!pipelineRunId || !text?.trim()) {
    return NextResponse.json(
      { error: "pipelineRunId and text are required" },
      { status: 400 }
    );
  }

  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    select: { teamDirectives: true },
  });

  if (!run) {
    return NextResponse.json({ error: "pipeline run not found" }, { status: 404 });
  }

  const directive = {
    text: text.trim(),
    timestamp: Date.now(),
    sentBy: session.user?.email ?? "unknown",
  };

  const existing = (run.teamDirectives as Array<Record<string, unknown>>) ?? [];
  existing.push(directive);

  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: { teamDirectives: existing },
  });

  // publish after db write succeeds — avoids redis leak on db error
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const event = {
      type: "build.message",
      pipelineRunId,
      timestamp: Date.now(),
      data: { text: text.trim(), sentBy: directive.sentBy },
    };
    await redis.publish(`events:${pipelineRunId}`, JSON.stringify(event));
  } finally {
    redis.disconnect();
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify route compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/calls/build/message/route.ts
git commit -m "feat: add POST /api/calls/build/message for team directives"
```

---

### Task 4: Create build pause API route

**Files:**
- Create: `apps/web/src/app/api/calls/build/pause/route.ts`

- [ ] **Step 1: Create the route file**

Create `apps/web/src/app/api/calls/build/pause/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import Redis from "ioredis";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { pipelineRunId } = await request.json();

  if (!pipelineRunId) {
    return NextResponse.json(
      { error: "pipelineRunId is required" },
      { status: 400 }
    );
  }

  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: { buildPaused: true },
  });

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const event = {
      type: "build.paused",
      pipelineRunId,
      timestamp: Date.now(),
      data: { pausedBy: session.user?.email ?? "unknown" },
    };
    await redis.publish(`events:${pipelineRunId}`, JSON.stringify(event));
  } finally {
    redis.disconnect();
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/calls/build/pause/route.ts
git commit -m "feat: add POST /api/calls/build/pause"
```

---

### Task 5: Create build resume API route

**Files:**
- Create: `apps/web/src/app/api/calls/build/resume/route.ts`

- [ ] **Step 1: Create the route file**

Create `apps/web/src/app/api/calls/build/resume/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import Redis from "ioredis";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { pipelineRunId } = await request.json();

  if (!pipelineRunId) {
    return NextResponse.json(
      { error: "pipelineRunId is required" },
      { status: 400 }
    );
  }

  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: { buildPaused: false },
  });

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const event = {
      type: "build.resumed",
      pipelineRunId,
      timestamp: Date.now(),
      data: { resumedBy: session.user?.email ?? "unknown" },
    };
    await redis.publish(`events:${pipelineRunId}`, JSON.stringify(event));

    // publish catch-up control signal so the incremental analyst scheduler re-checks
    await redis.publish("control:incremental-analyst", JSON.stringify({
      action: "catchup",
      pipelineRunId,
    }));
  } finally {
    redis.disconnect();
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/calls/build/resume/route.ts
git commit -m "feat: add POST /api/calls/build/resume with catch-up signal"
```

---

## Chunk 2: Incremental Analyst Scheduler + Orchestrator Changes

### Task 6: Create incremental analyst scheduler

**Files:**
- Create: `apps/worker/src/incremental-analyst.ts`

This module manages the warm-up timer and re-run cadence for the analyst during a live call. It piggybacks on the coaching control lifecycle (start/stop with the call). It dispatches `analyst.incremental` events (NOT `call.ended`) to avoid triggering the full post-call pipeline.

- [ ] **Step 1: Create the scheduler file**

Create `apps/worker/src/incremental-analyst.ts`:

```typescript
import Redis from "ioredis";
import { prisma } from "@slushie/db";
import { createEvent } from "@slushie/events";
import type { AnalystIncrementalEvent } from "@slushie/events";
import { analystQueue } from "./queues";
import { logger } from "./logger";
import { getFullTranscript } from "./coaching";

const WARMUP_MS = 5 * 60 * 1000; // 5 minutes
const RERUN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const GROWTH_THRESHOLD = 0.2; // 20%

interface SchedulerState {
  pipelineRunId: string;
  warmupTimer: ReturnType<typeof setTimeout> | null;
  rerunInterval: ReturnType<typeof setInterval> | null;
  started: boolean;
}

const activeSessions = new Map<string, SchedulerState>();
let catchupRedis: Redis | null = null;

export function startIncrementalAnalyst(pipelineRunId: string): void {
  if (activeSessions.has(pipelineRunId)) {
    logger.warn({ pipelineRunId }, "incremental analyst already active");
    return;
  }

  const state: SchedulerState = {
    pipelineRunId,
    warmupTimer: null,
    rerunInterval: null,
    started: false,
  };

  // start warm-up timer — first analyst run after 5 minutes
  state.warmupTimer = setTimeout(async () => {
    state.started = true;
    await dispatchAnalystRun(pipelineRunId);

    // start re-run interval after first run
    state.rerunInterval = setInterval(async () => {
      await maybeDispatchRerun(pipelineRunId);
    }, RERUN_INTERVAL_MS);
  }, WARMUP_MS);

  activeSessions.set(pipelineRunId, state);
  logger.info({ pipelineRunId }, "incremental analyst scheduler started, warm-up in 5 min");
}

export function stopIncrementalAnalyst(pipelineRunId: string): void {
  const state = activeSessions.get(pipelineRunId);
  if (!state) return;

  if (state.warmupTimer) clearTimeout(state.warmupTimer);
  if (state.rerunInterval) clearInterval(state.rerunInterval);
  activeSessions.delete(pipelineRunId);
  logger.info({ pipelineRunId }, "incremental analyst scheduler stopped");
}

async function dispatchAnalystRun(pipelineRunId: string): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    select: { buildPaused: true, status: true },
  });

  if (!run || run.status !== "RUNNING") {
    logger.info({ pipelineRunId }, "pipeline not running, skipping analyst run");
    return;
  }

  if (run.buildPaused) {
    logger.info({ pipelineRunId }, "build paused, skipping analyst run");
    return;
  }

  const transcript = getFullTranscript(pipelineRunId);
  if (!transcript || transcript.trim().length === 0) {
    logger.info({ pipelineRunId }, "no transcript yet, skipping analyst run");
    return;
  }

  // save snapshot and timestamp
  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: {
      transcriptSnapshot: transcript,
      lastAnalystRunAt: new Date(),
    },
  });

  // dispatch as analyst.incremental — distinct from call.ended to avoid
  // triggering the full post-call pipeline (workspace setup, tracker init, etc.)
  const event = createEvent<AnalystIncrementalEvent>(
    "analyst.incremental",
    pipelineRunId,
    { transcript, pipelineRunId }
  );

  await analystQueue.add(`incremental-analyst-${pipelineRunId}`, event, {
    attempts: 3,
    backoff: { type: "custom" },
    timeout: 5 * 60 * 1000, // 5-minute timeout for mid-call runs
  });

  logger.info(
    { pipelineRunId, transcriptLength: transcript.length },
    "dispatched incremental analyst run"
  );
}

async function maybeDispatchRerun(pipelineRunId: string): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    select: {
      buildPaused: true,
      transcriptSnapshot: true,
      lastAnalystRunAt: true,
      status: true,
    },
  });

  if (!run || run.status !== "RUNNING" || run.buildPaused) return;

  const currentTranscript = getFullTranscript(pipelineRunId);
  if (!currentTranscript) return;

  const previousLength = run.transcriptSnapshot?.length ?? 0;
  const currentLength = currentTranscript.length;

  if (previousLength === 0) {
    await dispatchAnalystRun(pipelineRunId);
    return;
  }

  const growth = (currentLength - previousLength) / previousLength;
  if (growth >= GROWTH_THRESHOLD) {
    logger.info(
      { pipelineRunId, growth: `${(growth * 100).toFixed(1)}%` },
      "transcript grew enough, dispatching analyst re-run"
    );
    await dispatchAnalystRun(pipelineRunId);
  } else {
    logger.debug(
      { pipelineRunId, growth: `${(growth * 100).toFixed(1)}%` },
      "transcript growth below threshold, skipping"
    );
  }
}

// handle catch-up signal from resume endpoint
export function setupCatchupListener(): void {
  catchupRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  catchupRedis.subscribe("control:incremental-analyst");

  catchupRedis.on("message", async (_channel: string, message: string) => {
    try {
      const msg = JSON.parse(message);
      if (msg.action === "catchup" && msg.pipelineRunId) {
        const state = activeSessions.get(msg.pipelineRunId);
        if (state?.started) {
          logger.info({ pipelineRunId: msg.pipelineRunId }, "catch-up analyst run on resume");
          await dispatchAnalystRun(msg.pipelineRunId);
        }
      }
    } catch (err) {
      logger.error(err, "failed to process incremental-analyst control message");
    }
  });
}

// cleanup for graceful shutdown
export function stopCatchupListener(): void {
  if (catchupRedis) {
    catchupRedis.unsubscribe("control:incremental-analyst").catch(() => {});
    catchupRedis.disconnect();
    catchupRedis = null;
  }
  // stop all active sessions
  for (const [pipelineRunId] of activeSessions) {
    stopIncrementalAnalyst(pipelineRunId);
  }
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors. If the `getFullTranscript` import doesn't resolve, check that it's exported from `coaching.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/incremental-analyst.ts
git commit -m "feat: add incremental analyst scheduler with warm-up and re-run cadence"
```

---

### Task 7: Add incremental analyst handler to analyst worker

**Files:**
- Modify: `apps/worker/src/agents/analyst.ts`

The analyst worker needs a new handler for `analyst.incremental` events. This handler is similar to `handleCallEnded` but uses the transcript passed in the event data (from the in-memory buffer) instead of reading from the database. It also applies material change detection — only publishes `build.spec.updated` if the spec changed meaningfully.

- [ ] **Step 1: Add handleIncrementalAnalysis function**

In `apps/worker/src/agents/analyst.ts`, add a new handler after the existing `handleCallEnded` function:

```typescript
async function handleIncrementalAnalysis(event: AnalystIncrementalEvent): Promise<void> {
  const { pipelineRunId } = event;
  const transcript = event.data.transcript;
  const agentLogger = createAgentLogger("analyst-incremental", pipelineRunId);

  agentLogger.info({ transcriptLength: transcript.length }, "starting incremental analysis");

  // load existing analysis and client context
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: {
      call: { include: { client: true } },
      client: true,
    },
  });

  if (!run) {
    agentLogger.error("pipeline run not found");
    return;
  }

  // load team directives for context
  const directives = run.teamDirectives as Array<{ text: string; timestamp: number; sentBy: string }> | null;
  let directivesContext = "";
  if (directives && directives.length > 0) {
    directivesContext = "\n\nTEAM MEMBER FEEDBACK:\n" + directives
      .map((d) => `[${new Date(d.timestamp).toISOString()}] ${d.sentBy}: ${d.text}`)
      .join("\n");
  }

  // set up workspace and write transcript
  const workspace = await createWorkspace(pipelineRunId);
  const fs = await import("node:fs/promises");
  await fs.writeFile(`${workspace.basePath}/transcript.txt`, transcript);

  const clientContext = `industry: ${run.client.industry}, name: ${run.client.name}`;

  // invoke claude code with analyst prompt + directives context
  const result = await invokeClaudeCode({
    prompt: analystPrompt + directivesContext,
    workingDirectory: workspace.basePath,
    timeoutMs: 5 * 60 * 1000, // 5-minute timeout for incremental runs
    pipelineRunId,
  });

  // parse output
  const output = JSON.parse(result.output);

  // check for existing analysis to detect material changes
  const existingAnalysis = await prisma.analysis.findFirst({
    where: { call: { pipelineRuns: { some: { id: pipelineRunId } } } },
    include: { buildSpecs: { orderBy: { version: "desc" }, take: 1 } },
  });

  const currentSpec = existingAnalysis?.buildSpecs[0];
  const isFirstRun = !existingAnalysis;

  if (isFirstRun) {
    // first incremental run — create analysis + build spec v1
    const analysis = await prisma.analysis.create({
      data: {
        callId: run.callId,
        workflowMap: output.workflowMap ?? null,
        gaps: output.gaps ?? null,
        monetaryImpact: output.totalMonthlyImpact ? { total: output.totalMonthlyImpact } : null,
      },
    });

    const spec = output.prototype ?? output;
    const buildSpec = await prisma.buildSpec.create({
      data: {
        analysisId: analysis.id,
        version: 1,
        uiRequirements: spec.pages ?? null,
        dataModels: spec.mockEndpoints ?? null,
        integrations: spec.simulatedIntegrations ?? null,
        walkthroughSteps: spec.walkthroughSteps ?? null,
      },
    });

    await publishEvent(createEvent("analysis.complete", pipelineRunId, {
      analysisId: analysis.id,
      gapCount: (output.gaps as unknown[])?.length ?? 0,
      totalMonetaryImpact: output.totalMonthlyImpact ?? "$0",
    }));

    await publishEvent(createEvent("build.spec.ready", pipelineRunId, {
      buildSpecId: buildSpec.id,
      version: 1,
      pageCount: (spec.pages as unknown[])?.length ?? 0,
    }));

    agentLogger.info("first incremental analysis complete — spec v1 published");
  } else {
    // subsequent run — check for material changes
    const spec = output.prototype ?? output;
    const newPages = spec.pages as unknown[] ?? [];
    const newIntegrations = spec.simulatedIntegrations as unknown[] ?? [];
    const newGaps = output.gaps as unknown[] ?? [];

    const oldPages = currentSpec?.uiRequirements as unknown[] ?? [];
    const oldIntegrations = currentSpec?.integrations as unknown[] ?? [];
    const oldGaps = existingAnalysis?.gaps as unknown[] ?? [];

    const materialChange =
      newPages.length !== oldPages.length ||
      newIntegrations.length !== oldIntegrations.length ||
      newGaps.length !== oldGaps.length;

    if (materialChange) {
      const newVersion = (currentSpec?.version ?? 0) + 1;
      const buildSpec = await prisma.buildSpec.create({
        data: {
          analysisId: existingAnalysis!.id,
          version: newVersion,
          uiRequirements: spec.pages ?? null,
          dataModels: spec.mockEndpoints ?? null,
          integrations: spec.simulatedIntegrations ?? null,
          walkthroughSteps: spec.walkthroughSteps ?? null,
        },
      });

      // update analysis with latest gaps
      await prisma.analysis.update({
        where: { id: existingAnalysis!.id },
        data: {
          gaps: output.gaps ?? null,
          monetaryImpact: output.totalMonthlyImpact ? { total: output.totalMonthlyImpact } : null,
        },
      });

      await publishEvent(createEvent("analysis.complete", pipelineRunId, {
        analysisId: existingAnalysis!.id,
        gapCount: newGaps.length,
        totalMonetaryImpact: output.totalMonthlyImpact ?? "$0",
      }));

      await publishEvent(createEvent("build.spec.updated", pipelineRunId, {
        buildSpecId: buildSpec.id,
        version: newVersion,
        changesFromGapReport: `incremental update: pages ${oldPages.length}→${newPages.length}, integrations ${oldIntegrations.length}→${newIntegrations.length}, gaps ${oldGaps.length}→${newGaps.length}`,
      }));

      agentLogger.info({ newVersion, materialChange: true }, "incremental analysis complete — spec updated");
    } else {
      agentLogger.info("incremental analysis complete — no material changes, skipping spec update");
    }
  }
}
```

- [ ] **Step 2: Register the handler in the analyst worker**

In the analyst worker's event routing (where it handles `call.ended`, `build.design.question`, and `review.complete`), add a case for `analyst.incremental`:

```typescript
    case "analyst.incremental":
      await handleIncrementalAnalysis(event as AnalystIncrementalEvent);
      break;
```

- [ ] **Step 3: Add import for the new event type**

At the top of the file, add `AnalystIncrementalEvent` to the imports from `@slushie/events`.

- [ ] **Step 4: Verify compilation**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/agents/analyst.ts
git commit -m "feat: add incremental analyst handler with material change detection"
```

---

### Task 8: Wire incremental analyst into coaching control

**Files:**
- Modify: `apps/worker/src/coaching-control.ts`

The incremental analyst scheduler starts and stops alongside the coaching scheduler — both are lifecycle-bound to the call.

- [ ] **Step 1: Add import**

At the top of `apps/worker/src/coaching-control.ts`, add:

```typescript
import { startIncrementalAnalyst, stopIncrementalAnalyst } from "./incremental-analyst";
```

- [ ] **Step 2: Start incremental analyst on coaching start**

In the `start` message handler, after the call to `startCoachingScheduler(...)`, add:

```typescript
        startIncrementalAnalyst(msg.pipelineRunId);
```

- [ ] **Step 3: Stop incremental analyst on coaching stop**

In the `stop` message handler, after the call to `stopCoachingScheduler(...)` but BEFORE `clearTranscriptBuffer(...)`, add:

```typescript
        stopIncrementalAnalyst(msg.pipelineRunId);
```

Note: must come before `clearTranscriptBuffer` since `stopIncrementalAnalyst` may need the buffer for any final check.

- [ ] **Step 4: Verify compilation**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/coaching-control.ts
git commit -m "feat: wire incremental analyst scheduler into coaching lifecycle"
```

---

### Task 9: Register catch-up listener and cleanup in worker entry

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Add imports**

At the top of `apps/worker/src/index.ts`, add:

```typescript
import { setupCatchupListener, stopCatchupListener } from "./incremental-analyst";
```

- [ ] **Step 2: Call setup in main function**

In the `main()` function, after the worker registrations and before the graceful shutdown setup, add:

```typescript
  // incremental analyst catch-up listener (for resume signals)
  setupCatchupListener();
  logger.info("incremental analyst catch-up listener started");
```

- [ ] **Step 3: Add cleanup to shutdown handler**

In the `shutdown` function, before `process.exit(0)`, add:

```typescript
    stopCatchupListener();
```

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat: register incremental analyst catch-up listener on worker start with cleanup"
```

---

### Task 10: Add pause-aware dispatch to pipeline orchestrator

**Files:**
- Modify: `apps/worker/src/agents/pipeline.ts`

- [ ] **Step 1: Add pause check helper**

Near the top of the file (after imports), add a helper function:

```typescript
async function isBuildPaused(pipelineRunId: string): Promise<boolean> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    select: { buildPaused: true },
  });
  return run?.buildPaused ?? false;
}
```

- [ ] **Step 2: Add pause check before builder dispatch on build.spec.ready**

In the `build.spec.ready` handler (where the builder queue is enqueued), add before the enqueue call:

```typescript
      if (await isBuildPaused(event.pipelineRunId)) {
        logger.info({ pipelineRunId: event.pipelineRunId }, "build paused, skipping builder dispatch");
        return;
      }
```

- [ ] **Step 3: Add pause check before builder dispatch on build.spec.updated**

In the `build.spec.updated` handler (where the builder queue is enqueued for patches), add the same pause check before the enqueue. Also set a shorter timeout for mid-call builder jobs:

```typescript
      if (await isBuildPaused(event.pipelineRunId)) {
        logger.info({ pipelineRunId: event.pipelineRunId }, "build paused, skipping builder patch dispatch");
        return;
      }
```

When enqueuing the builder job for `build.spec.updated`, use a 15-minute timeout (vs the default 45 minutes) for mid-call runs. Add `timeout: 15 * 60 * 1000` to the job options.

- [ ] **Step 4: Add team directives to workspace setup**

In the `setupWorkspace` function, after writing the transcript and coaching log files, add team directives. Use the workspace object returned by `createWorkspace()`:

```typescript
  // load team directives for agent context
  const pipelineRun = await prisma.pipelineRun.findUnique({
    where: { id: event.pipelineRunId },
    select: { teamDirectives: true },
  });
  const directives = pipelineRun?.teamDirectives as Array<{ text: string; timestamp: number; sentBy: string }> | null;
  if (directives && directives.length > 0) {
    const directivesText = directives
      .map((d) => `[${new Date(d.timestamp).toISOString()}] ${d.sentBy}: ${d.text}`)
      .join("\n");
    const fs = await import("node:fs/promises");
    await fs.writeFile(
      `${workspace.basePath}/team-directives.txt`,
      `TEAM MEMBER FEEDBACK:\n${directivesText}\n`
    );
  }
```

Note: use the actual workspace variable name from `createWorkspace()` — check the function to see if it's `workspace.basePath`, `workspace.dir`, or similar.

- [ ] **Step 5: Ensure call.ended does NOT check buildPaused for final analyst pass**

Verify that the `call.ended` handler in the orchestrator does NOT have a pause check. Per spec: "call end overrides pause for analysis." The final analyst pass must always run. The pause check only applies to `build.spec.ready` and `build.spec.updated` handlers.

- [ ] **Step 6: Verify compilation**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/agents/pipeline.ts
git commit -m "feat: add pause-aware dispatch and team directives to pipeline orchestrator"
```

---

## Chunk 3: Build Preview Panel UI

### Task 11: Create build preview panel component

**Files:**
- Create: `apps/web/src/components/call/build-preview-panel.tsx`

This component is built with `forwardRef` and `useImperativeHandle` from the start, so the parent page can call `handleBuildEvent` on it via ref.

- [ ] **Step 1: Create the component file**

Create `apps/web/src/components/call/build-preview-panel.tsx`:

```typescript
"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

interface ActivityEntry {
  id: string;
  type: "progress" | "system" | "message";
  text: string;
  timestamp: number;
  sender?: string;
  percentComplete?: number;
}

interface BuildPreviewPanelProps {
  pipelineRunId: string;
  isLive: boolean;
}

export interface BuildPreviewPanelHandle {
  handleBuildEvent: (event: {
    type: string;
    data?: Record<string, unknown>;
    timestamp?: number;
  }) => void;
}

export const BuildPreviewPanel = forwardRef<BuildPreviewPanelHandle, BuildPreviewPanelProps>(
  function BuildPreviewPanel({ pipelineRunId, isLive }, ref) {
    const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const previewUrlRef = useRef<string | null>(null); // ref to avoid stale closure
    const [isPaused, setIsPaused] = useState(false);
    const [messageText, setMessageText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const logBottomRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // auto-scroll activity log
    useEffect(() => {
      logBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activityLog.length]);

    const addEntry = useCallback((entry: Omit<ActivityEntry, "id">) => {
      setActivityLog((prev) => [
        ...prev,
        { ...entry, id: `${entry.timestamp}-${Math.random().toString(36).slice(2, 6)}` },
      ]);
    }, []);

    // called by the parent page when SSE events arrive
    const handleBuildEvent = useCallback(
      (event: { type: string; data?: Record<string, unknown>; timestamp?: number }) => {
        const ts = event.timestamp ?? Date.now();

        switch (event.type) {
          case "prototype.progress": {
            const phase = (event.data?.phase as string) ?? "working";
            const pct = (event.data?.percentComplete as number) ?? 0;
            addEntry({ type: "progress", text: phase, timestamp: ts, percentComplete: pct });
            break;
          }
          case "prototype.ready": {
            const url = event.data?.previewUrl as string;
            const version = event.data?.version as number;
            if (url) {
              setPreviewUrl(url);
              previewUrlRef.current = url;
            }
            addEntry({ type: "system", text: `prototype v${version ?? 1} ready`, timestamp: ts });
            break;
          }
          case "prototype.patched": {
            addEntry({ type: "system", text: "prototype updated", timestamp: ts });
            // reload iframe with cached url from ref (avoids stale closure)
            if (iframeRef.current && previewUrlRef.current) {
              iframeRef.current.src = previewUrlRef.current;
            }
            break;
          }
          case "build.message": {
            addEntry({
              type: "message",
              text: event.data?.text as string,
              sender: event.data?.sentBy as string,
              timestamp: ts,
            });
            break;
          }
          case "build.paused": {
            setIsPaused(true);
            addEntry({ type: "system", text: "build paused", timestamp: ts });
            break;
          }
          case "build.resumed": {
            setIsPaused(false);
            addEntry({ type: "system", text: "build resumed", timestamp: ts });
            break;
          }
          case "build.spec.ready": {
            const v = event.data?.version as number;
            addEntry({ type: "system", text: `build spec v${v ?? 1} ready`, timestamp: ts });
            break;
          }
          case "build.spec.updated": {
            const v = event.data?.version as number;
            addEntry({ type: "system", text: `build spec updated v${v ?? "?"}`, timestamp: ts });
            break;
          }
          case "analysis.complete": {
            addEntry({ type: "system", text: "analysis complete", timestamp: ts });
            break;
          }
        }
      },
      [addEntry]
    );

    useImperativeHandle(ref, () => ({ handleBuildEvent }), [handleBuildEvent]);

    const handleSendMessage = useCallback(async () => {
      if (!messageText.trim() || isSending) return;
      setIsSending(true);
      try {
        await fetch("/api/calls/build/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipelineRunId, text: messageText.trim() }),
        });
        setMessageText("");
      } catch (err) {
        console.error("failed to send message:", err);
      } finally {
        setIsSending(false);
      }
    }, [messageText, isSending, pipelineRunId]);

    const handlePauseResume = useCallback(async () => {
      const endpoint = isPaused ? "/api/calls/build/resume" : "/api/calls/build/pause";
      try {
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipelineRunId }),
        });
      } catch (err) {
        console.error("failed to pause/resume:", err);
      }
    }, [isPaused, pipelineRunId]);

    const handleRefreshIframe = useCallback(() => {
      if (iframeRef.current && previewUrlRef.current) {
        iframeRef.current.src = previewUrlRef.current;
      }
    }, []);

    const formatTime = (ts: number) => {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    return (
      <div className="flex h-full flex-col">
        {/* activity log — top 30% */}
        <div className="h-[30%] overflow-y-auto border-b border-gray-100 px-3 py-2">
          {activityLog.length === 0 ? (
            <p className="text-sm text-muted">
              {isLive ? "build activity will appear here..." : "start a call to begin building."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {activityLog.map((entry) => {
                if (entry.type === "message") {
                  return (
                    <div key={entry.id} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 rounded bg-secondary/10 px-1.5 py-0.5 text-[10px] font-semibold text-secondary">
                        {entry.sender ?? "you"}
                      </span>
                      <p className="text-sm text-foreground">{entry.text}</p>
                      <span className="ml-auto shrink-0 text-[10px] text-muted">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>
                  );
                }

                if (entry.type === "system") {
                  return (
                    <div key={entry.id} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted">{formatTime(entry.timestamp)}</span>
                      <span className="text-xs font-medium text-muted">{entry.text}</span>
                    </div>
                  );
                }

                // progress entry
                return (
                  <div key={entry.id} className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-secondary" />
                    <span className="text-xs text-foreground">{entry.text}</span>
                    {entry.percentComplete !== undefined && (
                      <span className="text-[10px] text-muted">{entry.percentComplete}%</span>
                    )}
                    <span className="ml-auto text-[10px] text-muted">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                );
              })}
              <div ref={logBottomRef} />
            </div>
          )}
        </div>

        {/* iframe preview — bottom 70% */}
        <div className="relative flex-1 bg-gray-50">
          {previewUrl ? (
            <>
              <iframe
                ref={iframeRef}
                src={previewUrl}
                className="h-full w-full border-0"
                title="prototype preview"
              />
              <button
                onClick={handleRefreshIframe}
                className="absolute right-2 top-2 rounded bg-white/80 px-2 py-1 text-[10px] text-muted shadow-sm hover:bg-white hover:text-foreground"
              >
                refresh
              </button>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted">build will appear here as it takes shape...</p>
            </div>
          )}
        </div>

        {/* controls bar */}
        <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="suggest something to the builder..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            disabled={!isLive}
          />
          <button
            onClick={handleSendMessage}
            disabled={!messageText.trim() || isSending || !isLive}
            className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            send
          </button>
          <button
            onClick={handlePauseResume}
            disabled={!isLive}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              isPaused
                ? "border-green-300 text-green-700 hover:bg-green-50"
                : "border-yellow-300 text-yellow-700 hover:bg-yellow-50"
            } disabled:opacity-50`}
          >
            {isPaused ? "resume" : "pause"}
          </button>
        </div>
      </div>
    );
  }
);
```

- [ ] **Step 2: Verify component compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/call/build-preview-panel.tsx
git commit -m "feat: add build preview panel component with activity log, iframe, chat, and controls"
```

---

### Task 12: Wire build preview panel into the live call page

**Files:**
- Modify: `apps/web/src/app/(dashboard)/dashboard/calls/live/[pipelineRunId]/page.tsx`

- [ ] **Step 1: Add imports**

At the top of the file, add:

```typescript
import { BuildPreviewPanel, type BuildPreviewPanelHandle } from "@/components/call/build-preview-panel";
```

- [ ] **Step 2: Add ref for build preview panel**

In the `LiveCallPage` component, after the existing refs (`transcriptBottomRef`, `coachingBottomRef`), add:

```typescript
  const buildPreviewRef = useRef<BuildPreviewPanelHandle | null>(null);
```

- [ ] **Step 3: Add state for responsive panel position**

After the existing state declarations, add:

```typescript
  const [buildPanelX, setBuildPanelX] = useState(972);
  const [buildPanelY, setBuildPanelY] = useState(80);

  useEffect(() => {
    if (window.innerWidth < 1500) {
      setBuildPanelX(528);
      setBuildPanelY(600);
    }
  }, []);
```

- [ ] **Step 4: Expand handleSSEEvent to route build events**

In the `handleSSEEvent` callback, add routing for build-related events after the existing `coaching.suggestion` handler:

```typescript
    // route build events to build preview panel
    const buildEventTypes = [
      "prototype.progress", "prototype.ready", "prototype.patched",
      "build.message", "build.paused", "build.resumed",
      "build.spec.ready", "build.spec.updated", "analysis.complete",
    ];
    if (buildEventTypes.includes(event.type)) {
      buildPreviewRef.current?.handleBuildEvent(event);
    }
```

- [ ] **Step 5: Add build preview DraggablePanel**

After the coaching `DraggablePanel` closing tag and before the closing `</div>` of the panels container, add:

```tsx
        {/* build preview panel */}
        <DraggablePanel
          title="build preview"
          defaultX={buildPanelX}
          defaultY={buildPanelY}
          defaultW={500}
          defaultH={600}
        >
          <BuildPreviewPanel
            ref={buildPreviewRef}
            pipelineRunId={pipelineRunId}
            isLive={isLive}
          />
        </DraggablePanel>
```

- [ ] **Step 6: Verify everything compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/call/build-preview-panel.tsx apps/web/src/app/(dashboard)/dashboard/calls/live/[pipelineRunId]/page.tsx
git commit -m "feat: wire build preview panel into live call page"
```

---

### Task 13: Manual integration test

- [ ] **Step 1: Clear .next cache and restart dev server**

```bash
cd apps/web && rm -rf .next && npm run dev
```

- [ ] **Step 2: Verify the live call page loads with three panels**

Navigate to the live call page. Verify:
- Transcript panel (left)
- Coaching panel (middle)
- Build preview panel (right) — shows "build activity will appear here..." in the top section and "build will appear here as it takes shape..." in the bottom section

- [ ] **Step 3: Verify chat input and pause button render**

At the bottom of the build preview panel, verify:
- Text input with placeholder "suggest something to the builder..."
- "send" button (disabled when input is empty)
- "pause" button (yellow border)

- [ ] **Step 4: Test the message API**

Start a call, then type a message in the chat input and click send. Open browser devtools network tab and verify:
- POST to `/api/calls/build/message` returns `{ ok: true }`
- The message appears in the activity log as a chat bubble

- [ ] **Step 5: Test pause/resume API**

Click the "pause" button. Verify:
- POST to `/api/calls/build/pause` returns `{ ok: true }`
- Activity log shows "build paused" system entry
- Button switches to "resume" (green border)

Click "resume". Verify:
- POST to `/api/calls/build/resume` returns `{ ok: true }`
- Activity log shows "build resumed" system entry
- Button switches back to "pause"

- [ ] **Step 6: Commit any fixes**

Only stage files that were modified during testing:

```bash
git status
git add <specific files that changed>
git commit -m "fix: resolve integration issues from build preview panel setup"
```

---

## Summary

**What this plan produces:**
- 3 new API routes: `/api/calls/build/message`, `/api/calls/build/pause`, `/api/calls/build/resume`
- 4 new event types: `build.message`, `build.paused`, `build.resumed`, `analyst.incremental`
- 4 new PipelineRun fields: `buildPaused`, `teamDirectives`, `lastAnalystRunAt`, `transcriptSnapshot`
- incremental analyst scheduler with 5-minute warm-up, 5-minute re-run cadence, 20% growth threshold
- incremental analyst handler with material change detection (gap count, page count, integration count)
- build preview panel with activity log, iframe preview, chat input, and pause/resume controls
- pause-aware pipeline orchestrator that checks `buildPaused` before dispatching builder jobs
- shorter timeouts for mid-call runs (analyst 5min, builder 15min)
- team directives injected into analyst and builder claude code sessions
- proper Redis cleanup on shutdown for catch-up listener
- reuse of 5 existing events (`analysis.complete`, `build.spec.ready`, `build.spec.updated`, `prototype.ready`, `prototype.patched`) in the mid-call context

**What comes next:**
- end-to-end testing with a real call once the analyst/builder agents are fully operational
- responsive layout tweaks based on user feedback
