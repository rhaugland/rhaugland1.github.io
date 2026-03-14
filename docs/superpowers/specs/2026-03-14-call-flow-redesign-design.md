# call flow redesign — design spec

**date:** 2026-03-14
**status:** draft
**owner:** ryan haugland

---

## overview

replace the single-form new call page with a 3-step wizard that supports existing client reuse, code upload, and previous prototype selection. add a `Codebase` model to track uploaded and generated codebases per client, enabling iterative builds across calls.

---

## data model

### new model: Codebase

```prisma
model Codebase {
  id        String   @id @default(cuid())
  name      String?
  clientId  String
  callId    String?
  source    String   // "uploaded" | "generated"
  path      String   // relative to WORKSPACE_ROOT
  filename  String?
  sizeBytes Int?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  client Client  @relation(fields: [clientId], references: [id])
  call   Call?   @relation(fields: [callId], references: [id])
}
```

- `source: "uploaded"` — user uploaded a zip/tar.gz before the call
- `source: "generated"` — prototype produced by the pipeline after a call
- `name` starts null for generated codebases; the user is prompted to name it when the pipeline completes
- `path` is relative to `WORKSPACE_ROOT` (e.g. `codebase-abc123/`), resolved to full path at runtime via `path.join(WORKSPACE_ROOT, codebase.path)`
- `filename` stores the original upload filename (null for generated)
- `sizeBytes` stores the extracted size for display and future quotas
- `callId` is NOT unique — a single call can have multiple codebases (an input one and a generated output one)

### model changes

- `Client` gains `codebases Codebase[]` relation
- `Call` gains `codebases Codebase[]` relation (one-to-many, since a call can have an input codebase and a generated output codebase)

---

## wizard ui flow

the new call page (`/dashboard/calls/new`) becomes a 3-step wizard. state lives in the page component — no new contexts or stores.

**assumption:** the web app and worker run on the same machine with shared filesystem access to `WORKSPACE_ROOT`.

### step 1: client selection

two cards: "new client" and "existing client".

**new client:** reveals form fields — client name (required), industry (dropdown), contact name, contact email, owner (employee dropdown). same fields and validation as today. the client record is created eagerly when the user advances to step 2 (so `clientId` is available for uploads and codebase queries). if the user goes back to step 1 and changes details, the client record is updated.

**existing client:** reveals a search input (debounced 300ms) that queries `GET /api/clients/search?q=...`. shows matching clients as a selectable list with name + industry. selecting one displays client details as read-only text. the user can click to change selection.

### step 2: codebase selection

**if new client:** two options — "new project" (no code, pipeline starts fresh) or "upload existing" (file picker).

