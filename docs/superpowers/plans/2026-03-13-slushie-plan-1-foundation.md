# slushie foundation implementation plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** set up the slushie monorepo with database, event bus, auth, and brand system — the foundation everything else builds on.

**Architecture:** turborepo monorepo with next.js frontend, node.js bullmq workers, prisma/postgres database, and redis event bus. all packages share typescript types. the brand system enforces slushie's visual identity across all ui.

**Tech Stack:** turborepo, next.js, typescript, tailwind css, shadcn/ui, prisma, postgresql, redis, bullmq, nextauth, pino, nanoid

**Spec:** `docs/superpowers/specs/2026-03-13-slushie-platform-design.md`

**Depends on:** nothing (this is plan 1)

**Produces:** a running monorepo with auth, database, event bus, and brand system. no agents yet — just the infrastructure they'll plug into.

---

## Chunk 1: Monorepo Scaffold + Database

### Task 1: Initialize turborepo monorepo

**Files:**
- Create: `package.json` (root)
- Create: `turbo.json`
- Create: `tsconfig.json` (root)
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/web/package.json`
- Create: `apps/worker/package.json`
- Create: `packages/db/package.json`
- Create: `packages/events/package.json`
- Create: `packages/ui/package.json`
- Create: `packages/agents/package.json`
- Create: `packages/prototype-kit/package.json`

- [ ] **Step 1: clean the repo**

remove existing files (index.html, main.js, style.css, blek pentha.png, chime.mp3). keep docs/ and README.md.

```bash
rm -f index.html main.js style.css "blek pentha.png" chime.mp3
```

- [ ] **Step 2: create monorepo directory structure**

```bash
mkdir -p apps/web apps/worker packages/db packages/events packages/ui packages/agents packages/prototype-kit
```

- [ ] **Step 3: create root package.json**

```json
{
  "name": "slushie",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "db:push": "turbo db:push --filter=@slushie/db",
    "db:generate": "turbo db:generate --filter=@slushie/db"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5"
  },
  "packageManager": "npm@10.0.0"
}
```

- [ ] **Step 4: create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {},
    "db:push": { "cache": false },
    "db:generate": { "cache": false }
  }
}
```

- [ ] **Step 5: create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 6: create .gitignore**

```
node_modules/
.next/
dist/
.env
.env.local
.turbo/
*.tsbuildinfo
.superpowers/
venv/
```

- [ ] **Step 7: create .env.example**

```
# database
DATABASE_URL=postgresql://localhost:5432/slushie

# redis
REDIS_URL=redis://localhost:6379

# deepgram
DEEPGRAM_API_KEY=

# nextauth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_EMAILS=ryan@slushie.agency

# s3 (optional for local dev)
S3_BUCKET=
S3_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

- [ ] **Step 8: create placeholder package.json for agents package**

Create `packages/agents/package.json`:

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

Create `packages/agents/src/index.ts`:

```typescript
// agent prompts and context templates — populated in plan 3
export {};
```

- [ ] **Step 9: create placeholder package.json for prototype-kit**

Create `packages/prototype-kit/package.json`:

```json
{
  "name": "@slushie/prototype-kit",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "devDependencies": {
    "typescript": "^5"
  }
}
```

Create `packages/prototype-kit/src/index.ts`:

```typescript
// prototype component library and renderer — populated in plan 3
export {};
```

- [ ] **Step 10: commit**

```bash
git add -A
git commit -m "feat: initialize turborepo monorepo scaffold"
```

---

### Task 2: Set up Prisma database schema

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/index.ts`

- [ ] **Step 1: create packages/db/package.json**

```json
{
  "name": "@slushie/db",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^6"
  },
  "devDependencies": {
    "prisma": "^6",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: create packages/db/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: create prisma schema**

Create `packages/db/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Client {
  id              String   @id @default(cuid())
  name            String
  industry        String
  phone           String?
  businessContext  Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  calls           Call[]
  pipelineRuns    PipelineRun[]
}

model Call {
  id           String   @id @default(cuid())
  clientId     String
  transcript   String?  @db.Text
  coachingLog  Json?
  startedAt    DateTime?
  endedAt      DateTime?
  createdAt    DateTime @default(now())

  client       Client   @relation(fields: [clientId], references: [id])
  pipelineRun  PipelineRun?
  analysis     Analysis?
}

