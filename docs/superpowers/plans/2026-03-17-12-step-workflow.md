# 12-Step Workflow Restructure

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the dashboard from 8 steps to 12 steps, adding demo scheduling, a demo call with screen sharing, a demo build, an internal review/polish loop, and removing the client tracker in favor of email-based client interactions.

**Architecture:** Steps 1-4 (intake build → schedule discovery → discovery meeting → discovery build) stay the same. Steps 5-12 are new: schedule demo, demo call (screen share + transcript → analyst → builder), demo build, internal review/polish (employee ↔ analyst ↔ builder loop), client approval (email link), plug-in (email), payment (email), satisfaction survey (email). The client tracker (`/track/[slug]`) is removed entirely — all client touchpoints use email links to standalone pages.

**Tech Stack:** Next.js App Router, Prisma (PostgreSQL), BullMQ event queue, Resend email, Redis pub/sub SSE, React

---

## New Step Flow

| Step | Label | What Happens | Client Interaction |
|------|-------|-------------|-------------------|
| 1 | intake build | Form submitted → analyst + builder run automatically | Email: booking confirmed |
| 2 | schedule discovery | Employee sends scheduling email | Email: schedule discovery |
| 3 | discovery meeting | Live call with coaching bot | — |
| 4 | discovery build | Analyst re-processes → builder creates v2 | — |
| 5 | schedule demo | Employee sends demo scheduling email | Email: schedule demo |
| 6 | demo call | Screen share of build + transcript captured | — |
| 7 | demo build | Analyst summarizes transcript → builder creates v3 | — |
| 8 | internal review/polish | Employee messages analyst → builder updates | — |
| 9 | client approval | Send email with link to approve build | Email: approve link |
| 10 | plug-in | Send email asking for credentials | Email: credentials form |
| 11 | payment | Send email with payment link | Email: payment link |
| 12 | satisfaction survey | Send email with survey link | Email: survey link |

## Chunk 1: Schema & Constants

### Task 1: Update Prisma Schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

The Tracker model needs new fields for demo scheduling (same pattern as discovery). We also need fields for the internal review loop.

- [ ] **Step 1: Add demo scheduling fields to Tracker model**

Add after `discoveryEmailSentAt`:
```prisma
demoEmailStatus       String?
demoEmailSentAt       DateTime?
demoMeetingTime       DateTime?
```

- [ ] **Step 2: Add internal review fields to Tracker model**

Add after demo fields:
```prisma
reviewMessages        Json?       // Array<{ from: "employee" | "system", text: string, at: string }>
reviewStatus          String?     // "reviewing" | "building" | "ready"
```

- [ ] **Step 3: Remove tracker auth fields (no more client tracker)**

Remove these fields from Tracker:
```
passwordHash    String?
mustChangePassword Boolean  @default(true)
```

And remove `prototypeNanoid String? @unique` (client preview will use a different mechanism).

- [ ] **Step 4: Run prisma generate**

```bash
DATABASE_URL="postgresql://ryanhaugland@localhost:5432/slushie" npx prisma db push --schema=packages/db/prisma/schema.prisma
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "schema: add demo scheduling and review fields, remove tracker auth"
```

### Task 2: Update BOOKING_STEPS Constants

**Files:**
- Modify: `apps/web/src/app/api/booking/route.ts`
- Modify: `apps/web/src/app/api/booking/demo/route.ts`
- Modify: `apps/web/src/app/api/booking/seed/route.ts`
- Modify: `apps/web/src/app/api/booking/next/route.ts`

- [ ] **Step 1: Replace BOOKING_STEPS in all 4 files**

New constant (identical in all files):
```typescript
const BOOKING_STEPS = [
  { step: 1, label: "intake build", subtitle: "we're already building your first prototype." },
  { step: 2, label: "schedule discovery", subtitle: "your rep will reach out to schedule a discovery call." },
  { step: 3, label: "discovery meeting", subtitle: "let's walk through your workflow together." },
  { step: 4, label: "discovery build", subtitle: "building an improved version based on our conversation." },
  { step: 5, label: "schedule demo", subtitle: "your rep will reach out to schedule a demo of what we've built." },
  { step: 6, label: "demo call", subtitle: "let's walk through the build together." },
  { step: 7, label: "demo build", subtitle: "incorporating your feedback from the demo." },
  { step: 8, label: "internal review", subtitle: "our team is reviewing and polishing." },
  { step: 9, label: "client approval", subtitle: "take a look and let us know what you think." },
  { step: 10, label: "plug-in", subtitle: "connecting to your tools. almost there." },
  { step: 11, label: "payment", subtitle: "invoice sent. simple and transparent." },
  { step: 12, label: "satisfaction survey", subtitle: "how'd we do? we want to keep getting better." },
];
```

