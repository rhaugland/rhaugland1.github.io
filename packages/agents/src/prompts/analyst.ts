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
    ],
    "designPreferences": {
      "theme": "light | dark — default 'light', use 'dark' if client requests dark mode/dark theme",
      "backgroundColor": "string | null — specific background color if mentioned (e.g. '#1a1a2e' for dark navy)",
      "accentColor": "string | null — primary accent color if mentioned (e.g. '#06b6d4' for teal/cyan)",
      "fontBody": "string | null — body font if mentioned (e.g. 'Inter')",
      "fontHeading": "string | null — heading font if mentioned (e.g. 'Plus Jakarta Sans')",
      "borderRadius": "string | null — 'rounded' or 'sharp' if mentioned",
      "spacing": "string | null — 'compact' or 'spacious' if mentioned",
      "notes": "string | null — any other design preferences the client mentioned"
    }
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
- pay close attention to any design/styling preferences mentioned in the transcript: colors, fonts, themes, spacing, border radius. capture these in designPreferences.
- if the client mentions a dark theme, set theme to "dark". extract specific color values, font names, and layout preferences.

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
  meetingNotesPath?: string;
  outputPath: string;
  version: number;
}): string {
  const meetingSection = context.meetingNotesPath
    ? `- client review meeting notes: ${context.meetingNotesPath}`
    : "";

  const meetingInstruction = context.meetingNotesPath
    ? "2b. read the client review meeting notes — these contain DIRECT CLIENT FEEDBACK. every issue the client raised must be addressed in the updated spec. client feedback takes highest priority."
    : "";

  return `you are the slushie analyst agent updating a build spec based on a reviewer's gap report.

## input files
- current build spec: ${context.currentSpecPath}
- gap report: ${context.gapReportPath}
${meetingSection}

## instructions

1. read the current build spec.
2. read the gap report — focus on revisions with priority "high" and "medium".
${meetingInstruction}
3. update the spec to address the identified gaps. for each gap:
   - if it's "missed": add the feature/component to the spec
   - if it's "simplified": expand the component spec to fully match the requirement
   - if it's "deferred": include it if priority is high or medium
4. do not remove features that were already working AND not flagged in the gap report.
5. do not add features the client never discussed.
6. keep the prototype at 3-6 pages.
7. the updated spec MUST be meaningfully different from the current spec. if the gap report found issues, the spec must change to address them.

write the updated spec (same json schema as the original) to: ${context.outputPath}

this is version ${context.version} of the spec.`;
}
