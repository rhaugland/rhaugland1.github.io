# slushie plan 4: client experience (tracker + dev chat + prototype delivery)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build the client-facing experience — a domino's-style progress tracker, a dev chat that simulates sms notifications, and a prototype preview wrapper with guided walkthrough. clients get real-time visibility into their build without needing an account.

**Architecture:** public tracker page receives real-time updates via sse from a tracker worker that listens to `tracker.update` events. dev chat lives in the protected dashboard and stores notification messages in the database, streamed via sse. prototype preview wraps generated prototypes in a slushie-branded frame with a tooltip-based walkthrough overlay. tracker creation is triggered by `call.ended` events. a delivery worker listens for `team.approved` and fires the final tracker step + prototype link notification.

**Tech Stack:** next.js, typescript, tailwind css, prisma, redis pub/sub, sse, bullmq, nanoid

**Spec:** `docs/superpowers/specs/2026-03-13-slushie-platform-design.md`

**Depends on:** plan 1 (monorepo, database, event bus, auth, brand system)

**Produces:** public progress tracker at `/track/[slug]`, dev chat at `/dashboard/dev/chat`, prototype preview at `/preview/[nanoid]`, tracker worker, notification worker, tracker-init worker, delivery worker.

---

## Chunk 1: Database Schema Updates + Workers + SSE Infrastructure

### Task 1: Add NotificationMessage model and update Tracker schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: add NotificationMessage model and prototypeNanoid to Tracker**

Add the following to the end of `packages/db/prisma/schema.prisma`:

```prisma
model NotificationMessage {
  id            String   @id @default(cuid())
  pipelineRunId String
  clientName    String
  message       String   @db.Text
  trackerUrl    String?
  prototypeUrl  String?
  createdAt     DateTime @default(now())

  @@index([pipelineRunId])
}
```

Also add a `prototypeNanoid` field to the existing `Tracker` model, after the `slug` field:

```prisma
  prototypeNanoid String?  @unique
```

- [ ] **Step 2: regenerate prisma client**

```bash
cd packages/db && npx prisma generate
```

Expected: `prisma generate` completes with "Generated Prisma Client".

- [ ] **Step 3: push schema to database**

```bash
cd packages/db && npx prisma db push
```

Expected: schema synced to database.

- [ ] **Step 4: commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat: add NotificationMessage model and prototypeNanoid to Tracker"
```

---

### Task 2: Create tracker SSE endpoint (public, no auth)

**Files:**
- Create: `apps/web/src/app/api/track/[slug]/events/route.ts`

- [ ] **Step 1: create public tracker SSE route**

Create `apps/web/src/app/api/track/[slug]/events/route.ts`:

```typescript
import Redis from "ioredis";
import { prisma } from "@slushie/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // verify slug exists — security via unguessable nanoid
  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    select: { id: true, pipelineRunId: true, expiresAt: true },
  });

  if (!tracker) {
    return new Response("not found", { status: 404 });
  }

  if (tracker.expiresAt && tracker.expiresAt < new Date()) {
    return new Response("this link has expired", { status: 410 });
  }

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const channel = `tracker:${tracker.pipelineRunId}`;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let alive = true;

      controller.enqueue(
        encoder.encode(`event: connected\ndata: {"slug":"${slug}"}\n\n`)
      );

      const keepalive = setInterval(() => {
        if (alive) {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        }
      }, 15_000);

      redis.subscribe(channel, (err) => {
        if (err) {
          clearInterval(keepalive);
          controller.error(err);
        }
      });

      redis.on("message", (_ch: string, message: string) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
      });

      redis.on("error", () => cleanup());

      function cleanup() {
        alive = false;
        clearInterval(keepalive);
        redis.unsubscribe(channel).catch(() => {});
        redis.disconnect();
        try {
          controller.close();
        } catch {}
      }

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/api/track
git commit -m "feat: add public tracker SSE endpoint with slug validation"
```

---

### Task 3: Create dev chat SSE endpoint (authenticated)

**Files:**
- Create: `apps/web/src/app/api/dev/chat/events/route.ts`

- [ ] **Step 1: create dev chat SSE route**

Create `apps/web/src/app/api/dev/chat/events/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const channel = "dev:chat";

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let alive = true;

      controller.enqueue(
        encoder.encode(`event: connected\ndata: {"channel":"dev:chat"}\n\n`)
      );

      const keepalive = setInterval(() => {
        if (alive) {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        }
      }, 15_000);

      redis.subscribe(channel, (err) => {
        if (err) {
          clearInterval(keepalive);
          controller.error(err);
        }
      });

      redis.on("message", (_ch: string, message: string) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
      });

      redis.on("error", () => cleanup());

      function cleanup() {
        alive = false;
        clearInterval(keepalive);
        redis.unsubscribe(channel).catch(() => {});
        redis.disconnect();
        try {
          controller.close();
        } catch {}
      }

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/api/dev
git commit -m "feat: add authenticated dev chat SSE endpoint"
```

---

### Task 4: Create tracker worker

**Files:**
- Create: `apps/worker/src/workers/tracker.worker.ts`

- [ ] **Step 1: create tracker worker that listens for tracker.update events**

Create `apps/worker/src/workers/tracker.worker.ts`:

```typescript
import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { prisma } from "@slushie/db";
import type { TrackerUpdateEvent } from "@slushie/events";
import { logger } from "../logger";