- [ ] **Step 2: Update dashboard page step labels**

File: `apps/web/src/app/(dashboard)/dashboard/page.tsx`

Replace `BOOKING_STEP_LABELS` (lines 7-17):
```typescript
const BOOKING_STEP_LABELS = [
  "intake build",
  "schedule discovery",
  "discovery meeting",
  "discovery build",
  "schedule demo",
  "demo call",
  "demo build",
  "internal review",
  "client approval",
  "plug-in",
  "payment",
  "satisfaction survey",
  "postmortem",
];
```

Update the postmortem column filter from `step === 9` to `step === 13`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/booking/route.ts apps/web/src/app/api/booking/demo/route.ts apps/web/src/app/api/booking/seed/route.ts apps/web/src/app/api/booking/next/route.ts apps/web/src/app/(dashboard)/dashboard/page.tsx
git commit -m "update BOOKING_STEPS to 12-step workflow across all routes and dashboard"
```

### Task 3: Update Pipeline Orchestrator Step Numbers

**Files:**
- Modify: `apps/worker/src/agents/pipeline.ts`

- [ ] **Step 1: Update prototype.ready v1 handler**

Currently advances tracker to step 2. This stays the same (step 1 → step 2 "schedule discovery"). No change needed here.

- [ ] **Step 2: Update resolution.complete handler**

Currently advances tracker to step 5 (client build approval) with steps `i <= 3` done and `i === 4` active.

Change to advance to step 5 (schedule demo): steps `i <= 3` done, `i === 4` active.

Wait — step 5 is now "schedule demo" and the discovery build finishing should advance to step 5. Currently `resolution.complete` sets steps `i <= 3` as done and `i === 4` as active. With the new numbering, after discovery build (step 4) completes, we want step 5 (schedule demo) to be active. So the logic should be `i <= 3` done, `i === 4` active. That's the same indices! But the tracker now has 12 steps instead of 8, so we need to verify the index math.

Actually the resolution.complete handler needs to mark steps 1-4 as done and step 5 as active:
```typescript
const updatedSteps = steps.map((s: StepShape, i: number) => ({
  ...s,
  status: i <= 3 ? "done" : i === 4 ? "active" : s.status,
  completedAt: i <= 3 && !s.completedAt ? new Date().toISOString() : s.completedAt,
}));
// currentStep: 5
```

This is the same as current — just verify the `currentStep` value is set to 5.

- [ ] **Step 3: Add demo.call.complete event handler**

After the demo call ends, we need a new event `demo.call.complete` that:
1. Runs the analyst on the demo transcript (same as gap meeting flow)
2. Triggers the builder to create v3 based on client comments
3. Advances tracker to step 7 (demo build active)

```typescript
case "demo.call.complete": {
  const { callId, clientId, transcript } = event.data;

  // Write demo transcript to workspace
  // Queue analyst with demo context
  // Queue builder for v3
  // Advance tracker: steps 1-6 done, step 7 active, currentStep: 7
}
```

- [ ] **Step 4: Add demo.build.ready event handler**

When the demo build (v3) completes:
1. Advance tracker to step 8 (internal review active)

```typescript
case "demo.build.ready": {
  // Advance tracker: steps 1-7 done, step 8 active, currentStep: 8
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/agents/pipeline.ts
git commit -m "update pipeline orchestrator for 12-step workflow with demo and review events"
```

### Task 4: Update Advance Route

**Files:**
- Modify: `apps/web/src/app/api/booking/[id]/advance/route.ts`

- [ ] **Step 1: Update email dispatch switch**

Update the email switch for the new step numbers. The advance route sends an email when moving to certain steps:

```typescript
switch (nextStep) {
  case 9:
    // client approval — send email with approval link
    sendClientApprovalLink({ ... });
    break;
  case 10:
    // plug-in — send email asking for credentials
    sendCredentialsNeeded({ ... });
    break;
  case 11:
    // payment — send email with payment link
    sendPaymentDue({ ... });
    break;
  case 12:
    // satisfaction survey
    sendSurveyOpen({ ... });
    break;
}
```

- [ ] **Step 2: Update completion logic**

Change the "final step" check from step 8 to step 12. When step 12 is reached, mark booking as COMPLETED.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/booking/[id]/advance/route.ts
git commit -m "update advance route email dispatch for 12-step workflow"
```

## Chunk 2: New API Routes & Email Templates

### Task 5: Create Schedule Demo API Route

**Files:**
- Create: `apps/web/src/app/api/booking/[id]/schedule-demo/route.ts`

This mirrors the schedule-discovery route but for the demo call.

- [ ] **Step 1: Create the route**

Three actions via POST body `{ action: "send_email" | "mark_responded" | "schedule_demo", meetingTime? }`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { sendDemoScheduling } from "@/lib/email";
import { createCalendarEvent } from "@/lib/calendar";
import { redis } from "@/lib/redis";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action, meetingTime, emailBody } = body;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { tracker: true },
  });

  if (!booking?.tracker) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  const tracker = booking.tracker;

  if (action === "send_email") {
    // Send demo scheduling email
    await sendDemoScheduling({
      to: booking.email,
      name: booking.name,
      businessName: booking.businessName,
      customBody: emailBody,
    });

    await prisma.tracker.update({
      where: { id: tracker.id },
      data: {
        demoEmailStatus: "sent",
        demoEmailSentAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, status: "sent" });
  }

  if (action === "mark_responded") {
    await prisma.tracker.update({
      where: { id: tracker.id },
      data: { demoEmailStatus: "responded" },
    });
    return NextResponse.json({ ok: true, status: "responded" });
  }

  if (action === "schedule_demo") {
    if (!meetingTime) {
      return NextResponse.json({ error: "meetingTime required" }, { status: 400 });
    }

    const mt = new Date(meetingTime);

    // Create calendar event
    const calendarEvent = await createCalendarEvent({
      summary: `slushie demo — ${booking.businessName}`,
      description: `Demo call for ${booking.businessName} with ${booking.name}`,
      startTime: mt,
      attendeeEmail: booking.email,
    });

    // Update booking with demo meeting time
    await prisma.booking.update({
      where: { id },
      data: { demoMeetingTime: mt, demoCalendarEventId: calendarEvent?.id },
    });

    // Advance tracker to step 6 (demo call)
    const steps = tracker.steps as Array<{
      step: number; label: string; subtitle: string; status: string; completedAt: string | null;
    }>;
    const updatedSteps = steps.map((s, i) => ({
      ...s,
      status: i <= 4 ? "done" : i === 5 ? "active" : s.status,
      completedAt: i <= 4 && !s.completedAt ? new Date().toISOString() : s.completedAt,
    }));

    await prisma.tracker.update({
      where: { id: tracker.id },
      data: {
        currentStep: 6,
        steps: updatedSteps,
        demoEmailStatus: "scheduled",
        demoMeetingTime: mt,
      },
    });

    // Publish SSE update
    const pub = redis.duplicate();
    await pub.connect();
    await pub.publish(`tracker:${tracker.slug}`, JSON.stringify({
      type: "tracker.update",
      steps: updatedSteps,
      currentStep: 6,
      label: "demo call",
      subtitle: "let's walk through the build together.",
    }));
    await pub.quit();

    return NextResponse.json({ ok: true, status: "scheduled" });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
```

Note: We need to add `demoMeetingTime DateTime?` and `demoCalendarEventId String?` to the Booking model in the schema. Add this to Task 1.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/booking/[id]/schedule-demo/route.ts
git commit -m "add schedule-demo API route with email tracking"
```

### Task 6: Create Internal Review API Route

**Files:**
- Create: `apps/web/src/app/api/booking/[id]/review/route.ts` (rename existing or create new)

This handles the employee ↔ analyst ↔ builder messaging loop at step 8.

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { createEventQueue, createEvent } from "@slushie/events";

const pipelineQueue = createEventQueue("pipeline");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { message } = await request.json();

  if (!message?.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { tracker: { include: { pipelineRun: true } } },
  });

  if (!booking?.tracker?.pipelineRun) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  const tracker = booking.tracker;
  const existingMessages = (tracker.reviewMessages as Array<{ from: string; text: string; at: string }>) ?? [];

  // Append the employee message
  const updatedMessages = [
    ...existingMessages,
    { from: "employee", text: message.trim(), at: new Date().toISOString() },
  ];

  // Set review status to "building" — analyst + builder will process
  await prisma.tracker.update({
    where: { id: tracker.id },
    data: {
      reviewMessages: updatedMessages,
      reviewStatus: "building",
    },
  });

  // Dispatch review.requested event to pipeline
  await pipelineQueue.add(
    "review.requested",
    createEvent("review.requested", tracker.pipelineRun.id, {
      message: message.trim(),
      clientId: booking.clientId,
    })
  );

  return NextResponse.json({ ok: true, messages: updatedMessages });
}

