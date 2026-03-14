# Landing Page + Booking System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sign-in gate at `/` with a public landing page that sells slushie's workflow automation, includes a booking form with Google Calendar integration, and creates a post-booking tracking portal with 8 steps.

**Architecture:** New public landing page (server + client components) at `/`. Booking form POSTs to `/api/booking` which creates Client, Booking, and Tracker records. Google Calendar API provides slot availability via `/api/booking/slots`. Existing tracker infrastructure (SSE, Redis pub/sub) reused for booking trackers with null-safety updates. Admin dashboard gets a new `/dashboard/bookings` page.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6 (PostgreSQL), Google Calendar API (googleapis), ioredis, Tailwind CSS 4, Server-Sent Events

**Spec:** `docs/superpowers/specs/2026-03-14-landing-page-design.md`

---

## Chunk 1: Data Model + Schema

### Task 1: Prisma Schema — Add Booking model, enums, and update Tracker/Client relations

**Files:**
- Modify: `packages/db/prisma/schema.prisma:10-27` (Client model — add `bookings` relation)
- Modify: `packages/db/prisma/schema.prisma:134-146` (Tracker model — make `pipelineRunId` optional, add `bookingId`)
- Add new models/enums after line 39 (after `ClientStage` enum)

- [ ] **Step 1: Add BookingPlan and BookingStatus enums**

Add after the `ClientStage` enum (line 39) in `packages/db/prisma/schema.prisma`:

```prisma
enum BookingPlan {
  SINGLE_SCOOP
  DOUBLE_BLEND
  TRIPLE_FREEZE
}

enum BookingStatus {
  CONFIRMED
  COMPLETED
  CANCELLED
}
```

- [ ] **Step 2: Add Booking model**

Add after the new enums:

```prisma
model Booking {
  id            String        @id @default(cuid())
  name          String
  email         String
  businessName  String
  plan          BookingPlan
  description   String        @db.Text
  meetingTime   DateTime
  status          BookingStatus @default(CONFIRMED)
  calendarEventId String?
  clientId        String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  client        Client?       @relation(fields: [clientId], references: [id])
  tracker       Tracker?
}
```

- [ ] **Step 3: Add `bookings` relation to Client model**

In the `Client` model (line 10-27), add after the `codebases` field (line 26):

```prisma
  bookings      Booking[]
```

- [ ] **Step 4: Update Tracker model for standalone booking support**

Change the `Tracker` model (lines 134-146) to:

```prisma
model Tracker {
  id              String       @id @default(cuid())
  pipelineRunId   String?      @unique
  bookingId       String?      @unique
  slug            String       @unique
  prototypeNanoid String?      @unique
  currentStep     Int          @default(1)
  steps           Json?
  notifiedAt      DateTime?
  expiresAt       DateTime?
  createdAt       DateTime     @default(now())

  pipelineRun     PipelineRun? @relation(fields: [pipelineRunId], references: [id])
  booking         Booking?     @relation(fields: [bookingId], references: [id])
}
```

Key changes:
- `pipelineRunId` is now `String?` (optional) instead of `String`
- Added `bookingId String? @unique`
- Added `booking` relation
- `pipelineRun` relation is now optional (`PipelineRun?`)

- [ ] **Step 5: Run Prisma migration**

```bash
cd packages/db && npx prisma migrate dev --name add-booking-model
```

Expected: Migration creates `Booking` table, `BookingPlan`/`BookingStatus` enums, adds `bookingId` column to `Tracker`, makes `pipelineRunId` nullable on `Tracker`.

- [ ] **Step 6: Verify Prisma client generates correctly**

```bash
cd packages/db && npx prisma generate
```

Expected: No errors. `@slushie/db` client now has `Booking`, `BookingPlan`, `BookingStatus` types.

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat: add Booking model and update Tracker for standalone booking support"
```

---

## Chunk 2: Existing File Null-Safety Fixes

### Task 2: Fix tracker page null-safety for booking trackers

**Files:**
- Modify: `apps/web/src/app/track/[slug]/page.tsx:26-57`

The tracker page crashes on `tracker.pipelineRun.client.name` when `pipelineRun` is null (booking trackers have no pipeline run).

- [ ] **Step 1: Update Prisma query to include booking relation**

In `apps/web/src/app/track/[slug]/page.tsx`, change the `findUnique` call (lines 26-35) to:

```typescript
  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    include: {
      pipelineRun: {
        include: {
          client: { select: { name: true } },
        },
      },
      booking: {
        select: { businessName: true },
      },
    },
  });
```

- [ ] **Step 2: Fix clientName derivation**

Change line 57 from:

```typescript
  const clientName = tracker.pipelineRun.client.name;