const TRACKER_STEPS = [
  { step: 1, label: "call complete", subtitle: "we heard what you need." },
  { step: 2, label: "analyzing your workflow", subtitle: "finding the gaps that cost you money." },
  { step: 3, label: "building your prototype", subtitle: "pouring the ingredients together." },
  { step: 4, label: "quality check", subtitle: "making sure everything blends right." },
  { step: 5, label: "ready to serve", subtitle: "your tool is live. take a sip." },
];

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const pubRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

export function createTrackerWorker() {
  const worker = new Worker<TrackerUpdateEvent>(
    "tracker",
    async (job: Job<TrackerUpdateEvent>) => {
      const event = job.data;
      const { pipelineRunId } = event;
      const { step } = event.data;

      const workerLogger = logger.child({ pipelineRunId, step });
      workerLogger.info("processing tracker update");

      // find tracker for this pipeline run
      const tracker = await prisma.tracker.findUnique({
        where: { pipelineRunId },
      });

      if (!tracker) {
        workerLogger.error("no tracker found for pipeline run");
        throw new Error(`no tracker found for pipeline run ${pipelineRunId}`);
      }

      // validate step number
      if (step < 1 || step > 5) {
        workerLogger.error({ step }, "invalid tracker step");
        throw new Error(`invalid tracker step: ${step}`);
      }

      // look up step metadata — use event data if provided, fall back to defaults
      const stepMeta = TRACKER_STEPS[step - 1];
      const label = event.data.label || stepMeta.label;
      const subtitle = event.data.subtitle || stepMeta.subtitle;

      // update tracker in database
      const updatedSteps = (tracker.steps as Array<{
        step: number;
        label: string;
        subtitle: string;
        status: string;
        completedAt: string | null;
      }>) ?? TRACKER_STEPS.map((s) => ({
        ...s,
        status: "pending",
        completedAt: null,
      }));

      // mark all steps up to current as done, current as active
      for (let i = 0; i < updatedSteps.length; i++) {
        if (i < step - 1) {
          updatedSteps[i].status = "done";
          updatedSteps[i].completedAt = updatedSteps[i].completedAt ?? new Date().toISOString();
        } else if (i === step - 1) {
          updatedSteps[i].status = "active";
          updatedSteps[i].label = label;
          updatedSteps[i].subtitle = subtitle;
        } else {
          updatedSteps[i].status = "pending";
        }
      }

      // if step is 5 (final), mark it as done too
      if (step === 5) {
        updatedSteps[4].status = "done";
        updatedSteps[4].completedAt = new Date().toISOString();
      }

      await prisma.tracker.update({
        where: { id: tracker.id },
        data: {
          currentStep: step,
          steps: updatedSteps,
        },
      });

      // publish to redis pub/sub for SSE
      const ssePayload = JSON.stringify({
        type: "tracker.update",
        pipelineRunId,
        step,
        label,
        subtitle,
        steps: updatedSteps,
        timestamp: Date.now(),
      });

      await pubRedis.publish(`tracker:${pipelineRunId}`, ssePayload);
      workerLogger.info({ step, label }, "tracker updated and published");
    },
    { connection: getRedisConnection() }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "tracker worker job failed");
  });

  logger.info("tracker worker registered");
  return worker;
}

export { TRACKER_STEPS };
```

- [ ] **Step 2: commit**

```bash
git add apps/worker/src/workers/tracker.worker.ts
git commit -m "feat: add tracker worker with step updates and SSE publishing"
```

---

### Task 5: Create dev chat notification worker

**Files:**
- Create: `apps/worker/src/workers/notification.worker.ts`

- [ ] **Step 1: create notification worker that listens for client.notified events**

Create `apps/worker/src/workers/notification.worker.ts`:

```typescript
import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { prisma } from "@slushie/db";
import type { ClientNotifiedEvent } from "@slushie/events";
import { logger } from "../logger";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const pubRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

export function createNotificationWorker() {
  const worker = new Worker<ClientNotifiedEvent>(
    "notification",
    async (job: Job<ClientNotifiedEvent>) => {
      const event = job.data;
      const { pipelineRunId } = event;
      const { clientName, message, trackerUrl, prototypeUrl } = event.data;

      const workerLogger = logger.child({ pipelineRunId, clientName });
      workerLogger.info("processing client notification");

      // store notification message in database
      const notification = await prisma.notificationMessage.create({
        data: {
          pipelineRunId,
          clientName,
          message,
          trackerUrl: trackerUrl ?? null,
          prototypeUrl: prototypeUrl ?? null,
        },
      });

      // publish to dev chat channel via redis pub/sub
      const ssePayload = JSON.stringify({
        type: "client.notified",
        id: notification.id,
        pipelineRunId,
        clientName,
        message,
        trackerUrl,
        prototypeUrl,
        createdAt: notification.createdAt.toISOString(),
        timestamp: Date.now(),
      });

      await pubRedis.publish("dev:chat", ssePayload);
      workerLogger.info({ notificationId: notification.id }, "notification stored and published to dev chat");
    },
    { connection: getRedisConnection() }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "notification worker job failed");
  });

  logger.info("notification worker registered");
  return worker;
}
```

- [ ] **Step 2: commit**

```bash
git add apps/worker/src/workers/notification.worker.ts
git commit -m "feat: add dev chat notification worker with DB storage and SSE"
```

---

### Task 6: Create tracker creation logic (triggered on call.ended)

**Files:**
- Create: `apps/worker/src/workers/tracker-init.worker.ts`

- [ ] **Step 1: create tracker initialization worker**

Create `apps/worker/src/workers/tracker-init.worker.ts`:

```typescript
import { Worker, Job } from "bullmq";
import { prisma } from "@slushie/db";
import { nanoid } from "nanoid";
import type { CallEndedEvent, ClientNotifiedEvent } from "@slushie/events";
import { createEventQueue } from "@slushie/events";
import { logger } from "../logger";
import { TRACKER_STEPS } from "./tracker.worker";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const notificationQueue = createEventQueue("notification");
const trackerQueue = createEventQueue("tracker");