model PipelineRun {
  id          String          @id @default(cuid())
  clientId    String
  callId      String          @unique
  status      PipelineStatus  @default(RUNNING)
  startedAt   DateTime        @default(now())
  completedAt DateTime?

  client      Client          @relation(fields: [clientId], references: [id])
  call        Call            @relation(fields: [callId], references: [id])
  tracker     Tracker?
  postmortem  Postmortem?
}

enum PipelineStatus {
  RUNNING
  STALLED
  COMPLETED
  CANCELLED
}

model Analysis {
  id             String   @id @default(cuid())
  callId         String   @unique
  workflowMap    Json?
  gaps           Json?
  monetaryImpact Json?
  createdAt      DateTime @default(now())

  call           Call     @relation(fields: [callId], references: [id])
  buildSpecs     BuildSpec[]
}

model BuildSpec {
  id              String   @id @default(cuid())
  analysisId      String
  version         Int      @default(1)
  uiRequirements  Json?
  dataModels      Json?
  integrations    Json?
  walkthroughSteps Json?
  createdAt       DateTime @default(now())

  analysis        Analysis @relation(fields: [analysisId], references: [id])
  prototypes      Prototype[]
}

model Prototype {
  id               String   @id @default(cuid())
  buildSpecId      String
  version          Int      @default(1)
  codeBundleUrl    String?
  previewUrl       String?
  manifest         Json?    // contains pages, walkthrough, mock_endpoints, simulated_integrations
  decisionLog      Json?
  createdAt        DateTime @default(now())

  buildSpec        BuildSpec @relation(fields: [buildSpecId], references: [id])
  gapReports       GapReport[]
}

model GapReport {
  id            String   @id @default(cuid())
  prototypeId   String
  version       Int      @default(1)
  coverageScore Int?
  gaps          Json?
  tradeoffs     Json?
  revisions     Json?
  createdAt     DateTime @default(now())

  prototype     Prototype @relation(fields: [prototypeId], references: [id])
}

model Tracker {
  id            String   @id @default(cuid())
  pipelineRunId String   @unique
  slug          String   @unique
  currentStep   Int      @default(1)
  steps         Json?
  notifiedAt    DateTime?
  expiresAt     DateTime?
  createdAt     DateTime @default(now())

  pipelineRun   PipelineRun @relation(fields: [pipelineRunId], references: [id])
}

model Postmortem {
  id               String   @id @default(cuid())
  pipelineRunId    String   @unique
  agentScores      Json?
  employeeFeedback Json?
  skillUpdates     Json?
  createdAt        DateTime @default(now())

  pipelineRun      PipelineRun @relation(fields: [pipelineRunId], references: [id])
}