```

to:

```typescript
  const clientName =
    tracker.pipelineRun?.client.name ??
    tracker.booking?.businessName ??
    "your project";
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/track/[slug]/page.tsx
git commit -m "fix: null-safe pipelineRun access on tracker page for booking trackers"
```

---

### Task 3: Fix tracker API route null-safety

**Files:**
- Modify: `apps/web/src/app/api/track/[slug]/route.ts:9-35`

Same crash: `tracker.pipelineRun.client.name` on line 32.

- [ ] **Step 1: Update Prisma query to include booking**

Change the `findUnique` call (lines 9-18) to:

```typescript
  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    include: {
      pipelineRun: {
        include: {
          client: { select: { name: true } },
        },
      },
      booking: {
        select: { businessName: true },
      },
    },
  });
```

- [ ] **Step 2: Fix clientName in response**

Change line 32 from:

```typescript
    clientName: tracker.pipelineRun.client.name,
```

to:

```typescript
    clientName:
      tracker.pipelineRun?.client.name ??
      tracker.booking?.businessName ??
      "your project",
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/track/[slug]/route.ts
git commit -m "fix: null-safe pipelineRun access in tracker API route"
```

---

### Task 4: Fix SSE events route — channel keying for booking trackers

**Files:**
- Modify: `apps/web/src/app/api/track/[slug]/events/route.ts:27`

When `pipelineRunId` is null (booking tracker), the Redis channel becomes `tracker:null` which never receives updates.

- [ ] **Step 1: Fix Redis channel key**

Change line 27 from:

```typescript
  const channel = `tracker:${tracker.pipelineRunId}`;
