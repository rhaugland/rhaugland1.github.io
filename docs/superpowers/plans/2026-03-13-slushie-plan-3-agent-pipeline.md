# slushie agent pipeline + prototype kit implementation plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build the 4-agent pipeline (analyst, builder, reviewer, gap resolution orchestrator) with builder-analyst consultation loop, prototype-kit component library, and manifest renderer. after this plan, a `call.ended` event triggers fully autonomous analysis, prototype generation, review, and 2-cycle gap resolution.

**Architecture:** each agent is a bullmq worker that spawns a claude code cli session via `claude -p`. agents communicate through typed events on the redis bus. the builder produces a json manifest consumed by a renderer that assembles a static next.js export. the pipeline orchestrator coordinates phases 2-5 from the spec in sequence.

**Tech Stack:** typescript, bullmq, claude code cli, next.js, react, tailwind css, zod, vitest

**Spec:** `docs/superpowers/specs/2026-03-13-slushie-platform-design.md`

**Depends on:** Plan 1 (monorepo, database, event bus, claude.ts wrapper, publish.ts helper, queues, prisma schema)

**Produces:** analyst agent, builder agent, reviewer agent, builder-analyst consultation loop (max 15 rounds), gap resolution orchestrator (2 cycles), prototype-kit component library (6 components), manifest renderer, pipeline orchestrator

---

## Chunk 1: Agent Prompts + Analyst Agent + Builder Agent

### Task 1: Create agent prompt templates

**Files:**
- Create: `packages/agents/src/prompts/analyst.ts`
- Create: `packages/agents/src/prompts/builder.ts`
- Create: `packages/agents/src/prompts/reviewer.ts`
- Create: `packages/agents/src/prompts/consultation.ts`
- Create: `packages/agents/src/index.ts`

- [ ] **Step 1: create agents package structure**

```bash
mkdir -p packages/agents/src/prompts
```

- [ ] **Step 2: create analyst prompt**

Create `packages/agents/src/prompts/analyst.ts`:

```typescript
export function analystPrompt(context: {
  transcriptPath: string;
  coachingLogPath: string;
  clientContext: string;
  outputPath: string;
}): string {
  return `you are the slushie analyst agent. your job is to read a discovery call transcript and produce a typed build spec for the builder agent.

## input files
- transcript: ${context.transcriptPath}
- coaching log: ${context.coachingLogPath}
- client context: ${context.clientContext}

## instructions

1. read the transcript file completely.
2. read the coaching log file for gap hints identified during the call.
3. identify the client's current workflow — what they do today, step by step.
4. identify monetary gaps — where money or time is lost due to manual processes, missed opportunities, or inefficiencies.
5. estimate monetary impact for each gap (conservative monthly estimate).
6. design a prototype that closes the top 3-5 gaps. prototypes are 3-6 pages.
7. write the build spec as a json file to: ${context.outputPath}

## build spec schema

the output file must contain valid json matching this structure exactly:

{
  "clientName": "string — the client's business name",
  "industry": "string — e.g. plumbing, cleaning, consulting",
  "workflowMap": [
    {
      "step": "string — what the client does",
      "tools": "string — current tools used (or 'manual')",
      "painPoint": "string | null — what's broken about this step"
    }
  ],
  "gaps": [
    {
      "id": "gap-1",
      "description": "string — what's missing or broken",
      "monthlyImpact": "string — dollar estimate, e.g. '$2,400/mo'",
      "severity": "high | medium | low",
      "solutionApproach": "string — how the prototype addresses this"
    }
  ],
  "totalMonthlyImpact": "string — sum of all gap impacts",
  "prototype": {
    "name": "string — short name for the tool, e.g. 'job tracker pro'",
    "description": "string — one sentence describing what it does",
    "pages": [
      {
        "route": "string — e.g. '/' or '/jobs' or '/invoices'",
        "title": "string — page title",
        "layout": "dashboard | form | list-detail | calendar | table",
        "purpose": "string — what this page does for the client",
        "components": [
          {
            "type": "stat-card | data-table | form | chart | nav-bar | walkthrough-overlay",
            "props": {},
            "description": "string — what this component shows"
          }
        ]
      }
    ],
    "walkthroughSteps": [
      {
        "targetPage": "string — route of the page",
        "targetComponent": "string — component type being highlighted",
        "stepNumber": 1,
        "title": "string — short title",
        "text": "string — plain language explanation tied to their business"
      }
    ],
    "mockEndpoints": [
      {
        "path": "string — e.g. '/api/jobs'",
        "method": "GET | POST | PUT | DELETE",
        "description": "string — what this endpoint returns",
        "sampleResponse": {}
      }
    ],
    "simulatedIntegrations": [
      {
        "name": "string — e.g. 'quickbooks', 'google calendar'",
        "type": "accounting | calendar | crm | email | sms | payment",
        "mockBehavior": "string — what the simulation does"
      }
    ]
  }
}

## rules
- prototype must be 3-6 pages. no more.
- every page must have a clear purpose tied to a gap.
- use plain language in walkthrough steps — the client is not technical.
- mock endpoints must return realistic sample data with realistic names, dollar amounts, and dates.
- simulated integrations should feel real but clearly state they are simulated in the walkthrough.
- do not include any features the client did not discuss or imply.
- be conservative on monetary estimates — underestimate rather than overestimate.

write the json file to ${context.outputPath} and nothing else.`;
}

export function analystConsultationAnswerPrompt(context: {
  transcriptPath: string;
  currentSpecPath: string;
  question: string;
  roundNumber: number;
}): string {
  return `you are the slushie analyst agent answering a design question from the builder agent.

## context
- original transcript: ${context.transcriptPath}
- current build spec: ${context.currentSpecPath}
- builder's question: ${context.question}
- consultation round: ${context.roundNumber} of 15

## instructions

1. read the transcript to find relevant context for the builder's question.
2. read the current build spec to understand what's already been decided.
3. answer the question concisely based on what the client actually said or implied.
4. if the transcript doesn't contain enough information, say so and recommend the builder use their best judgment.

respond with a json object:

{
  "answer": "string — your answer to the builder's question",
  "transcriptEvidence": "string — relevant quote or summary from the transcript",
  "confidence": "high | medium | low",
  "specUpdateNeeded": false
}

if answering the question requires updating the build spec, set specUpdateNeeded to true and include:

{
  "answer": "...",
  "transcriptEvidence": "...",
  "confidence": "...",
  "specUpdateNeeded": true,
  "specPatch": {
    "field": "string — dot-notation path in the spec to update",
    "value": "the new value"
  }
}

write only the json response to stdout.`;
}

export function analystSpecUpdatePrompt(context: {
  currentSpecPath: string;
  gapReportPath: string;
  outputPath: string;
  version: number;
}): string {
  return `you are the slushie analyst agent updating a build spec based on a reviewer's gap report.

## input files
- current build spec: ${context.currentSpecPath}
- gap report: ${context.gapReportPath}

## instructions

1. read the current build spec.
2. read the gap report — focus on revisions with priority "high" and "medium".
3. update the spec to address the identified gaps.
4. do not remove features that were already working.
5. do not add features the client never discussed.
6. keep the prototype at 3-6 pages.

write the updated spec (same json schema as the original) to: ${context.outputPath}

this is version ${context.version} of the spec.`;
}
```

- [ ] **Step 3: create builder prompt**

Create `packages/agents/src/prompts/builder.ts`:

```typescript
export function builderPrompt(context: {
  buildSpecPath: string;
  outputManifestPath: string;
  prototypeDir: string;
  version: number;
}): string {
  return `you are the slushie builder agent. your job is to read a build spec and produce a prototype manifest that the renderer will use to assemble a static next.js prototype.

## input files
- build spec: ${context.buildSpecPath}

## output
- write the prototype manifest to: ${context.outputManifestPath}

## prototype manifest schema

the manifest must be valid json matching this structure exactly:

{
  "version": ${context.version},
  "pages": [
    {
      "route": "string — e.g. '/' or '/jobs'",
      "title": "string",
      "layout": "dashboard | form | list-detail | calendar | table",
      "components": [
        {
          "type": "stat-card | data-table | form | chart | nav-bar | walkthrough-overlay",
          "id": "string — unique id for this component instance",
          "props": {
            "title": "string",
            "description": "string"
          },
          "data": {}
        }
      ]
    }
  ],
  "walkthrough": [
    {
      "targetComponentId": "string — matches a component id",
      "targetPage": "string — route",
      "step": 1,
      "title": "string",
      "text": "string — plain language, tied to the client's business"
    }
  ],
  "mockEndpoints": [
    {
      "path": "string",
      "method": "GET | POST | PUT | DELETE",
      "responseData": {},
      "delayMs": 200
    }
  ],
  "simulatedIntegrations": [
    {
      "name": "string",
      "type": "string",
      "mockAccountConfig": {
        "connected": true,
        "accountName": "string — realistic name",
        "lastSync": "string — iso date"
      }
    }
  ],
  "decisionLog": [
    {
      "decision": "string — what was decided",
      "reasoning": "string — why",
      "flaggedForReview": false,
      "consultationRound": null
    }
  ]
}

## component data schemas

### stat-card
data: { value: "string", change: "string — e.g. '+12%'", trend: "up | down | flat" }

### data-table
data: { columns: [{ key: "string", label: "string" }], rows: [{}] }

