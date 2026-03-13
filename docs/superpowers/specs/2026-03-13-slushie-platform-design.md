# slushie platform — design spec

**date:** 2026-03-13
**status:** draft
**owner:** ryan haugland

---

## overview

slushie is a platform that learns people's workflows through discovery calls, identifies monetary gaps, and builds ai-powered prototypes to close them — all autonomously. a slushie team member runs a call with a non-technical small business owner. behind the scenes, a pipeline of 5 ai agents transcribes the call, coaches the team member in real time, analyzes workflow gaps, builds a functional prototype, reviews it through 2 gap resolution cycles, and delivers it to the client via a branded progress tracker.

**target customers:** small business owners (service businesses like plumbers, cleaners, consultants; knowledge workers like accountants, lawyers, real estate agents) who know their operations but aren't technical.

**core value prop:** "i know my business, i want it better, can you please do it for me because i don't know tech."

---

## system architecture

### event-driven pipeline

all agents communicate through a shared event bus (redis streams via bullmq). each agent publishes and subscribes to typed events. this naturally handles the two timing modes — real-time during the call and async batch processing after.

### phases

**phase 1: live call (autonomous)**
- slushie team member runs discovery call with the client
- listener agent transcribes in real time via websocket → deepgram
- listener agent streams coaching suggestions to team member's dashboard
- client receives slushie-branded tracker link via sms immediately after call ends
- events: `transcript.chunk`, `coaching.suggestion`, `call.ended`

**phase 2: analysis (autonomous)**
- triggered by `call.ended`
- analyst agent processes full transcript
- identifies workflow gaps, estimates monetary impact
- produces typed build spec (json schema) for the builder
- events: `analysis.complete`, `build.spec.ready` (v1)

**phase 3: initial build (autonomous)**
- triggered by `build.spec.ready`
- builder agent generates functional web prototype with simulated integrations and guided walkthrough overlay
- consults analyst agent on design ambiguities via event loop (max 15 rounds)
- events: `build.design.question`, `build.design.answer`, `prototype.ready` (v1)

**phase 4: gap resolution — 2 cycles (autonomous)**
- cycle 1: reviewer analyzes prototype v1 → gap report v1 → analyst updates spec v2 → builder patches → prototype v2
- cycle 2: reviewer analyzes prototype v2 → gap report v2 → analyst updates spec v3 → builder patches → prototype v3 (final)
- events: `review.complete` (v1, v2), `build.spec.updated` (v2, v3), `prototype.patched` (v2, v3), `resolution.complete`

**phase 5: final review (autonomous)**
- reviewer produces final gap report on prototype v3
- only contains genuinely unresolvable items — hard tradeoffs and phase 2 deferrals
- events: `final.review.complete`, `internal.preview.ready`

**phase 6: approval + delivery (human gate)**
- first human checkpoint in the pipeline
- slushie team member reviews prototype v3 + final gap report in internal preview
- on approval, client tracker updates and prototype link goes live
- events: `team.approved`, `client.notified`, `tracker.complete`

**phase 7: postmortem (human gate)**
- slushie employee reviews agent performance across all versions and gap reports
- postmortem agent ingests feedback, identifies patterns, and generates versioned skill/prompt updates
- events: `postmortem.complete`, `skills.updated`

### builder ↔ analyst consultation loop

during phase 3, when the builder hits an ambiguous design decision, it publishes a `build.design.question` event. the analyst subscribes, resolves it using original transcript context, and publishes `build.design.answer`. the builder continues.

- capped at 15 rounds per build
- after cap, builder uses best judgment and flags decisions for the reviewer
- prevents infinite loops while allowing meaningful design collaboration

### authentication + security

**team dashboard:** nextauth with google oauth. all slushie team members have `@slushie.agency` google accounts. role-based access: `team_member` (run calls, review previews), `admin` (postmortems, skill management).

**client tracker + prototype links:** unguessable slugs (nanoid, 21 chars). no login required — security through obscurity of the url. links are single-use tokens that expire 30 days after delivery. tracker urls: `slushie.agency/track/[nanoid]`. prototype urls: `app.slushie.agency/preview/[nanoid]`.

**api routes:** all internal api routes require valid session token. agent-to-agent communication happens via bullmq (redis auth), never via public http.

### error handling + failure strategy

**bullmq retry policy:** all agent jobs retry 3 times with exponential backoff (1s, 10s, 60s). after 3 failures, the job moves to a dead letter queue and the team is notified via the dashboard.

**pipeline stall detection:** if any phase exceeds its timeout (listener: call duration + 5min, analyst: 15min, builder: 45min, reviewer: 10min, gap resolution cycle: 60min), the pipeline is marked as stalled. team member is notified. client tracker shows "taking a little longer than usual — we'll text you when it's ready."