// GET: fetch current review messages
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { tracker: { select: { reviewMessages: true, reviewStatus: true } } },
  });

  if (!booking?.tracker) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    messages: booking.tracker.reviewMessages ?? [],
    status: booking.tracker.reviewStatus,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/booking/[id]/review/route.ts
git commit -m "add internal review API route for employee-analyst-builder loop"
```

### Task 7: Create Client Approval Page

**Files:**
- Create: `apps/web/src/app/approve/[bookingId]/page.tsx`
- Create: `apps/web/src/app/approve/[bookingId]/approve-client.tsx`

This is a standalone page (no auth required, accessed via email link) where the client sees the build and clicks "approve."

- [ ] **Step 1: Create server component**

`apps/web/src/app/approve/[bookingId]/page.tsx`:
```typescript
import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import { ApproveClient } from "./approve-client";

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tracker: {
        include: {
          pipelineRun: {
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
      },
    },
  });

  if (!booking?.tracker) notFound();

  const proto = booking.tracker.pipelineRun?.call?.analysis?.buildSpecs?.[0]?.prototypes?.[0];

  return (
    <ApproveClient
      bookingId={booking.id}
      businessName={booking.businessName}
      name={booking.name}
      previewUrl={proto?.previewUrl ?? null}
      prototypeId={proto?.id ?? null}
      currentStep={booking.tracker.currentStep}
    />
  );
}
```

- [ ] **Step 2: Create client component**

`apps/web/src/app/approve/[bookingId]/approve-client.tsx`:
A page that shows the prototype in an iframe and has an "approve" bar at the bottom.

```typescript
"use client";