### form
data: { fields: [{ name: "string", label: "string", type: "text | number | email | select | date | textarea", options?: string[], required: boolean }], submitLabel: "string", submitEndpoint: "string" }

### chart
data: { chartType: "bar | line | pie | donut", labels: string[], datasets: [{ label: "string", data: number[], color: "string" }] }

### nav-bar
data: { brand: "string", links: [{ label: "string", href: "string" }] }

### walkthrough-overlay
data: {} (controlled by the walkthrough array in the manifest root)

## rules
- every page in the build spec must appear in the manifest.
- use realistic mock data — real-sounding names, realistic dollar amounts, plausible dates.
- every component must have a unique id (use kebab-case, e.g. "dashboard-revenue-card").
- mock endpoints must return data consistent with the data-table and chart components.
- the nav-bar component should appear on every page with links to all other pages.
- walkthrough steps must cover every page, in order a new user would navigate.
- add decisions to the decisionLog for any ambiguity you resolved yourself.
- flag decisions for review if you're less than 80% confident.
- keep mock endpoint delay at 200ms for realistic feel.
- do not invent features not in the build spec.

write the manifest to ${context.outputManifestPath} and nothing else.`;
}

export function builderDesignQuestionPrompt(context: {
  buildSpecPath: string;
  currentManifestPath: string;
  question: string;
  roundNumber: number;
}): string {
  return `you are the slushie builder agent formulating a design question for the analyst.

you are building a prototype and hit an ambiguity in the spec.

- build spec: ${context.buildSpecPath}
- current manifest progress: ${context.currentManifestPath}
- your question: ${context.question}
- round: ${context.roundNumber} of 15

format your question as a json object:

{
  "question": "string — specific, actionable question",
  "context": "string — what you've built so far and why this is ambiguous",
  "options": ["string — option A", "string — option B"],
  "defaultChoice": "string — what you'd pick if no answer comes"
}

write only the json to stdout.`;
}

export function builderPatchPrompt(context: {
  currentManifestPath: string;
  updatedSpecPath: string;
  gapReportPath: string;
  outputManifestPath: string;
  version: number;
}): string {
  return `you are the slushie builder agent patching an existing prototype based on an updated spec and gap report.

## input files
- current manifest: ${context.currentManifestPath}
- updated build spec: ${context.updatedSpecPath}
- gap report: ${context.gapReportPath}

## instructions

1. read the current manifest.
2. read the updated spec to see what changed.
3. read the gap report to understand what the reviewer found lacking.
4. patch the manifest — fix gaps, update data, add missing components.
5. do not remove components that were already working correctly.
6. update the decisionLog with what you changed and why.

write the patched manifest (same schema) to: ${context.outputManifestPath}

this is version ${context.version} of the prototype.`;
}
```

- [ ] **Step 4: create reviewer prompt**

Create `packages/agents/src/prompts/reviewer.ts`:

```typescript
export function reviewerPrompt(context: {
  transcriptPath: string;
  buildSpecPath: string;
  manifestPath: string;
  decisionLogPath: string;
  outputPath: string;
  reviewVersion: number;
}): string {
  return `you are the slushie reviewer agent. your job is to compare the prototype manifest against the original transcript and build spec, then produce a gap report.

## input files
- original transcript: ${context.transcriptPath}
- build spec: ${context.buildSpecPath}
- prototype manifest: ${context.manifestPath}
- builder decision log: embedded in manifest under "decisionLog"

## instructions

1. read the transcript to understand what the client actually requested.
2. read the build spec to understand what was planned.
3. read the prototype manifest to understand what was built.
4. for every requirement the client mentioned, check if the manifest addresses it.
5. categorize each gap as: missed (not present), simplified (present but reduced), or deferred (intentionally left for later).
6. assign a coverage score using the rubric below.
7. write the gap report to: ${context.outputPath}

## coverage score rubric
- 90-100: all explicitly requested features present and functional
- 80-89: core workflow fully covered, minor features simplified or approximated
- 70-79: core workflow covered with notable simplifications
- 60-69: core workflow partially covered, significant gaps
- below 60: major requirements missing

## gap report schema

{
  "version": ${context.reviewVersion},
  "coverageScore": 85,
  "summary": "string — 2-3 sentence summary of the review",
  "gaps": [
    {
      "type": "missed | simplified | deferred",
      "feature": "string — what was requested",
      "description": "string — details about the gap",
      "reason": "string — why it's missing (spec limitation, ambiguity, complexity)",
      "severity": "high | medium | low",
      "transcriptEvidence": "string — relevant quote from transcript"
    }
  ],
  "tradeoffs": [
    {
      "decision": "string — what was decided",
      "chose": "string — what the builder chose",
      "alternative": "string — what could have been done instead",
      "rationale": "string — why the choice was made"
    }
  ],
  "revisions": [
    {
      "target": "spec | prototype",
      "action": "string — what to change",
      "priority": "high | medium | low",
      "estimatedEffort": "string — small, medium, large"
    }
  ],
  "flaggedDecisions": [
    {
      "decision": "string — from the builder's decision log",
      "reviewerAssessment": "string — was the builder's choice good?"
    }
  ]
}

## rules
- be thorough but fair. the builder had limited context and time constraints.
- only flag genuinely important gaps — don't nitpick.
- the prototype is 3-6 pages. don't penalize for not building a full production app.
- score against what the client explicitly discussed, not what they might theoretically want.
- high-priority revisions should be things that change the client's perception of value.
- low-priority revisions are nice-to-haves that can wait.

write the gap report to ${context.outputPath} and nothing else.`;
}
```

- [ ] **Step 5: create consultation prompt**

Create `packages/agents/src/prompts/consultation.ts`:

```typescript
export { analystConsultationAnswerPrompt } from "./analyst";
export { builderDesignQuestionPrompt } from "./builder";
```

- [ ] **Step 6: create agents package index**

Update `packages/agents/src/index.ts`:

```typescript
export { analystPrompt, analystConsultationAnswerPrompt, analystSpecUpdatePrompt } from "./prompts/analyst";
export { builderPrompt, builderDesignQuestionPrompt, builderPatchPrompt } from "./prompts/builder";
export { reviewerPrompt } from "./prompts/reviewer";
```

- [ ] **Step 7: update packages/agents/package.json with dependencies**

```json
{
  "name": "@slushie/agents",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "devDependencies": {
    "typescript": "^5"
  }
}
```

- [ ] **Step 8: commit**

```bash
git add packages/agents
git commit -m "feat: add agent prompt templates for analyst, builder, reviewer"
```

---

### Task 2: Create analyst agent worker

**Files:**
- Create: `apps/worker/src/agents/analyst.ts`
- Create: `apps/worker/src/agents/workspace.ts`

- [ ] **Step 1: create workspace helper**

This utility creates and manages the working directory for each pipeline run where agents read/write files.

Create `apps/worker/src/agents/workspace.ts`:

```typescript
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/tmp/slushie-workspaces";

export interface PipelineWorkspace {
  root: string;
  transcriptPath: string;
  coachingLogPath: string;
  buildSpecPath: (version: number) => string;
  manifestPath: (version: number) => string;
  gapReportPath: (version: number) => string;
  decisionLogPath: (version: number) => string;
}

export async function createWorkspace(pipelineRunId: string): Promise<PipelineWorkspace> {
  const root = join(WORKSPACE_ROOT, pipelineRunId);
  await mkdir(root, { recursive: true });

  return {
    root,
    transcriptPath: join(root, "transcript.txt"),
    coachingLogPath: join(root, "coaching-log.json"),
    buildSpecPath: (v: number) => join(root, `build-spec-v${v}.json`),
    manifestPath: (v: number) => join(root, `manifest-v${v}.json`),
    gapReportPath: (v: number) => join(root, `gap-report-v${v}.json`),
    decisionLogPath: (v: number) => join(root, `decision-log-v${v}.json`),
  };
}

export async function getWorkspace(pipelineRunId: string): Promise<PipelineWorkspace> {
  const root = join(WORKSPACE_ROOT, pipelineRunId);
  if (!existsSync(root)) {
    return createWorkspace(pipelineRunId);
  }
  return {
    root,
    transcriptPath: join(root, "transcript.txt"),
    coachingLogPath: join(root, "coaching-log.json"),
    buildSpecPath: (v: number) => join(root, `build-spec-v${v}.json`),
    manifestPath: (v: number) => join(root, `manifest-v${v}.json`),
    gapReportPath: (v: number) => join(root, `gap-report-v${v}.json`),
    decisionLogPath: (v: number) => join(root, `decision-log-v${v}.json`),
  };
}

export async function writeWorkspaceFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf-8");
}

export async function readWorkspaceFile(path: string): Promise<string> {
  return readFile(path, "utf-8");
}
```

- [ ] **Step 2: create analyst agent worker**

Create `apps/worker/src/agents/analyst.ts`:

```typescript
import { Worker, Job } from "bullmq";
import { prisma } from "@slushie/db";
import { createEvent, type CallEndedEvent, type SlushieEvent } from "@slushie/events";
import { analystPrompt, analystConsultationAnswerPrompt, analystSpecUpdatePrompt } from "@slushie/agents";
import { invokeClaudeCode } from "../claude";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";
import { getWorkspace, writeWorkspaceFile, readWorkspaceFile } from "./workspace";
import { PHASE_TIMEOUTS } from "../queues";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

export function createAnalystWorker() {
  return new Worker<SlushieEvent>(
    "analyst",
    async (job: Job<SlushieEvent>) => {
      const event = job.data;

      if (event.type === "call.ended") {
        await handleCallEnded(event as CallEndedEvent);
      } else if (event.type === "build.design.question") {
        await handleDesignQuestion(event);
      } else if (event.type === "review.complete") {
        await handleReviewComplete(event);
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    }
  );
}

async function handleCallEnded(event: CallEndedEvent): Promise<void> {
  const log = createAgentLogger("analyst", event.pipelineRunId);
  log.info("analyst agent starting — processing transcript");

  const workspace = await getWorkspace(event.pipelineRunId);

  // load transcript and coaching log from database
  const call = await prisma.call.findUniqueOrThrow({
    where: { id: event.data.callId },
    include: { client: true },
  });

  await writeWorkspaceFile(workspace.transcriptPath, call.transcript ?? "");
  await writeWorkspaceFile(
    workspace.coachingLogPath,
    JSON.stringify(call.coachingLog ?? [], null, 2)
  );

  const clientContext = `industry: ${call.client.industry}, name: ${call.client.name}`;
  const specOutputPath = workspace.buildSpecPath(1);

  const prompt = analystPrompt({
    transcriptPath: workspace.transcriptPath,
    coachingLogPath: workspace.coachingLogPath,
    clientContext,
    outputPath: specOutputPath,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: PHASE_TIMEOUTS.analyst,
    pipelineRunId: event.pipelineRunId,
  });

  log.info({ exitCode: result.exitCode }, "analyst claude code session completed");

  // read and validate the spec file
  const specContent = await readWorkspaceFile(specOutputPath);
  const spec = JSON.parse(specContent);

  // save to database
  const analysis = await prisma.analysis.create({
    data: {
      callId: event.data.callId,
      workflowMap: spec.workflowMap,
      gaps: spec.gaps,
      monetaryImpact: { total: spec.totalMonthlyImpact },
    },
  });

  const buildSpec = await prisma.buildSpec.create({
    data: {
      analysisId: analysis.id,
      version: 1,
      uiRequirements: spec.prototype.pages,
      dataModels: spec.prototype.mockEndpoints,
      integrations: spec.prototype.simulatedIntegrations,
      walkthroughSteps: spec.prototype.walkthroughSteps,
    },
  });

  // publish events
  await publishEvent(
    createEvent("analysis.complete", event.pipelineRunId, {
      analysisId: analysis.id,
      gapCount: spec.gaps.length,
      totalMonetaryImpact: spec.totalMonthlyImpact,
    })
  );

  await publishEvent(
    createEvent("build.spec.ready", event.pipelineRunId, {
      buildSpecId: buildSpec.id,
      version: 1,
      pageCount: spec.prototype.pages.length,
    })
  );

  // update tracker
  await publishEvent(
    createEvent("tracker.update", event.pipelineRunId, {
      step: 2,
      label: "analyzing your workflow",
      subtitle: "finding the gaps that cost you money.",
    })
  );

  log.info({ analysisId: analysis.id, buildSpecId: buildSpec.id }, "analyst complete");
}

async function handleDesignQuestion(event: SlushieEvent): Promise<void> {
  const log = createAgentLogger("analyst", event.pipelineRunId);
  const { question, roundNumber } = event.data as {
    question: string;
    context: string;
    roundNumber: number;
  };

  log.info({ roundNumber }, "analyst answering builder design question");

  const workspace = await getWorkspace(event.pipelineRunId);

  const prompt = analystConsultationAnswerPrompt({
    transcriptPath: workspace.transcriptPath,
    currentSpecPath: workspace.buildSpecPath(1),
    question,
    roundNumber,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: 5 * 60 * 1000, // 5 min per consultation
    pipelineRunId: event.pipelineRunId,
  });

  // parse claude's json response from stdout
  let answer: string;
  try {
    const parsed = JSON.parse(result.output);
    // claude --output-format json wraps in { result: "..." }
    const inner = typeof parsed.result === "string" ? JSON.parse(parsed.result) : parsed;
    answer = inner.answer ?? result.output;
  } catch {
    answer = result.output;
  }

  await publishEvent(
    createEvent("build.design.answer", event.pipelineRunId, {
      answer,
      roundNumber,
    })
  );

  log.info({ roundNumber }, "analyst answered design question");
}

async function handleReviewComplete(event: SlushieEvent): Promise<void> {
  const log = createAgentLogger("analyst", event.pipelineRunId);
  const { version } = event.data as { version: number; gapReportId: string; coverageScore: number; gapCount: number };
  const newVersion = version + 1;

  log.info({ currentVersion: version, newVersion }, "analyst updating spec based on gap report");

  const workspace = await getWorkspace(event.pipelineRunId);

  const prompt = analystSpecUpdatePrompt({
    currentSpecPath: workspace.buildSpecPath(version),
    gapReportPath: workspace.gapReportPath(version),
    outputPath: workspace.buildSpecPath(newVersion),
    version: newVersion,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: PHASE_TIMEOUTS.analyst,
    pipelineRunId: event.pipelineRunId,
  });

  log.info({ exitCode: result.exitCode }, "analyst spec update completed");

  // read updated spec and save to database
  const specContent = await readWorkspaceFile(workspace.buildSpecPath(newVersion));
  const spec = JSON.parse(specContent);

  // find the analysis for this pipeline run
  const pipelineRun = await prisma.pipelineRun.findUniqueOrThrow({
    where: { id: event.pipelineRunId },
    include: { call: { include: { analysis: true } } },
  });

  const analysisId = pipelineRun.call.analysis?.id;
  if (!analysisId) throw new Error("no analysis found for pipeline run");

  const buildSpec = await prisma.buildSpec.create({
    data: {
      analysisId,
      version: newVersion,
      uiRequirements: spec.prototype?.pages ?? spec.pages,
      dataModels: spec.prototype?.mockEndpoints ?? spec.mockEndpoints,
      integrations: spec.prototype?.simulatedIntegrations ?? spec.simulatedIntegrations,
      walkthroughSteps: spec.prototype?.walkthroughSteps ?? spec.walkthroughSteps,
    },
  });

  await publishEvent(
    createEvent("build.spec.updated", event.pipelineRunId, {
      buildSpecId: buildSpec.id,
      version: newVersion,
      changesFromGapReport: `updated from gap report v${version}`,
    })
  );

  log.info({ buildSpecId: buildSpec.id, version: newVersion }, "analyst spec update published");
}
```

- [ ] **Step 3: commit**

```bash
git add apps/worker/src/agents
git commit -m "feat: add analyst agent worker with consultation and spec update handlers"
```

---

### Task 3: Create builder agent worker

**Files:**
- Create: `apps/worker/src/agents/builder.ts`

- [ ] **Step 1: create builder agent worker**

Create `apps/worker/src/agents/builder.ts`:

