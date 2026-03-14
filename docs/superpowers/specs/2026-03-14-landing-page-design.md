# slushie landing page + booking system

## goal

replace the current sign-in gate at `/` with a public-facing landing page that sells slushie's workflow automation service to small business owners. the page includes pricing, a contact form with google calendar integration for scheduling, and a post-booking tracking portal that shows the customer their project status through 8 steps.

## target audience

small business owners who know they need technology but don't know how to build it. they want the process to feel effortless — "i had a 60-minute meeting, one of my workflows got resolved, and i just sipped on a slushie."

## architecture

the landing page is a single Next.js page at `/`. it is public (no auth). the booking form submits to a new API route that creates a `Booking` record, a `Client` record, and a `Tracker` with 8 pre-defined steps. the customer receives their tracking link immediately after booking. the admin dashboard gets a new bookings view.

google calendar integration uses the Google Calendar API to fetch free/busy data for a configured calendar and display available 60-minute slots.

---

## section 1: landing page layout

**route:** `/` (replaces current `page.tsx`)

the current sign-in page moves to a "team" link in the nav that points to `/api/auth/signin`.

### nav (sticky, glass-blur)

- gradient logo "slushie" on left
- "book a blend" CTA button (scrolls to contact section) on right
- tiny "team" text link to `/api/auth/signin` on far right
- `background: rgba(15,15,15,0.85)` with `backdrop-filter: blur(8px)`

### hero (gradient background)

- small caps label: "workflow automation for small business"
- headline: "one meeting. one workflow. done."
- body: "you hop on a call, tell us what's broken, sip your coffee, and we build it right there. by tomorrow, it's plugged into your tools and running."
- CTA: "book your blend →" (scrolls to contact section)
- subtext: "60 minutes. that's it. we handle the rest."
- background: `linear-gradient(135deg, #DC2626 0%, #3B5BDB 100%)`

### how it works (vertical timeline)

background: `#F8FAFC`. section header: "sit back. sip. we've got this."

three steps on a vertical gradient line (red → blue):

1. **you talk, we listen** — "hop on a 60-minute call. walk us through the messy spreadsheet, the copy-paste nightmare, the thing that eats your afternoon. we get it."
2. **we build it live** — "while you're still on the call, we start building. you watch your workflow take shape in real time. it's like magic, but it's actually just us moving fast."
3. **wake up to it working** — "we plug it into your tools overnight — google sheets, quickbooks, whatever you use. by morning, your workflow is running on autopilot."

### pricing

background: white. section header: "pick your flavor." subheader: "no subscriptions. no retainers. just pay for what you need."

three tiers side by side:

| tier | name | price | copy |
|------|------|-------|------|
| 1 | single scoop | $3,500 | one meeting, one workflow, one backend plug-in |
| 2 | double blend | $6,000 | two meetings, two workflows, two backend plug-ins |
| 3 | triple freeze | $8,500 | three meetings, three workflows, three backend plug-ins |

- double blend is the featured/highlighted tier with gradient background, "most popular" badge, slightly scaled up
- single scoop and triple freeze have white background with colored borders
- each tier has a CTA button: "get started" (scrolls to contact) or "pour this one →" for the featured tier

### contact / booking form

background: `#F8FAFC`. section header: "ready? this part takes 2 minutes."

form fields:
- name (text)
- email (text)
- business name (text)
- pick your flavor (3 toggle buttons: single scoop / double blend / triple freeze)
- "what's the workflow that's eating your time?" (textarea)
- pick a time (calendar slot picker — see section 3)
- submit: "book your blend →" (gradient button)

### footer

dark background (`#0f0f0f`). gradient logo left, copyright right. minimal.

---

## section 2: data model

### new: Booking model

