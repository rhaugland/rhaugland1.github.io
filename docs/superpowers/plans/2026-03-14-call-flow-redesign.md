# Call Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-form new call page with a 3-step wizard supporting existing client reuse, code upload, and previous prototype selection.

**Architecture:** Add a `Codebase` model to Prisma for tracking uploaded and generated codebases per client. New API routes handle client search, codebase listing, file upload/extraction, and codebase naming. The new call page becomes a 3-step wizard (client → codebase → review+start). The pipeline auto-creates `Codebase` records on completion.

**Tech Stack:** Next.js API routes, Prisma, `extract-zip`, `tar` (npm), React client component

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/db/prisma/schema.prisma` | Add Codebase model + relations |
| Create | `apps/web/src/app/api/clients/search/route.ts` | Client search endpoint |
| Create | `apps/web/src/app/api/clients/[id]/codebases/route.ts` | List codebases for a client |
| Create | `apps/web/src/app/api/calls/upload/route.ts` | File upload + extraction |
| Create | `apps/web/src/app/api/codebases/[id]/route.ts` | PATCH to name a codebase |
| Modify | `apps/web/src/app/api/calls/start/route.ts` | Add optional codebaseId support |
| Modify | `apps/web/src/app/api/calls/demo/execute/route.ts` | Add optional codebaseId + clientId |
| Create | `apps/web/src/components/call/wizard-step-client.tsx` | Step 1: client selection UI |
| Create | `apps/web/src/components/call/wizard-step-codebase.tsx` | Step 2: codebase selection UI |
| Create | `apps/web/src/components/call/wizard-step-review.tsx` | Step 3: review + start UI |
| Modify | `apps/web/src/app/(dashboard)/dashboard/calls/new/page.tsx` | Wizard orchestrator |
| Modify | `apps/web/src/app/(dashboard)/dashboard/calls/page.tsx` | Codebase naming prompt |
| Modify | `apps/worker/src/agents/pipeline.ts` | Auto-create Codebase on completion |

---

## Chunk 1: Data Model + Backend API Routes

### Task 1: Add Codebase model to Prisma schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the Codebase model and relations**

Add to the schema file:

```prisma
model Codebase {
  id        String   @id @default(cuid())
  name      String?
  clientId  String
  callId    String?
  source    String   // "uploaded" | "generated"
  path      String
  filename  String?
  sizeBytes Int?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  client Client @relation(fields: [clientId], references: [id])
  call   Call?  @relation(fields: [callId], references: [id])
}
```

Add `codebases Codebase[]` to the `Client` model's relations.
Add `codebases Codebase[]` to the `Call` model's relations.

- [ ] **Step 2: Push schema to database**

```bash
DATABASE_URL="postgresql://ryanhaugland@localhost:5432/slushie" npx prisma db push --schema packages/db/prisma/schema.prisma
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(call-flow): add Codebase model to schema"
```

---

### Task 2: Create client search route

**Files:**
- Create: `apps/web/src/app/api/clients/search/route.ts`

**Context:**
- Auth pattern: `import { auth } from "@/lib/auth"`, check `if (!session)` return 401
- Prisma: `import { prisma } from "@slushie/db"`
- Case-insensitive search: `where: { name: { contains: q, mode: "insensitive" } }`

- [ ] **Step 1: Create the route**

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ clients: [] });
  }

  const clients = await prisma.client.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      industry: true,
      contactName: true,
      contactEmail: true,
      owner: true,
    },
    take: 10,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ clients });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/clients/search/route.ts
git commit -m "feat(call-flow): add client search API route"
```

---

### Task 3: Create client codebases route

**Files:**
- Create: `apps/web/src/app/api/clients/[id]/codebases/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const codebases = await prisma.codebase.findMany({
    where: { clientId: id },
    select: {
      id: true,
      name: true,
      source: true,
      filename: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ codebases });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/clients/[id]/codebases/route.ts
git commit -m "feat(call-flow): add client codebases list API route"
```

---

### Task 4: Create file upload route

**Files:**
- Create: `apps/web/src/app/api/calls/upload/route.ts`
- Modify: `apps/web/package.json` (install `extract-zip`)

**Context:**
- Next.js supports `request.formData()` natively for multipart uploads
- Workspace root: `process.env.WORKSPACE_ROOT ?? "/tmp/slushie-workspaces"`
- Archive extraction: `extract-zip` for zip, Node built-in `zlib.createGunzip()` + `tar.extract()` for tar.gz
- Codebase path is stored relative to WORKSPACE_ROOT
- Magic bytes: zip starts with `PK\x03\x04` (hex 504b0304), gzip starts with `\x1f\x8b`

