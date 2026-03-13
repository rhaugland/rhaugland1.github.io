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

**how it works:** claude opus generates a deployable web prototype using a slushie component library and template system. simulated integrations use mock api endpoints that return realistic data based on the client's business context. the walkthrough overlay is auto-generated from the build spec steps. each prototype is deployed to a unique url (e.g., `app.slushie.agency/preview/[client-id]`). publishes progress events so the client tracker updates in real time.

**model:** claude opus (code generation requires deep reasoning)

### 4. reviewer agent

**purpose:** transcript vs. prototype comparison + gap report

**input:**
- original call transcript
- analyst's build spec (current version)
- builder's decision log
- deployed prototype url

**output:**
- gap report — what was requested vs. what was built
- reasons for each gap (spec limitation, ambiguity, complexity)
- tradeoff explanations
- suggested revisions for next cycle or phase 2
- coverage score (0-100)

**how it works:** claude sonnet compares the transcript against the build spec and final prototype. produces a structured internal report with gap categorization (missed, simplified, deferred to phase 2), reasons, and actionable revision suggestions. includes a coverage score that the postmortem agent tracks over time. runs 3 times total — once per gap resolution cycle, plus the final review.

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

functional web app at `app.slushie.agency/preview/[client-id]` with a tooltip-based guided overlay.

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
- **next.js 14** — team dashboard + client-facing pages (tracker, prototypes)
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
- id, prototype_id, version, gaps[] (each: type, description, reason), coverage_score, tradeoffs[], revisions[]

**tracker**
- id, client_id, slug, current_step, steps[], notified_at

**postmortem**
- id, call_id, agent_scores{}, employee_feedback{}, skill_updates[], created_at

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