export function createTrackerInitWorker() {
  const worker = new Worker<CallEndedEvent>(
    "tracker-init",
    async (job: Job<CallEndedEvent>) => {
      const event = job.data;
      const { pipelineRunId } = event;
      const { callId, clientId } = event.data;

      const workerLogger = logger.child({ pipelineRunId, callId });
      workerLogger.info("initializing tracker for pipeline run");

      // generate unguessable slugs — nanoid 21 chars per spec
      const slug = nanoid(21);
      const prototypeNanoid = nanoid(21);

      // set expiry 30 days from now per spec
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // initialize all steps as pending with step 1 active
      const initialSteps = TRACKER_STEPS.map((s, i) => ({
        ...s,
        status: i === 0 ? "active" : "pending",
        completedAt: null,
      }));

      // create tracker record
      const tracker = await prisma.tracker.create({
        data: {
          pipelineRunId,
          slug,
          prototypeNanoid,
          currentStep: 1,
          steps: initialSteps,
          expiresAt,
        },
      });

      workerLogger.info({ trackerId: tracker.id, slug }, "tracker created");

      // look up client name
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { name: true },
      });
      const clientName = client?.name ?? "client";

      const trackerUrl = `slushie.agency/track/${slug}`;

      // fire tracker.update for step 1
      await trackerQueue.add("tracker.update", {
        type: "tracker.update",
        pipelineRunId,
        timestamp: Date.now(),
        data: {
          step: 1,
          label: "call complete",
          subtitle: "we heard what you need.",
        },
      } as any);

      // fire client.notified to dev chat — spec copy: cold/blending metaphor
      const notificationEvent: ClientNotifiedEvent = {
        type: "client.notified",
        pipelineRunId,
        timestamp: Date.now(),
        data: {
          clientName,
          trackerUrl,
          message: `hey! thanks for chatting with us today. we're blending your custom tool right now. track the progress here: ${trackerUrl}`,
        },
      };

      await notificationQueue.add("client.notified", notificationEvent);
      workerLogger.info({ trackerUrl }, "initial notification queued");
    },
    { connection: getRedisConnection() }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "tracker-init worker job failed");
  });

  logger.info("tracker-init worker registered");
  return worker;
}
```

- [ ] **Step 2: commit**

```bash
git add apps/worker/src/workers/tracker-init.worker.ts
git commit -m "feat: add tracker creation worker triggered by call.ended"
```

---

### Task 7: Register all new workers in the worker entry point

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: update worker entry point to register tracker, notification, and tracker-init workers**

Add the following imports after the existing imports in `apps/worker/src/index.ts`:

```typescript
import { createTrackerWorker } from "./workers/tracker.worker";
import { createNotificationWorker } from "./workers/notification.worker";
import { createTrackerInitWorker } from "./workers/tracker-init.worker";
```

Replace the comment `// workers will be registered here as they're built in plans 2-5` with:

```typescript
  // register workers
  const trackerWorker = createTrackerWorker();
  const notificationWorker = createNotificationWorker();
  const trackerInitWorker = createTrackerInitWorker();

  const workers = [trackerWorker, notificationWorker, trackerInitWorker];
```

Replace the existing shutdown function with:

```typescript
  const shutdown = async () => {
    logger.info("shutting down workers...");
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
```

- [ ] **Step 2: verify worker compiles**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat: register tracker, notification, and tracker-init workers"
```

---

## Chunk 2: Progress Tracker Page + Dev Chat UI

### Task 8: Build the progress tracker page

**Files:**
- Create: `apps/web/src/app/track/[slug]/page.tsx`
- Create: `apps/web/src/app/track/[slug]/tracker-client.tsx`

- [ ] **Step 1: create tracker server page**

Create `apps/web/src/app/track/[slug]/page.tsx`:

```tsx
import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TrackerClient } from "./tracker-client";

interface TrackerStep {
  step: number;
  label: string;
  subtitle: string;
  status: "done" | "active" | "pending";
  completedAt: string | null;
}

export const metadata: Metadata = {
  title: "slushie — tracking your build",
  description: "watch your custom tool come together.",
};