- [ ] **Step 1: Install extract-zip**

```bash
cd apps/web && npm install extract-zip tar && npm install -D @types/tar
```

- [ ] **Step 2: Create the route**

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";
import { extract as tarExtract } from "tar";
import extractZip from "extract-zip";
import { randomUUID } from "crypto";

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/tmp/slushie-workspaces";
const MAX_SIZE = 100 * 1024 * 1024; // 100MB

const VALID_EXTENSIONS = [".zip", ".tar.gz", ".tgz"];
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const clientId = formData.get("clientId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  // validate file extension
  const filename = file.name;
  const ext = filename.endsWith(".tar.gz")
    ? ".tar.gz"
    : path.extname(filename).toLowerCase();

  if (!VALID_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: "invalid file type — accepted: .zip, .tar.gz, .tgz" },
      { status: 400 }
    );
  }

  // validate file size
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "file too large — max 100MB" },
      { status: 400 }
    );
  }

  // validate magic bytes
  const buffer = Buffer.from(await file.arrayBuffer());
  const isZip = ext === ".zip" && buffer.subarray(0, 4).equals(ZIP_MAGIC);
  const isGzip =
    (ext === ".tar.gz" || ext === ".tgz") &&
    buffer.subarray(0, 2).equals(GZIP_MAGIC);

  if (!isZip && !isGzip) {
    return NextResponse.json(
      { error: "file content does not match extension" },
      { status: 400 }
    );
  }

  // create workspace directory
  const dirName = `codebase-${randomUUID()}`;
  const extractDir = path.join(WORKSPACE_ROOT, dirName);

  try {
    await fs.mkdir(extractDir, { recursive: true });

    if (isZip) {
      // write temp file then extract
      const tmpPath = path.join(WORKSPACE_ROOT, `${dirName}.zip`);
      await fs.writeFile(tmpPath, buffer);
      await extractZip(tmpPath, { dir: extractDir });
      await fs.unlink(tmpPath);
    } else {
      // tar.gz — write temp file then extract
      const tmpPath = path.join(WORKSPACE_ROOT, `${dirName}.tar.gz`);
      await fs.writeFile(tmpPath, buffer);
      await tarExtract({ file: tmpPath, cwd: extractDir });
      await fs.unlink(tmpPath);
    }

    // calculate extracted size
    const sizeBytes = await getDirSize(extractDir);

    // create codebase record
    const codebase = await prisma.codebase.create({
      data: {
        clientId,
        source: "uploaded",
        path: dirName,
        filename,
        sizeBytes,
      },
    });

    return NextResponse.json({
      codebaseId: codebase.id,
      filename,
    });
  } catch (err) {
    console.error("upload extraction failed:", err);
    // cleanup on failure
    await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    return NextResponse.json(
      { error: "failed to extract archive" },
      { status: 500 }
    );
  }
}

async function getDirSize(dir: string): Promise<number> {
  let size = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      size += await getDirSize(fullPath);
    } else {
      const stat = await fs.stat(fullPath);
      size += stat.size;
    }
  }
  return size;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/calls/upload/route.ts apps/web/package.json apps/web/package-lock.json
git commit -m "feat(call-flow): add file upload and extraction route"
```

---

### Task 5: Create codebase naming route

**Files:**
- Create: `apps/web/src/app/api/codebases/[id]/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const codebase = await prisma.codebase.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!codebase) {
    return NextResponse.json({ error: "codebase not found" }, { status: 404 });
  }

  const updated = await prisma.codebase.update({
    where: { id },
    data: { name: name.trim() },
    select: { id: true, name: true },
  });

  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/codebases/[id]/route.ts
git commit -m "feat(call-flow): add codebase naming route"
```

---

### Task 6: Modify start route for codebaseId support

**Files:**
- Modify: `apps/web/src/app/api/calls/start/route.ts`

**Context:**
- Current route at `apps/web/src/app/api/calls/start/route.ts` accepts `clientId` or `clientName`, creates Call + PipelineRun
- Add optional `codebaseId` — if provided, copy codebase contents into new pipeline workspace
- Workspace root: `process.env.WORKSPACE_ROOT ?? "/tmp/slushie-workspaces"`
- Workspace path pattern: `{WORKSPACE_ROOT}/{pipelineRunId}/`

- [ ] **Step 1: Add codebaseId handling to the start route**

After the existing PipelineRun creation, add:

```typescript
import path from "path";
import fs from "fs/promises";

// ... existing code ...

// add codebaseId to destructured body
const { clientId, clientName, industry, contactName, contactEmail, owner, codebaseId } = body;

// ... existing client + call + pipelineRun creation ...