**external service failures:**
- deepgram websocket drops mid-call: automatic reconnect with 3 retries. if reconnect fails, fall back to recording audio and transcribing post-call via batch api. coaching pauses during fallback.
- anthropic api failure: bullmq retry handles transient errors. if all retries fail, job goes to dlq and team is alerted.
- twilio sms failure: retry 3 times over 5 minutes. if all fail, log the failure and surface it in the dashboard so team member can manually share the link.

**dead letter queue dashboard:** all dlq items visible in the team dashboard under a "stalled builds" section with retry/cancel actions.

### cost model

**estimated token usage per pipeline run (single call):**
- listener agent (sonnet): ~50k tokens (coaching across a 30-min call, batched every 30 seconds)
- analyst agent (opus): ~30k tokens (transcript analysis + spec generation)
- builder agent (opus): ~150k tokens (initial build) + ~60k tokens per patch (x2 patches = ~120k)
- builder ↔ analyst consultation: ~30k tokens (15 rounds worst case)
- reviewer agent (sonnet): ~20k tokens per review (x3 reviews = ~60k)
- postmortem agent (opus): ~40k tokens

**total per pipeline run:** ~480k tokens (~$15-25 depending on input/output ratio)

**rate limiting:** max 10 concurrent pipeline runs. max 50 pipeline runs per day. per-agent token budget caps enforced at the bullmq worker level — if an agent exceeds 2x its estimated budget, the job is paused and flagged for review.

### service architecture

**monorepo structure (turborepo):**
- `apps/web` — next.js app (team dashboard + client pages)
- `apps/worker` — node.js bullmq workers (all 5 agents run as workers)
- `packages/agents` — agent logic (prompt templates, structured output schemas, tool definitions)
- `packages/db` — prisma schema + client
- `packages/events` — typed event definitions shared between web and worker
- `packages/ui` — slushie component library (shadcn/ui customized with brand)
- `packages/prototype-kit` — component library and templates for generated prototypes

**deployment topology:**
- vercel: `apps/web` (frontend + api routes for sse, auth)
- railway: `apps/worker` (long-running bullmq workers), redis, postgresql
- s3: prototype code bundles
- each service communicates only through redis (event bus) and postgres (shared state)

---

## agent designs

### 1. listener agent

**purpose:** real-time transcription + live coaching during the call

**input:**
- live audio stream from call (via websocket)
- client context if available (industry, business type)

**output:**
- streaming transcript chunks
- coaching suggestions to team member dashboard (via sse)
- final consolidated transcript on call end

**how it works:** audio streams via websocket to deepgram's streaming api for transcription. transcript chunks are published to the event bus. a claude sonnet instance monitors the running transcript and generates coaching suggestions — "ask about their invoicing process" or "there's a gap here, dig deeper on scheduling." suggestions stream to the team member's dashboard in real time via server-sent events.

**target latency:** coaching suggestions should appear within 5 seconds of the relevant spoken content. achieved by batching transcript chunks every 2-3 sentences (not every word) and streaming sonnet responses.

**model:** claude sonnet (speed matters for real-time coaching)

### 2. analyst agent

**purpose:** workflow gap analysis + build spec generation

**input:**
- full call transcript
- coaching suggestions generated during call
- client context (industry, size, tools mentioned)

**output:**
- workflow map — what the client does today
- gap analysis — where money/time is lost
- monetary impact estimates
- build spec — exactly what prototype to create (typed json schema)
- anticipated integrations list (for simulated accounts)

**how it works:** claude opus processes the full transcript with a structured prompt that extracts workflows, identifies inefficiencies, and estimates monetary impact. outputs a typed build spec (json schema) the builder consumes directly. the spec includes ui requirements, data models, simulated integration endpoints, and walkthrough steps. also available during phase 3 to answer builder design questions (up to 15 rounds) and during phase 4 to update specs based on gap reports.

**model:** claude opus (complex reasoning for gap analysis and spec generation)

### 3. builder agent

**purpose:** functional prototype generation with guided walkthrough

**input:**
- build spec from analyst (json schema)
- slushie brand kit + component library
- design answers from analyst (up to 15 rounds)

**output:**
- functional web app (next.js/react)
- simulated integration endpoints (mock apis with realistic data)
- guided walkthrough overlay (auto-generated from spec steps)
- progress events for client tracker
- decision log — choices made + flagged ambiguities

**how it works:** the builder uses a `prototype-kit` package — a pre-built library of react components (dashboard layouts, forms, tables, charts, nav bars, walkthrough overlay) styled to slushie brand standards. the builder agent does not generate code from scratch. instead, it composes pages from the kit by producing a json manifest that declares which components to use, what data to show, and how pages connect. a renderer reads this manifest and assembles the prototype.