**if existing client:** three options — "new project", "upload existing", or "use previous" (dropdown of that client's codebases from `GET /api/clients/{id}/codebases`, showing name + source type + date).

**upload flow:** file picker accepts `.zip`, `.tar.gz`, `.tgz` files up to 100MB. drag-and-drop supported. validates file type by both extension and magic bytes (zip: `PK\x03\x04`, gzip: `\x1f\x8b`). after selecting a file, shows filename and a progress bar during upload to `POST /api/calls/upload`. the uploaded codebase record is created server-side, linked to the client. on failure, shows error inline and lets user retry.

### step 3: review + start

summary of selections:
- client: name (new or existing)
- codebase: "new project" or "uploaded: filename.zip" or "previous: Codebase Name"

two buttons: "start call" (existing behavior + codebaseId) and "demo call" (existing demo behavior + codebaseId).

### step validation

| transition | requires |
|---|---|
| step 1 → step 2 | new client: `clientName` filled. existing client: a client selected. |
| step 2 → step 3 | a codebase option selected. if "upload", upload must be complete. |
| step 3 → start | no additional validation (all data gathered in steps 1-2). |

### navigation

back/forward buttons on each step. step indicators at the top (1 → 2 → 3). form state preserved when navigating back. the wizard mode is tracked as `step: 1 | 2 | 3`.

### state management

all state in the page component:
- `step: 1 | 2 | 3`
- `clientMode: "new" | "existing"`
- `selectedClient: Client | null` (for existing client selection)
- `createdClientId: string | null` (for eagerly created new clients)
- `codebaseMode: "new" | "upload" | "previous"`
- `uploadedCodebaseId: string | null`
- `selectedCodebaseId: string | null`
- form fields: `clientName`, `industry`, `contactName`, `contactEmail`, `owner`
- `isLoading`, `error`

plus the existing demo call state: `demoMode: "form" | "loading" | "review"`, `transcript`

---

## new api routes

### GET `/api/clients/search`

searches clients by name.

- **auth:** requires valid session
- **query:** `q` — search string
- **action:** case-insensitive `contains` search on client name
- **response:** `{ clients: [{ id, name, industry, contactName, contactEmail, owner }] }`
- **limit:** 10 results
- **empty query:** returns empty array

### GET `/api/clients/[id]/codebases`

lists codebases for a client.

- **auth:** requires valid session
- **action:** find all codebases for the client, ordered by `createdAt` desc
- **response:** `{ codebases: [{ id, name, source, filename, createdAt }] }`

### POST `/api/calls/upload`

uploads and extracts a code archive.

- **auth:** requires valid session
- **body:** multipart form data — `file` (zip/tar.gz/tgz, max 100MB), `clientId` (string, required — the client must already exist from step 1)
- **action:**
  1. validates file type by extension (`.zip`, `.tar.gz`, `.tgz`) and magic bytes (zip: `PK\x03\x04`, gzip: `\x1f\x8b`), and size (100MB max)
  2. creates a workspace directory using the existing workspace path pattern
  3. extracts archive into the workspace directory
  4. creates a `Codebase` record with `source: "uploaded"`, `clientId`, relative `path`, `filename`, `sizeBytes`
- **response:** `{ codebaseId: string, filename: string }`
- **error handling:** returns 400 for invalid file type/size, 500 for extraction failure. cleans up partial workspace on failure.

**extraction:** uses `extract-zip` for `.zip` files and Node's built-in `zlib` + `tar` for `.tar.gz`/`.tgz` files.

### PATCH `/api/codebases/[id]`

names a codebase.

- **auth:** requires valid session
- **body:** `{ name: string }`
- **action:** updates the codebase name
- **response:** `{ id, name }`

---

## modified api routes

### POST `/api/calls/start` (modified)

- **new field:** optional `codebaseId: string` in request body
- **behavior change:** if `codebaseId` is provided:
  1. looks up the `Codebase` record
  2. copies the codebase's path contents into the new pipeline workspace
  3. everything else unchanged (create Call, PipelineRun, return IDs)
- **existing client flow:** when `clientId` is provided (existing client selected in step 1), skips client creation — same as current behavior
- **no codebaseId:** behaves exactly as today (fresh workspace)

### POST `/api/calls/demo/execute` (modified)

- **new fields:** optional `codebaseId: string` and optional `clientId: string` in request body
- **existing client support:** if `clientId` is provided, uses that client instead of creating a new one
- **codebase support:** seeds workspace from codebase path if `codebaseId` provided

---

## pipeline integration

### upload extraction

the upload route extracts archives into a workspace directory under `WORKSPACE_ROOT`. paths stored in the `Codebase` record are relative to `WORKSPACE_ROOT`. file type detected by extension + magic bytes.

### codebase reuse at call start

when `/api/calls/start` receives a `codebaseId`, the pipeline workspace is seeded by copying the contents of that codebase's resolved path into the new workspace. the builder agent then works on top of the existing code rather than starting from scratch.

### auto-creating generated codebases

when the pipeline fires `final.review.complete`, the worker creates a `Codebase` record with `source: "generated"`, `name: null`, linked to the call and client. the naming prompt appears on the calls list page — calls with an unnamed generated codebase show an inline input next to the call entry that PATCHes `/api/codebases/[id]`.

---

## scope boundaries

### in scope
- 3-step wizard UI replacing the single-form new call page
- `Codebase` prisma model + migration
- eager client creation for new clients at step 1 completion
- client search API route (with 300ms client-side debounce)
- client codebases list API route
- file upload + extraction API route (with magic bytes validation)
- codebase naming API route
- modifications to `/api/calls/start` and `/api/calls/demo/execute` for `codebaseId` and `clientId`
- auto-creating `Codebase` records on pipeline completion
- naming prompt for generated codebases on calls list page

### out of scope
- changes to the pipeline agents (analyst, builder, reviewer)
- client editing/management UI changes
- codebase deletion or version history
- git integration for codebases
- codebase preview/browsing UI
- changes to the live call page or build preview panel
- authorization model for codebase ownership (no user-to-client mapping exists yet)

### known limitations
- no cleanup of orphaned codebases if user abandons wizard after upload
- no user-level authorization on codebase rename (any authenticated user can rename any codebase)