// after pipelineRun creation, seed workspace if codebaseId provided
if (codebaseId) {
  const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/tmp/slushie-workspaces";
  const codebase = await prisma.codebase.findUnique({
    where: { id: codebaseId },
    select: { path: true },
  });

  if (codebase) {
    const sourcePath = path.join(WORKSPACE_ROOT, codebase.path);
    const destPath = path.join(WORKSPACE_ROOT, pipelineRun.id);
    await fs.mkdir(destPath, { recursive: true });
    await fs.cp(sourcePath, destPath, { recursive: true });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/calls/start/route.ts
git commit -m "feat(call-flow): add codebaseId support to start route"
```

---

### Task 7: Modify demo execute route for codebaseId + clientId

**Files:**
- Modify: `apps/web/src/app/api/calls/demo/execute/route.ts`

**Context:**
- Current route always creates a new client. Add optional `clientId` to reuse existing.
- Add optional `codebaseId` — same workspace seeding as start route.

- [ ] **Step 1: Add clientId and codebaseId handling**

Modify the body destructuring and client creation:

```typescript
const { clientName, industry, contactName, contactEmail, owner, transcript, clientId, codebaseId } = body;

// ... validation (clientName OR clientId required, transcript required) ...

// client: reuse existing or create new
let client;
if (clientId) {
  client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }
} else {
  if (!clientName) {
    return NextResponse.json({ error: "clientName or clientId is required" }, { status: 400 });
  }
  client = await prisma.client.create({
    data: {
      name: clientName,
      industry: industry || "other",
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      owner: owner || session.user?.name || session.user?.email || null,
    },
  });
}

// ... call + pipelineRun creation (use client.id) ...

// after pipelineRun creation, seed workspace if codebaseId provided
if (codebaseId) {
  const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/tmp/slushie-workspaces";
  const codebase = await prisma.codebase.findUnique({
    where: { id: codebaseId },
    select: { path: true },
  });

  if (codebase) {
    const sourcePath = path.join(WORKSPACE_ROOT, codebase.path);
    const destPath = path.join(WORKSPACE_ROOT, pipelineRun.id);
    await fs.mkdir(destPath, { recursive: true });
    await fs.cp(sourcePath, destPath, { recursive: true });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/calls/demo/execute/route.ts
git commit -m "feat(call-flow): add codebaseId and clientId to demo execute route"
```

---

## Chunk 2: Client Route + Wizard UI

### Task 8: Create client creation route

**Files:**
- Create: `apps/web/src/app/api/clients/route.ts`

**Context:**
- The wizard needs to eagerly create clients in step 1 before advancing to step 2
- Follows same pattern as client creation in `/api/calls/start`

- [ ] **Step 1: Create the route**

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, industry, contactName, contactEmail, owner } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const client = await prisma.client.create({
    data: {
      name,
      industry: industry ?? "other",
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      owner: owner || session.user?.name || session.user?.email || null,
    },
  });

  return NextResponse.json({
    id: client.id,
    name: client.name,
    industry: client.industry,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/clients/route.ts
git commit -m "feat(call-flow): add client creation route for wizard step 1"
```

---

### Task 9: Create Step 1 component — client selection (was Task 8)

**Files:**
- Create: `apps/web/src/components/call/wizard-step-client.tsx`

**Context:**
- Two modes: "new" (shows form fields) and "existing" (shows search)
- Search input debounced 300ms, queries `GET /api/clients/search?q=...`
- Selecting a client shows read-only details
- Parent passes down form field state and setters
- Uses same Tailwind classes as existing form (see `apps/web/src/app/(dashboard)/dashboard/calls/new/page.tsx` for styling patterns)

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface Client {
  id: string;
  name: string;
  industry: string;
  contactName: string | null;
  contactEmail: string | null;
  owner: string | null;
}

interface Employee {
  id: string;
  name: string;
  email: string | null;
}

interface StepClientProps {
  clientMode: "new" | "existing";
  setClientMode: (mode: "new" | "existing") => void;
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
  clientName: string;
  setClientName: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  contactName: string;
  setContactName: (v: string) => void;
  contactEmail: string;
  setContactEmail: (v: string) => void;
  owner: string;
  setOwner: (v: string) => void;
  employees: Employee[];
  error: string | null;
}

const INDUSTRIES = [
  "plumbing", "cleaning", "consulting", "accounting", "legal",
  "real estate", "healthcare", "construction", "landscaping",
  "automotive", "restaurant", "retail", "other",
];

export default function WizardStepClient({
  clientMode, setClientMode, selectedClient, setSelectedClient,
  clientName, setClientName, industry, setIndustry,
  contactName, setContactName, contactEmail, setContactEmail,
  owner, setOwner, employees, error,
}: StepClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (clientMode !== "existing" || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/clients/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.clients);
        }
      } catch {
        // ignore search errors
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, clientMode]);

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground">who is this call with?</h3>

      {/* mode selection */}
      <div className="mt-4 flex gap-3">
        <button
          onClick={() => { setClientMode("new"); setSelectedClient(null); }}
          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
            clientMode === "new"
              ? "border-primary bg-primary/5 text-primary"
              : "border-gray-300 text-foreground hover:bg-gray-50"
          }`}
        >
          new client
        </button>
        <button
          onClick={() => { setClientMode("existing"); }}
          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
            clientMode === "existing"
              ? "border-primary bg-primary/5 text-primary"
              : "border-gray-300 text-foreground hover:bg-gray-50"
          }`}
        >
          existing client
        </button>
      </div>

      {/* new client form */}
      {clientMode === "new" && (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="clientName" className="mb-1 block text-sm font-medium text-foreground">
              client / business name *
            </label>
            <input
              id="clientName"
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. mike's plumbing"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="industry" className="mb-1 block text-sm font-medium text-foreground">
              industry
            </label>
            <select
              id="industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">select an industry</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="contactName" className="mb-1 block text-sm font-medium text-foreground">
                contact name
              </label>
              <input
                id="contactName"
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. mike johnson"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="contactEmail" className="mb-1 block text-sm font-medium text-foreground">
                contact email
              </label>
              <input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="mike@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label htmlFor="owner" className="mb-1 block text-sm font-medium text-foreground">
              slushie owner
            </label>
            <select
              id="owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">select owner</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.name}>{emp.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* existing client search */}
      {clientMode === "existing" && !selectedClient && (
        <div className="mt-4">
          <label htmlFor="clientSearch" className="mb-1 block text-sm font-medium text-foreground">
            search clients
          </label>
          <input
            id="clientSearch"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="type to search..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searching && <p className="mt-2 text-xs text-muted">searching...</p>}
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-1">
              {searchResults.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClient(c); setSearchQuery(""); setSearchResults([]); }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <span className="font-medium text-foreground">{c.name}</span>
                  {c.industry && (
                    <span className="ml-2 text-muted">({c.industry})</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {searchQuery.trim() && !searching && searchResults.length === 0 && (
            <p className="mt-2 text-xs text-muted">no clients found</p>
          )}
        </div>
      )}

      {/* selected client display */}
      {clientMode === "existing" && selectedClient && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">{selectedClient.name}</p>
              <p className="text-sm text-muted">
                {selectedClient.industry}
                {selectedClient.contactName && ` · ${selectedClient.contactName}`}
              </p>
            </div>
            <button
              onClick={() => setSelectedClient(null)}
              className="text-sm text-muted underline hover:text-foreground"
            >
              change
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-primary">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/call/wizard-step-client.tsx
git commit -m "feat(call-flow): add wizard step 1 — client selection"
```

---

### Task 10: Create Step 2 component — codebase selection

**Files:**
- Create: `apps/web/src/components/call/wizard-step-codebase.tsx`

**Context:**
- Three modes: "new" (no code), "upload" (file picker with drag-drop), "previous" (dropdown)
- "previous" only available when `clientMode === "existing"` and `selectedClient !== null`
- Upload sends multipart FormData to `POST /api/calls/upload` with `clientId`
- Lists codebases from `GET /api/clients/{id}/codebases`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CodebaseEntry {
  id: string;
  name: string | null;
  source: string;
  filename: string | null;
  createdAt: string;
}

interface StepCodebaseProps {
  clientMode: "new" | "existing";
  clientId: string | null; // either selectedClient.id or createdClientId
  codebaseMode: "new" | "upload" | "previous";
  setCodebaseMode: (mode: "new" | "upload" | "previous") => void;
  uploadedCodebaseId: string | null;
  setUploadedCodebaseId: (id: string | null) => void;
  uploadedFilename: string | null;
  setUploadedFilename: (name: string | null) => void;
  selectedCodebaseId: string | null;
  setSelectedCodebaseId: (id: string | null) => void;
  setSelectedCodebaseName: (name: string | null) => void;
  error: string | null;
  setError: (err: string | null) => void;
}

export default function WizardStepCodebase({
  clientMode, clientId,
  codebaseMode, setCodebaseMode,
  uploadedCodebaseId, setUploadedCodebaseId,
  uploadedFilename, setUploadedFilename,
  selectedCodebaseId, setSelectedCodebaseId, setSelectedCodebaseName,
  error, setError,
}: StepCodebaseProps) {
  const [codebases, setCodebases] = useState<CodebaseEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // fetch codebases for existing client
  useEffect(() => {
    if (clientMode !== "existing" || !clientId) return;
    fetch(`/api/clients/${clientId}/codebases`)
      .then((r) => r.json())
      .then((data) => setCodebases(data.codebases ?? []))
      .catch(() => {});
  }, [clientMode, clientId]);

  const handleUpload = useCallback(async (file: File) => {
    setError(null);

    // validate extension
    const name = file.name.toLowerCase();
    if (!name.endsWith(".zip") && !name.endsWith(".tar.gz") && !name.endsWith(".tgz")) {
      setError("invalid file type — accepted: .zip, .tar.gz, .tgz");
      return;
    }

    // validate size
    if (file.size > 100 * 1024 * 1024) {
      setError("file too large — max 100MB");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientId", clientId!);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/calls/upload");

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      const result = await new Promise<{ codebaseId: string; filename: string }>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data.error ?? "upload failed"));
          }
        };
        xhr.onerror = () => reject(new Error("upload failed"));
        xhr.send(formData);
      });

      setUploadedCodebaseId(result.codebaseId);
      setUploadedFilename(result.filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }, [clientId, setError, setUploadedCodebaseId, setUploadedFilename]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground">select a codebase</h3>

      {/* mode selection */}
      <div className="mt-4 flex gap-3">
        <button
          onClick={() => { setCodebaseMode("new"); setSelectedCodebaseId(null); }}
          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
            codebaseMode === "new"
              ? "border-primary bg-primary/5 text-primary"
              : "border-gray-300 text-foreground hover:bg-gray-50"
          }`}
        >
          new project
        </button>
        <button
          onClick={() => { setCodebaseMode("upload"); setSelectedCodebaseId(null); }}
          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
            codebaseMode === "upload"
              ? "border-primary bg-primary/5 text-primary"
              : "border-gray-300 text-foreground hover:bg-gray-50"
          }`}
        >
          upload existing
        </button>
        {clientMode === "existing" && codebases.length > 0 && (
          <button
            onClick={() => { setCodebaseMode("previous"); setUploadedCodebaseId(null); setUploadedFilename(null); }}
            className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
              codebaseMode === "previous"
                ? "border-primary bg-primary/5 text-primary"
                : "border-gray-300 text-foreground hover:bg-gray-50"
            }`}
          >
            use previous
          </button>
        )}
      </div>

      {/* upload area */}
      {codebaseMode === "upload" && (
        <div className="mt-4">
          {!uploadedCodebaseId ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition ${
                dragOver ? "border-primary bg-primary/5" : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.tar.gz,.tgz"
                onChange={handleFileSelect}
                className="hidden"
              />
              {uploading ? (
                <div>
                  <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted">{uploadProgress}%</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-foreground">
                    drop a file here or click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted">.zip, .tar.gz, .tgz — max 100MB</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">uploaded: {uploadedFilename}</p>
                <button
                  onClick={() => { setUploadedCodebaseId(null); setUploadedFilename(null); }}
                  className="text-sm text-muted underline hover:text-foreground"
                >
                  remove
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* previous codebases dropdown */}
      {codebaseMode === "previous" && (
        <div className="mt-4">
          <label htmlFor="previousCodebase" className="mb-1 block text-sm font-medium text-foreground">
            select a previous codebase
          </label>
          <select
            id="previousCodebase"
            value={selectedCodebaseId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              setSelectedCodebaseId(id);
              const cb = codebases.find((c) => c.id === id);
              setSelectedCodebaseName(cb?.name ?? cb?.filename ?? null);
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">choose a codebase</option>
            {codebases.map((cb) => (
              <option key={cb.id} value={cb.id}>
                {cb.name ?? cb.filename ?? "unnamed"} ({cb.source}) — {new Date(cb.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-primary">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/call/wizard-step-codebase.tsx
git commit -m "feat(call-flow): add wizard step 2 — codebase selection"
```

---

### Task 11: Create Step 3 component — review + start

**Files:**
- Create: `apps/web/src/components/call/wizard-step-review.tsx`

**Context:**
- Shows a summary of selections from steps 1 and 2
- "start call" and "demo call" buttons
- Codebase status: "new project" or "uploaded: filename" or "previous: name"

- [ ] **Step 1: Create the component**

```tsx
"use client";

interface StepReviewProps {
  clientMode: "new" | "existing";
  clientName: string;
  selectedClientName: string | null;
  codebaseMode: "new" | "upload" | "previous";
  uploadedFilename: string | null;
  selectedCodebaseName: string | null;
  isLoading: boolean;
  error: string | null;
  onStartCall: () => void;
  onDemoCall: () => void;
}

export default function WizardStepReview({
  clientMode, clientName, selectedClientName,
  codebaseMode, uploadedFilename, selectedCodebaseName,
  isLoading, error, onStartCall, onDemoCall,
}: StepReviewProps) {
  const displayClientName = clientMode === "existing" ? selectedClientName : clientName;

  const codebaseLabel =
    codebaseMode === "new"
      ? "new project"
      : codebaseMode === "upload"
        ? `uploaded: ${uploadedFilename}`
        : `previous: ${selectedCodebaseName ?? "unnamed"}`;

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground">review & start</h3>

      <div className="mt-4 space-y-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase text-muted">client</p>
          <p className="mt-1 text-sm text-foreground">
            {displayClientName}
            <span className="ml-2 text-muted">({clientMode})</span>
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase text-muted">codebase</p>
          <p className="mt-1 text-sm text-foreground">{codebaseLabel}</p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-primary">{error}</p>}

      <div className="mt-6 flex gap-3">
        <button
          onClick={onStartCall}
          disabled={isLoading}
          className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {isLoading ? "starting call..." : "start call"}
        </button>
        <button
          onClick={onDemoCall}
          disabled={isLoading}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-gray-50 disabled:opacity-50"
        >
          demo call
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/call/wizard-step-review.tsx
git commit -m "feat(call-flow): add wizard step 3 — review and start"
```

---

### Task 12: Rewrite new call page as wizard orchestrator

**Files:**
- Modify: `apps/web/src/app/(dashboard)/dashboard/calls/new/page.tsx`

**Context:**
- Replace the current single-form with a 3-step wizard
- Imports the three step components
- Manages all wizard state, step navigation, validation
- Handles eager client creation when advancing from step 1 (new client)
- Resolves codebaseId from uploadedCodebaseId or selectedCodebaseId
- Calls `/api/calls/start` with clientId + codebaseId
- Demo call flow preserved: generates transcript, shows review, executes with clientId + codebaseId
- Step indicators at top: 1 → 2 → 3

- [ ] **Step 1: Rewrite the page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WizardStepClient from "@/components/call/wizard-step-client";
import WizardStepCodebase from "@/components/call/wizard-step-codebase";
import WizardStepReview from "@/components/call/wizard-step-review";

interface Employee {
  id: string;
  name: string;
  email: string | null;
}

interface Client {
  id: string;
  name: string;
  industry: string;
  contactName: string | null;
  contactEmail: string | null;
  owner: string | null;
}

type DemoMode = "idle" | "loading" | "review";

const STEPS = ["client", "codebase", "review"] as const;

export default function NewCallPage() {
  const router = useRouter();

  // wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // step 1: client
  const [clientMode, setClientMode] = useState<"new" | "existing">("new");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [industry, setIndustry] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [owner, setOwner] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);

  // step 2: codebase
  const [codebaseMode, setCodebaseMode] = useState<"new" | "upload" | "previous">("new");
  const [uploadedCodebaseId, setUploadedCodebaseId] = useState<string | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [selectedCodebaseId, setSelectedCodebaseId] = useState<string | null>(null);
  const [selectedCodebaseName, setSelectedCodebaseName] = useState<string | null>(null);

  // general
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // demo call
  const [demoMode, setDemoMode] = useState<DemoMode>("idle");
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data) => setEmployees(data))
      .catch(() => {});
  }, []);

  const getClientId = (): string | null => {
    if (clientMode === "existing") return selectedClient?.id ?? null;
    return createdClientId;
  };

  const getCodebaseId = (): string | null => {
    if (codebaseMode === "upload") return uploadedCodebaseId;
    if (codebaseMode === "previous") return selectedCodebaseId;
    return null;
  };

  // step 1 → 2: validate and eagerly create client if new
  const advanceToStep2 = async () => {
    setError(null);

    if (clientMode === "new") {
      if (!clientName.trim()) {
        setError("client name is required");
        return;
      }

      setIsLoading(true);
      try {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: clientName.trim(),
            industry: industry || "other",
            contactName: contactName.trim() || undefined,
            contactEmail: contactEmail.trim() || undefined,
            owner: owner || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "failed to create client");
        }

        const data = await res.json();
        setCreatedClientId(data.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "something went wrong");
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
    } else {
      if (!selectedClient) {
        setError("please select a client");
        return;
      }
    }

    setStep(2);
  };

  // step 2 → 3: validate codebase selection
  const advanceToStep3 = () => {
    setError(null);

    if (codebaseMode === "upload" && !uploadedCodebaseId) {
      setError("please upload a file first");
      return;
    }

    if (codebaseMode === "previous" && !selectedCodebaseId) {
      setError("please select a codebase");
      return;
    }

    setStep(3);
  };

  const handleStartCall = async () => {
    const clientId = getClientId();
    if (!clientId) {
      setError("client not found — go back and select a client");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const codebaseId = getCodebaseId();

      const res = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          codebaseId: codebaseId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "failed to start call");
      }

      const data = await res.json();
      router.push(`/dashboard/calls/live/${data.pipelineRunId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
      setIsLoading(false);
    }
  };

  const handleDemoCall = async () => {
    setError(null);
    setDemoMode("loading");

    const name = clientMode === "existing" ? selectedClient?.name : clientName.trim();

    try {
      const res = await fetch("/api/calls/demo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: name,
          industry: clientMode === "existing" ? selectedClient?.industry : (industry || "other"),
          contactName: clientMode === "existing" ? selectedClient?.contactName : (contactName.trim() || undefined),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "failed to generate transcript");
      }

      const data = await res.json();
      setTranscript(data.transcript);
      setDemoMode("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
      setDemoMode("idle");
    }
  };

  const handleDemoExecute = async () => {
    setError(null);
    setDemoMode("loading");

    try {
      const clientId = getClientId();
      const codebaseId = getCodebaseId();

      const body: Record<string, unknown> = {
        transcript,
        codebaseId: codebaseId || undefined,
      };

      if (clientId) {
        body.clientId = clientId;
      } else {
        body.clientName = clientName.trim();
        body.industry = industry || "other";
        body.contactName = contactName.trim() || undefined;
        body.contactEmail = contactEmail.trim() || undefined;
        body.owner = owner || undefined;
      }

      const res = await fetch("/api/calls/demo/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "failed to execute demo call");
      }

      router.push("/dashboard/calls");
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
      setDemoMode("review");
    }
  };

  // demo loading state
  if (demoMode === "loading") {
    return (
      <div className="mx-auto max-w-lg pt-8">
        <h2 className="text-2xl font-bold text-foreground">demo call</h2>
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted">
            {transcript ? "executing demo call..." : "generating transcript..."}
          </p>
        </div>
      </div>
    );
  }

  // demo review state
  if (demoMode === "review") {
    return (
      <div className="mx-auto max-w-2xl pt-8">
        <h2 className="text-2xl font-bold text-foreground">review transcript</h2>
        <p className="mt-1 text-sm text-muted">
          review the generated transcript. rework to generate a new one, or execute to run the pipeline.
        </p>
        <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-lg border border-gray-300 bg-white p-4">
          <pre className="whitespace-pre-wrap text-sm text-foreground font-mono leading-relaxed">{transcript}</pre>
        </div>
        {error && <p className="mt-3 text-sm text-primary">{error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleDemoExecute}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            execute
          </button>
          <button
            onClick={handleDemoCall}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-gray-50"
          >
            rework
          </button>
          <button
            onClick={() => { setDemoMode("idle"); setError(null); }}
            className="text-sm text-muted underline hover:text-foreground"
          >
            back
          </button>
        </div>
      </div>
    );
  }

  // wizard
  return (
    <div className="mx-auto max-w-lg pt-8">
      <h2 className="text-2xl font-bold text-foreground">start a new call</h2>
      <p className="mt-1 text-sm text-muted">
        enter the client details and pour a fresh discovery call.
      </p>

      {/* step indicators */}
      <div className="mt-4 flex items-center gap-2">
        {STEPS.map((label, i) => {
          const stepNum = (i + 1) as 1 | 2 | 3;
          const isActive = step === stepNum;
          const isComplete = step > stepNum;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-6 ${isComplete ? "bg-primary" : "bg-gray-300"}`} />}
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  isActive
                    ? "bg-primary text-white"
                    : isComplete
                      ? "bg-primary/20 text-primary"
                      : "bg-gray-200 text-muted"
                }`}
              >
                {stepNum}
              </div>
              <span className={`text-xs ${isActive ? "font-medium text-foreground" : "text-muted"}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        {step === 1 && (
          <WizardStepClient
            clientMode={clientMode}
            setClientMode={setClientMode}
            selectedClient={selectedClient}
            setSelectedClient={setSelectedClient}
            clientName={clientName}
            setClientName={setClientName}
            industry={industry}
            setIndustry={setIndustry}
            contactName={contactName}
            setContactName={setContactName}
            contactEmail={contactEmail}
            setContactEmail={setContactEmail}
            owner={owner}
            setOwner={setOwner}
            employees={employees}
            error={error}
          />
        )}

        {step === 2 && (
          <WizardStepCodebase
            clientMode={clientMode}
            clientId={getClientId()}
            codebaseMode={codebaseMode}
            setCodebaseMode={setCodebaseMode}
            uploadedCodebaseId={uploadedCodebaseId}
            setUploadedCodebaseId={setUploadedCodebaseId}
            uploadedFilename={uploadedFilename}
            setUploadedFilename={setUploadedFilename}
            selectedCodebaseId={selectedCodebaseId}
            setSelectedCodebaseId={setSelectedCodebaseId}
            setSelectedCodebaseName={setSelectedCodebaseName}
            error={error}
            setError={setError}
          />
        )}

        {step === 3 && (
          <WizardStepReview
            clientMode={clientMode}
            clientName={clientName}
            selectedClientName={selectedClient?.name ?? null}
            codebaseMode={codebaseMode}
            uploadedFilename={uploadedFilename}
            selectedCodebaseName={selectedCodebaseName}
            isLoading={isLoading}
            error={error}
            onStartCall={handleStartCall}
            onDemoCall={handleDemoCall}
          />
        )}
      </div>

      {/* navigation */}
      <div className="mt-6 flex items-center justify-between">
        {step > 1 ? (
          <button
            onClick={() => { setStep((step - 1) as 1 | 2 | 3); setError(null); }}
            className="text-sm text-muted underline hover:text-foreground"
          >
            back
          </button>
        ) : (
          <div />
        )}
        {step < 3 && (
          <button
            onClick={step === 1 ? advanceToStep2 : advanceToStep3}
            disabled={isLoading}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {isLoading ? "loading..." : "next"}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/(dashboard)/dashboard/calls/new/page.tsx
git commit -m "feat(call-flow): rewrite new call page as 3-step wizard"
```

---

## Chunk 3: Pipeline Integration + Codebase Naming

### Task 13: Auto-create Codebase on pipeline completion

**Files:**
- Modify: `apps/worker/src/agents/pipeline.ts`

**Context:**
- When `final.review.complete` fires, the pipeline should create a `Codebase` record with `source: "generated"` and `name: null`
- The codebase `path` is the pipelineRun's workspace directory (relative to WORKSPACE_ROOT), which is the pipelineRunId itself
- Link it to the call and client via the pipelineRun

- [ ] **Step 1: Add codebase creation to the final.review.complete handler**

In `apps/worker/src/agents/pipeline.ts`, inside the `case "final.review.complete"` block, after the existing logic and before the `break`, add:

```typescript
// auto-create generated codebase record
try {
  const completedRun = await prisma.pipelineRun.findUnique({
    where: { id: event.pipelineRunId },
    select: { clientId: true, callId: true },
  });

  if (completedRun) {
    await prisma.codebase.create({
      data: {
        clientId: completedRun.clientId,
        callId: completedRun.callId,
        source: "generated",
        path: event.pipelineRunId,
      },
    });

    log.info(
      { pipelineRunId: event.pipelineRunId },
      "pipeline: created generated codebase record"
    );
  }
} catch (err) {
  log.error(err, "pipeline: failed to create generated codebase record");
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker/src/agents/pipeline.ts
git commit -m "feat(call-flow): auto-create codebase record on pipeline completion"
```

---

### Task 14: Add codebase naming prompt to calls list page

**Files:**
- Modify: `apps/web/src/app/(dashboard)/dashboard/calls/page.tsx`

**Context:**
- The calls list is a server component that queries calls with client + pipelineRun
- Need to also include codebases in the query to find unnamed generated ones
- For calls with an unnamed generated codebase, show an inline input to name it
- The naming input PATCHes `/api/codebases/[id]`
- This requires a client component wrapper for the naming input

- [ ] **Step 1: Update the calls query to include codebases**

In the calls list page, update the `prisma.call.findMany` include to add:

```typescript
codebases: {
  where: { source: "generated", name: null },
  select: { id: true },
},
```

- [ ] **Step 2: Add naming UI**

After each call row in the table, if `call.codebases.length > 0` (has unnamed generated codebase), render an inline form. Since the page is a server component, create a small client component:

Create `apps/web/src/components/call/codebase-name-input.tsx`:

```tsx
"use client";

import { useState } from "react";

export default function CodebaseNameInput({ codebaseId }: { codebaseId: string }) {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/codebases/${codebaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) setSaved(true);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return <span className="text-xs text-muted">saved as "{name}"</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="name this build..."
        className="rounded border border-gray-300 px-2 py-1 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
      />
      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
      >
        {saving ? "..." : "save"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(dashboard)/dashboard/calls/page.tsx apps/web/src/components/call/codebase-name-input.tsx
git commit -m "feat(call-flow): add codebase naming prompt to calls list"
```