```prisma
model Booking {
  id            String        @id @default(cuid())
  name          String
  email         String
  businessName  String
  plan          BookingPlan
  description   String        @db.Text
  meetingTime   DateTime
  status        BookingStatus @default(CONFIRMED)
  clientId      String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  client        Client?       @relation(fields: [clientId], references: [id])
  tracker       Tracker?
}

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

the `clientId` links to the Client record created at booking time. the tracking slug is derived from the related Tracker record (no duplicate storage). the Client model needs a `bookings Booking[]` field added.

### tracker steps (updated)

when a booking is created, a Tracker is created with these 8 steps:

1. **meeting confirmed** — "your blend is scheduled. we'll see you there."
2. **meeting** — "we're on the call. workflow discovery in progress."
3. **build completion** — "your tool is built. time for a taste test."
4. **internal build review** — "our team is reviewing the build for quality."
5. **client build approval** — "your turn. take a look and let us know."
6. **plug-in** — "connecting to your tools. almost there."
7. **billing** — "invoice sent. simple and transparent."
8. **satisfaction survey** — "how'd we do? we want to keep getting better."

step 1 is immediately set to "done" when the booking is created. the tracker is NOT tied to a PipelineRun (since that doesn't exist yet at booking time). we need a new optional relation or a standalone tracker.

### standalone tracker approach

add an optional `bookingId` field to the existing Tracker model:

```prisma
model Tracker {
  id              String       @id @default(cuid())
  pipelineRunId   String?      @unique    // now optional
  bookingId       String?      @unique    // new
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

this lets the tracker exist independently of a pipeline run (for the booking flow) while still supporting the existing pipeline-based tracker. both relations are optional — a tracker belongs to either a pipeline run or a booking, never both.

---

## section 3: google calendar integration

### setup

use the Google Calendar API with a service account (or OAuth) to read free/busy data from a designated calendar. the calendar ID is stored in an environment variable `GOOGLE_CALENDAR_ID`.

credentials: `GOOGLE_SERVICE_ACCOUNT_JSON` env var containing the service account key JSON (or a path to the file).

### API route: `GET /api/booking/slots`

query params: `date` (optional, defaults to today)

returns available 60-minute slots for the next 7 business days (weekdays only). logic:

1. fetch free/busy data from Google Calendar API for the date range
2. define business hours (e.g. 9am-5pm EST, configurable via env)
3. generate all possible 60-minute slots within business hours
4. subtract busy periods from google calendar
5. subtract already-booked slots from the Booking table
6. return available slots grouped by date

response shape:
```json
{
  "slots": [
    { "date": "2026-03-17", "label": "mon 3/17", "times": [
      { "start": "2026-03-17T10:00:00-05:00", "label": "10:00am" },
      { "start": "2026-03-17T14:00:00-05:00", "label": "2:00pm" }
    ]},
    ...
  ]
}
```

### API route: `POST /api/booking`

body: `{ name, email, businessName, plan, description, meetingTime }`

actions:
1. validate all fields
2. create a Google Calendar event for the meeting time with the customer as attendee (this serves as the race condition guard — if the slot is taken, the Calendar API returns a conflict error; also sends the customer a calendar invite as confirmation)
3. create a Client record
4. create a Booking record with `clientId`
5. create a Tracker with 8 steps, step 1 set to "done", `bookingId` set
6. return `{ trackingSlug: tracker.slug, bookingId }`

the landing page redirects to `/track/{slug}` after successful booking, showing the customer their tracking page with step 1 (meeting confirmed) already complete.

---

## section 4: post-booking experience

after booking, the customer sees their tracking page at `/track/{slug}`. the existing tracker page and `TrackerClient` component already handle this — they display steps with status indicators and support live SSE updates.

### SSE for booking trackers

the existing SSE route (`/api/track/[slug]/events`) subscribes to `tracker:${tracker.pipelineRunId}`. for booking trackers where `pipelineRunId` is null, the SSE route must use the tracker's own id as the channel key: `tracker:${tracker.id}`. update the SSE route to use `tracker.pipelineRunId ?? tracker.id` as the Redis channel key.

when advancing a booking tracker step from the admin dashboard, publish the update to `tracker:${tracker.id}` so the SSE connection picks it up.

### advancing booking tracker steps

new API route: `PATCH /api/booking/[id]/advance`

- auth required (admin only)
- advances the tracker's `currentStep` by 1
- updates the step status in the `steps` JSON
- publishes a `tracker.update` event to the Redis channel `tracker:${tracker.id}`
- returns the updated tracker

the 8 steps progress as the slushie team works:
- step 1 is set to "done" automatically at booking creation
- step 2 is advanced manually when the meeting starts (or via a scheduled job at `meetingTime` — future enhancement)
- steps 3-7 are advanced manually by the team through the admin dashboard
- step 8 (satisfaction survey) could link to an external survey tool or a simple in-app form (future enhancement)

### admin: bookings view

add a `/dashboard/bookings` page that shows all bookings with:
- customer name, business, plan, meeting time, status
- link to the customer's tracking page
- "advance step" button to move the tracker forward
- current step indicator

---

## section 5: existing page changes

- **`/` (page.tsx)** — completely replaced with the landing page. the current sign-in redirect logic moves to the nav "team" link.
- **`/track/[slug]/page.tsx`** — must handle null `pipelineRun`. currently accesses `tracker.pipelineRun.client.name` which will crash for booking trackers. for booking trackers, derive `clientName` from the booking's `businessName` via the `tracker.booking` relation. add `booking: { select: { businessName: true } }` to the include and use `tracker.pipelineRun?.client.name ?? tracker.booking?.businessName ?? "your project"`.
- **`/api/track/[slug]/route.ts`** — same null-safety fix for `pipelineRun` access.
- **`/api/track/[slug]/events/route.ts`** — change Redis channel from `tracker:${tracker.pipelineRunId}` to `tracker:${tracker.pipelineRunId ?? tracker.id}`.
- **`/preview/[nanoid]/page.tsx`** — add null check on `tracker.pipelineRun` before accessing `pipelineRun.callId`.
- **`apps/worker/src/workers/tracker.worker.ts`** — change hardcoded `step > 5` validation to use dynamic step count from the tracker's `steps` array.
- **dashboard layout** — add "bookings" nav link alongside calls, builds, clients, postmortems.
- **Client model** — add `bookings Booking[]` relation field.

---

## section 6: environment variables

new env vars needed:
- `GOOGLE_CALENDAR_ID` — the google calendar to check for availability
- `GOOGLE_SERVICE_ACCOUNT_JSON` — service account credentials for google calendar API
- `BOOKING_TIMEZONE` — timezone for business hours (default: "America/New_York")
- `BOOKING_START_HOUR` — start of business hours (default: 9)
- `BOOKING_END_HOUR` — end of business hours (default: 17)

---

## out of scope

- payment processing (billing step is manual/invoice-based)
- custom email notifications (Google Calendar invite serves as booking confirmation)
- satisfaction survey implementation (step 8 is a placeholder for now)
- mobile-specific design optimizations (responsive but not mobile-first)
