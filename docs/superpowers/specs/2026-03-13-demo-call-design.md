# demo call — design spec

**date:** 2026-03-13
**status:** draft
**owner:** ryan haugland

---

## overview

add a "demo call" button to the new call form that generates a realistic discovery call transcript using claude, lets the team member review it and optionally rework it, then executes the full post-call pipeline (analyst → builder → reviewer → gap resolution) as if a real call happened. transcripts emphasize workflow integrations — the client describes their current tools (google sheets, excel, jira, quickbooks, etc.) and the pain points around them, so the prototype is designed to plug into those workflows.

---

## ui flow

the new call form page (`/dashboard/calls/new`) gains a second button and a new state.

### form state (existing, modified)

the form keeps all existing fields (client name, industry, contact name, contact email, owner). two buttons at the bottom:
- **"start call"** — existing behavior, navigates to live call page
- **"demo call"** — new button, triggers transcript generation. requires client name (same validation as "start call"). styled as a secondary/outline button to differentiate from the primary "start call" button.

### transcript review state (new)

when "demo call" is clicked, the form is replaced with:
- a **loading indicator** ("generating transcript...") while the API call is in flight
- once ready, a **scrollable transcript panel** showing the full generated transcript. uses the same `[team]: ...` / `[client]: ...` format as real transcripts.
- two buttons below the panel:
  - **"rework"** — clears the transcript and generates a new one (shows loading again)
  - **"execute"** — creates client + call + pipeline run, saves the transcript, publishes `call.ended`, and redirects to `/dashboard/calls`
- a **"back"** link/button to return to the form without losing form field values

### state management

all state lives in the page component — no new contexts or stores. the page has a mode: `"form"` | `"loading"` | `"review"`. form field values are preserved when switching between form and review states (so "back" restores the form as it was).

---

## new api routes

### POST `/api/calls/demo/generate`

generates a realistic discovery call transcript using the anthropic sdk.

- **auth:** requires valid session
- **body:** `{ clientName: string, industry: string, contactName?: string }`
- **action:** calls claude (anthropic sdk, `@anthropic-ai/sdk`) with a system prompt and user message. this is a single prompt→response call, not an agent workflow.
- **response:** `{ transcript: string }`
- **error handling:** returns 500 with `{ error: "failed to generate transcript" }` if claude call fails

#### generation prompt

the system prompt instructs claude to write a discovery call transcript between a slushie team member and a small business client. key instructions:

- the client contact name defaults to "the client" if not provided
- the client describes their **current workflow using specific named tools** — google sheets, excel, quickbooks, jira, slack, google calendar, servicetitan, xero, freshbooks, trello, asana, hubspot, salesforce, etc. — whatever is realistic for the industry
- the client explains **pain points around those tools**: manual data entry, copy-pasting between apps, no single source of truth, dropped balls, lost revenue
- the team member asks discovery questions that surface **how work flows between tools** and where the gaps are
- the prototype being discussed should be designed to **integrate into the client's existing tools**, not replace them
- format: `[team]: ...` and `[client]: ...` lines (one line per speaker turn)
- length: 80-120 exchanges (realistic for a ~15-20 minute discovery call)
- tone: natural, conversational, not salesy. the team member is genuinely trying to understand the business

the user message provides: client name, industry, and contact name.

#### sdk usage

uses `@anthropic-ai/sdk` directly in the route handler. model: `claude-sonnet-4-20250514` (fast, cheap, good at creative writing). max_tokens: 8192. the anthropic api key comes from `process.env.ANTHROPIC_API_KEY`.

### POST `/api/calls/demo/execute`

creates the client, call, and pipeline run, then triggers the post-call pipeline.

- **auth:** requires valid session
- **body:** `{ clientName: string, industry: string, contactName?: string, contactEmail?: string, owner?: string, transcript: string }`
- **action:**
  1. creates a Client record (name, industry, contactName, contactEmail, owner — same fields as `/api/calls/start`)
  2. creates a Call record with:
     - `transcript` set to the provided transcript
     - `startedAt` set to 20 minutes ago (`new Date(Date.now() - 20 * 60 * 1000)`)
     - `endedAt` set to now
     - `coachingLog` set to `[]`
  3. creates a PipelineRun record linking client and call (status: RUNNING)
  4. publishes `call.ended` event to redis channel `events:${pipelineRunId}` with callId, clientId, and duration (1200 seconds / 20 minutes)
- **response:** `{ pipelineRunId: string, callId: string, clientId: string }`
- **error handling:** if any step fails, return 500. no partial cleanup needed — prisma transactions can wrap steps 1-3 if desired, but the records are harmless orphans if redis publish fails.

#### redis publish pattern

same pattern as the existing `/api/calls/end` route: create a new Redis connection, publish the event, disconnect in a finally block.

---

## scope boundaries

### in scope
- "demo call" button on new call form
- transcript review UI (loading, display, rework, execute, back)
- transcript generation API route using anthropic sdk
- demo execute API route (atomic create + trigger pipeline)
- the generated transcript emphasizes workflow integrations by design (via prompt)

### out of scope
- changes to the live call page or build preview panel
- changes to the pipeline, analyst, builder, or any worker code
- new database fields or event types
- pre-written template transcripts or fallback generation
- industry-specific integration mappings (claude handles this via its knowledge)
- transcript editing before execution (rework generates a fresh one; no inline editing)