```typescript
import { Worker, Job, Queue } from "bullmq";
import { prisma } from "@slushie/db";
import {
  createEvent,
  type BuildSpecReadyEvent,
  type BuildDesignAnswerEvent,
  type BuildSpecUpdatedEvent,
  type SlushieEvent,
} from "@slushie/events";
import { builderPrompt, builderPatchPrompt } from "@slushie/agents";
import { invokeClaudeCode } from "../claude";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";
import { getWorkspace, readWorkspaceFile } from "./workspace";
import { PHASE_TIMEOUTS } from "../queues";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

// track consultation state per pipeline run
const consultationState = new Map<
  string,
  {
    roundNumber: number;
    maxRounds: number;
    pendingAnswer: ((answer: string) => void) | null;
  }
>();

export function createBuilderWorker() {
  return new Worker<SlushieEvent>(
    "builder",
    async (job: Job<SlushieEvent>) => {
      const event = job.data;

      if (event.type === "build.spec.ready") {
        await handleBuildSpecReady(event as BuildSpecReadyEvent);
      } else if (event.type === "build.design.answer") {
        handleDesignAnswer(event as BuildDesignAnswerEvent);
      } else if (event.type === "build.spec.updated") {
        await handleBuildSpecUpdated(event as BuildSpecUpdatedEvent);
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    }
  );
}

async function handleBuildSpecReady(event: BuildSpecReadyEvent): Promise<void> {
  const log = createAgentLogger("builder", event.pipelineRunId);
  log.info({ buildSpecId: event.data.buildSpecId, version: event.data.version }, "builder starting initial build");

  // update tracker
  await publishEvent(
    createEvent("tracker.update", event.pipelineRunId, {
      step: 3,
      label: "building your prototype",
      subtitle: "pouring the ingredients together.",
    })
  );

  // initialize consultation state
  consultationState.set(event.pipelineRunId, {
    roundNumber: 0,
    maxRounds: 15,
    pendingAnswer: null,
  });

  const workspace = await getWorkspace(event.pipelineRunId);
  const version = event.data.version;
  const specPath = workspace.buildSpecPath(version);
  const manifestPath = workspace.manifestPath(version);

  const prompt = builderPrompt({
    buildSpecPath: specPath,
    outputManifestPath: manifestPath,
    prototypeDir: workspace.root,
    version,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: PHASE_TIMEOUTS.builder,
    pipelineRunId: event.pipelineRunId,
  });

  log.info({ exitCode: result.exitCode }, "builder claude code session completed");

  // read the manifest
  const manifestContent = await readWorkspaceFile(manifestPath);
  const manifest = JSON.parse(manifestContent);

  // save to database
  const buildSpec = await prisma.buildSpec.findFirstOrThrow({
    where: { id: event.data.buildSpecId },
  });

  const prototype = await prisma.prototype.create({
    data: {
      buildSpecId: buildSpec.id,
      version,
      manifest,
      decisionLog: manifest.decisionLog ?? [],
    },
  });

  // publish prototype.ready
  await publishEvent(
    createEvent("prototype.ready", event.pipelineRunId, {
      prototypeId: prototype.id,
      version,
      previewUrl: `app.slushie.agency/preview/${event.pipelineRunId}`,
    })
  );

  // cleanup consultation state
  consultationState.delete(event.pipelineRunId);

  log.info({ prototypeId: prototype.id, version }, "builder initial build complete");
}

function handleDesignAnswer(event: BuildDesignAnswerEvent): void {
  const state = consultationState.get(event.pipelineRunId);
  if (state?.pendingAnswer) {
    state.pendingAnswer(event.data.answer);
    state.pendingAnswer = null;
  }
}

async function handleBuildSpecUpdated(event: BuildSpecUpdatedEvent): Promise<void> {
  const log = createAgentLogger("builder", event.pipelineRunId);
  const version = event.data.version;
  log.info({ version }, "builder patching prototype from updated spec");

  const workspace = await getWorkspace(event.pipelineRunId);
  const previousVersion = version - 1;

  const prompt = builderPatchPrompt({
    currentManifestPath: workspace.manifestPath(previousVersion),
    updatedSpecPath: workspace.buildSpecPath(version),
    gapReportPath: workspace.gapReportPath(previousVersion),
    outputManifestPath: workspace.manifestPath(version),
    version,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: PHASE_TIMEOUTS.builder,
    pipelineRunId: event.pipelineRunId,
  });

  log.info({ exitCode: result.exitCode }, "builder patch session completed");

  // read patched manifest
  const manifestContent = await readWorkspaceFile(workspace.manifestPath(version));
  const manifest = JSON.parse(manifestContent);

  // find the build spec for this version
  const pipelineRun = await prisma.pipelineRun.findUniqueOrThrow({
    where: { id: event.pipelineRunId },
    include: { call: { include: { analysis: { include: { buildSpecs: true } } } } },
  });

  const buildSpec = pipelineRun.call.analysis?.buildSpecs.find(
    (s) => s.version === version
  );
  if (!buildSpec) throw new Error(`no build spec found for version ${version}`);

  const prototype = await prisma.prototype.create({
    data: {
      buildSpecId: buildSpec.id,
      version,
      manifest,
      decisionLog: manifest.decisionLog ?? [],
    },
  });

  await publishEvent(
    createEvent("prototype.patched", event.pipelineRunId, {
      prototypeId: prototype.id,
      version,
      patchSummary: `patched from gap report v${previousVersion}`,
    })
  );

  log.info({ prototypeId: prototype.id, version }, "builder patch complete");
}
```

- [ ] **Step 2: commit**

```bash
git add apps/worker/src/agents/builder.ts
git commit -m "feat: add builder agent worker with consultation support and patching"
```

---

## Chunk 2: Reviewer Agent + Consultation Loop + Gap Resolution Orchestrator

### Task 4: Create reviewer agent worker

**Files:**
- Create: `apps/worker/src/agents/reviewer.ts`

- [ ] **Step 1: create reviewer agent worker**

Create `apps/worker/src/agents/reviewer.ts`:

```typescript
import { Worker, Job } from "bullmq";
import { prisma } from "@slushie/db";
import {
  createEvent,
  type PrototypeReadyEvent,
  type PrototypePatchedEvent,
  type SlushieEvent,
} from "@slushie/events";
import { reviewerPrompt } from "@slushie/agents";
import { invokeClaudeCode } from "../claude";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";
import { getWorkspace, readWorkspaceFile, writeWorkspaceFile } from "./workspace";
import { PHASE_TIMEOUTS } from "../queues";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

export function createReviewerWorker() {
  return new Worker<SlushieEvent>(
    "reviewer",
    async (job: Job<SlushieEvent>) => {
      const event = job.data;

      if (event.type === "prototype.ready" || event.type === "prototype.patched") {
        await handlePrototypeReady(event);
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    }
  );
}

async function handlePrototypeReady(event: SlushieEvent): Promise<void> {
  const log = createAgentLogger("reviewer", event.pipelineRunId);
  const { prototypeId, version } = event.data as {
    prototypeId: string;
    version: number;
  };

  log.info({ prototypeId, version }, "reviewer starting review");

  // update tracker
  await publishEvent(
    createEvent("tracker.update", event.pipelineRunId, {
      step: 4,
      label: "quality check",
      subtitle: "making sure everything blends right.",
    })
  );

  const workspace = await getWorkspace(event.pipelineRunId);

  // ensure manifest content is available in workspace
  const prototype = await prisma.prototype.findUniqueOrThrow({
    where: { id: prototypeId },
  });

  // write manifest to workspace if not already there
  const manifestPath = workspace.manifestPath(version);
  await writeWorkspaceFile(manifestPath, JSON.stringify(prototype.manifest, null, 2));

  // write decision log
  const decisionLogPath = workspace.decisionLogPath(version);
  await writeWorkspaceFile(decisionLogPath, JSON.stringify(prototype.decisionLog, null, 2));

  const prompt = reviewerPrompt({
    transcriptPath: workspace.transcriptPath,
    buildSpecPath: workspace.buildSpecPath(version),
    manifestPath,
    decisionLogPath,
    outputPath: workspace.gapReportPath(version),
    reviewVersion: version,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: PHASE_TIMEOUTS.reviewer,
    pipelineRunId: event.pipelineRunId,
  });

  log.info({ exitCode: result.exitCode }, "reviewer claude code session completed");

  // read gap report
  const reportContent = await readWorkspaceFile(workspace.gapReportPath(version));
  const report = JSON.parse(reportContent);

  // save to database
  const gapReport = await prisma.gapReport.create({
    data: {
      prototypeId,
      version,
      coverageScore: report.coverageScore,
      gaps: report.gaps,
      tradeoffs: report.tradeoffs,
      revisions: report.revisions,
    },
  });

  // publish review.complete
  await publishEvent(
    createEvent("review.complete", event.pipelineRunId, {
      gapReportId: gapReport.id,
      version,
      coverageScore: report.coverageScore,
      gapCount: report.gaps?.length ?? 0,
    })
  );

  log.info(
    {
      gapReportId: gapReport.id,
      coverageScore: report.coverageScore,
      gapCount: report.gaps?.length ?? 0,
    },
    "reviewer complete"
  );
}
```

- [ ] **Step 2: commit**

```bash
git add apps/worker/src/agents/reviewer.ts
git commit -m "feat: add reviewer agent worker with coverage scoring"
```

---

### Task 5: Create builder-analyst consultation loop

**Files:**
- Create: `apps/worker/src/agents/consultation.ts`

- [ ] **Step 1: create consultation loop handler**

The consultation loop is invoked by the builder when it hits ambiguity. It publishes a `build.design.question` event, waits for the analyst's `build.design.answer`, and returns the answer to the builder. Capped at 15 rounds.

Create `apps/worker/src/agents/consultation.ts`:

```typescript
import Redis from "ioredis";
import { createEvent } from "@slushie/events";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";

const CONSULTATION_MAX_ROUNDS = 15;
const CONSULTATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 min per round

export interface ConsultationContext {
  pipelineRunId: string;
  currentRound: number;
}

/**
 * sends a design question to the analyst and waits for the answer via redis pub/sub.
 * returns the analyst's answer string, or null if max rounds exceeded.
 */
export async function askAnalyst(
  context: ConsultationContext,
  question: string,
  questionContext: string
): Promise<string | null> {
  const log = createAgentLogger("builder-consultation", context.pipelineRunId);

  if (context.currentRound >= CONSULTATION_MAX_ROUNDS) {
    log.warn(
      { round: context.currentRound },
      "consultation cap reached — builder will use best judgment"
    );
    return null;
  }

  context.currentRound++;
  const roundNumber = context.currentRound;

  log.info({ roundNumber, question }, "builder asking analyst");

  // publish the question
  await publishEvent(
    createEvent("build.design.question", context.pipelineRunId, {
      question,
      context: questionContext,
      roundNumber,
    })
  );

  // wait for the answer via redis pub/sub
  const answer = await waitForAnswer(context.pipelineRunId, roundNumber);

  log.info({ roundNumber, answerLength: answer?.length ?? 0 }, "builder received answer");

  return answer;
}

async function waitForAnswer(
  pipelineRunId: string,
  roundNumber: number
): Promise<string | null> {
  return new Promise((resolve) => {
    const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    const channel = `events:${pipelineRunId}`;

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, CONSULTATION_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      redis.unsubscribe(channel).catch(() => {});
      redis.disconnect();
    }

    redis.subscribe(channel, (err) => {
      if (err) {
        cleanup();
        resolve(null);
      }
    });

    redis.on("message", (_ch: string, message: string) => {
      try {
        const event = JSON.parse(message);
        if (
          event.type === "build.design.answer" &&
          event.data.roundNumber === roundNumber
        ) {
          cleanup();
          resolve(event.data.answer);
        }
      } catch {
        // ignore parse errors
      }
    });
  });
}

export function createConsultationContext(pipelineRunId: string): ConsultationContext {
  return {
    pipelineRunId,
    currentRound: 0,
  };
}
```

