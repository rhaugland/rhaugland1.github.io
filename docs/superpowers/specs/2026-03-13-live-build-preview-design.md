# live build preview — design spec

**date:** 2026-03-13
**status:** draft
**owner:** ryan haugland

---

## overview

add a live build preview to the call page so the team member can watch the prototype being built in real time during the call, send suggestions to the builder agent via chat, and pause/resume the build. this changes the pipeline from "build after call ends" to "build while the call is happening."

---

## pipeline architecture: incremental build

### current flow

call ends → analyst processes full transcript → builder generates prototype → reviewer → gap resolution

### new flow

1. call starts. transcript chunks accumulate via browser speech recognition.
2. after 5-minute warm-up, the orchestrator dispatches the analyst with a transcript snapshot. analyst produces build spec v1 and publishes `analysis.complete` + `build.spec.ready` (v1).
3. builder starts building from spec v1. publishes `prototype.progress` events as it works and `prototype.ready` (v1) when the first renderable version is done.
4. every 5 minutes after that, the orchestrator re-dispatches the analyst with the full transcript so far. if the new analysis is materially different, analyst publishes `analysis.complete` + `build.spec.updated` (not `build.spec.ready` — that's reserved for the initial spec). builder patches the prototype and publishes `prototype.patched`.
5. when the call ends, one final analyst pass runs with the complete transcript. builder does a final patch. then the normal reviewer/gap-resolution loop kicks in as before.
6. team member chat messages are stored as "team directives" on the pipeline run. each analyst re-run and builder session includes them as context.

### event reuse clarification

this feature reuses several existing events in a new context (during the call instead of post-call):

- **`analysis.complete`** — published after each incremental analyst run during the call (not just post-call). same schema, same semantics.
- **`build.spec.ready`** — published only once, for the initial spec v1 during the call. triggers the builder's first build (not a patch).
- **`build.spec.updated`** — published for each subsequent analyst re-run that produces material changes. triggers builder patching (same as gap-resolution patching). this avoids semantic overloading of `build.spec.ready`.
- **`prototype.ready`** — published when the builder completes the initial prototype v1. includes `previewUrl`.
- **`prototype.patched`** — published when the builder patches the prototype from an updated spec. same event as gap-resolution patching. the panel caches the `previewUrl` from the initial `prototype.ready` event and reuses it for iframe reloads on `prototype.patched` (since the URL doesn't change, only the content at that URL).

### warm-up & re-run timing

- **warm-up trigger:** 5 minutes of transcript accumulation (~10 coaching cycles). the orchestrator dispatches the first analyst run with a transcript snapshot.
- **re-run cadence:** every 5 minutes after the first run. the orchestrator checks: has it been 5+ minutes since the last analyst run AND has the transcript grown by at least 20% in character count compared to the `transcriptSnapshot` stored at the time of the last analyst run? if both conditions are met, a new analyst run is triggered.
- **material change detection:** the analyst compares its new output against the previous spec. if the gap count, page count, or integration list changed, it publishes `build.spec.updated` (next version). if the changes are trivial (just wording), it skips publishing and the builder doesn't re-run.

### pause/resume

- a `buildPaused` boolean flag on the PipelineRun record (default false).
- **pause:** current claude code session finishes its current task. no new analyst or builder jobs are dispatched until resumed. activity log shows "build paused."
- **resume:** orchestrator runs a catch-up check: if a re-run was due during the pause (5+ minutes elapsed and transcript grew 20%+), it dispatches the analyst immediately with the current transcript. if there's a pending spec update that the builder hasn't processed, it dispatches the builder. activity log shows "build resumed."
- **edge case — pause + call end:** the final analyst pass still runs (call end overrides pause for analysis). the builder stays paused until explicitly resumed.
- **edge case — messages while paused:** messages accumulate in `teamDirectives` and get processed on resume.
- **edge case — skipped re-runs during pause:** re-runs are not queued individually. on resume, one catch-up analyst run happens with the current transcript, regardless of how many 5-minute windows were missed.

---

## new events

### `build.message`

team member sends a suggestion to the builder.

```typescript
interface BuildMessageEvent extends BaseEvent {
  type: "build.message";
  data: {
    text: string;
    sentBy: string;
  };
}
```

### `build.paused`

build pipeline paused by team member.

```typescript
interface BuildPausedEvent extends BaseEvent {
  type: "build.paused";
  data: {
    pausedBy: string;
  };
}
```

### `build.resumed`

build pipeline resumed by team member.

```typescript
interface BuildResumedEvent extends BaseEvent {
  type: "build.resumed";
  data: {
    resumedBy: string;
  };
}
```

---

## new database fields

on the `PipelineRun` model:

```prisma
buildPaused         Boolean   @default(false)
teamDirectives      Json?     // array of { text: string, timestamp: number, sentBy: string }
lastAnalystRunAt    DateTime?
transcriptSnapshot  String?   @db.Text
```

---

## new api routes

### POST `/api/calls/build/message`

- **auth:** requires valid session
- **body:** `{ pipelineRunId: string, text: string }`
- **action:** appends `{ text, timestamp: Date.now(), sentBy: session.user.email }` to `PipelineRun.teamDirectives` json array. publishes `build.message` event via redis.
- **response:** `{ ok: true }`

### POST `/api/calls/build/pause`

- **auth:** requires valid session
- **body:** `{ pipelineRunId: string }`
- **action:** sets `PipelineRun.buildPaused = true`. publishes `build.paused` event via redis.
- **response:** `{ ok: true }`

### POST `/api/calls/build/resume`

- **auth:** requires valid session
- **body:** `{ pipelineRunId: string }`
- **action:** sets `PipelineRun.buildPaused = false`. publishes `build.resumed` event via redis. orchestrator runs catch-up check and dispatches pending work.
- **response:** `{ ok: true }`

---

## ui: build preview panel

a third draggable panel on the live call page, using the existing `DraggablePanel` component. positioned to the right of the coaching panel by default.

### panel layout

**default size:** 500w x 600h, positioned at x:972, y:80. if the viewport is narrower than 1500px, the panel stacks below the coaching panel instead (x:528, y:600).

**top section — activity log (~30% height):**
- scrolling feed of builder activity
- entries show what the builder is doing: "analyzing transcript...", "building invoice dashboard...", "adding calendar view...", "wiring mock data...", "prototype v1 ready"
- each entry has a timestamp and status icon (spinner for in-progress, checkmark for done)
- sourced from `prototype.progress` events (which have `phase` and `percentComplete` fields)
- team messages appear as distinct chat bubbles (different background color, shows sender name)
- `build.paused` and `build.resumed` events appear as system entries

**bottom section — live iframe (~70% height):**
- shows the prototype preview URL once the first renderable version is ready (`prototype.ready` event includes `previewUrl`)
- the panel caches this `previewUrl` and reuses it for subsequent reloads
- before any prototype is ready, shows placeholder text: "build will appear here as it takes shape..."
- iframe reloads when a new `prototype.ready` or `prototype.patched` event arrives (using the cached previewUrl)
- small refresh button in the corner to manually reload the iframe

### controls bar (below the panel body, inside the panel)

- **chat input:** text box + send button for typing suggestions to the builder
- **pause/resume button:** next to the chat input. toggles between "pause" and "resume" states
- when paused, button shows "resume" and activity log shows a "build paused" system entry

### event handling

the panel listens to the same SSE stream (`/api/events/{pipelineRunId}`) that the transcript and coaching panels use. it filters for these event types:

- `prototype.progress` → add activity log entry with phase and percent
- `prototype.ready` → add "prototype vN ready" log entry + cache previewUrl + load iframe
- `prototype.patched` → add "prototype updated" log entry + reload iframe using cached previewUrl
- `build.message` → add team message bubble to activity log
- `build.paused` → add "build paused" system entry, switch button to "resume"
- `build.resumed` → add "build resumed" system entry, switch button to "pause"
- `build.spec.ready` → add "build spec v1 ready" system entry
- `build.spec.updated` → add "build spec updated vN" system entry
- `analysis.complete` → add "analysis complete" system entry

### state persistence

if the team member navigates away from the call page and returns, the activity log starts fresh (events are not replayed from history). the iframe will be empty until the next `prototype.ready` or `prototype.patched` event arrives, at which point it reloads. this is acceptable because the prototype URL is stable and the team member can manually refresh the iframe.

---

## orchestrator changes

the pipeline orchestrator (`apps/worker/src/agents/pipeline.ts`) needs these changes:

### incremental analyst dispatch

- track warm-up: after receiving transcript chunks for 5 minutes, dispatch first analyst run with transcript snapshot
- track re-runs: every 5 minutes after that, if transcript has grown by 20%+ in character count compared to `transcriptSnapshot`, dispatch another analyst run
- after each analyst run, update `lastAnalystRunAt` and `transcriptSnapshot` on the PipelineRun
- the analyst publishes `analysis.complete` after each incremental run (same event, same schema as post-call)
- on `call.ended`: dispatch final analyst run with complete transcript regardless of timing or growth threshold

### pause-aware job dispatch

- before dispatching any builder or analyst job (except the final post-call analyst pass), check `PipelineRun.buildPaused`
- if paused, do not queue the job. on resume, run a catch-up check: dispatch analyst if 5+ minutes have passed since last run, dispatch builder if there's an unprocessed spec update

### team directives injection

- when dispatching analyst or builder jobs, include the full `PipelineRun.teamDirectives` array in the context passed to the claude code session
- directives appear in the prompt as "team member feedback" with timestamps
- the full array is passed each time (not filtered by "processed" status) — the prompt instructs the agent to treat all directives as cumulative context, not individual commands to execute

### error handling for incremental runs

- if a mid-call analyst run fails, it retries up to 3 times (same bullmq retry policy as post-call). a failed analyst run does not block the next scheduled re-run — the orchestrator continues the 5-minute cadence.
- if the builder fails mid-call, it retries up to 3 times. a failed build does not block subsequent patches from future spec updates.
- mid-call runs use shorter timeouts than post-call: analyst 5 minutes (vs 15), builder 15 minutes (vs 45). the incremental runs process less data and should complete faster.

---

## scope boundaries

### in scope
- incremental analyst + builder pipeline during the call
- build preview panel with activity log and iframe
- chat input for team directives
- pause/resume controls
- 3 new api routes, 3 new events, 4 new db fields
- reuse of 5 existing events (`analysis.complete`, `build.spec.ready`, `build.spec.updated`, `prototype.ready`, `prototype.patched`) in the new mid-call context

### out of scope
- quick reaction buttons on the preview (chat only)
- killing a running claude code session mid-task (pause waits for current task to finish)
- reviewer/gap-resolution during the call (still runs after call ends)
- changes to the tracker or client-facing preview pages
- activity log persistence across page navigations