export default async function TrackerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    include: {
      pipelineRun: {
        include: {
          client: { select: { name: true } },
        },
      },
    },
  });

  if (!tracker) {
    notFound();
  }

  // expired links get a friendly message — 30 day expiry per spec
  if (tracker.expiresAt && tracker.expiresAt < new Date()) {
    return (
      <main className="flex min-h-screen items-center justify-center slushie-gradient">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-primary">slushie</h1>
          <p className="mt-4 text-foreground">this link has expired.</p>
          <p className="mt-2 text-muted text-sm">
            reach out to your slushie contact for a fresh one.
          </p>
        </div>
      </main>
    );
  }

  const steps = (tracker.steps as TrackerStep[]) ?? [];
  const clientName = tracker.pipelineRun.client.name;

  return (
    <TrackerClient
      slug={slug}
      clientName={clientName}
      initialSteps={steps}
      currentStep={tracker.currentStep}
      prototypeNanoid={tracker.prototypeNanoid}
    />
  );
}
```

- [ ] **Step 2: create tracker client component with SSE and animated step indicators**

Create `apps/web/src/app/track/[slug]/tracker-client.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface TrackerStep {
  step: number;
  label: string;
  subtitle: string;
  status: "done" | "active" | "pending";
  completedAt: string | null;
}

interface TrackerClientProps {
  slug: string;
  clientName: string;
  initialSteps: TrackerStep[];
  currentStep: number;
  prototypeNanoid: string | null;
}

function StepIndicator({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500">
        <svg
          className="h-5 w-5 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="relative flex h-10 w-10 items-center justify-center">
        <div className="absolute h-10 w-10 animate-ping rounded-full bg-primary opacity-25" />
        <div className="relative h-6 w-6 rounded-full bg-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300">
      <div className="h-3 w-3 rounded-full bg-gray-400" />
    </div>
  );
}

function StepConnector({ status }: { status: "done" | "active" | "pending" }) {
  return (
    <div className="mx-auto my-1 h-8 w-0.5">
      <div
        className={`h-full w-full transition-colors duration-500 ${
          status === "done" ? "bg-green-500" : "bg-gray-300"
        }`}
      />
    </div>
  );
}