- [ ] **Step 2: commit**

```bash
git add apps/worker/src/agents/consultation.ts
git commit -m "feat: add builder-analyst consultation loop (max 15 rounds)"
```

---

### Task 6: Create gap resolution orchestrator

**Files:**
- Create: `apps/worker/src/agents/gap-resolution.ts`

- [ ] **Step 1: create gap resolution orchestrator**

The orchestrator manages the 2-cycle gap resolution process. After each review, it checks the coverage score and decides whether to continue (up to 3 cycles total if score is below 60).

Create `apps/worker/src/agents/gap-resolution.ts`:

```typescript
import { Queue } from "bullmq";
import { prisma } from "@slushie/db";
import { createEvent, type SlushieEvent } from "@slushie/events";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";
import Redis from "ioredis";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const MAX_STANDARD_CYCLES = 2;
const MAX_EXTRA_CYCLES = 1; // 1 extra if score < 60
const LOW_SCORE_THRESHOLD = 60;

interface ResolutionState {
  pipelineRunId: string;
  cyclesCompleted: number;
  maxCycles: number;
  scores: number[];
}

// in-memory state per pipeline run
const resolutionStates = new Map<string, ResolutionState>();

/**
 * called by the pipeline orchestrator after the initial prototype.ready event.
 * starts the gap resolution loop.
 */
export function initResolution(pipelineRunId: string): void {
  resolutionStates.set(pipelineRunId, {
    pipelineRunId,
    cyclesCompleted: 0,
    maxCycles: MAX_STANDARD_CYCLES,
    scores: [],
  });
}

/**
 * called when a review.complete event arrives during gap resolution.
 * decides whether to continue resolution or finalize.
 */
export async function handleResolutionReview(
  event: SlushieEvent,
  analystQueue: Queue<SlushieEvent>,
  reviewerQueue: Queue<SlushieEvent>
): Promise<void> {
  const log = createAgentLogger("gap-resolution", event.pipelineRunId);
  const { coverageScore, version, gapReportId } = event.data as {
    coverageScore: number;
    version: number;
    gapReportId: string;
    gapCount: number;
  };

  let state = resolutionStates.get(event.pipelineRunId);
  if (!state) {
    // initialize if not found (recovery case)
    state = {
      pipelineRunId: event.pipelineRunId,
      cyclesCompleted: 0,
      maxCycles: MAX_STANDARD_CYCLES,
      scores: [],
    };
    resolutionStates.set(event.pipelineRunId, state);
  }

  state.cyclesCompleted++;
  state.scores.push(coverageScore);

  log.info(
    {
      cycle: state.cyclesCompleted,
      maxCycles: state.maxCycles,
      coverageScore,
      version,
    },
    "gap resolution cycle completed"
  );

  // check if we need an extra cycle for low scores
  if (
    coverageScore < LOW_SCORE_THRESHOLD &&
    state.maxCycles === MAX_STANDARD_CYCLES
  ) {
    state.maxCycles = MAX_STANDARD_CYCLES + MAX_EXTRA_CYCLES;
    log.warn(
      { coverageScore, newMaxCycles: state.maxCycles },
      "low coverage score — adding extra resolution cycle"
    );
  }

  // check if we're done
  if (state.cyclesCompleted >= state.maxCycles) {
    log.info(
      {
        cyclesCompleted: state.cyclesCompleted,
        finalScore: coverageScore,
        allScores: state.scores,
      },
      "gap resolution complete"
    );

    // if still below 60 after all cycles, flag for human review
    if (coverageScore < LOW_SCORE_THRESHOLD) {
      log.warn(
        { coverageScore },
        "coverage still below 60 after max cycles — escalating to human review"
      );
    }

    await publishEvent(
      createEvent("resolution.complete", event.pipelineRunId, {
        cyclesCompleted: state.cyclesCompleted,
        finalPrototypeVersion: version,
      })
    );

    resolutionStates.delete(event.pipelineRunId);
    return;
  }

  // continue: send review.complete to analyst to update spec
  // the analyst worker listens for review.complete and produces build.spec.updated
  // the builder worker listens for build.spec.updated and produces prototype.patched
  // the reviewer worker listens for prototype.patched and produces review.complete
  // this chain is already wired — we just need to enqueue the review.complete for the analyst
  log.info(
    { nextCycle: state.cyclesCompleted + 1 },
    "continuing gap resolution — triggering analyst spec update"
  );

  await analystQueue.add("review.complete", event);
}

/**
 * returns true if the given pipeline run is currently in gap resolution.
 */
export function isInResolution(pipelineRunId: string): boolean {
  return resolutionStates.has(pipelineRunId);
}

export function getResolutionState(pipelineRunId: string): ResolutionState | undefined {
  return resolutionStates.get(pipelineRunId);
}
```

- [ ] **Step 2: commit**

```bash
git add apps/worker/src/agents/gap-resolution.ts
git commit -m "feat: add gap resolution orchestrator with 2+1 cycle logic"
```

---

### Task 7: Create pipeline orchestrator

**Files:**
- Create: `apps/worker/src/agents/pipeline.ts`

- [ ] **Step 1: create pipeline orchestrator**

The pipeline orchestrator coordinates phases 2-5. It listens for lifecycle events and triggers the next phase.

Create `apps/worker/src/agents/pipeline.ts`:

```typescript
import { Worker, Job, Queue } from "bullmq";
import { prisma } from "@slushie/db";
import {
  createEvent,
  type SlushieEvent,
  type CallEndedEvent,
} from "@slushie/events";
import { publishEvent } from "../publish";
import { createAgentLogger, logger } from "../logger";
import { createWorkspace, writeWorkspaceFile } from "./workspace";
import { initResolution, handleResolutionReview, isInResolution } from "./gap-resolution";
import {
  analystQueue,
  builderQueue,
  reviewerQueue,
  PHASE_TIMEOUTS,
} from "../queues";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

/**
 * the pipeline orchestrator is a single worker that subscribes to all lifecycle events
 * and routes them to the appropriate agent queues.
 *
 * event flow:
 *   call.ended → analyst queue
 *   build.spec.ready → builder queue
 *   prototype.ready (v1) → reviewer queue + init gap resolution
 *   review.complete (during resolution) → gap-resolution orchestrator → analyst queue
 *   build.spec.updated → builder queue
 *   prototype.patched → reviewer queue
 *   resolution.complete → final review trigger
 *   final.review.complete → internal.preview.ready
 */
export function createPipelineOrchestrator() {
  return new Worker<SlushieEvent>(
    "pipeline",
    async (job: Job<SlushieEvent>) => {
      const event = job.data;
      const log = createAgentLogger("pipeline", event.pipelineRunId);

      switch (event.type) {
        case "call.ended": {
          log.info("pipeline: call ended — starting phase 2 (analysis)");
          await setupWorkspace(event as CallEndedEvent);
          await analystQueue.add("call.ended", event);
          break;
        }

        case "build.spec.ready": {
          log.info("pipeline: build spec ready — starting phase 3 (initial build)");
          await builderQueue.add("build.spec.ready", event);
          break;
        }

        case "prototype.ready": {
          const { version } = event.data as { version: number; prototypeId: string; previewUrl: string };
          if (version === 1) {
            log.info("pipeline: prototype v1 ready — starting phase 4 (gap resolution)");
            initResolution(event.pipelineRunId);
            await reviewerQueue.add("prototype.ready", event);
          }
          break;
        }

        case "prototype.patched": {
          log.info("pipeline: prototype patched — sending to reviewer");
          await reviewerQueue.add("prototype.patched", event);
          break;
        }

        case "review.complete": {
          const { version, coverageScore } = event.data as {
            version: number;
            coverageScore: number;
            gapReportId: string;
            gapCount: number;
          };

          if (isInResolution(event.pipelineRunId)) {
            log.info(
              { version, coverageScore },
              "pipeline: review complete during gap resolution"
            );
            await handleResolutionReview(event, analystQueue, reviewerQueue);
          } else {
            log.info(
              { version, coverageScore },
              "pipeline: review complete — not in resolution, ignoring"
            );
          }
          break;
        }

        case "build.spec.updated": {
          log.info("pipeline: spec updated — triggering builder patch");
          await builderQueue.add("build.spec.updated", event);
          break;
        }

        case "resolution.complete": {
          const { finalPrototypeVersion } = event.data as {
            cyclesCompleted: number;
            finalPrototypeVersion: number;
          };

          log.info(
            { finalPrototypeVersion },
            "pipeline: gap resolution complete — starting phase 5 (final review)"
          );

          // trigger final review: send the final prototype to reviewer
          // find the latest prototype
          const pipelineRun = await prisma.pipelineRun.findUniqueOrThrow({
            where: { id: event.pipelineRunId },
            include: {
              call: {
                include: {
                  analysis: {
                    include: {
                      buildSpecs: {
                        include: { prototypes: true },
                        orderBy: { version: "desc" },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          });

          const latestPrototype =
            pipelineRun.call.analysis?.buildSpecs[0]?.prototypes[0];

          if (latestPrototype) {
            // send to reviewer for final review
            await reviewerQueue.add(
              "prototype.patched",
              createEvent("prototype.patched", event.pipelineRunId, {
                prototypeId: latestPrototype.id,
                version: latestPrototype.version,
                patchSummary: "final review",
              })
            );
          }
          break;
        }

        case "final.review.complete": {
          const { gapReportId, coverageScore } = event.data as {
            gapReportId: string;
            coverageScore: number;
            unresolvedGapCount: number;
          };

          log.info(
            { gapReportId, coverageScore },
            "pipeline: final review complete — ready for internal preview"
          );

          await publishEvent(
            createEvent("internal.preview.ready", event.pipelineRunId, {
              prototypeUrl: `app.slushie.agency/preview/${event.pipelineRunId}`,
              gapReportId,
            })
          );

          // update tracker
          await publishEvent(
            createEvent("tracker.update", event.pipelineRunId, {
              step: 5,
              label: "ready to serve",
              subtitle: "your tool is live. take a sip.",
            })
          );

          break;
        }

        default:
          log.debug({ type: event.type }, "pipeline: unhandled event type");
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 3,
    }
  );
}

async function setupWorkspace(event: CallEndedEvent): Promise<void> {
  const workspace = await createWorkspace(event.pipelineRunId);

  // load call data and write to workspace files
  const call = await prisma.call.findUniqueOrThrow({
    where: { id: event.data.callId },
    include: { client: true },
  });

  await writeWorkspaceFile(
    workspace.transcriptPath,
    call.transcript ?? ""
  );

  await writeWorkspaceFile(
    workspace.coachingLogPath,
    JSON.stringify(call.coachingLog ?? [], null, 2)
  );
}
```