import { useState } from "react";

interface ApproveClientProps {
  bookingId: string;
  businessName: string;
  name: string;
  previewUrl: string | null;
  prototypeId: string | null;
  currentStep: number;
}

export function ApproveClient({ bookingId, businessName, name, previewUrl, prototypeId, currentStep }: ApproveClientProps) {
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      const res = await fetch(`/api/booking/${bookingId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance" }),
      });
      if (res.ok) setApproved(true);
    } finally {
      setLoading(false);
    }
  }

  if (currentStep > 9) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">slushie</h1>
          <p className="mt-4 text-sm text-foreground">this build has already been approved. thanks!</p>
        </div>
      </main>
    );
  }

  if (approved) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">slushie</h1>
          <div className="mt-6 rounded-2xl bg-surface border border-border p-8">
            <div className="text-4xl mb-3">&#10003;</div>
            <p className="text-lg font-bold text-foreground">build approved!</p>
            <p className="mt-2 text-sm text-muted">thanks {name}. we'll be in touch about next steps for {businessName}.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* header */}
      <div className="px-4 py-3 border-b border-border bg-surface flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">slushie</h1>
          <p className="text-xs text-muted">{businessName} — build review</p>
        </div>
      </div>

      {/* prototype iframe */}
      <div className="flex-1 relative">
        {previewUrl ? (
          <iframe
            src={prototypeId ? `/api/prototype/${prototypeId}/html` : previewUrl}
            className="w-full h-full border-0"
            title="Build preview"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            build preview is loading...
          </div>
        )}
      </div>

      {/* approval bar */}
      <div className="px-4 py-4 border-t border-border bg-surface">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
          <p className="text-sm text-muted">ready to approve this build?</p>
          <button
            onClick={handleApprove}
            disabled={loading}
            className="rounded-lg bg-gradient-to-r from-primary to-secondary px-8 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-50"
          >
            {loading ? "approving..." : "approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/approve/
git commit -m "add client approval page with prototype preview and approve bar"
```

### Task 8: Create Credentials & Payment Standalone Pages

**Files:**
- Create: `apps/web/src/app/credentials/[bookingId]/page.tsx`
- Create: `apps/web/src/app/credentials/[bookingId]/credentials-client.tsx`
- Create: `apps/web/src/app/survey/[bookingId]/page.tsx`
- Create: `apps/web/src/app/survey/[bookingId]/survey-client.tsx`

These replace the tracker's inline credentials form, payment, and survey — now standalone email-linked pages.

- [ ] **Step 1: Create credentials page**

Server component loads booking + tech stack. Client component shows a form asking for API keys/credentials for each detected service. On submit, POSTs to `/api/booking/[id]/advance` with credentials data.

- [ ] **Step 2: Create survey page**

Server component loads booking. Client component shows NPS score selector (0-10) + feedback textarea. On submit, POSTs to existing survey endpoint, then advances.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/credentials/ apps/web/src/app/survey/
git commit -m "add standalone credentials and survey pages for email-linked flow"
```

### Task 9: Add New Email Templates

**Files:**
- Modify: `apps/web/src/lib/email.ts`

- [ ] **Step 1: Add sendDemoScheduling email**

Same pattern as `sendDiscoveryScheduling` but for the demo call. Includes a link to a preview of what was built.

```typescript
export async function sendDemoScheduling({
  to, name, businessName, customBody,
}: {
  to: string; name: string; businessName: string; customBody?: string;
}) {
  const defaultBody = `hi ${name},\n\nwe've finished building the improved version for ${businessName} based on our discovery call. we'd love to walk you through a demo — are any of these times good for you?\n\nlet us know and we'll get it on the calendar.`;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `let's schedule your demo — ${businessName}`,
    html: layout(
      `<h2>your build is ready for a demo</h2>
       <p style="...">${(customBody || defaultBody).replace(/\n/g, "<br>")}</p>
       <p style="...">just reply to this email with times that work for you.</p>`
    ),
  });
}
```

- [ ] **Step 2: Add sendClientApprovalLink email**

```typescript
export async function sendClientApprovalLink({
  to, name, businessName, approveUrl,
}: {
  to: string; name: string; businessName: string; approveUrl: string;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `your build is ready for review — ${businessName}`,
    html: layout(
      `<h2>your build is ready</h2>
       <p>hi ${name}, we've finished building and polishing your tool for ${businessName}. click below to review it and let us know if it's good to go.</p>
       <a href="${approveUrl}" style="...button styles...">review & approve</a>`
    ),
  });
}
```

- [ ] **Step 3: Add sendCredentialsRequest email**

```typescript
export async function sendCredentialsRequest({
  to, name, businessName, credentialsUrl, services,
}: {
  to: string; name: string; businessName: string; credentialsUrl: string; services: string[];
}) {
  const serviceList = services.map(s => `<li>${s}</li>`).join("");
  await resend.emails.send({
    from: FROM,
    to,
    subject: `credentials needed — ${businessName}`,
    html: layout(
      `<h2>almost there — we need your credentials</h2>
       <p>hi ${name}, to connect your tool to the real services, we need API keys or login credentials for:</p>
       <ul>${serviceList}</ul>
       <a href="${credentialsUrl}" style="...button styles...">submit credentials</a>`
    ),
  });
}
```

- [ ] **Step 4: Add sendSurveyLink email**

```typescript
export async function sendSurveyLink({
  to, name, businessName, surveyUrl,
}: {
  to: string; name: string; businessName: string; surveyUrl: string;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `how'd we do? — ${businessName}`,
    html: layout(
      `<h2>your feedback matters</h2>
       <p>hi ${name}, thanks for choosing slushie for ${businessName}. we'd love to hear how the experience was.</p>
       <a href="${surveyUrl}" style="...button styles...">take the survey</a>`
    ),
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/email.ts
git commit -m "add email templates for demo scheduling, approval link, credentials request, and survey"
```

## Chunk 3: BookingCard UI Updates

### Task 10: Update BookingCard for Steps 5-12

**Files:**
- Modify: `apps/web/src/app/(dashboard)/dashboard/booking-card.tsx`

This is the largest UI change. The BookingCard needs new props and UI for steps 5-12.

- [ ] **Step 1: Add new props**

```typescript
interface BookingCardProps {
  // ... existing props ...
  demoEmailStatus: string | null;
  demoEmailSentAt: string | null;
  demoMeetingTime: string | null;
  reviewMessages: Array<{ from: string; text: string; at: string }> | null;
  reviewStatus: string | null;
}
```

- [ ] **Step 2: Step 5 — Schedule Demo UI**

Same pattern as step 2 (schedule discovery) but for the demo:
- No status: editable email textarea + "send" button → POST `/api/booking/[id]/schedule-demo` action=send_email
- "sent": Sent badge + timestamp + "mark responded" button
- "responded": Datetime picker + "schedule demo" button
- "scheduled": Green badge with demo meeting time

- [ ] **Step 3: Step 6 — Demo Call UI**

- Show "join demo call" button linking to the demo call page
- Show the demo meeting time
- When call is in progress, show live indicator

- [ ] **Step 4: Step 7 — Demo Build UI**

Same progress pattern as step 4 (discovery build): analyzing → building → ready.

- [ ] **Step 5: Step 8 — Internal Review/Polish UI**

- Show a message thread (reviewMessages) in a chat-like display
- Employee can type a message in a textarea and send it
- When reviewStatus is "building", show a building indicator
- When reviewStatus is "ready", show the updated preview link + "advance" button to move to step 9

- [ ] **Step 6: Steps 9-12 — Renumber existing steps**

- Step 9 (client approval): Show "send approval link" button → sends email. Badge shows "waiting for approval" or "approved"
- Step 10 (plug-in): Same as old step 6 but triggers email instead of tracker
- Step 11 (payment): Same as old step 7 but triggers email
- Step 12 (survey): Same as old step 8 but triggers email

- [ ] **Step 7: Update step counter display**

Change `step X of 8` to `step X of 12`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/(dashboard)/dashboard/booking-card.tsx
git commit -m "update BookingCard UI for 12-step workflow with demo, review, and email-linked steps"
```

### Task 11: Update Dashboard Page Query

**Files:**
- Modify: `apps/web/src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Add new tracker fields to query**

Add to the tracker select:
```typescript
demoEmailStatus: true,
demoEmailSentAt: true,
demoMeetingTime: true,
reviewMessages: true,
reviewStatus: true,
```

- [ ] **Step 2: Pass new props to BookingCard**

Add props:
```typescript
demoEmailStatus={booking.tracker?.demoEmailStatus ?? null}
demoEmailSentAt={booking.tracker?.demoEmailSentAt?.toISOString() ?? null}
demoMeetingTime={booking.tracker?.demoMeetingTime?.toISOString() ?? null}
reviewMessages={(booking.tracker?.reviewMessages as Array<{ from: string; text: string; at: string }>) ?? null}
reviewStatus={booking.tracker?.reviewStatus ?? null}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(dashboard)/dashboard/page.tsx
git commit -m "add demo and review fields to dashboard query and BookingCard props"
```

## Chunk 4: Demo Call & Pipeline Integration

### Task 12: Create Demo Call Page

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/calls/demo-live/[pipelineRunId]/page.tsx`

The demo call page shows a screen share of the build (iframe) alongside a live transcript/chat. When the call ends, the transcript is sent to the analyst.

- [ ] **Step 1: Create the demo call page**

This page has two panels:
- Left: iframe showing the prototype (screen share)
- Right: transcript/chat area where the employee types what the client says

On "end call", POST the transcript to a new endpoint that dispatches `demo.call.complete`.

- [ ] **Step 2: Create the end-demo-call API**

File: `apps/web/src/app/api/calls/demo/end/route.ts`

```typescript
// Takes pipelineRunId and transcript
// Creates/updates call record with demo transcript
// Dispatches demo.call.complete event to pipeline queue
// Advances tracker to step 7 (demo build)
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(dashboard)/dashboard/calls/demo-live/ apps/web/src/app/api/calls/demo/end/
git commit -m "add demo call page with screen share and transcript capture"
```

### Task 13: Handle review.requested in Pipeline

**Files:**
- Modify: `apps/worker/src/agents/pipeline.ts`

- [ ] **Step 1: Add review.requested event handler**

When an employee sends a review message:
1. Run the analyst with the review message as context (e.g., "the employee says: {message}")
2. The analyst generates updated specs
3. The builder creates an updated build
4. Update tracker `reviewStatus: "ready"` and append a system message

- [ ] **Step 2: Commit**

```bash
git add apps/worker/src/agents/pipeline.ts
git commit -m "add review.requested pipeline handler for internal review loop"
```

## Chunk 5: Remove Client Tracker

### Task 14: Remove Client Tracker Pages & Routes

**Files:**
- Remove: `apps/web/src/app/track/[slug]/page.tsx`
- Remove: `apps/web/src/app/track/[slug]/tracker-client.tsx`
- Remove: `apps/web/src/app/track/[slug]/tracker-login.tsx`
- Remove: `apps/web/src/app/api/track/[slug]/password/route.ts`
- Remove: `apps/web/src/app/api/track/[slug]/survey/route.ts`
- Remove: `apps/web/src/app/api/track/[slug]/events/route.ts` (SSE endpoint)
- Remove: `apps/web/src/app/api/track/[slug]/demo-pay/route.ts`
- Remove: `apps/web/src/lib/tracker-auth.ts`

- [ ] **Step 1: Delete tracker page files**

```bash
rm -rf apps/web/src/app/track/
rm -rf apps/web/src/app/api/track/
rm -f apps/web/src/lib/tracker-auth.ts
```

- [ ] **Step 2: Remove tracker-auth imports**

Search for and remove any remaining imports of `tracker-auth` or references to `/track/[slug]` in:
- `apps/web/src/app/api/booking/route.ts` (remove sendBookingConfirmed tracker credentials)
- `apps/web/src/app/api/booking/demo/route.ts` (remove tempPassword/passwordHash)
- `apps/web/src/app/api/booking/next/route.ts` (remove tempPassword/passwordHash)
- `apps/web/src/lib/email.ts` (remove tracker login credentials from booking confirmation email)

- [ ] **Step 3: Update booking confirmation email**

Remove tracker slug/password from the confirmation email. Instead just confirm the booking and say "we'll be in touch."

- [ ] **Step 4: Remove tracker slug from booking API responses**

The booking routes currently return `trackingSlug`. These can be simplified since the client no longer navigates to a tracker.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "remove client tracker pages and auth in favor of email-linked flow"
```

### Task 15: Update Remaining References

**Files:**
- Modify: `apps/web/src/app/(dashboard)/dashboard/booking-card.tsx` — remove any "view tracker" links
- Modify: `apps/web/src/app/booking-form.tsx` — remove tracker link from success message
- Modify: `apps/web/src/app/call/[bookingId]/page.tsx` — remove tracker links
- Modify: `apps/web/src/app/book/next/[bookingId]/next-workflow-form.tsx` — remove tracker redirect

- [ ] **Step 1: Search and update all `/track/` references**

```bash
grep -r "/track/" apps/web/src/ --include="*.tsx" --include="*.ts" -l
```

Update each file to remove tracker links. The booking form success should just show a confirmation. The next-workflow form should redirect to a simple confirmation page.

- [ ] **Step 2: Update Booking schema — remove tracker password fields reference from seed/demo**

Remove `passwordHash` and `mustChangePassword` from tracker creation in:
- `apps/web/src/app/api/booking/route.ts`
- `apps/web/src/app/api/booking/demo/route.ts`
- `apps/web/src/app/api/booking/next/route.ts`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "remove all tracker references from booking flows and UI"
```

### Task 16: Run Schema Migration & Type Check

- [ ] **Step 1: Push schema changes**

```bash
DATABASE_URL="postgresql://ryanhaugland@localhost:5432/slushie" npx prisma db push --schema=packages/db/prisma/schema.prisma
```

- [ ] **Step 2: Run TypeScript type check**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

Fix any type errors.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix type errors from 12-step workflow migration"
```

## Chunk 6: Verification

### Task 17: End-to-End Verification

- [ ] **Step 1: Create a demo booking and verify steps 1-4 work**
- [ ] **Step 2: Verify step 5 schedule demo email flow (send → responded → scheduled)**
- [ ] **Step 3: Verify step 6 demo call page loads with prototype iframe**
- [ ] **Step 4: Verify step 7 demo build triggers after call ends**
- [ ] **Step 5: Verify step 8 internal review messaging loop**
- [ ] **Step 6: Verify step 9 client approval email and standalone page**
- [ ] **Step 7: Verify steps 10-12 email-linked flows**
- [ ] **Step 8: Verify client tracker routes are fully removed (404)**

## Schema Changes Summary

### Booking model additions:
```prisma
demoMeetingTime     DateTime?
demoCalendarEventId String?
```

### Tracker model additions:
```prisma
demoEmailStatus       String?
demoEmailSentAt       DateTime?
demoMeetingTime       DateTime?
reviewMessages        Json?
reviewStatus          String?
```

### Tracker model removals:
```
passwordHash          String?
mustChangePassword    Boolean  @default(true)
prototypeNanoid       String?  @unique
```