**prototype manifest structure:**
```
{
  pages: [{ route, layout, components: [{ type, props, data }] }],
  walkthrough: [{ target_component, step, text }],
  mock_endpoints: [{ path, method, response_data }],
  simulated_integrations: [{ name, type, mock_account_config }]
}
```

**deployment:** the renderer produces a static next.js export. the export is uploaded to s3 and served via vercel's static hosting at `app.slushie.agency/preview/[nanoid]`. each prototype is an independent static deployment — no shared runtime, no server-side code. this is cheap (~$0 marginal cost per prototype on vercel) and secure (no code execution, just static assets + client-side js calling mock endpoints).

**prototype scope:** typical prototypes are 3-6 pages. the kit constrains what can be built to a known set of patterns: dashboards, crud forms, list/detail views, scheduling calendars, invoice tables, and simple workflows. this constraint is a feature — it keeps build times under 45 minutes and ensures consistent quality.

**model:** claude opus (complex reasoning for component composition and data modeling)

### 4. reviewer agent

**purpose:** transcript vs. prototype comparison + gap report

**input:**
- original call transcript
- analyst's build spec (current version)
- builder's decision log
- prototype json manifest (structured component/data declaration)

**output:**
- gap report — what was requested vs. what was built
- reasons for each gap (spec limitation, ambiguity, complexity)
- tradeoff explanations
- suggested revisions for next cycle or phase 2
- coverage score (0-100)

**how it works:** the reviewer receives the prototype's json manifest (not the deployed url) along with the transcript and build spec. it compares the manifest's pages, components, and data against what the client described in the call. this is a structured comparison — manifest components vs. transcript requirements — not a visual evaluation. produces a structured internal report with gap categorization (missed, simplified, deferred to phase 2), reasons, and actionable revision suggestions. runs 3 times total — once per gap resolution cycle, plus the final review.

**coverage score rubric:**
- 90-100: all explicitly requested features present and functional
- 80-89: core workflow fully covered, minor features simplified or approximated
- 70-79: core workflow covered with notable simplifications
- 60-69: core workflow partially covered, significant gaps
- below 60: major requirements missing — triggers one extra resolution cycle (max 1 extra, so 3 total max) before human review. if still below 60 after the extra cycle, escalate to human review with a warning flag

**model:** claude sonnet (speed for review iteration cycles)

### 5. postmortem agent

**purpose:** agent performance review + skill improvement loop

**input:**
- all events from the entire pipeline
- reviewer's gap reports (all versions) + quality scores
- slushie employee's written feedback on each agent
- historical postmortem data (trends across builds)

**output:**
- per-agent performance assessment
- specific prompt/skill modifications
- updated agent configurations (versioned)
- trend reports (are agents improving over time?)

**how it works:** after a slushie employee submits their review, the postmortem agent cross-references it with the full event log and all reviewer reports. identifies patterns — e.g., "builder consistently struggles with scheduling uis" or "analyst underestimates complexity of multi-step workflows." generates concrete prompt modifications and skill updates. all changes are versioned so they can be rolled back if performance degrades.

**model:** claude opus (pattern recognition across historical data)

---

## client experience

### 1. the text message

sent immediately after the call ends. branded, warm, no jargon.

> hey! thanks for chatting with us today. we're blending your custom tool right now. track the progress here:
>
> slushie.agency/track/[slug]

### 2. the progress tracker (domino's style)

live progress page at `slushie.agency/track/[slug]`. updates in real time as agents complete work.

**steps:**
1. call complete — "we heard what you need."
2. analyzing your workflow — "finding the gaps that cost you money."
3. building your prototype — "pouring the ingredients together."
4. quality check — "making sure everything blends right."
5. ready to serve — "your tool is live. take a sip."

copy uses slushie's cold/blending metaphors throughout. updates driven by `tracker.update` events from the pipeline.

### 3. the prototype + walkthrough

functional web app at `app.slushie.agency/preview/[nanoid]` with a tooltip-based guided overlay.

- each walkthrough step highlights a section of the app
- explains what it does in plain language tied to the client's specific business
- uses simulated data that feels real (e.g., realistic job names, dollar amounts, client names)
- walkthrough steps auto-generated from the build spec

---

## internal team experience

### 1. live call dashboard

split-view during the call:
- **left panel:** live transcript with speaker labels and real-time highlighting
- **right panel:** ai coaching cards that slide in as gaps are detected
- **top bar:** live badge with call duration, client name

coaching card types:
- "dig deeper" — the listener spotted a potential gap, ask for specifics
- "gap spotted" — confirmed monetary gap with estimated impact
- "suggested" — general discovery question to explore

### 2. internal preview + gap report

after the 2 gap resolution cycles complete:
- **left panel:** final gap report with coverage score, categorized gaps (missed/simplified/deferred), reasons for each, tradeoff explanations
- **right panel:** embedded prototype preview with builder's flagged decisions
- **action bar:** "approve and deliver" / "request revisions"