```

to:

```typescript
  const channel = `tracker:${tracker.pipelineRunId ?? tracker.id}`;
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/track/[slug]/events/route.ts
git commit -m "fix: use tracker.id as SSE channel fallback when pipelineRunId is null"
```

---

### Task 5: Fix preview page null-safety

**Files:**
- Modify: `apps/web/src/app/preview/[nanoid]/page.tsx:50-70`

Line 50 assigns `tracker.pipelineRun` without null check. Line 57 accesses `pipelineRun.callId` which crashes for booking trackers.

- [ ] **Step 1: Add null check on pipelineRun before prototype query**

Change lines 49-68 from:

```typescript
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
```

to:

```typescript
  // find the latest prototype for this pipeline run (null for booking trackers)
  const pipelineRun = tracker.pipelineRun;

  let prototype: {
    id: string;
    version: number;
    previewUrl: string | null;
    manifest: unknown;
  } | null = null;

  if (pipelineRun) {
    prototype = await prisma.prototype.findFirst({
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
  }
```

- [ ] **Step 2: Fix clientName derivation**

Change line 70 from:

```typescript
  const clientName = pipelineRun.client.name;
```

to:

```typescript
  const clientName = pipelineRun?.client.name ?? "your project";
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/preview/[nanoid]/page.tsx
git commit -m "fix: null-safe pipelineRun access on preview page"
```

---

### Task 6: Fix tracker worker — dynamic step count

**Files:**
- Modify: `apps/worker/src/workers/tracker.worker.ts:49`

Line 49 hardcodes `step > 5`. Booking trackers have 8 steps.

**Note:** This worker is only triggered by pipeline run events (via BullMQ). Booking tracker step progression is handled entirely by the `PATCH /api/booking/[id]/advance` route (Task 11). However, we still fix the hardcoded limits here so the worker doesn't crash if it ever receives a step > 5.

- [ ] **Step 1: Replace hardcoded step limit with dynamic check and fix stepMeta null-safety**

Change lines 48-57 from:

```typescript
      // validate step number
      if (step < 1 || step > 5) {
        workerLogger.error({ step }, "invalid tracker step");
        throw new Error(`invalid tracker step: ${step}`);
      }

      // look up step metadata — use event data if provided, fall back to defaults
      const stepMeta = TRACKER_STEPS[step - 1];
      const label = event.data.label || stepMeta.label;
      const subtitle = event.data.subtitle || stepMeta.subtitle;
```

to:

```typescript
      // validate step number — use tracker's step count (5 for pipeline, 8 for booking)
      const trackerSteps = tracker.steps as Array<{ step: number }> | null;
      const maxStep = trackerSteps?.length ?? TRACKER_STEPS.length;
      if (step < 1 || step > maxStep) {
        workerLogger.error({ step, maxStep }, "invalid tracker step");
        throw new Error(`invalid tracker step: ${step} (max: ${maxStep})`);
      }

      // look up step metadata — null-safe for steps beyond TRACKER_STEPS (booking has 8)
      const stepMeta = TRACKER_STEPS[step - 1] ?? null;
      const label = event.data.label || stepMeta?.label || `step ${step}`;
      const subtitle = event.data.subtitle || stepMeta?.subtitle || "";
```

- [ ] **Step 2: Fix final step detection**

Change lines 86-90 from:

```typescript
      // if step is 5 (final), mark it as done too
      if (step === 5) {
        updatedSteps[4].status = "done";
        updatedSteps[4].completedAt = new Date().toISOString();
      }
```

to:

```typescript
      // if final step, mark it as done too
      if (step === maxStep) {
        updatedSteps[step - 1].status = "done";
        updatedSteps[step - 1].completedAt = new Date().toISOString();
      }
```

- [ ] **Step 3: Fix Redis channel for booking trackers**

Change line 111 from:

```typescript
      await pubRedis.publish(`tracker:${pipelineRunId}`, ssePayload);
```

to:

```typescript
      await pubRedis.publish(`tracker:${pipelineRunId ?? tracker.id}`, ssePayload);
```

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/workers/tracker.worker.ts
git commit -m "fix: dynamic step count and Redis channel fallback in tracker worker"
```

---

## Chunk 3: Google Calendar Integration + Booking API

### Task 7: Install googleapis and date-fns-tz dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install googleapis and date-fns-tz**

`date-fns-tz` is needed for timezone-aware slot generation (server may run in UTC but business hours are in `BOOKING_TIMEZONE`).

```bash
cd apps/web && npm install googleapis date-fns-tz date-fns
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/package.json package-lock.json
git commit -m "chore: add googleapis and date-fns-tz for calendar integration"
```

---

### Task 8: Create Google Calendar helper module

**Files:**
- Create: `apps/web/src/lib/google-calendar.ts`

This module encapsulates all Google Calendar API interactions.

- [ ] **Step 1: Create the helper module**

Create `apps/web/src/lib/google-calendar.ts`:

```typescript
import { google } from "googleapis";
import { formatInTimeZone, toDate } from "date-fns-tz";
import { addDays, addHours } from "date-fns";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function getCalendarClient() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var is not set");
  }

  const credentials = JSON.parse(credentialsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });

  return google.calendar({ version: "v3", auth });
}

function getCalendarId(): string {
  const id = process.env.GOOGLE_CALENDAR_ID;
  if (!id) throw new Error("GOOGLE_CALENDAR_ID env var is not set");
  return id;
}

function getTimezone(): string {
  return process.env.BOOKING_TIMEZONE ?? "America/New_York";
}

function getBusinessHours(): { start: number; end: number } {
  return {
    start: parseInt(process.env.BOOKING_START_HOUR ?? "9"),
    end: parseInt(process.env.BOOKING_END_HOUR ?? "17"),
  };
}

/** Returns available 60-minute slots for the next 7 business days. */
export async function getAvailableSlots(): Promise<
  Array<{
    date: string;
    label: string;
    times: Array<{ start: string; label: string }>;
  }>
> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();
  const tz = getTimezone();
  const { start: startHour, end: endHour } = getBusinessHours();

  // collect next 7 business days (weekdays) in the configured timezone
  const businessDays: Date[] = [];
  const now = new Date();
  let cursor = addDays(now, 1); // start from tomorrow

  while (businessDays.length < 7) {
    // get day-of-week in the business timezone
    const dayOfWeek = parseInt(formatInTimeZone(cursor, tz, "i")); // 1=Mon, 7=Sun
    if (dayOfWeek <= 5) {
      businessDays.push(new Date(cursor));
    }
    cursor = addDays(cursor, 1);
  }

  // build time range for free/busy query
  const dateStrFirst = formatInTimeZone(businessDays[0], tz, "yyyy-MM-dd");
  const dateStrLast = formatInTimeZone(businessDays[businessDays.length - 1], tz, "yyyy-MM-dd");
  const timeMin = toDate(`${dateStrFirst}T00:00:00`, { timeZone: tz });
  const timeMax = toDate(`${dateStrLast}T23:59:59`, { timeZone: tz });

  // fetch free/busy from Google Calendar
  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: tz,
      items: [{ id: calendarId }],
    },
  });

  const busyPeriods =
    freeBusy.data.calendars?.[calendarId]?.busy ?? [];

  // generate slots in the business timezone and subtract busy periods
  const slots = businessDays.map((day) => {
    const dateStr = formatInTimeZone(day, tz, "yyyy-MM-dd");
    const dayLabel = formatInTimeZone(day, tz, "EEE M/d").toLowerCase();

    const times: Array<{ start: string; label: string }> = [];

    for (let hour = startHour; hour < endHour; hour++) {
      // create slot times in the business timezone
      const slotStart = toDate(`${dateStr}T${String(hour).padStart(2, "0")}:00:00`, { timeZone: tz });
      const slotEnd = addHours(slotStart, 1);

      // check if slot overlaps any busy period
      const isBusy = busyPeriods.some((busy) => {
        const busyStart = new Date(busy.start!);
        const busyEnd = new Date(busy.end!);
        return slotStart < busyEnd && slotEnd > busyStart;
      });

      if (!isBusy) {
        const ampm = hour >= 12 ? "pm" : "am";
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        // format with timezone offset (e.g., "2026-03-17T10:00:00-05:00")
        const isoWithOffset = formatInTimeZone(slotStart, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
        times.push({
          start: isoWithOffset,
          label: `${displayHour}:00${ampm}`,
        });
      }
    }

    return { date: dateStr, label: dayLabel, times };
  });

  return slots.filter((s) => s.times.length > 0);
}

/** Create a Google Calendar event and return the event ID. Sends invite to attendee. */
export async function createCalendarEvent(params: {
  summary: string;
  description: string;
  startTime: string;
  attendeeEmail: string;
}): Promise<string> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();
  const tz = getTimezone();

  const startDate = new Date(params.startTime);
  const endDate = addHours(startDate, 1);

  const event = await calendar.events.insert({
    calendarId,
    sendUpdates: "all", // sends calendar invite to attendee
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { dateTime: startDate.toISOString(), timeZone: tz },
      end: { dateTime: endDate.toISOString(), timeZone: tz },
      attendees: [{ email: params.attendeeEmail }],
    },
  });

  return event.data.id!;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/google-calendar.ts
git commit -m "feat: add Google Calendar helper for slot availability and event creation"
```

---

### Task 9: Create GET /api/booking/slots route

**Files:**
- Create: `apps/web/src/app/api/booking/slots/route.ts`

Public endpoint — no auth required. Returns available 60-minute meeting slots.

- [ ] **Step 1: Create the slots route**

Create `apps/web/src/app/api/booking/slots/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { getAvailableSlots } from "@/lib/google-calendar";

export async function GET() {
  try {
    const slots = await getAvailableSlots();

    // also subtract already-booked meeting times
    const bookedMeetings = await prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        meetingTime: { gte: new Date() },
      },
      select: { meetingTime: true },
    });

    const bookedTimes = new Set(
      bookedMeetings.map((b) => b.meetingTime.toISOString())
    );

    const filtered = slots
      .map((day) => ({
        ...day,
        times: day.times.filter((t) => !bookedTimes.has(new Date(t.start).toISOString())),
      }))
      .filter((day) => day.times.length > 0);

    return NextResponse.json({ slots: filtered });
  } catch (err) {
    console.error("failed to fetch booking slots:", err);
    return NextResponse.json(
      { error: "failed to fetch available slots" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/booking/slots/route.ts
git commit -m "feat: add GET /api/booking/slots for available meeting times"
```

---

### Task 10: Create POST /api/booking route

**Files:**
- Create: `apps/web/src/app/api/booking/route.ts`

Public endpoint. Creates Google Calendar event, Client, Booking, and Tracker with 8 booking steps.

- [ ] **Step 1: Create the booking route**

Create `apps/web/src/app/api/booking/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { nanoid } from "nanoid";
import { createCalendarEvent } from "@/lib/google-calendar";

const BOOKING_STEPS = [
  { step: 1, label: "meeting confirmed", subtitle: "your blend is scheduled. we'll see you there." },
  { step: 2, label: "meeting", subtitle: "we're on the call. workflow discovery in progress." },
  { step: 3, label: "build completion", subtitle: "your tool is built. time for a taste test." },
  { step: 4, label: "internal build review", subtitle: "our team is reviewing the build for quality." },
  { step: 5, label: "client build approval", subtitle: "your turn. take a look and let us know." },
  { step: 6, label: "plug-in", subtitle: "connecting to your tools. almost there." },
  { step: 7, label: "billing", subtitle: "invoice sent. simple and transparent." },
  { step: 8, label: "satisfaction survey", subtitle: "how'd we do? we want to keep getting better." },
];

const VALID_PLANS = ["SINGLE_SCOOP", "DOUBLE_BLEND", "TRIPLE_FREEZE"] as const;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, businessName, plan, description, meetingTime } = body;

    // validate required fields
    if (!name || !email || !businessName || !plan || !description || !meetingTime) {
      return NextResponse.json(
        { error: "all fields are required" },
        { status: 400 }
      );
    }

    if (!VALID_PLANS.includes(plan)) {
      return NextResponse.json(
        { error: "invalid plan selection" },
        { status: 400 }
      );
    }

    // basic email validation
    if (!email.includes("@") || !email.includes(".")) {
      return NextResponse.json(
        { error: "invalid email address" },
        { status: 400 }
      );
    }

    // validate meeting time is in the future
    const meetingDate = new Date(meetingTime);
    if (isNaN(meetingDate.getTime()) || meetingDate < new Date()) {
      return NextResponse.json(
        { error: "meeting time must be in the future" },
        { status: 400 }
      );
    }

    const planLabels: Record<string, string> = {
      SINGLE_SCOOP: "single scoop",
      DOUBLE_BLEND: "double blend",
      TRIPLE_FREEZE: "triple freeze",
    };

    // 1. check for existing booking at this time (race condition guard)
    const existingBooking = await prisma.booking.findFirst({
      where: {
        meetingTime: meetingDate,
        status: "CONFIRMED",
      },
    });

    if (existingBooking) {
      return NextResponse.json(
        { error: "this time slot was just taken. please pick another." },
        { status: 409 }
      );
    }

    // 2. create Google Calendar event (sends invite to customer)
    let calendarEventId: string | null = null;
    try {
      calendarEventId = await createCalendarEvent({
        summary: `slushie blend — ${businessName} (${planLabels[plan]})`,
        description: `customer: ${name} (${email})\nbusiness: ${businessName}\nplan: ${planLabels[plan]}\n\nworkflow description:\n${description}`,
        startTime: meetingTime,
        attendeeEmail: email,
      });
    } catch (calErr: unknown) {
      const message = calErr instanceof Error ? calErr.message : "unknown error";
      console.error("google calendar event creation failed:", message);
      return NextResponse.json(
        { error: "failed to schedule meeting. please try again." },
        { status: 500 }
      );
    }

    // 3. create Client record
    const client = await prisma.client.create({
      data: {
        name: businessName,
        industry: "pending",
        contactName: name,
        contactEmail: email,
      },
    });

    // 4. create Booking record
    const booking = await prisma.booking.create({
      data: {
        name,
        email,
        businessName,
        plan,
        description,
        meetingTime: meetingDate,
        calendarEventId,
        clientId: client.id,
      },
    });

    // 5. create Tracker with 8 steps, step 1 done
    const slug = nanoid(21);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const steps = BOOKING_STEPS.map((s, i) => ({
      ...s,
      status: i === 0 ? "done" : "pending",
      completedAt: i === 0 ? new Date().toISOString() : null,
    }));

    const tracker = await prisma.tracker.create({
      data: {
        bookingId: booking.id,
        slug,
        currentStep: 1,
        steps,
        expiresAt,
      },
    });

    return NextResponse.json({
      trackingSlug: tracker.slug,
      bookingId: booking.id,
    });
  } catch (err) {
    console.error("booking creation failed:", err);
    return NextResponse.json(
      { error: "something went wrong. please try again." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/booking/route.ts
git commit -m "feat: add POST /api/booking for creating bookings with calendar events"
```

---

### Task 11: Create PATCH /api/booking/[id]/advance route

**Files:**
- Create: `apps/web/src/app/api/booking/[id]/advance/route.ts`

Admin-only endpoint to advance a booking tracker's step.

- [ ] **Step 1: Create the advance route**

Create `apps/web/src/app/api/booking/[id]/advance/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import Redis from "ioredis";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      tracker: true,
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  if (!booking.tracker) {
    return NextResponse.json({ error: "no tracker for this booking" }, { status: 404 });
  }

  const tracker = booking.tracker;
  const steps = tracker.steps as Array<{
    step: number;
    label: string;
    subtitle: string;
    status: string;
    completedAt: string | null;
  }>;

  if (!steps || tracker.currentStep >= steps.length) {
    return NextResponse.json(
      { error: "tracker is already at the final step" },
      { status: 400 }
    );
  }

  const nextStep = tracker.currentStep + 1;

  // update step statuses
  const updatedSteps = steps.map((s, i) => {
    if (i < nextStep - 1) {
      return { ...s, status: "done", completedAt: s.completedAt ?? new Date().toISOString() };
    }
    if (i === nextStep - 1) {
      // if final step, mark as done immediately
      if (nextStep === steps.length) {
        return { ...s, status: "done", completedAt: new Date().toISOString() };
      }
      return { ...s, status: "active" };
    }
    return { ...s, status: "pending" };
  });

  const updated = await prisma.tracker.update({
    where: { id: tracker.id },
    data: {
      currentStep: nextStep,
      steps: updatedSteps,
    },
  });

  // mark booking as COMPLETED when reaching the final step
  if (nextStep === steps.length) {
    await prisma.booking.update({
      where: { id },
      data: { status: "COMPLETED" },
    });
  }

  // publish SSE update via Redis
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const channel = `tracker:${tracker.id}`;
    const payload = JSON.stringify({
      type: "tracker.update",
      step: nextStep,
      label: steps[nextStep - 1].label,
      subtitle: steps[nextStep - 1].subtitle,
      steps: updatedSteps,
      timestamp: Date.now(),
    });

    await redis.publish(channel, payload);
  } finally {
    redis.disconnect();
  }

  return NextResponse.json({
    currentStep: updated.currentStep,
    steps: updatedSteps,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/booking/[id]/advance/route.ts
git commit -m "feat: add PATCH /api/booking/[id]/advance for admin step progression"
```

---

## Chunk 4: Landing Page UI

### Task 12: Create the landing page — replace current `/` route

**Files:**
- Modify: `apps/web/src/app/page.tsx` (complete rewrite)
- Create: `apps/web/src/app/booking-form.tsx` (client component for form + calendar picker)

The landing page is a server component with a client sub-component for the interactive booking form. The page is public (no auth). The current sign-in redirect moves to the nav "team" link.

- [ ] **Step 1: Create the booking form client component**

Create `apps/web/src/app/booking-form.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface TimeSlot {
  start: string;
  label: string;
}

interface DaySlots {
  date: string;
  label: string;
  times: TimeSlot[];
}

type Plan = "SINGLE_SCOOP" | "DOUBLE_BLEND" | "TRIPLE_FREEZE";

export function BookingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [plan, setPlan] = useState<Plan>("DOUBLE_BLEND");
  const [description, setDescription] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<DaySlots[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/booking/slots")
      .then((res) => res.json())
      .then((data) => {
        setSlots(data.slots ?? []);
        if (data.slots?.length > 0) {
          setSelectedDay(data.slots[0].date);
        }
      })
      .catch(() => setError("couldn't load available times"))
      .finally(() => setLoadingSlots(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) {
      setError("please pick a time");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          businessName,
          plan,
          description,
          meetingTime: selectedSlot,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "something went wrong");
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      router.push(`/track/${data.trackingSlug}`);
    } catch {
      setError("something went wrong. please try again.");
      setSubmitting(false);
    }
  }

  const planOptions: Array<{ value: Plan; label: string }> = [
    { value: "SINGLE_SCOOP", label: "single scoop" },
    { value: "DOUBLE_BLEND", label: "double blend" },
    { value: "TRIPLE_FREEZE", label: "triple freeze" },
  ];

  const currentDaySlots = slots.find((s) => s.date === selectedDay);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* name */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          name
        </label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="your name"
        />
      </div>

      {/* email */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="you@company.com"
        />
      </div>

      {/* business name */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          business name
        </label>
        <input
          type="text"
          required
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="your business"
        />
      </div>

      {/* plan selector */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          pick your flavor
        </label>
        <div className="grid grid-cols-3 gap-2">
          {planOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPlan(opt.value)}
              className={`rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                plan === opt.value
                  ? "border-primary bg-primary text-white"
                  : "border-gray-200 bg-white text-foreground hover:border-primary/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* description */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          what's the workflow that's eating your time?
        </label>
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          placeholder="tell us about the spreadsheet, the copy-paste nightmare, the thing that eats your afternoon..."
        />
      </div>

      {/* calendar picker */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          pick a time
        </label>
        {loadingSlots ? (
          <div className="text-center py-8 text-sm text-muted">
            loading available times...
          </div>
        ) : slots.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted">
            no available times right now. check back soon.
          </div>
        ) : (
          <div className="space-y-3">
            {/* day tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {slots.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDay(day.date)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                    selectedDay === day.date
                      ? "bg-foreground text-white"
                      : "bg-white border border-gray-200 text-foreground hover:border-foreground/30"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
            {/* time slots */}
            {currentDaySlots && (
              <div className="grid grid-cols-4 gap-2">
                {currentDaySlots.times.map((time) => (
                  <button
                    key={time.start}
                    type="button"
                    onClick={() => setSelectedSlot(time.start)}
                    className={`rounded-lg border-2 px-2 py-2 text-sm font-medium transition-all ${
                      selectedSlot === time.start
                        ? "border-primary bg-primary text-white"
                        : "border-gray-200 bg-white text-foreground hover:border-primary/50"
                    }`}
                  >
                    {time.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* error */}
      {error && (
        <p className="text-sm text-primary font-medium">{error}</p>
      )}

      {/* submit */}
      <button
        type="submit"
        disabled={submitting || !selectedSlot}
        className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "booking..." : "book your blend →"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Replace the landing page**

Rewrite `apps/web/src/app/page.tsx`:

```tsx
import Link from "next/link";
import { BookingForm } from "./booking-form";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      {/* nav — sticky glass blur */}
      <nav className="sticky top-0 z-50 border-b border-white/10" style={{ background: "rgba(15,15,15,0.85)", backdropFilter: "blur(8px)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            slushie
          </span>
          <div className="flex items-center gap-4">
            <a
              href="#contact"
              className="rounded-full bg-gradient-to-r from-primary to-secondary px-5 py-2 text-sm font-semibold text-white transition-transform hover:scale-105"
            >
              book a blend
            </a>
            <Link
              href="/api/auth/signin"
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              team
            </Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <section
        className="relative overflow-hidden px-6 py-28 md:py-40"
        style={{ background: "linear-gradient(135deg, #DC2626 0%, #3B5BDB 100%)" }}
      >
        <div className="mx-auto max-w-3xl text-center text-white">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/70">
            workflow automation for small business
          </p>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight md:text-6xl">
            one meeting. one workflow. done.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/80">
            you hop on a call, tell us what's broken, sip your coffee, and we
            build it right there. by tomorrow, it's plugged into your tools and
            running.
          </p>
          <a
            href="#contact"
            className="mt-8 inline-block rounded-full bg-white px-8 py-3.5 text-sm font-bold text-primary shadow-lg transition-transform hover:scale-105"
          >
            book your blend →
          </a>
          <p className="mt-4 text-sm text-white/60">
            60 minutes. that's it. we handle the rest.
          </p>
        </div>
      </section>

      {/* how it works */}
      <section className="bg-background px-6 py-24">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-3xl font-extrabold text-foreground">
            sit back. sip. we've got this.
          </h2>

          <div className="relative mt-16">
            {/* vertical gradient line */}
            <div
              className="absolute left-5 top-0 h-full w-0.5 rounded-full"
              style={{ background: "linear-gradient(to bottom, #DC2626, #3B5BDB)" }}
            />

            {/* step 1 */}
            <div className="relative flex gap-6 pb-12">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                1
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">you talk, we listen</h3>
                <p className="mt-1 text-sm text-muted">
                  hop on a 60-minute call. walk us through the messy spreadsheet,
                  the copy-paste nightmare, the thing that eats your afternoon. we
                  get it.
                </p>
              </div>
            </div>

            {/* step 2 */}
            <div className="relative flex gap-6 pb-12">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white">
                2
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">we build it live</h3>
                <p className="mt-1 text-sm text-muted">
                  while you're still on the call, we start building. you watch
                  your workflow take shape in real time. it's like magic, but it's
                  actually just us moving fast.
                </p>
              </div>
            </div>

            {/* step 3 */}
            <div className="relative flex gap-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-white">
                3
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  wake up to it working
                </h3>
                <p className="mt-1 text-sm text-muted">
                  we plug it into your tools overnight — google sheets, quickbooks,
                  whatever you use. by morning, your workflow is running on
                  autopilot.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* pricing */}
      <section className="bg-white px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-extrabold text-foreground">
            pick your flavor.
          </h2>
          <p className="mt-3 text-sm text-muted">
            no subscriptions. no retainers. just pay for what you need.
          </p>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {/* single scoop */}
            <div className="rounded-2xl border-2 border-gray-200 p-8 text-left">
              <p className="text-sm font-semibold text-muted">single scoop</p>
              <p className="mt-2 text-4xl font-extrabold text-foreground">$3,500</p>
              <p className="mt-4 text-sm text-muted">
                one meeting, one workflow, one backend plug-in
              </p>
              <a
                href="#contact"
                className="mt-6 block rounded-lg border-2 border-primary py-2.5 text-center text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
              >
                get started
              </a>
            </div>

            {/* double blend — featured */}
            <div
              className="relative rounded-2xl p-8 text-left text-white shadow-xl md:scale-105"
              style={{ background: "linear-gradient(135deg, #DC2626 0%, #3B5BDB 100%)" }}
            >
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-1 text-xs font-bold text-primary shadow">
                most popular
              </span>
              <p className="text-sm font-semibold text-white/70">double blend</p>
              <p className="mt-2 text-4xl font-extrabold">$6,000</p>
              <p className="mt-4 text-sm text-white/80">
                two meetings, two workflows, two backend plug-ins
              </p>
              <a
                href="#contact"
                className="mt-6 block rounded-lg bg-white py-2.5 text-center text-sm font-bold text-primary transition-transform hover:scale-105"
              >
                pour this one →
              </a>
            </div>

            {/* triple freeze */}
            <div className="rounded-2xl border-2 border-secondary/30 p-8 text-left">
              <p className="text-sm font-semibold text-muted">triple freeze</p>
              <p className="mt-2 text-4xl font-extrabold text-foreground">$8,500</p>
              <p className="mt-4 text-sm text-muted">
                three meetings, three workflows, three backend plug-ins
              </p>
              <a
                href="#contact"
                className="mt-6 block rounded-lg border-2 border-secondary py-2.5 text-center text-sm font-semibold text-secondary transition-colors hover:bg-secondary hover:text-white"
              >
                get started
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* contact / booking form */}
      <section id="contact" className="bg-background px-6 py-24">
        <div className="mx-auto max-w-lg">
          <h2 className="text-center text-3xl font-extrabold text-foreground">
            ready? this part takes 2 minutes.
          </h2>
          <div className="mt-10">
            <BookingForm />
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="bg-[#0f0f0f] px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="text-lg font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            slushie
          </span>
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} slushie
          </p>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Verify the page renders**

```bash
cd apps/web && npx next build 2>&1 | head -30
```

Expected: Build succeeds without errors for the `/` route.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/booking-form.tsx
git commit -m "feat: replace sign-in page with public landing page and booking form"
```

---

## Chunk 5: Admin Dashboard + Final Wiring

### Task 13: Add bookings page to admin dashboard

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/bookings/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/layout.tsx:22` (add nav link)

- [ ] **Step 1: Create the bookings dashboard page**

Create `apps/web/src/app/(dashboard)/dashboard/bookings/page.tsx`:

```tsx
import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BookingActions } from "./booking-actions";

export default async function BookingsPage() {
  const session = await auth();
  if (!session) redirect("/api/auth/signin");

  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      tracker: {
        select: { slug: true, currentStep: true, steps: true },
      },
    },
  });

  const planLabels: Record<string, string> = {
    SINGLE_SCOOP: "single scoop",
    DOUBLE_BLEND: "double blend",
    TRIPLE_FREEZE: "triple freeze",
  };

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-foreground">bookings</h1>
      <p className="mt-1 text-sm text-muted">customer bookings from the landing page</p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-muted">
              <th className="pb-2 pr-4 font-medium">customer</th>
              <th className="pb-2 pr-4 font-medium">business</th>
              <th className="pb-2 pr-4 font-medium">plan</th>
              <th className="pb-2 pr-4 font-medium">meeting</th>
              <th className="pb-2 pr-4 font-medium">status</th>
              <th className="pb-2 pr-4 font-medium">step</th>
              <th className="pb-2 font-medium">actions</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => {
              const steps = booking.tracker?.steps as Array<{ step: number; label: string }> | null;
              const currentStep = booking.tracker?.currentStep ?? 0;
              const totalSteps = steps?.length ?? 0;
              const currentLabel = steps?.[currentStep - 1]?.label ?? "—";

              return (
                <tr key={booking.id} className="border-b border-gray-100">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-foreground">{booking.name}</div>
                    <div className="text-xs text-muted">{booking.email}</div>
                  </td>
                  <td className="py-3 pr-4 text-foreground">{booking.businessName}</td>
                  <td className="py-3 pr-4">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {planLabels[booking.plan] ?? booking.plan}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-foreground">
                    {booking.meetingTime.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        booking.status === "CONFIRMED"
                          ? "bg-green-100 text-green-700"
                          : booking.status === "COMPLETED"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {booking.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-foreground">
                    <span className="text-xs">
                      {currentStep}/{totalSteps} — {currentLabel}
                    </span>
                  </td>
                  <td className="py-3">
                    <BookingActions
                      bookingId={booking.id}
                      trackingSlug={booking.tracker?.slug ?? null}
                      canAdvance={currentStep < totalSteps}
                    />
                  </td>
                </tr>
              );
            })}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  no bookings yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the BookingActions client component**

Create `apps/web/src/app/(dashboard)/dashboard/bookings/booking-actions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface BookingActionsProps {
  bookingId: string;
  trackingSlug: string | null;
  canAdvance: boolean;
}

export function BookingActions({
  bookingId,
  trackingSlug,
  canAdvance,
}: BookingActionsProps) {
  const router = useRouter();
  const [advancing, setAdvancing] = useState(false);

  async function handleAdvance() {
    setAdvancing(true);
    try {
      const res = await fetch(`/api/booking/${bookingId}/advance`, {
        method: "PATCH",
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {trackingSlug && (
        <a
          href={`/track/${trackingSlug}`}
          target="_blank"
          rel="noopener"
          className="text-xs text-primary hover:underline"
        >
          track
        </a>
      )}
      {canAdvance && (
        <button
          onClick={handleAdvance}
          disabled={advancing}
          className="rounded bg-foreground px-2.5 py-1 text-xs font-medium text-white hover:bg-foreground/80 disabled:opacity-50"
        >
          {advancing ? "..." : "advance →"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add bookings link to dashboard nav**

In `apps/web/src/app/(dashboard)/layout.tsx`, add after the clients link (line 22):

```tsx
            <Link href="/dashboard/bookings" className="hover:text-white">bookings</Link>
```

So the nav links section (lines 19-25) becomes:

```tsx
          <div className="flex items-center gap-6 text-sm text-muted">
            <Link href="/dashboard/calls" className="hover:text-white">calls</Link>
            <Link href="/dashboard/builds" className="hover:text-white">builds</Link>
            <Link href="/dashboard/clients" className="hover:text-white">clients</Link>
            <Link href="/dashboard/bookings" className="hover:text-white">bookings</Link>
            <Link href="/dashboard/postmortems" className="hover:text-white">postmortems</Link>
            <Link href="/dashboard/dev/chat" className="hover:text-white">dev chat</Link>
          </div>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/dashboard/bookings/ apps/web/src/app/\(dashboard\)/layout.tsx
git commit -m "feat: add bookings dashboard page with advance step action"
```

---

### Task 14: Install nanoid in web app (if not already present)

**Files:**
- Check: `apps/web/package.json`

The booking route uses `nanoid` for generating tracker slugs. Check if it's available via the `@slushie/events` package re-export or needs direct installation.

- [ ] **Step 1: Check nanoid availability**

```bash
cd apps/web && node -e "require('nanoid')" 2>&1
```

If this fails (module not found):

```bash
cd apps/web && npm install nanoid
```

- [ ] **Step 2: Commit if installed**

```bash
git add apps/web/package.json package-lock.json
git commit -m "chore: add nanoid dependency to web app"
```

---

### Task 15: Verify full build

**Files:** None (verification only)

- [ ] **Step 1: Run Prisma generate**

```bash
cd packages/db && npx prisma generate
```

Expected: Success.

- [ ] **Step 2: Run Next.js build**

```bash
cd apps/web && npx next build
```

Expected: Build succeeds. All pages compile.

- [ ] **Step 3: Fix any type errors or build issues found**

Address any issues discovered during the build.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: address build issues from landing page integration"
```