model AgentSkill {
  id                    String   @id @default(cuid())
  agentType             String
  version               Int      @default(1)
  promptTemplate        String   @db.Text
  config                Json?
  updatedByPostmortemId String?
  createdAt             DateTime @default(now())

  @@unique([agentType, version])
}
```

- [ ] **Step 4: create db client export**

Create `packages/db/src/index.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
```

- [ ] **Step 5: install dependencies and generate client**

```bash
cd packages/db && npm install && npx prisma generate
```

- [ ] **Step 6: commit**

```bash
git add packages/db
git commit -m "feat: add prisma schema with all entities"
```

---

### Task 3: Set up typed event definitions

**Files:**
- Create: `packages/events/package.json`
- Create: `packages/events/tsconfig.json`
- Create: `packages/events/src/index.ts`
- Create: `packages/events/src/types.ts`

- [ ] **Step 1: create packages/events/package.json**

```json
{
  "name": "@slushie/events",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "bullmq": "^5",
    "ioredis": "^5",
    "nanoid": "^5"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: create event type definitions**

Create `packages/events/src/types.ts`:

```typescript
export type EventType =
  | "transcript.chunk"
  | "coaching.suggestion"
  | "call.ended"
  | "analysis.complete"
  | "build.spec.ready"
  | "build.design.question"
  | "build.design.answer"
  | "prototype.ready"
  | "prototype.progress"
  | "review.complete"
  | "build.spec.updated"
  | "prototype.patched"
  | "resolution.complete"
  | "final.review.complete"
  | "internal.preview.ready"
  | "team.approved"
  | "client.notified"
  | "tracker.update"
  | "tracker.complete"
  | "postmortem.complete"
  | "skills.updated";

export interface BaseEvent {
  type: EventType;
  pipelineRunId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface TranscriptChunkEvent extends BaseEvent {
  type: "transcript.chunk";
  data: {
    text: string;
    speaker: "team" | "client";
    isFinal: boolean;
    chunkIndex: number;
  };
}

export interface CoachingSuggestionEvent extends BaseEvent {
  type: "coaching.suggestion";
  data: {
    category: "dig_deeper" | "gap_spotted" | "suggested";
    text: string;
    relatedTranscriptIndex?: number;
    monetaryEstimate?: string;
  };
}

export interface CallEndedEvent extends BaseEvent {
  type: "call.ended";
  data: {
    callId: string;
    clientId: string;
    duration: number;
  };
}

export interface AnalysisCompleteEvent extends BaseEvent {
  type: "analysis.complete";
  data: {
    analysisId: string;
    gapCount: number;
    totalMonetaryImpact: string;
  };
}

export interface BuildSpecReadyEvent extends BaseEvent {
  type: "build.spec.ready";
  data: {
    buildSpecId: string;
    version: number;
    pageCount: number;
  };
}

export interface BuildDesignQuestionEvent extends BaseEvent {
  type: "build.design.question";
  data: {
    question: string;
    context: string;
    roundNumber: number;
  };
}

export interface BuildDesignAnswerEvent extends BaseEvent {
  type: "build.design.answer";
  data: {
    answer: string;
    roundNumber: number;
  };
}

export interface PrototypeReadyEvent extends BaseEvent {
  type: "prototype.ready";
  data: {
    prototypeId: string;
    version: number;
    previewUrl: string;
  };
}

export interface ReviewCompleteEvent extends BaseEvent {
  type: "review.complete";
  data: {
    gapReportId: string;
    version: number;
    coverageScore: number;
    gapCount: number;
  };
}

export interface TrackerUpdateEvent extends BaseEvent {
  type: "tracker.update";
  data: {
    step: number;
    label: string;
    subtitle: string;
  };
}

export interface ClientNotifiedEvent extends BaseEvent {
  type: "client.notified";
  data: {
    clientName: string;
    trackerUrl: string;
    prototypeUrl?: string;
    message: string;
  };
}

export interface PrototypeProgressEvent extends BaseEvent {
  type: "prototype.progress";
  data: {
    prototypeId: string;
    version: number;
    phase: string;
    percentComplete: number;
  };
}

export interface BuildSpecUpdatedEvent extends BaseEvent {
  type: "build.spec.updated";
  data: {
    buildSpecId: string;
    version: number;
    changesFromGapReport: string;
  };
}

export interface PrototypePatchedEvent extends BaseEvent {
  type: "prototype.patched";
  data: {
    prototypeId: string;
    version: number;
    patchSummary: string;
  };
}

export interface ResolutionCompleteEvent extends BaseEvent {
  type: "resolution.complete";
  data: {
    cyclesCompleted: number;
    finalPrototypeVersion: number;
  };
}

export interface FinalReviewCompleteEvent extends BaseEvent {
  type: "final.review.complete";
  data: {
    gapReportId: string;
    coverageScore: number;
    unresolvedGapCount: number;
  };
}

export interface InternalPreviewReadyEvent extends BaseEvent {
  type: "internal.preview.ready";
  data: {
    prototypeUrl: string;
    gapReportId: string;
  };
}

export interface TeamApprovedEvent extends BaseEvent {
  type: "team.approved";
  data: {
    approvedBy: string;
    prototypeVersion: number;
  };
}

export interface TrackerCompleteEvent extends BaseEvent {
  type: "tracker.complete";
  data: {
    trackerId: string;
    slug: string;
  };
}

export interface PostmortemCompleteEvent extends BaseEvent {
  type: "postmortem.complete";
  data: {
    postmortemId: string;
    agentScores: Record<string, number>;
  };
}

export interface SkillsUpdatedEvent extends BaseEvent {
  type: "skills.updated";
  data: {
    updatedAgents: string[];
    postmortemId: string;
  };
}

export type SlushieEvent =
  | TranscriptChunkEvent
  | CoachingSuggestionEvent
  | CallEndedEvent
  | AnalysisCompleteEvent
  | BuildSpecReadyEvent
  | BuildDesignQuestionEvent
  | BuildDesignAnswerEvent
  | PrototypeReadyEvent
  | PrototypeProgressEvent
  | ReviewCompleteEvent
  | BuildSpecUpdatedEvent
  | PrototypePatchedEvent
  | ResolutionCompleteEvent
  | FinalReviewCompleteEvent
  | InternalPreviewReadyEvent
  | TeamApprovedEvent
  | TrackerUpdateEvent
  | TrackerCompleteEvent
  | ClientNotifiedEvent
  | PostmortemCompleteEvent
  | SkillsUpdatedEvent;
```

- [ ] **Step 3: create event bus helpers**

Create `packages/events/src/index.ts`:

```typescript
import { Queue, Worker, Job } from "bullmq";
import { nanoid } from "nanoid";
import Redis from "ioredis";
import type { SlushieEvent, EventType } from "./types";

export * from "./types";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const DEFAULT_REDIS = getRedisConnection();

export function createEventQueue(name: string) {
  return new Queue<SlushieEvent>(name, {
    connection: DEFAULT_REDIS,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "custom",
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
    settings: {
      backoffStrategy: (attemptsMade: number) => {
        // spec: 1s, 10s, 60s
        const delays = [1000, 10000, 60000];
        return delays[attemptsMade - 1] ?? 60000;
      },
    },
  });
}

export function createEventWorker(
  name: string,
  handler: (event: SlushieEvent) => Promise<void>
) {
  return new Worker<SlushieEvent>(
    name,
    async (job: Job<SlushieEvent>) => {
      await handler(job.data);
    },
    { connection: DEFAULT_REDIS }
  );
}

export function createEvent<T extends SlushieEvent>(
  type: T["type"],
  pipelineRunId: string,
  data: T["data"]
): T {
  return {
    type,
    pipelineRunId,
    timestamp: Date.now(),
    data,
  } as T;
}

export function generateSlug(): string {
  return nanoid(21);
}
```

- [ ] **Step 4: install dependencies**

```bash
cd packages/events && npm install
```

- [ ] **Step 5: commit**

```bash
git add packages/events
git commit -m "feat: add typed event definitions and bullmq helpers"
```

---

## Chunk 2: Next.js App + Auth + Brand System

### Task 4: Initialize Next.js app

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`

- [ ] **Step 1: scaffold next.js app**

```bash
cd apps/web && npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias
```

- [ ] **Step 2: add workspace dependencies to apps/web/package.json**

Add to dependencies:
```json
{
  "@slushie/db": "*",
  "@slushie/events": "*",
  "@slushie/ui": "*"
}
```

- [ ] **Step 3: verify dev server starts**

```bash
cd apps/web && npm run dev
```

Expected: next.js dev server running on http://localhost:3000

- [ ] **Step 4: commit**

```bash
git add apps/web
git commit -m "feat: scaffold next.js app"
```

---

### Task 5: Set up slushie brand system + UI package

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/theme.ts`
- Create: `apps/web/src/app/globals.css`

- [ ] **Step 1: create packages/ui/package.json**

```json
{
  "name": "@slushie/ui",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "devDependencies": {
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: create brand theme**

Create `packages/ui/src/theme.ts`:

```typescript
export const slushieTheme = {
  colors: {
    primary: "#DC2626",       // cherry red
    secondary: "#3B5BDB",     // berry blue
    background: "#F8FAFC",    // arctic white
    foreground: "#1e293b",
    muted: "#94a3b8",
    gradientStart: "#FEE2E2", // red
    gradientMid: "#EDE9FE",   // purple
    gradientEnd: "#DBEAFE",   // blue
  },
  fonts: {
    primary: "'Inter', sans-serif",
  },
} as const;

export type SlushieTheme = typeof slushieTheme;
```

- [ ] **Step 3: create packages/ui/src/index.ts**

```typescript
export { slushieTheme } from "./theme";
export type { SlushieTheme } from "./theme";
```

- [ ] **Step 4: update apps/web/src/app/globals.css**

```css
@import "tailwindcss";

@theme {
  --color-primary: #DC2626;
  --color-secondary: #3B5BDB;
  --color-background: #F8FAFC;
  --color-foreground: #1e293b;
  --color-muted: #94a3b8;
  --color-gradient-start: #FEE2E2;
  --color-gradient-mid: #EDE9FE;
  --color-gradient-end: #DBEAFE;
  --font-primary: 'Inter', sans-serif;
}

/* slushie brand: all ui text lowercase */
body {
  text-transform: lowercase;
  font-family: var(--font-primary);
  background-color: var(--color-background);
  color: var(--color-foreground);
}

/* gradient background utility */
.slushie-gradient {
  background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-mid), var(--color-gradient-end));
}
```

- [ ] **Step 5: update apps/web/src/app/layout.tsx**

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "slushie",
  description: "blend your workflows.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: create landing page placeholder**

Create `apps/web/src/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-extrabold text-primary">slushie</h1>
        <p className="mt-4 text-muted">blend your workflows.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 7: verify brand renders correctly**