- [ ] **Step 2: commit**

```bash
git add apps/worker/src/agents/pipeline.ts
git commit -m "feat: add pipeline orchestrator coordinating phases 2-5"
```

---

## Chunk 3: Prototype Kit Component Library

### Task 8: Create prototype-kit component library

**Files:**
- Create: `packages/prototype-kit/src/components/stat-card.tsx`
- Create: `packages/prototype-kit/src/components/data-table.tsx`
- Create: `packages/prototype-kit/src/components/form.tsx`
- Create: `packages/prototype-kit/src/components/chart.tsx`
- Create: `packages/prototype-kit/src/components/nav-bar.tsx`
- Create: `packages/prototype-kit/src/components/walkthrough-overlay.tsx`
- Create: `packages/prototype-kit/src/components/index.ts`
- Create: `packages/prototype-kit/src/layouts/index.ts`
- Update: `packages/prototype-kit/src/index.ts`
- Update: `packages/prototype-kit/package.json`

- [ ] **Step 1: update prototype-kit package.json with dependencies**

```json
{
  "name": "@slushie/prototype-kit",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: create stat-card component**

Create `packages/prototype-kit/src/components/stat-card.tsx`:

```tsx
"use client";

import React from "react";

export interface StatCardProps {
  title: string;
  description?: string;
  data: {
    value: string;
    change: string;
    trend: "up" | "down" | "flat";
  };
}