### 3. postmortem review

after delivery:
- per-agent scorecards with auto-generated performance summaries
- text areas for employee feedback on each agent
- postmortem agent surfaces pattern-based improvement suggestions
- "submit postmortem" triggers the skill update loop

---

## tech stack

### frontend
- **next.js (latest stable)** — team dashboard + client-facing pages (tracker, prototypes)
- **typescript** — type safety across the entire codebase
- **tailwind css + shadcn/ui** — matches slushie design system

### backend
- **node.js + typescript** — api routes and agent orchestration
- **bullmq + redis** — event bus. reliable job queues with retry, delay, and priority
- **prisma + postgresql** — structured data (clients, calls, specs, reports)
- **s3** — prototype code bundles and assets

### ai
- **anthropic sdk** — all agent interactions
- **claude opus** — analyst, builder, postmortem (complex reasoning)
- **claude sonnet** — listener coaching, reviewer (speed)
- **deepgram** — real-time streaming transcription via websocket

### notifications
- **twilio** — sms for client tracker link and completion notification
- **server-sent events** — real-time dashboard updates (coaching, tracker)

### deployment
- **vercel** — next.js frontend hosting
- **railway** — node.js backend, redis, postgresql
- **github actions** — ci/cd pipeline

---

## data model

### entities

**client**
- id, name, industry, phone, business_context

**call**
- id, client_id, transcript, coaching_log, started_at, ended_at

**analysis**
- id, call_id, workflow_map, gaps[], monetary_impact

**build_spec**
- id, analysis_id, version (v1/v2/v3), ui_requirements, data_models, integrations[], walkthrough_steps[]

**prototype**
- id, build_spec_id, version (v1/v2/v3), code_bundle_url, preview_url, walkthrough_steps[], decision_log[]

**gap_report**
- id, prototype_id, version, coverage_score
- gaps[]: `{ type: "missed"|"simplified"|"deferred", feature: string, description: string, reason: string, severity: "high"|"medium"|"low" }`
- tradeoffs[]: `{ decision: string, chose: string, alternative: string, rationale: string }`
- revisions[]: `{ target: "spec"|"prototype", action: string, priority: "high"|"medium"|"low" }`

**pipeline_run**
- id, client_id, call_id, status (running/stalled/completed/cancelled), started_at, completed_at
- the unifying entity — ties call, analysis, build_specs, prototypes, gap_reports, tracker, and postmortem together as one unit of work

**tracker**
- id, pipeline_run_id, slug (nanoid 21 chars), current_step, steps[], notified_at, expires_at

**postmortem**
- id, pipeline_run_id, agent_scores{}, employee_feedback{}, skill_updates[], created_at

**agent_skill**
- id, agent_type, version, prompt_template, config, updated_by_postmortem_id

---

## brand rules (enforced globally)

- brand name always lowercase: "slushie"
- primary color: cherry red #DC2626
- secondary color: berry blue #3B5BDB
- background: arctic white #F8FAFC
- gradient: #FEE2E2 → #EDE9FE → #DBEAFE
- font: inter everywhere
- all ui text lowercase via css
- no emojis anywhere
- tone: confident, casual, short sentences, plain language
- headlines use cold/blending metaphors
- ctas use action-first language
- no corporate stock imagery

---

## scope boundaries

### phase 1 (this build)
- full 5-agent pipeline with event bus
- real-time call transcription + coaching
- autonomous analysis → build → 2-cycle gap resolution
- functional prototype generation with simulated integrations
- client progress tracker with sms delivery
- internal team dashboard (call, preview, postmortem)
- postmortem feedback loop with versioned skill updates

### phase 2 (future)
- real client system integrations (quickbooks, google calendar, twilio, etc.)
- multi-call support (follow-up calls that refine the prototype)
- client self-service portal
- billing and subscription management
- analytics dashboard (conversion rates, time-to-delivery, agent improvement trends)

---

## data retention + privacy

- call transcripts retained for 12 months, then archived to cold storage
- prototype deployments expire 30 days after delivery (configurable per client)
- clients can request deletion of all their data via the slushie team (manual process in phase 1, self-service in phase 2)
- transcripts and build specs are sent to anthropic's api (claude) and deepgram for processing — no other third parties receive client data
- all data at rest encrypted via postgresql and s3 default encryption
- all data in transit encrypted via tls
- call recording consent: team member verbally confirms recording at call start. consent noted in call record
- static prototype exports are self-contained (all assets bundled) — no dependency on shared cdn or live component library

---

## observability

- structured json logging across all services (pino)
- per-agent metrics: token usage, latency, success/failure rate
- pipeline-level metrics: time-to-delivery, coverage score trends, stall rate
- railway built-in logging for phase 1; datadog or axiom for phase 2
- all bullmq events logged with correlation id (pipeline_run_id) for end-to-end tracing