```bash
cd apps/web && npm run dev
```

Open http://localhost:3000. Verify: "slushie" in cherry red (#DC2626), subtitle in muted, all lowercase, inter font, arctic white background.

- [ ] **Step 8: commit**

```bash
git add packages/ui apps/web/src
git commit -m "feat: add slushie brand system and ui package"
```

---

### Task 6: Set up NextAuth with Google OAuth

**Files:**
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/web/src/lib/auth.ts`
- Create: `apps/web/src/app/(dashboard)/layout.tsx`
- Create: `apps/web/src/middleware.ts`

- [ ] **Step 1: install next-auth**

```bash
cd apps/web && npm install next-auth@beta
```

- [ ] **Step 2: create NextAuth type augmentation**

Create `apps/web/src/types/next-auth.d.ts`:

```typescript
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      email: string;
      name?: string | null;
      image?: string | null;
      role: "admin" | "team_member";
    };
  }
}
```

- [ ] **Step 3: create auth config**

Create `apps/web/src/lib/auth.ts`:

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// admin emails — add slushie team admins here
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      // only allow @slushie.agency accounts
      return profile?.email?.endsWith("@slushie.agency") ?? false;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = request.nextUrl.pathname.startsWith("/dashboard");
      if (isProtected && !isLoggedIn) return false;
      return true;
    },
    session({ session, token }) {
      if (session.user && token.email) {
        session.user.role = ADMIN_EMAILS.includes(token.email)
          ? "admin"
          : "team_member";
      }
      return session;
    },
  },
});
```