export function StatCard({ title, data }: StatCardProps) {
  const trendColor =
    data.trend === "up"
      ? "text-green-600"
      : data.trend === "down"
        ? "text-red-600"
        : "text-gray-500";

  const trendArrow =
    data.trend === "up" ? "^" : data.trend === "down" ? "v" : "-";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl font-bold text-gray-900">{data.value}</p>
        <span className={`text-sm font-medium ${trendColor}`}>
          {trendArrow} {data.change}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: create data-table component**

Create `packages/prototype-kit/src/components/data-table.tsx`:

```tsx
"use client";

import React from "react";

export interface DataTableProps {
  title: string;
  description?: string;
  data: {
    columns: { key: string; label: string }[];
    rows: Record<string, unknown>[];
  };
}

export function DataTable({ title, data }: DataTableProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {data.columns.map((col) => (
                <th
                  key={col.key}
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {data.columns.map((col) => (
                  <td key={col.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                    {String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: create form component**

Create `packages/prototype-kit/src/components/form.tsx`:

```tsx
"use client";

import React, { useState } from "react";

export interface FormProps {
  title: string;
  description?: string;
  data: {
    fields: {
      name: string;
      label: string;
      type: "text" | "number" | "email" | "select" | "date" | "textarea";
      options?: string[];
      required: boolean;
    }[];
    submitLabel: string;
    submitEndpoint: string;
  };
}

export function Form({ title, data }: FormProps) {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {data.fields.map((field) => (
          <div key={field.name}>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            {field.type === "textarea" ? (
              <textarea
                name={field.name}
                required={field.required}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={3}
              />
            ) : field.type === "select" ? (
              <select
                name={field.name}
                required={field.required}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">select...</option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                name={field.name}
                required={field.required}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
          </div>
        ))}
        <button
          type="submit"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          {submitted ? "saved" : data.submitLabel}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: create chart component**

Create `packages/prototype-kit/src/components/chart.tsx`:

```tsx
"use client";

import React from "react";

export interface ChartProps {
  title: string;
  description?: string;
  data: {
    chartType: "bar" | "line" | "pie" | "donut";
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      color: string;
    }[];
  };
}

/**
 * lightweight chart using pure css/svg — no chart library dependency.
 * keeps prototype-kit small and self-contained.
 */
export function Chart({ title, data }: ChartProps) {
  const maxValue = Math.max(
    ...data.datasets.flatMap((ds) => ds.data),
    1
  );

  if (data.chartType === "bar") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex items-end gap-2" style={{ height: 200 }}>
          {data.labels.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              {data.datasets.map((ds, di) => (
                <div
                  key={ds.label}
                  className="w-full rounded-t"
                  style={{
                    height: `${(ds.data[i] / maxValue) * 160}px`,
                    backgroundColor: ds.color,
                    minHeight: 4,
                  }}
                  title={`${ds.label}: ${ds.data[i]}`}
                />
              ))}
              <span className="mt-1 text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4">
          {data.datasets.map((ds) => (
            <div key={ds.label} className="flex items-center gap-1 text-xs text-gray-600">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: ds.color }}
              />
              {ds.label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // pie/donut
  if (data.chartType === "pie" || data.chartType === "donut") {
    const total = data.datasets[0]?.data.reduce((a, b) => a + b, 0) ?? 1;
    let cumulativePercent = 0;

    const segments = data.labels.map((label, i) => {
      const value = data.datasets[0]?.data[i] ?? 0;
      const percent = (value / total) * 100;
      const startPercent = cumulativePercent;
      cumulativePercent += percent;
      return { label, percent, startPercent, color: data.datasets[0]?.color ?? "#DC2626", value };
    });

    const colors = ["#DC2626", "#3B5BDB", "#059669", "#D97706", "#7C3AED", "#0891B2"];

    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-6">
          <svg viewBox="0 0 32 32" className="h-32 w-32" style={{ transform: "rotate(-90deg)" }}>
            {segments.map((seg, i) => (
              <circle
                key={seg.label}
                r="16"
                cx="16"
                cy="16"
                fill="transparent"
                stroke={colors[i % colors.length]}
                strokeWidth={data.chartType === "donut" ? "6" : "16"}
                strokeDasharray={`${seg.percent} ${100 - seg.percent}`}
                strokeDashoffset={`-${seg.startPercent}`}
                pathLength="100"
              />
            ))}
          </svg>
          <div className="space-y-1">
            {segments.map((seg, i) => (
              <div key={seg.label} className="flex items-center gap-2 text-xs text-gray-600">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                {seg.label}: {seg.value}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // line chart — simple svg polyline
  const svgWidth = 400;
  const svgHeight = 160;
  const padding = 20;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight + 20}`} className="w-full">
        {data.datasets.map((ds) => {
          const points = ds.data
            .map((val, i) => {
              const x = padding + (i / (ds.data.length - 1 || 1)) * (svgWidth - 2 * padding);
              const y = svgHeight - padding - (val / maxValue) * (svgHeight - 2 * padding);
              return `${x},${y}`;
            })
            .join(" ");

          return (
            <polyline
              key={ds.label}
              points={points}
              fill="none"
              stroke={ds.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {data.labels.map((label, i) => {
          const x = padding + (i / (data.labels.length - 1 || 1)) * (svgWidth - 2 * padding);
          return (
            <text key={label} x={x} y={svgHeight + 12} textAnchor="middle" className="text-xs" fill="#6b7280" fontSize="10">
              {label}
            </text>
          );
        })}
      </svg>
      <div className="mt-2 flex gap-4">
        {data.datasets.map((ds) => (
          <div key={ds.label} className="flex items-center gap-1 text-xs text-gray-600">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: ds.color }} />
            {ds.label}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: create nav-bar component**

Create `packages/prototype-kit/src/components/nav-bar.tsx`:

```tsx
"use client";

import React from "react";

export interface NavBarProps {
  title?: string;
  description?: string;
  data: {
    brand: string;
    links: { label: string; href: string }[];
  };
}

export function NavBar({ data }: NavBarProps) {
  return (
    <nav className="border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center justify-between">
        <span className="text-lg font-extrabold text-red-600">
          {data.brand}
        </span>
        <div className="flex items-center gap-6">
          {data.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 7: create walkthrough-overlay component**

Create `packages/prototype-kit/src/components/walkthrough-overlay.tsx`:

```tsx
"use client";

import React, { useState, useEffect } from "react";

export interface WalkthroughStep {
  targetComponentId: string;
  targetPage: string;
  step: number;
  title: string;
  text: string;
}

export interface WalkthroughOverlayProps {
  title?: string;
  description?: string;
  data: Record<string, never>;
  steps: WalkthroughStep[];
  currentPage: string;
}

export function WalkthroughOverlay({ steps, currentPage }: WalkthroughOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const pageSteps = steps.filter((s) => s.targetPage === currentPage);

  useEffect(() => {
    setCurrentStep(0);
    setDismissed(false);
  }, [currentPage]);

  if (dismissed || pageSteps.length === 0) return null;

  const step = pageSteps[currentStep];
  if (!step) return null;

  const isLast = currentStep >= pageSteps.length - 1;
  const globalStepNumber = step.step;
  const totalSteps = steps.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="mx-4 max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">
            step {globalStepNumber} of {totalSteps}
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            skip tour
          </button>
        </div>
        <h4 className="text-lg font-semibold text-gray-900">{step.title}</h4>
        <p className="mt-2 text-sm text-gray-600">{step.text}</p>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
            disabled={currentStep === 0}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30"
          >
            back
          </button>
          <button
            onClick={() => {
              if (isLast) {
                setDismissed(true);
              } else {
                setCurrentStep((s) => s + 1);
              }
            }}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            {isLast ? "got it" : "next"}
          </button>
        </div>
        {/* progress dots */}
        <div className="mt-3 flex justify-center gap-1">
          {pageSteps.map((_, i) => (
            <span
              key={i}
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                i === currentStep ? "bg-red-600" : "bg-gray-300"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: create component index**

Create `packages/prototype-kit/src/components/index.ts`:

```typescript
export { StatCard } from "./stat-card";
export type { StatCardProps } from "./stat-card";

export { DataTable } from "./data-table";
export type { DataTableProps } from "./data-table";

export { Form } from "./form";
export type { FormProps } from "./form";

export { Chart } from "./chart";
export type { ChartProps } from "./chart";

export { NavBar } from "./nav-bar";
export type { NavBarProps } from "./nav-bar";

export { WalkthroughOverlay } from "./walkthrough-overlay";
export type { WalkthroughStep, WalkthroughOverlayProps } from "./walkthrough-overlay";
```

- [ ] **Step 9: create layout templates**

Create `packages/prototype-kit/src/layouts/index.ts`:

```typescript
import React from "react";

export type LayoutType = "dashboard" | "form" | "list-detail" | "calendar" | "table";

/**
 * layout configuration for each page type.
 * the renderer uses these to wrap components in the appropriate grid/flex structure.
 */
export const layoutConfigs: Record<LayoutType, { className: string; description: string }> = {
  dashboard: {
    className: "grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3",
    description: "multi-column grid for stat cards and charts",
  },
  form: {
    className: "mx-auto max-w-2xl space-y-6",
    description: "centered single-column for forms",
  },
  "list-detail": {
    className: "grid grid-cols-1 gap-6 lg:grid-cols-3",
    description: "sidebar list + main detail area",
  },
  calendar: {
    className: "space-y-6",
    description: "full-width calendar view",
  },
  table: {
    className: "space-y-6",
    description: "full-width table with optional filters",
  },
};
```

- [ ] **Step 10: update prototype-kit index**

Update `packages/prototype-kit/src/index.ts`:

```typescript
export * from "./components";
export { layoutConfigs } from "./layouts";
export type { LayoutType } from "./layouts";
```

- [ ] **Step 11: install dependencies**

```bash
cd packages/prototype-kit && npm install
```

- [ ] **Step 12: commit**

```bash
git add packages/prototype-kit
git commit -m "feat: add prototype-kit component library (6 components + layouts)"
```

---

## Chunk 4: Manifest Renderer + Worker Registration + Integration

### Task 9: Create prototype manifest renderer

**Files:**
- Create: `packages/prototype-kit/src/renderer/types.ts`
- Create: `packages/prototype-kit/src/renderer/render-page.tsx`
- Create: `packages/prototype-kit/src/renderer/render-manifest.ts`
- Create: `packages/prototype-kit/src/renderer/mock-server.ts`

- [ ] **Step 1: create manifest types**

Create `packages/prototype-kit/src/renderer/types.ts`:

```typescript
export interface ManifestComponent {
  type: "stat-card" | "data-table" | "form" | "chart" | "nav-bar" | "walkthrough-overlay";
  id: string;
  props: {
    title?: string;
    description?: string;
    [key: string]: unknown;
  };
  data: Record<string, unknown>;
}

export interface ManifestPage {
  route: string;
  title: string;
  layout: "dashboard" | "form" | "list-detail" | "calendar" | "table";
  components: ManifestComponent[];
}

export interface ManifestWalkthroughStep {
  targetComponentId: string;
  targetPage: string;
  step: number;
  title: string;
  text: string;
}

export interface ManifestMockEndpoint {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  responseData: Record<string, unknown>;
  delayMs: number;
}

export interface ManifestSimulatedIntegration {
  name: string;
  type: string;
  mockAccountConfig: {
    connected: boolean;
    accountName: string;
    lastSync: string;
  };
}

export interface ManifestDecisionLogEntry {
  decision: string;
  reasoning: string;
  flaggedForReview: boolean;
  consultationRound: number | null;
}

export interface PrototypeManifest {
  version: number;
  pages: ManifestPage[];
  walkthrough: ManifestWalkthroughStep[];
  mockEndpoints: ManifestMockEndpoint[];
  simulatedIntegrations: ManifestSimulatedIntegration[];
  decisionLog: ManifestDecisionLogEntry[];
}
```

- [ ] **Step 2: create page renderer**

Create `packages/prototype-kit/src/renderer/render-page.tsx`:

```tsx
"use client";

import React from "react";
import { StatCard } from "../components/stat-card";
import { DataTable } from "../components/data-table";
import { Form } from "../components/form";
import { Chart } from "../components/chart";
import { NavBar } from "../components/nav-bar";
import { WalkthroughOverlay } from "../components/walkthrough-overlay";
import { layoutConfigs } from "../layouts";
import type { ManifestComponent, ManifestPage, ManifestWalkthroughStep } from "./types";

const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  "stat-card": StatCard,
  "data-table": DataTable,
  form: Form,
  chart: Chart,
  "nav-bar": NavBar,
};

interface RenderPageProps {
  page: ManifestPage;
  walkthroughSteps: ManifestWalkthroughStep[];
  allPages: ManifestPage[];
}

export function RenderPage({ page, walkthroughSteps, allPages }: RenderPageProps) {
  const layoutConfig = layoutConfigs[page.layout] ?? layoutConfigs.dashboard;

  // separate nav-bar from other components — it renders outside the layout grid
  const navComponents = page.components.filter((c) => c.type === "nav-bar");
  const bodyComponents = page.components.filter((c) => c.type !== "nav-bar" && c.type !== "walkthrough-overlay");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* render nav bars */}
      {navComponents.map((comp) => {
        const Component = COMPONENT_MAP[comp.type];
        if (!Component) return null;
        return (
          <div key={comp.id} data-component-id={comp.id}>
            <Component {...comp.props} data={comp.data} />
          </div>
        );
      })}

      {/* page title */}
      <div className="px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">{page.title}</h1>
      </div>

      {/* body components in layout grid */}
      <div className={`px-6 pb-6 ${layoutConfig.className}`}>
        {bodyComponents.map((comp) => {
          const Component = COMPONENT_MAP[comp.type];
          if (!Component) {
            return (
              <div key={comp.id} className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400">
                unknown component: {comp.type}
              </div>
            );
          }
          return (
            <div key={comp.id} data-component-id={comp.id}>
              <Component {...comp.props} data={comp.data} />
            </div>
          );
        })}
      </div>

      {/* walkthrough overlay */}
      <WalkthroughOverlay
        steps={walkthroughSteps}
        currentPage={page.route}
        data={{} as Record<string, never>}
      />
    </div>
  );
}
```

- [ ] **Step 3: create manifest renderer**

This generates the next.js page files from a manifest. It's invoked by the builder worker after the manifest is produced.

Create `packages/prototype-kit/src/renderer/render-manifest.ts`:

```typescript
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { PrototypeManifest, ManifestPage } from "./types";

/**
 * generates a next.js app directory structure from a prototype manifest.
 * each page becomes a route in the app directory.
 * mock endpoints become api route handlers.
 *
 * output structure:
 *   outputDir/
 *     app/
 *       layout.tsx
 *       page.tsx              (for route "/")
 *       jobs/page.tsx         (for route "/jobs")
 *       invoices/page.tsx     (for route "/invoices")
 *       api/jobs/route.ts     (for mock endpoint "/api/jobs")
 *     manifest.json           (copy of the manifest for reference)
 *     package.json
 *     next.config.ts
 *     tailwind.config.ts
 */
export async function renderManifest(
  manifest: PrototypeManifest,
  outputDir: string
): Promise<{ pageCount: number; endpointCount: number }> {
  // create directory structure
  await mkdir(join(outputDir, "app"), { recursive: true });

  // write manifest copy
  await writeFile(
    join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  // write package.json
  await writeFile(
    join(outputDir, "package.json"),
    JSON.stringify(
      {
        name: "slushie-prototype",
        private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          export: "next build",
        },
        dependencies: {
          next: "^15",
          react: "^19",
          "react-dom": "^19",
          "@slushie/prototype-kit": "*",
        },
        devDependencies: {
          typescript: "^5",
          "@types/react": "^19",
          tailwindcss: "^4",
        },
      },
      null,
      2
    )
  );

  // write next.config.ts
  await writeFile(
    join(outputDir, "next.config.ts"),
    `import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default config;
`
  );

  // write tailwind.config.ts
  await writeFile(
    join(outputDir, "tailwind.config.ts"),
    `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "../../packages/prototype-kit/src/**/*.{ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
`
  );

  // write root layout
  await writeFile(
    join(outputDir, "app", "layout.tsx"),
    `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "slushie prototype",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900" style={{ textTransform: "lowercase" }}>
        {children}
      </body>
    </html>
  );
}
`
  );

  // write globals.css
  await writeFile(
    join(outputDir, "app", "globals.css"),
    `@import "tailwindcss";
`
  );

  // generate pages
  for (const page of manifest.pages) {
    await generatePage(outputDir, page, manifest);
  }

  // generate mock api endpoints
  for (const endpoint of manifest.mockEndpoints) {
    await generateMockEndpoint(outputDir, endpoint);
  }

  return {
    pageCount: manifest.pages.length,
    endpointCount: manifest.mockEndpoints.length,
  };
}

async function generatePage(
  outputDir: string,
  page: ManifestPage,
  manifest: PrototypeManifest
): Promise<void> {
  const route = page.route === "/" ? "" : page.route.replace(/^\//, "");
  const pageDir = join(outputDir, "app", route);
  await mkdir(pageDir, { recursive: true });

  const pageContent = `"use client";

import { RenderPage } from "@slushie/prototype-kit/renderer/render-page";

const page = ${JSON.stringify(page, null, 2)};

const walkthroughSteps = ${JSON.stringify(
    manifest.walkthrough.filter((s) => s.targetPage === page.route),
    null,
    2
  )};

const allPages = ${JSON.stringify(
    manifest.pages.map((p) => ({ route: p.route, title: p.title })),
    null,
    2
  )};

export default function Page() {
  return <RenderPage page={page} walkthroughSteps={walkthroughSteps} allPages={allPages} />;
}
`;

  await writeFile(join(pageDir, "page.tsx"), pageContent);
}

async function generateMockEndpoint(
  outputDir: string,
  endpoint: { path: string; method: string; responseData: Record<string, unknown>; delayMs: number }
): Promise<void> {
  const routePath = endpoint.path.replace(/^\//, "");
  const routeDir = join(outputDir, "app", routePath);
  await mkdir(routeDir, { recursive: true });

  const method = endpoint.method.toUpperCase();
  const handler = `export async function ${method}() {
  await new Promise((r) => setTimeout(r, ${endpoint.delayMs}));
  return Response.json(${JSON.stringify(endpoint.responseData, null, 2)});
}
`;

  await writeFile(join(routeDir, "route.ts"), handler);
}
```

- [ ] **Step 4: create mock server utility**

Create `packages/prototype-kit/src/renderer/mock-server.ts`:

```typescript
import type { ManifestMockEndpoint } from "./types";

/**
 * client-side mock server that intercepts fetch calls matching mock endpoints.
 * injected into prototypes so they work as static exports without a real backend.
 */
export function createMockInterceptor(endpoints: ManifestMockEndpoint[]): void {
  if (typeof window === "undefined") return;

  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method?.toUpperCase() ?? "GET";

    const match = endpoints.find(
      (ep) => url.endsWith(ep.path) && ep.method === method
    );

    if (match) {
      await new Promise((r) => setTimeout(r, match.delayMs));
      return new Response(JSON.stringify(match.responseData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return originalFetch(input, init);
  };
}
```

- [ ] **Step 5: update prototype-kit index with renderer exports**

Update `packages/prototype-kit/src/index.ts`:

```typescript
export * from "./components";
export { layoutConfigs } from "./layouts";
export type { LayoutType } from "./layouts";
export { renderManifest } from "./renderer/render-manifest";
export { createMockInterceptor } from "./renderer/mock-server";
export type {
  PrototypeManifest,
  ManifestPage,
  ManifestComponent,
  ManifestWalkthroughStep,
  ManifestMockEndpoint,
  ManifestSimulatedIntegration,
  ManifestDecisionLogEntry,
} from "./renderer/types";
```

- [ ] **Step 6: commit**

```bash
git add packages/prototype-kit/src/renderer packages/prototype-kit/src/index.ts
git commit -m "feat: add manifest renderer and mock server for prototype generation"
```

---

### Task 10: Register all workers in the worker entry point

**Files:**
- Update: `apps/worker/src/index.ts`

- [ ] **Step 1: update worker entry point to register all agents**

Update `apps/worker/src/index.ts`:

```typescript
import Redis from "ioredis";
import { logger } from "./logger";
import {
  listenerQueue,
  analystQueue,
  builderQueue,
  reviewerQueue,
  postmortemQueue,
} from "./queues";
import { createAnalystWorker } from "./agents/analyst";
import { createBuilderWorker } from "./agents/builder";
import { createReviewerWorker } from "./agents/reviewer";
import { createPipelineOrchestrator } from "./agents/pipeline";

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

  // start agent workers
  const analystWorker = createAnalystWorker();
  const builderWorker = createBuilderWorker();
  const reviewerWorker = createReviewerWorker();
  const pipelineOrchestrator = createPipelineOrchestrator();

  const workers = [analystWorker, builderWorker, reviewerWorker, pipelineOrchestrator];

  for (const w of workers) {
    w.on("failed", (job, err) => {
      logger.error(
        { queue: w.name, jobId: job?.id, error: err.message },
        "worker job failed"
      );
    });

    w.on("completed", (job) => {
      logger.info(
        { queue: w.name, jobId: job?.id },
        "worker job completed"
      );
    });
  }

  logger.info(
    { workers: workers.map((w) => w.name) },
    "slushie worker is running. all agents registered."
  );

  // graceful shutdown
  const shutdown = async () => {
    logger.info("shutting down workers...");
    await Promise.all(workers.map((w) => w.close()));
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

- [ ] **Step 2: verify worker compiles**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat: register analyst, builder, reviewer, and pipeline orchestrator workers"
```

---

### Task 11: Add build spec render step to builder worker

**Files:**
- Update: `apps/worker/src/agents/builder.ts`

- [ ] **Step 1: add manifest rendering to builder after manifest creation**

In `apps/worker/src/agents/builder.ts`, add the render step after saving the prototype to the database. Add this import at the top:

```typescript
import { renderManifest } from "@slushie/prototype-kit";
import type { PrototypeManifest } from "@slushie/prototype-kit";
```

Then after `const manifest = JSON.parse(manifestContent);` in `handleBuildSpecReady`, add:

```typescript
  // render the manifest into a static next.js prototype
  const prototypeOutputDir = `${workspace.root}/prototype-v${version}`;
  const renderResult = await renderManifest(manifest as PrototypeManifest, prototypeOutputDir);
  log.info(
    { pageCount: renderResult.pageCount, endpointCount: renderResult.endpointCount },
    "prototype rendered from manifest"
  );
```

And the same after `const manifest = JSON.parse(manifestContent);` in `handleBuildSpecUpdated`:

```typescript
  // render the patched manifest
  const prototypeOutputDir = `${workspace.root}/prototype-v${version}`;
  const renderResult = await renderManifest(manifest as PrototypeManifest, prototypeOutputDir);
  log.info(
    { pageCount: renderResult.pageCount, endpointCount: renderResult.endpointCount },
    "patched prototype rendered from manifest"
  );
```

- [ ] **Step 2: commit**

```bash
git add apps/worker/src/agents/builder.ts
git commit -m "feat: integrate manifest renderer into builder worker"
```

---

### Task 12: Final integration verification

- [ ] **Step 1: verify all packages compile**

```bash
cd packages/agents && npx tsc --noEmit
cd packages/prototype-kit && npx tsc --noEmit
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors in any package.

- [ ] **Step 2: verify worker starts with all agents**

```bash
cd apps/worker && npm run dev
```

Expected: "slushie worker is running. all agents registered." with analyst, builder, reviewer, pipeline listed.

- [ ] **Step 3: commit any fixes**

```bash
git add -A
git commit -m "fix: resolve integration issues from agent pipeline setup"
```

---

## Summary

**What Plan 3 produces:**
- analyst agent worker (`apps/worker/src/agents/analyst.ts`) — processes transcripts, generates build specs, answers builder questions, updates specs from gap reports
- builder agent worker (`apps/worker/src/agents/builder.ts`) — generates prototype manifests from specs, patches manifests from gap reports, renders static next.js prototypes
- reviewer agent worker (`apps/worker/src/agents/reviewer.ts`) — compares manifests against transcripts, produces gap reports with coverage scores
- builder-analyst consultation loop (`apps/worker/src/agents/consultation.ts`) — max 15 rounds via redis pub/sub
- gap resolution orchestrator (`apps/worker/src/agents/gap-resolution.ts`) — 2 standard cycles + 1 extra if score below 60
- pipeline orchestrator (`apps/worker/src/agents/pipeline.ts`) — coordinates phases 2-5, routes events between agents
- agent prompt templates (`packages/agents/src/prompts/`) — analyst, builder, reviewer prompts with full context
- prototype-kit component library (`packages/prototype-kit/src/components/`) — stat-card, data-table, form, chart, nav-bar, walkthrough-overlay
- prototype manifest renderer (`packages/prototype-kit/src/renderer/`) — reads json manifest, generates static next.js app
- workspace manager (`apps/worker/src/agents/workspace.ts`) — creates and manages per-pipeline working directories

**What comes next:**
- Plan 4: client tracker + dev chat + notification system
- Plan 5: internal review dashboard + postmortem agent + skill update loop