export function TrackerClient({
  slug,
  clientName,
  initialSteps,
  currentStep: initialCurrentStep,
  prototypeNanoid,
}: TrackerClientProps) {
  const [steps, setSteps] = useState<TrackerStep[]>(initialSteps);
  const [currentStep, setCurrentStep] = useState(initialCurrentStep);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(`/api/track/${slug}/events`);

    eventSource.addEventListener("connected", () => {
      setConnected(true);
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "tracker.update" && data.steps) {
          setSteps(data.steps);
          setCurrentStep(data.step);
        }
      } catch {
        // ignore malformed messages
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      // browser will auto-reconnect
    };

    return () => {
      eventSource.close();
    };
  }, [slug]);

  const isComplete = currentStep === 5 && steps[4]?.status === "done";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center slushie-gradient px-4">
      <div className="w-full max-w-md">
        {/* header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold text-primary">slushie</h1>
          <p className="mt-2 text-foreground text-sm">
            {isComplete
              ? `${clientName}, your tool is ready.`
              : `hey ${clientName} — we're blending something for you.`}
          </p>
          {connected && !isComplete && (
            <p className="mt-1 text-xs text-muted">live updates</p>
          )}
        </div>

        {/* step list */}
        <div className="rounded-2xl bg-white/80 p-6 shadow-lg backdrop-blur-sm">
          {steps.map((step, index) => (
            <div key={step.step}>
              <div className="flex items-center gap-4">
                <StepIndicator status={step.status} />
                <div className="flex-1">
                  <p
                    className={`text-sm font-semibold ${
                      step.status === "active"
                        ? "text-primary"
                        : step.status === "done"
                        ? "text-foreground"
                        : "text-muted"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p
                    className={`text-xs ${
                      step.status === "pending" ? "text-muted/50" : "text-muted"
                    }`}
                  >
                    {step.subtitle}
                  </p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className="ml-5">
                  <StepConnector status={steps[index + 1].status === "pending" ? "pending" : "done"} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* prototype link — only shows when ready */}
        {isComplete && prototypeNanoid && (
          <div className="mt-6 text-center">
            <a
              href={`/preview/${prototypeNanoid}`}
              className="inline-block rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105"
            >
              take a look
            </a>
          </div>
        )}

        {/* auto-refresh hint */}
        {!isComplete && currentStep > 0 && (
          <p className="mt-6 text-center text-xs text-muted">
            this page updates automatically. no need to refresh.
          </p>
        )}
      </div>

      {/* footer */}
      <div className="mt-12 text-center text-xs text-muted/60">
        <p>powered by slushie</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: verify tracker page compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/track
git commit -m "feat: add progress tracker page with real-time SSE updates"
```

---

### Task 9: Build the dev chat page

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/dev/chat/page.tsx`
- Create: `apps/web/src/app/(dashboard)/dashboard/dev/chat/chat-client.tsx`
- Create: `apps/web/src/app/api/dev/chat/messages/route.ts`

- [ ] **Step 1: create API route to fetch existing messages**

Create `apps/web/src/app/api/dev/chat/messages/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";

export async function GET() {
  const session = await auth();
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }

  const messages = await prisma.notificationMessage.findMany({
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // group by pipelineRunId — each pipeline run gets its own chat thread
  const threads: Record<
    string,
    {
      pipelineRunId: string;
      clientName: string;
      messages: typeof messages;
    }
  > = {};

  for (const msg of messages) {
    if (!threads[msg.pipelineRunId]) {
      threads[msg.pipelineRunId] = {
        pipelineRunId: msg.pipelineRunId,
        clientName: msg.clientName,
        messages: [],
      };
    }
    threads[msg.pipelineRunId].messages.push(msg);
  }

  return Response.json({
    threads: Object.values(threads),
  });
}
```

- [ ] **Step 2: create dev chat server page**

Create `apps/web/src/app/(dashboard)/dashboard/dev/chat/page.tsx`:

```tsx
import { ChatClient } from "./chat-client";

export default function DevChatPage() {
  return <ChatClient />;
}
```

- [ ] **Step 3: create dev chat client component with phone-style UI**

Create `apps/web/src/app/(dashboard)/dashboard/dev/chat/chat-client.tsx`:

```tsx
"use client";

import { useEffect, useState, useRef } from "react";

interface NotificationMessage {
  id: string;
  pipelineRunId: string;
  clientName: string;
  message: string;
  trackerUrl: string | null;
  prototypeUrl: string | null;
  createdAt: string;
}

interface ChatThread {
  pipelineRunId: string;
  clientName: string;
  messages: NotificationMessage[];
}

function extractLinks(text: string): {
  beforeLink: string;
  trackerUrl: string | null;
  prototypeUrl: string | null;
  afterLink: string;
} {
  const trackerMatch = text.match(/(slushie\.agency\/track\/[a-zA-Z0-9_-]{21})/);
  const prototypeMatch = text.match(/(app\.slushie\.agency\/preview\/[a-zA-Z0-9_-]{21})/);

  let beforeLink = text;
  let afterLink = "";

  if (trackerMatch) {
    const idx = text.indexOf(trackerMatch[1]);
    beforeLink = text.substring(0, idx);
    afterLink = text.substring(idx + trackerMatch[1].length);
  } else if (prototypeMatch) {
    const idx = text.indexOf(prototypeMatch[1]);
    beforeLink = text.substring(0, idx);
    afterLink = text.substring(idx + prototypeMatch[1].length);
  }

  return {
    beforeLink,
    trackerUrl: trackerMatch ? trackerMatch[1] : null,
    prototypeUrl: prototypeMatch ? prototypeMatch[1] : null,
    afterLink,
  };
}

function ChatBubble({ message }: { message: NotificationMessage }) {
  const { beforeLink, trackerUrl, prototypeUrl, afterLink } = extractLinks(
    message.message
  );
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex justify-start">
      <div className="max-w-[280px] rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-2.5">
        <p className="text-sm text-foreground leading-relaxed">
          {beforeLink}
          {trackerUrl && (
            <button
              onClick={() => navigator.clipboard.writeText(`https://${trackerUrl}`)}
              className="inline text-secondary underline decoration-secondary/30 hover:decoration-secondary cursor-pointer"
              title="click to copy link"
            >
              {trackerUrl}
            </button>
          )}
          {prototypeUrl && (
            <button
              onClick={() => navigator.clipboard.writeText(`https://${prototypeUrl}`)}
              className="inline text-secondary underline decoration-secondary/30 hover:decoration-secondary cursor-pointer"
              title="click to copy link"
            >
              {prototypeUrl}
            </button>
          )}
          {afterLink}
        </p>
        <p className="mt-1 text-right text-[10px] text-muted">{time}</p>
      </div>
    </div>
  );
}

function ThreadView({
  thread,
  isSelected,
  onSelect,
}: {
  thread: ChatThread;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const lastMsg = thread.messages[thread.messages.length - 1];
  const preview =
    lastMsg.message.length > 50
      ? lastMsg.message.substring(0, 50) + "..."
      : lastMsg.message;
  const time = new Date(lastMsg.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <button
      onClick={onSelect}
      className={`w-full border-b border-gray-100 px-4 py-3 text-left transition-colors ${
        isSelected ? "bg-gradient-start/30" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          {thread.clientName}
        </span>
        <span className="text-[10px] text-muted">{time}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted truncate">{preview}</p>
    </button>
  );
}

export function ChatClient() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // fetch existing messages on mount
  useEffect(() => {
    async function loadMessages() {
      const res = await fetch("/api/dev/chat/messages");
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads);
        if (data.threads.length > 0 && !selectedThreadId) {
          setSelectedThreadId(data.threads[data.threads.length - 1].pipelineRunId);
        }
      }
    }
    loadMessages();
  }, []);

  // subscribe to SSE for real-time messages
  useEffect(() => {
    const eventSource = new EventSource("/api/dev/chat/events");

    eventSource.addEventListener("connected", () => {
      setConnected(true);
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "client.notified") {
          const newMsg: NotificationMessage = {
            id: data.id,
            pipelineRunId: data.pipelineRunId,
            clientName: data.clientName,
            message: data.message,
            trackerUrl: data.trackerUrl ?? null,
            prototypeUrl: data.prototypeUrl ?? null,
            createdAt: data.createdAt,
          };

          setThreads((prev) => {
            const existing = prev.find(
              (t) => t.pipelineRunId === newMsg.pipelineRunId
            );
            if (existing) {
              return prev.map((t) =>
                t.pipelineRunId === newMsg.pipelineRunId
                  ? { ...t, messages: [...t.messages, newMsg] }
                  : t
              );
            }
            return [
              ...prev,
              {
                pipelineRunId: newMsg.pipelineRunId,
                clientName: newMsg.clientName,
                messages: [newMsg],
              },
            ];
          });

          // auto-select new thread
          setSelectedThreadId(newMsg.pipelineRunId);
        }
      } catch {
        // ignore malformed messages
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threads, selectedThreadId]);

  const selectedThread = threads.find(
    (t) => t.pipelineRunId === selectedThreadId
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">dev chat</h2>
          <p className="text-sm text-muted">
            simulated sms notifications. upgrade to twilio in phase 2.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              connected ? "bg-green-500" : "bg-gray-300"
            }`}
          />
          <span className="text-xs text-muted">
            {connected ? "live" : "connecting..."}
          </span>
        </div>
      </div>

      {/* phone-style container */}
      <div className="overflow-hidden rounded-3xl border-2 border-gray-200 bg-white shadow-xl">
        <div className="flex h-[600px]">
          {/* thread list (left panel) */}
          <div className="w-[200px] border-r border-gray-200 overflow-y-auto">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
              <p className="text-xs font-semibold text-muted">threads</p>
            </div>
            {threads.length === 0 && (
              <div className="p-4 text-center text-xs text-muted">
                no messages yet. run a pipeline to see notifications here.
              </div>
            )}
            {threads.map((thread) => (
              <ThreadView
                key={thread.pipelineRunId}
                thread={thread}
                isSelected={thread.pipelineRunId === selectedThreadId}
                onSelect={() => setSelectedThreadId(thread.pipelineRunId)}
              />
            ))}
          </div>

          {/* chat messages (right panel) */}
          <div className="flex flex-1 flex-col">
            {/* chat header */}
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5">
              {selectedThread ? (
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    {selectedThread.clientName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {selectedThread.clientName}
                    </p>
                    <p className="text-[10px] text-muted">slushie notification</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">select a thread</p>
              )}
            </div>

            {/* messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {selectedThread?.messages.map((msg) => (
                <ChatBubble key={msg.id} message={msg} />
              ))}
              {!selectedThread && (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-muted">
                    {threads.length > 0
                      ? "pick a thread from the left."
                      : "waiting for notifications..."}
                  </p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* bottom bar */}
            <div className="border-t border-gray-200 bg-gray-50 px-4 py-2.5">
              <p className="text-center text-[10px] text-muted">
                outbound only — these messages simulate sms to your client
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: verify dev chat compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 5: commit**

```bash
git add apps/web/src/app/api/dev/chat/messages apps/web/src/app/\(dashboard\)/dashboard/dev
git commit -m "feat: add dev chat page with phone-style UI and real-time SSE"
```

---

## Chunk 3: Prototype Preview Wrapper + Walkthrough Overlay

### Task 10: Build the prototype preview wrapper

**Files:**
- Create: `apps/web/src/app/preview/[nanoid]/page.tsx`
- Create: `apps/web/src/app/preview/[nanoid]/preview-client.tsx`

- [ ] **Step 1: create preview server page**

Create `apps/web/src/app/preview/[nanoid]/page.tsx`:

```tsx
import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PreviewClient } from "./preview-client";

export const metadata: Metadata = {
  title: "slushie — your prototype",
  description: "take a look at what we built for you.",
};

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ nanoid: string }>;
}) {
  const { nanoid } = await params;

  // find tracker by prototypeNanoid — security via unguessable url
  const tracker = await prisma.tracker.findUnique({
    where: { prototypeNanoid: nanoid },
    include: {
      pipelineRun: {
        include: {
          client: { select: { name: true } },
        },
      },
    },
  });

  if (!tracker) {
    notFound();
  }

  // expired links get a friendly message — 30 day expiry per spec
  if (tracker.expiresAt && tracker.expiresAt < new Date()) {
    return (
      <main className="flex min-h-screen items-center justify-center slushie-gradient">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-primary">slushie</h1>
          <p className="mt-4 text-foreground">this prototype link has expired.</p>
          <p className="mt-2 text-muted text-sm">
            reach out to your slushie contact for a fresh one.
          </p>
        </div>
      </main>
    );
  }

  // find the latest prototype for this pipeline run
  const pipelineRun = tracker.pipelineRun;

  // query through the chain: pipelineRun -> call -> analysis -> buildSpec -> prototype
  const prototype = await prisma.prototype.findFirst({
    where: {
      buildSpec: {
        analysis: {
          callId: pipelineRun.callId,
        },
      },
    },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      previewUrl: true,
      manifest: true,
    },
  });

  const clientName = pipelineRun.client.name;

  // extract walkthrough steps from prototype manifest
  interface WalkthroughStep {
    target_component: string;
    step: number;
    text: string;
  }

  let walkthroughSteps: WalkthroughStep[] = [];
  if (prototype?.manifest && typeof prototype.manifest === "object") {
    const manifest = prototype.manifest as { walkthrough?: WalkthroughStep[] };
    walkthroughSteps = manifest.walkthrough ?? [];
  }

  return (
    <PreviewClient
      nanoid={nanoid}
      clientName={clientName}
      prototypeUrl={prototype?.previewUrl ?? null}
      walkthroughSteps={walkthroughSteps}
    />
  );
}
```

- [ ] **Step 2: create preview client with branded frame and walkthrough overlay**

Create `apps/web/src/app/preview/[nanoid]/preview-client.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";

interface WalkthroughStep {
  target_component: string;
  step: number;
  text: string;
}

interface PreviewClientProps {
  nanoid: string;
  clientName: string;
  prototypeUrl: string | null;
  walkthroughSteps: WalkthroughStep[];
}

function WalkthroughOverlay({
  steps,
  currentIndex,
  onNext,
  onPrev,
  onClose,
}: {
  steps: WalkthroughStep[];
  currentIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const step = steps[currentIndex];
  if (!step) return null;

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === steps.length - 1;

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* semi-transparent backdrop */}
      <div className="pointer-events-auto absolute inset-0 bg-black/20" />

      {/* tooltip card — positioned center bottom */}
      <div className="pointer-events-auto absolute bottom-8 left-1/2 w-full max-w-md -translate-x-1/2 px-4">
        <div className="rounded-2xl bg-white p-5 shadow-2xl">
          {/* step counter */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {currentIndex + 1}
              </span>
              <span className="text-xs text-muted">
                step {currentIndex + 1} of {steps.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-muted hover:text-foreground transition-colors"
              aria-label="close walkthrough"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* highlighted section name */}
          <p className="mb-1 text-xs font-semibold text-secondary">
            {step.target_component}
          </p>

          {/* step description */}
          <p className="text-sm text-foreground leading-relaxed">{step.text}</p>

          {/* progress dots */}
          <div className="mt-4 flex items-center justify-center gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentIndex
                    ? "w-4 bg-primary"
                    : i < currentIndex
                    ? "w-1.5 bg-primary/40"
                    : "w-1.5 bg-gray-300"
                }`}
              />
            ))}
          </div>

          {/* navigation buttons */}
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={onPrev}
              disabled={isFirst}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                isFirst
                  ? "text-muted cursor-not-allowed"
                  : "text-foreground hover:bg-gray-100"
              }`}
            >
              back
            </button>
            <button
              onClick={isLast ? onClose : onNext}
              className="rounded-full bg-primary px-6 py-1.5 text-xs font-semibold text-white shadow-sm transition-transform hover:scale-105"
            >
              {isLast ? "got it" : "next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PreviewClient({
  nanoid,
  clientName,
  prototypeUrl,
  walkthroughSteps,
}: PreviewClientProps) {
  const [showWalkthrough, setShowWalkthrough] = useState(walkthroughSteps.length > 0);
  const [walkthroughIndex, setWalkthroughIndex] = useState(0);

  const handleNext = useCallback(() => {
    setWalkthroughIndex((prev) =>
      prev < walkthroughSteps.length - 1 ? prev + 1 : prev
    );
  }, [walkthroughSteps.length]);

  const handlePrev = useCallback(() => {
    setWalkthroughIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const handleClose = useCallback(() => {
    setShowWalkthrough(false);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      {/* slushie branding frame — top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-lg font-extrabold text-primary">slushie</span>
          <span className="text-xs text-muted">
            built for {clientName}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {walkthroughSteps.length > 0 && !showWalkthrough && (
            <button
              onClick={() => {
                setWalkthroughIndex(0);
                setShowWalkthrough(true);
              }}
              className="rounded-full border border-secondary px-3 py-1 text-xs font-semibold text-secondary transition-colors hover:bg-secondary hover:text-white"
            >
              replay walkthrough
            </button>
          )}
          <span className="text-[10px] text-muted">prototype preview</span>
        </div>
      </div>

      {/* prototype content area */}
      <div className="relative flex-1">
        {prototypeUrl ? (
          <iframe
            src={prototypeUrl}
            className="h-full w-full border-none"
            title={`${clientName} prototype`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex h-full items-center justify-center slushie-gradient">
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                your prototype is being prepared.
              </p>
              <p className="mt-2 text-sm text-muted">
                check back soon — we're putting the finishing touches on it.
              </p>
            </div>
          </div>
        )}

        {/* walkthrough overlay */}
        {showWalkthrough && walkthroughSteps.length > 0 && (
          <WalkthroughOverlay
            steps={walkthroughSteps}
            currentIndex={walkthroughIndex}
            onNext={handleNext}
            onPrev={handlePrev}
            onClose={handleClose}
          />
        )}
      </div>

      {/* slushie branding frame — bottom bar */}
      <div className="border-t border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted">
            this is a prototype. some features use simulated data.
          </p>
          <p className="text-[10px] text-muted">powered by slushie</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: verify preview page compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/preview
git commit -m "feat: add prototype preview wrapper with walkthrough overlay"
```

---

### Task 11: Create API route to fetch tracker data (for initial page load)

**Files:**
- Create: `apps/web/src/app/api/track/[slug]/route.ts`

- [ ] **Step 1: create tracker data API route**

Create `apps/web/src/app/api/track/[slug]/route.ts`:

```typescript
import { prisma } from "@slushie/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    include: {
      pipelineRun: {
        include: {
          client: { select: { name: true } },
        },
      },
    },
  });

  if (!tracker) {
    return new Response("not found", { status: 404 });
  }

  if (tracker.expiresAt && tracker.expiresAt < new Date()) {
    return Response.json({ expired: true }, { status: 410 });
  }

  return Response.json({
    slug: tracker.slug,
    currentStep: tracker.currentStep,
    steps: tracker.steps,
    clientName: tracker.pipelineRun.client.name,
    prototypeNanoid: tracker.prototypeNanoid,
    createdAt: tracker.createdAt.toISOString(),
  });
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/api/track
git commit -m "feat: add tracker data API route for initial page load"
```

---

### Task 12: Add delivery notification (triggered when team approves)

**Files:**
- Create: `apps/worker/src/workers/delivery.worker.ts`
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: create delivery worker that fires step 5 and sends prototype link**

Create `apps/worker/src/workers/delivery.worker.ts`:

```typescript
import { Worker, Job } from "bullmq";
import { prisma } from "@slushie/db";
import type { TeamApprovedEvent, ClientNotifiedEvent, TrackerUpdateEvent } from "@slushie/events";
import { createEventQueue } from "@slushie/events";
import { logger } from "../logger";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const trackerQueue = createEventQueue("tracker");
const notificationQueue = createEventQueue("notification");

export function createDeliveryWorker() {
  const worker = new Worker<TeamApprovedEvent>(
    "delivery",
    async (job: Job<TeamApprovedEvent>) => {
      const event = job.data;
      const { pipelineRunId } = event;

      const workerLogger = logger.child({ pipelineRunId });
      workerLogger.info("processing delivery after team approval");

      // get tracker for prototype nanoid
      const tracker = await prisma.tracker.findUnique({
        where: { pipelineRunId },
      });

      if (!tracker) {
        workerLogger.error("no tracker found");
        throw new Error(`no tracker found for pipeline run ${pipelineRunId}`);
      }

      // get client name
      const pipelineRun = await prisma.pipelineRun.findUnique({
        where: { id: pipelineRunId },
        include: { client: { select: { name: true } } },
      });

      const clientName = pipelineRun?.client.name ?? "client";
      const prototypeUrl = tracker.prototypeNanoid
        ? `app.slushie.agency/preview/${tracker.prototypeNanoid}`
        : null;

      // update tracker to step 5 — "ready to serve"
      const trackerEvent: TrackerUpdateEvent = {
        type: "tracker.update",
        pipelineRunId,
        timestamp: Date.now(),
        data: {
          step: 5,
          label: "ready to serve",
          subtitle: "your tool is live. take a sip.",
        },
      };
      await trackerQueue.add("tracker.update", trackerEvent);

      // send delivery notification to dev chat — spec copy
      const notificationEvent: ClientNotifiedEvent = {
        type: "client.notified",
        pipelineRunId,
        timestamp: Date.now(),
        data: {
          clientName,
          trackerUrl: `slushie.agency/track/${tracker.slug}`,
          prototypeUrl: prototypeUrl ?? undefined,
          message: prototypeUrl
            ? `your tool is ready! take a look: ${prototypeUrl}`
            : "your tool is ready! your slushie contact will share the link with you.",
        },
      };
      await notificationQueue.add("client.notified", notificationEvent);

      // mark pipeline as completed
      await prisma.pipelineRun.update({
        where: { id: pipelineRunId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      workerLogger.info("delivery complete — tracker updated and client notified");
    },
    { connection: getRedisConnection() }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "delivery worker job failed");
  });

  logger.info("delivery worker registered");
  return worker;
}
```

- [ ] **Step 2: register delivery worker in entry point**

Add the following import to `apps/worker/src/index.ts`:

```typescript
import { createDeliveryWorker } from "./workers/delivery.worker";
```

Add to the workers array after `trackerInitWorker`:

```typescript
  const deliveryWorker = createDeliveryWorker();
```

Update the workers array to include it:

```typescript
  const workers = [trackerWorker, notificationWorker, trackerInitWorker, deliveryWorker];
```

- [ ] **Step 3: verify worker compiles**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: commit**

```bash
git add apps/worker/src/workers/delivery.worker.ts apps/worker/src/index.ts
git commit -m "feat: add delivery worker for prototype link notification on team approval"
```

---

### Task 13: Final integration check

- [ ] **Step 1: verify all web app routes compile**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 2: verify all worker files compile**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: verify turbo build**

```bash
npx turbo build
```

Expected: all packages build without errors.

- [ ] **Step 4: verify tracker page renders**

```bash
cd apps/web && npm run dev
```

Open http://localhost:3000/track/test-slug — should return 404 (no tracker in db). Confirms routing works.

- [ ] **Step 5: verify dev chat page renders**

Open http://localhost:3000/dashboard/dev/chat — should redirect to auth (no session). Confirms protected route works.

- [ ] **Step 6: verify preview page renders**

Open http://localhost:3000/preview/test-nanoid — should return 404 (no tracker in db). Confirms routing works.

- [ ] **Step 7: commit any fixes**

```bash
git add -A
git commit -m "fix: resolve integration issues from plan 4"
```

---

## Summary

**What Plan 4 produces:**
- public progress tracker at `/track/[slug]` with 5 domino's-style steps, real-time SSE updates, animated step indicators (green check / red pulse / gray dot), cold/blending copy, and prototype link on completion
- tracker worker that listens for `tracker.update` events, updates the database, and publishes to SSE
- tracker creation on `call.ended` — generates nanoid slugs (21 chars), initializes steps, sends first notification
- dev chat at `/dashboard/dev/chat` with phone-style UI, per-pipeline-run chat threads labeled with client name, real-time message delivery via SSE, copyable tracker/prototype links
- dev chat notification worker that listens for `client.notified` events, stores in DB, publishes to SSE
- prototype preview wrapper at `/preview/[nanoid]` with slushie branding frame, iframe for prototype, tooltip-style walkthrough overlay with step counter/next/back/progress dots
- delivery worker that fires on `team.approved` — updates tracker to step 5, sends prototype link notification, marks pipeline complete
- `NotificationMessage` database model for chat message persistence
- public SSE endpoint for tracker (no auth, security via unguessable slug)
- authenticated SSE endpoint for dev chat
- all pages follow brand rules: lowercase, inter font, cherry red, berry blue, gradient background, no emojis

**What comes next:**
- Plan 5: internal review + postmortem