- [ ] **Step 4: create auth route handler**

Create `apps/web/src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 5: create middleware**

Create `apps/web/src/middleware.ts`:

```typescript
export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

- [ ] **Step 6: create protected dashboard layout**

Create `apps/web/src/app/(dashboard)/layout.tsx`:

```tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/api/auth/signin");

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-gray-200 bg-foreground px-6 py-3">
        <div className="flex items-center justify-between">
          <span className="text-lg font-extrabold text-primary">slushie</span>
          <div className="flex items-center gap-6 text-sm text-muted">
            <Link href="/dashboard/calls" className="hover:text-white">calls</Link>
            <Link href="/dashboard/builds" className="hover:text-white">builds</Link>
            <Link href="/dashboard/clients" className="hover:text-white">clients</Link>
            <Link href="/dashboard/postmortems" className="hover:text-white">postmortems</Link>
            <Link href="/dashboard/dev/chat" className="hover:text-white">dev chat</Link>
          </div>
          <span className="text-sm text-muted">{session.user?.email}</span>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 7: create dashboard index page**

Create `apps/web/src/app/(dashboard)/dashboard/page.tsx`:

```tsx
export default function DashboardPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold">dashboard</h2>
      <p className="mt-2 text-muted">welcome to slushie. pour something new.</p>
    </div>
  );
}
```

- [ ] **Step 8: commit**

```bash
git add apps/web/src
git commit -m "feat: add nextauth google oauth with role-based access"
```

---

## Chunk 3: Worker App + Event Bus + Logging

### Task 7: Set up worker app with BullMQ

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/index.ts`
- Create: `apps/worker/src/queues.ts`
- Create: `apps/worker/src/logger.ts`

- [ ] **Step 1: create apps/worker/package.json**

```json
{
  "name": "@slushie/worker",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@slushie/db": "*",
    "@slushie/events": "*",
    "bullmq": "^5",
    "ioredis": "^5",
    "pino": "^9",
    "pino-pretty": "^11"
  },
  "devDependencies": {
    "tsx": "^4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: create apps/worker/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: create logger**

Create `apps/worker/src/logger.ts`:

```typescript
import pino from "pino";

export const logger = pino({
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty" }
      : undefined,
});

export function createAgentLogger(agentType: string, pipelineRunId: string) {
  return logger.child({ agentType, pipelineRunId });
}
```

- [ ] **Step 4: create queue definitions**

Create `apps/worker/src/queues.ts`:

```typescript
import { createEventQueue } from "@slushie/events";

export const listenerQueue = createEventQueue("listener");
export const analystQueue = createEventQueue("analyst");
export const builderQueue = createEventQueue("builder");
export const reviewerQueue = createEventQueue("reviewer");
export const postmortemQueue = createEventQueue("postmortem");
export const notificationQueue = createEventQueue("notification");
export const trackerQueue = createEventQueue("tracker");

export const PHASE_TIMEOUTS = {
  listener: 60 * 60 * 1000,      // 60 min (call duration + buffer)
  analyst: 15 * 60 * 1000,       // 15 min
  builder: 45 * 60 * 1000,       // 45 min
  reviewer: 10 * 60 * 1000,      // 10 min
  gapResolution: 60 * 60 * 1000, // 60 min per cycle
} as const;
```

- [ ] **Step 5: create worker entry point**

Create `apps/worker/src/index.ts`:

```typescript
import Redis from "ioredis";
import { logger } from "./logger";
import { listenerQueue, analystQueue, builderQueue, reviewerQueue, postmortemQueue } from "./queues";

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

  // workers will be registered here as they're built in plans 2-5
  logger.info("slushie worker is running. waiting for events...");

  // graceful shutdown
  const shutdown = () => {
    logger.info("shutting down workers...");
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

- [ ] **Step 6: install dependencies**

```bash
cd apps/worker && npm install
```

- [ ] **Step 7: verify worker starts**

```bash
cd apps/worker && npm run dev
```

Expected: "slushie worker is running. waiting for events..." in console.

- [ ] **Step 8: commit**

```bash
git add apps/worker
git commit -m "feat: add worker app with bullmq queues and pino logging"
```

---

### Task 8: Add SSE endpoint for real-time dashboard updates

**Files:**
- Create: `apps/web/src/app/api/events/[pipelineRunId]/route.ts`

- [ ] **Step 1: create SSE route**

Create `apps/web/src/app/api/events/[pipelineRunId]/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pipelineRunId: string }> }
) {
  const session = await auth();
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }

  const { pipelineRunId } = await params;
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const channel = `events:${pipelineRunId}`;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let alive = true;

      // send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: {"pipelineRunId":"${pipelineRunId}"}\n\n`)
      );

      // keepalive every 15 seconds to prevent proxy/lb timeout
      const keepalive = setInterval(() => {
        if (alive) {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        }
      }, 15_000);

      redis.subscribe(channel, (err) => {
        if (err) {
          clearInterval(keepalive);
          controller.error(err);
          return;
        }
      });

      redis.on("message", (_channel: string, message: string) => {
        controller.enqueue(
          encoder.encode(`data: ${message}\n\n`)
        );
      });

      redis.on("error", (err) => {
        console.error("redis subscription error:", err);
        cleanup();
      });

      function cleanup() {
        alive = false;
        clearInterval(keepalive);
        redis.unsubscribe(channel).catch(() => {});
        redis.disconnect();
        try { controller.close(); } catch {}
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

- [ ] **Step 2: install ioredis in web app**

```bash
cd apps/web && npm install ioredis
```

- [ ] **Step 3: verify SSE endpoint compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/api/events
git commit -m "feat: add sse endpoint for real-time pipeline events"
```

---

### Task 9: Add event publishing helper for workers

**Files:**
- Create: `apps/worker/src/publish.ts`

- [ ] **Step 1: create publish helper**

Create `apps/worker/src/publish.ts`:

```typescript
import Redis from "ioredis";
import type { SlushieEvent } from "@slushie/events";
import { logger } from "./logger";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

export async function publishEvent(event: SlushieEvent): Promise<void> {
  const channel = `events:${event.pipelineRunId}`;
  const payload = JSON.stringify(event);

  await redis.publish(channel, payload);

  logger.info(
    {
      type: event.type,
      pipelineRunId: event.pipelineRunId,
    },
    "event published"
  );
}
```

- [ ] **Step 2: verify publish helper compiles**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: commit**

```bash
git add apps/worker/src/publish.ts
git commit -m "feat: add redis pub/sub event publishing for workers"
```

---

### Task 10: Add Claude Code CLI invocation helper

**Files:**
- Create: `apps/worker/src/claude.ts`

- [ ] **Step 1: create claude code cli wrapper**

Create `apps/worker/src/claude.ts`:

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

interface ClaudeCodeOptions {
  prompt: string;
  workingDirectory: string;
  timeoutMs: number; // required — caller must pass the appropriate phase timeout
  pipelineRunId?: string;
}

interface ClaudeCodeResult {
  output: string;
  stderr: string;
  exitCode: number;
}

export async function invokeClaudeCode(
  options: ClaudeCodeOptions
): Promise<ClaudeCodeResult> {
  const { prompt, workingDirectory, timeoutMs, pipelineRunId } = options;

  const agentLogger = pipelineRunId
    ? logger.child({ pipelineRunId })
    : logger;

  agentLogger.info(
    { workingDirectory, promptLength: prompt.length, timeoutMs },
    "invoking claude code"
  );

  try {
    const { stdout, stderr } = await execFileAsync(
      "claude",
      ["-p", prompt, "--output-format", "json"],
      {
        cwd: workingDirectory,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10mb
        env: { ...process.env },
      }
    );

    if (stderr) {
      agentLogger.warn({ stderr }, "claude code stderr output");
    }

    agentLogger.info(
      { outputLength: stdout.length },
      "claude code completed"
    );

    return { output: stdout, stderr: stderr || "", exitCode: 0 };
  } catch (error: unknown) {
    const err = error as {
      code?: number | string;
      killed?: boolean;
      stderr?: string;
      signal?: string;
    };

    if (err.killed) {
      agentLogger.error(
        { signal: err.signal, timeoutMs },
        "claude code session timed out or was killed"
      );
      throw new Error(`claude code timed out after ${timeoutMs}ms`);
    }

    agentLogger.error(
      { exitCode: err.code, stderr: err.stderr },
      "claude code session failed"
    );
    throw error;
  }
}
```

- [ ] **Step 2: verify claude cli is available**

```bash
claude --version
```

Expected: version output confirming claude code cli is installed.

- [ ] **Step 3: verify wrapper compiles**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: commit**

```bash
git add apps/worker/src/claude.ts
git commit -m "feat: add claude code cli invocation wrapper"
```

---

### Task 11: Final integration check

- [ ] **Step 1: install all root dependencies**

```bash
npm install
```

- [ ] **Step 2: verify turbo build works**

```bash
npx turbo build
```

Expected: all packages build without errors.

- [ ] **Step 3: verify web app starts**

```bash
cd apps/web && npm run dev
```

Expected: next.js app at http://localhost:3000 with slushie branding.

- [ ] **Step 4: verify worker starts**

```bash
cd apps/worker && npm run dev
```

Expected: worker process starts with pino logging.

- [ ] **Step 5: commit any fixes**

```bash
git add -A
git commit -m "fix: resolve integration issues from foundation setup"
```

---

## Summary

**What Plan 1 produces:**
- turborepo monorepo with 2 apps + 5 packages
- postgresql database via prisma with all 10 entities from the spec
- redis event bus with typed events (21 event types) and bullmq queues
- next.js app with slushie branding (cherry red, berry blue, inter, lowercase)
- nextauth with google oauth and role-based access
- protected dashboard layout with nav
- sse endpoint for real-time event streaming to the frontend
- worker app with bullmq queue definitions, pino logging, and phase timeouts
- claude code cli invocation wrapper for agent sessions
- redis pub/sub for event publishing from workers to frontend

**What comes next:**
- Plan 2: listener agent + live call dashboard
- Plan 3: agent pipeline + prototype kit
- Plan 4: client tracker + dev chat
- Plan 5: internal review + postmortem
