# slushie listener agent + live call dashboard implementation plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add real-time call transcription via deepgram, ai coaching suggestions via claude code cli, and a live call dashboard so a slushie team member can run a discovery call with a client and receive real-time coaching cards while the transcript streams in.

**Architecture:** browser captures microphone audio via web audio api, streams raw pcm over a websocket to a next.js api route, which proxies to deepgram's streaming api for real-time transcription. transcript chunks publish to redis pub/sub and are stored in the database. a bullmq coaching worker invokes `claude -p` every 30 seconds with the last 5 minutes of transcript context and returns coaching cards. the live call dashboard receives transcript chunks and coaching cards via sse. call start creates Call and PipelineRun records; call end publishes `call.ended` to trigger the downstream pipeline.

**Tech Stack:** next.js, typescript, web audio api, websocket, deepgram streaming sdk, bullmq, redis pub/sub, sse, claude code cli, prisma, pino, tailwind css

**Spec:** `docs/superpowers/specs/2026-03-13-slushie-platform-design.md`

**Depends on:** plan 1 (monorepo, database, event bus, auth, brand system, sse endpoint, `publishEvent` from `apps/worker/src/publish.ts`, `invokeClaudeCode` from `apps/worker/src/claude.ts`, `createAgentLogger` from `apps/worker/src/logger.ts`, queue definitions from `apps/worker/src/queues.ts`)

**Produces:** working live call flow — team member starts a call, sees live transcript on the left, coaching cards on the right, and ends the call to trigger downstream pipeline events via `call.ended`.

---

## Chunk 1: Deepgram Integration + Audio Proxy

### Task 1: Add deepgram client library and types

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/deepgram.ts`
- Create: `apps/web/src/types/deepgram.ts`

- [ ] **Step 1: install deepgram sdk in the web app**

```bash
cd apps/web && npm install @deepgram/sdk ws && npm install -D @types/ws
```

Expected output: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2: create deepgram types**

Create `apps/web/src/types/deepgram.ts`:

```typescript
export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker: number;
  punctuated_word: string;
}

export interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}

export interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

export interface DeepgramTranscriptResponse {
  type: "Results";
  channel_index: [number, number];
  duration: number;
  start: number;
  is_final: boolean;
  speech_final: boolean;
  channel: DeepgramChannel;
  metadata: {
    request_id: string;
    model_info: {
      name: string;
      version: string;
      arch: string;
    };
  };
}

export interface DeepgramErrorResponse {
  type: "Error";
  description: string;
  message: string;
  variant: string;
}

export type DeepgramResponse = DeepgramTranscriptResponse | DeepgramErrorResponse;

export interface TranscriptChunk {
  text: string;
  speaker: "team" | "client";
  isFinal: boolean;
  chunkIndex: number;
  timestamp: number;
}
```

- [ ] **Step 3: create deepgram client helper**

Create `apps/web/src/lib/deepgram.ts`:

```typescript
import WebSocket from "ws";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen";

export interface DeepgramStreamOptions {
  encoding: "linear16";
  sampleRate: number;
  channels: number;
  model: "nova-2";
  punctuate: boolean;
  diarize: boolean;
  interimResults: boolean;
  utteranceEndMs: number;
  smartFormat: boolean;
}

const DEFAULT_OPTIONS: DeepgramStreamOptions = {
  encoding: "linear16",
  sampleRate: 16000,
  channels: 1,
  model: "nova-2",
  punctuate: true,
  diarize: true,
  interimResults: true,
  utteranceEndMs: 1000,
  smartFormat: true,
};

export function createDeepgramWebSocket(
  options: Partial<DeepgramStreamOptions> = {}
): WebSocket {
  if (!DEEPGRAM_API_KEY) {
    throw new Error("DEEPGRAM_API_KEY is not set in environment");
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  const params = new URLSearchParams({
    encoding: opts.encoding,
    sample_rate: opts.sampleRate.toString(),
    channels: opts.channels.toString(),
    model: opts.model,
    punctuate: opts.punctuate.toString(),
    diarize: opts.diarize.toString(),
    interim_results: opts.interimResults.toString(),
    utterance_end_ms: opts.utteranceEndMs.toString(),
    smart_format: opts.smartFormat.toString(),
  });

  const url = `${DEEPGRAM_WS_URL}?${params.toString()}`;

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
    },
  });

  return ws;
}

/**
 * maps deepgram speaker index to slushie speaker label.
 * speaker 0 = team (the slushie team member initiates the call).
 * speaker 1+ = client.
 */
export function mapSpeakerLabel(speakerIndex: number): "team" | "client" {
  return speakerIndex === 0 ? "team" : "client";
}
```

- [ ] **Step 4: commit**

```bash
git add apps/web/package.json apps/web/src/lib/deepgram.ts apps/web/src/types/deepgram.ts
git commit -m "feat: add deepgram client library and streaming types"
```

---

### Task 2: Create WebSocket audio proxy route with deepgram reconnection

**Files:**
- Create: `apps/web/src/app/api/calls/audio/route.ts`
- Create: `apps/web/src/lib/deepgram-proxy.ts`

- [ ] **Step 1: create the deepgram proxy class with reconnection logic**

Create `apps/web/src/lib/deepgram-proxy.ts`:

```typescript
import WebSocket from "ws";
import { createDeepgramWebSocket, mapSpeakerLabel } from "./deepgram";
import type {
  DeepgramResponse,
  DeepgramTranscriptResponse,
  TranscriptChunk,
} from "@/types/deepgram";

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = [1000, 2000, 4000]; // escalating delays

export type TranscriptCallback = (chunk: TranscriptChunk) => void;
export type ErrorCallback = (error: Error) => void;
export type FallbackCallback = () => void;

export class DeepgramProxy {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private chunkIndex = 0;
  private isClosed = false;
  private audioBuffer: Buffer[] = [];
  private isConnected = false;

  private onTranscript: TranscriptCallback;
  private onError: ErrorCallback;
  private onFallback: FallbackCallback;

  constructor(
    onTranscript: TranscriptCallback,
    onError: ErrorCallback,
    onFallback: FallbackCallback
  ) {
    this.onTranscript = onTranscript;
    this.onError = onError;
    this.onFallback = onFallback;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = createDeepgramWebSocket();
      } catch (err) {
        reject(err);
        return;
      }

      this.ws.on("open", () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // flush any buffered audio from reconnection attempts
        for (const chunk of this.audioBuffer) {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(chunk);
          }
        }
        this.audioBuffer = [];

        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const response: DeepgramResponse = JSON.parse(data.toString());

          if (response.type === "Error") {
            this.onError(new Error(`deepgram error: ${response.description}`));
            return;
          }

          if (response.type === "Results") {
            this.handleTranscriptResult(response);
          }
        } catch (err) {
          this.onError(
            err instanceof Error ? err : new Error("failed to parse deepgram response")
          );
        }
      });

      this.ws.on("close", () => {
        this.isConnected = false;
        if (!this.isClosed) {
          this.attemptReconnect();
        }
      });

      this.ws.on("error", (err: Error) => {
        this.isConnected = false;
        this.onError(err);
        if (!this.isClosed) {
          this.attemptReconnect();
        }
      });
    });
  }

  sendAudio(data: Buffer): void {
    if (this.isClosed) return;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      // buffer audio during reconnection (keep last 5 seconds at 16khz 16-bit mono = ~160kb)
      this.audioBuffer.push(data);
      const maxBufferSize = 160 * 1024;
      let totalSize = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
      while (totalSize > maxBufferSize && this.audioBuffer.length > 0) {
        const removed = this.audioBuffer.shift();
        if (removed) totalSize -= removed.length;
      }
    }
  }

  close(): void {
    this.isClosed = true;
    if (this.ws) {
      // send close message to deepgram to get final results
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      }
      setTimeout(() => {
        this.ws?.close();
        this.ws = null;
      }, 1000);
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  private handleTranscriptResult(result: DeepgramTranscriptResponse): void {
    const alt = result.channel.alternatives[0];
    if (!alt || !alt.transcript) return;

    // determine speaker from diarization — use first word's speaker label
    const speakerIndex = alt.words[0]?.speaker ?? 0;
    const speaker = mapSpeakerLabel(speakerIndex);

    const chunk: TranscriptChunk = {
      text: alt.transcript,
      speaker,
      isFinal: result.is_final,
      chunkIndex: this.chunkIndex++,
      timestamp: Date.now(),
    };

    this.onTranscript(chunk);
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.onFallback();
      return;
    }

    const delay = RECONNECT_DELAY_MS[this.reconnectAttempts] ?? 4000;
    this.reconnectAttempts++;

    setTimeout(async () => {
      if (this.isClosed) return;
      try {
        this.ws = createDeepgramWebSocket();

        this.ws.on("open", () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;

          // flush buffered audio
          for (const chunk of this.audioBuffer) {
            if (this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(chunk);
            }
          }
          this.audioBuffer = [];
        });

        this.ws.on("message", (data: WebSocket.Data) => {
          try {
            const response: DeepgramResponse = JSON.parse(data.toString());
            if (response.type === "Results") {
              this.handleTranscriptResult(response);
            }
          } catch {}
        });

        this.ws.on("close", () => {
          this.isConnected = false;
          if (!this.isClosed) {
            this.attemptReconnect();
          }
        });

        this.ws.on("error", () => {
          this.isConnected = false;
          if (!this.isClosed) {
            this.attemptReconnect();
          }
        });
      } catch {
        this.attemptReconnect();
      }
    }, delay);
  }
}
```

- [ ] **Step 2: create the websocket-to-sse audio proxy route**

Create `apps/web/src/app/api/calls/audio/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { DeepgramProxy } from "@/lib/deepgram-proxy";
import type { TranscriptChunk } from "@/types/deepgram";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

/**
 * POST /api/calls/audio
 *
 * receives raw pcm audio as binary body from the browser,
 * proxies it to deepgram, and publishes transcript chunks to redis.
 *
 * NOTE: for the live call, the browser uses a persistent websocket via
 * the custom server (see task 3). this route exists as a fallback
 * for simple audio chunk uploads.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }

  const pipelineRunId = request.headers.get("x-pipeline-run-id");
  if (!pipelineRunId) {
    return new Response("missing x-pipeline-run-id header", { status: 400 });
  }

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const channel = `events:${pipelineRunId}`;

  const audioData = Buffer.from(await request.arrayBuffer());

  const proxy = new DeepgramProxy(
    (chunk: TranscriptChunk) => {
      const event = {
        type: "transcript.chunk" as const,
        pipelineRunId,
        timestamp: Date.now(),
        data: {
          text: chunk.text,
          speaker: chunk.speaker,
          isFinal: chunk.isFinal,
          chunkIndex: chunk.chunkIndex,
        },
      };
      redis.publish(channel, JSON.stringify(event));
    },
    (error: Error) => {
      console.error("deepgram proxy error:", error.message);
    },
    () => {
      console.error("deepgram proxy fallback triggered — all reconnects failed");
    }
  );

  try {
    await proxy.connect();
    proxy.sendAudio(audioData);

    // wait briefly for deepgram to process the chunk
    await new Promise((resolve) => setTimeout(resolve, 500));
    proxy.close();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "deepgram connection failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    redis.disconnect();
  }
}
```

- [ ] **Step 3: commit**

```bash
git add apps/web/src/lib/deepgram-proxy.ts apps/web/src/app/api/calls/audio/route.ts
git commit -m "feat: add deepgram websocket proxy with 3-retry reconnection and fallback"
```

---

### Task 3: Create WebSocket server for persistent audio streaming

**Files:**
- Create: `apps/web/src/lib/ws-server.ts`
- Create: `apps/web/server.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: create the websocket server module**

Create `apps/web/src/lib/ws-server.ts`:

```typescript
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import { DeepgramProxy } from "./deepgram-proxy";
import type { TranscriptChunk } from "@/types/deepgram";
import Redis from "ioredis";

interface ActiveCall {
  proxy: DeepgramProxy;
  redis: Redis;
  pipelineRunId: string;
  transcriptBuffer: TranscriptChunk[];
  fallbackTriggered: boolean;
}

const activeCalls = new Map<WebSocket, ActiveCall>();

export function attachWebSocketServer(server: Server): void {
  const wss = new WebSocketServer({
    server,
    path: "/ws/audio",
  });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pipelineRunId = url.searchParams.get("pipelineRunId");

    if (!pipelineRunId) {
      ws.close(4001, "missing pipelineRunId query parameter");
      return;
    }

    const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    const channel = `events:${pipelineRunId}`;
    const transcriptBuffer: TranscriptChunk[] = [];

    const proxy = new DeepgramProxy(
      // on transcript chunk
      (chunk: TranscriptChunk) => {
        transcriptBuffer.push(chunk);

        const event = {
          type: "transcript.chunk" as const,
          pipelineRunId,
          timestamp: Date.now(),
          data: {
            text: chunk.text,
            speaker: chunk.speaker,
            isFinal: chunk.isFinal,
            chunkIndex: chunk.chunkIndex,
          },
        };

        // publish to redis for sse subscribers
        redis.publish(channel, JSON.stringify(event));

        // echo back to the browser for immediate display
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(event));
        }
      },
      // on error
      (error: Error) => {
        console.error(`[ws:${pipelineRunId}] deepgram error:`, error.message);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "error",
              data: { message: error.message },
            })
          );
        }
      },
      // on fallback (all reconnects exhausted)
      () => {
        console.error(
          `[ws:${pipelineRunId}] deepgram reconnection failed — fallback mode`
        );
        const call = activeCalls.get(ws);
        if (call) {
          call.fallbackTriggered = true;
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "fallback",
              data: {
                message:
                  "transcription connection lost. coaching paused. audio will be processed after the call.",
              },
            })
          );
        }
      }
    );

    activeCalls.set(ws, {
      proxy,
      redis,
      pipelineRunId,
      transcriptBuffer,
      fallbackTriggered: false,
    });

    try {
      await proxy.connect();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "connected",
            data: { pipelineRunId },
          })
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to connect to deepgram";
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "error", data: { message } }));
        ws.close(4002, message);
      }
      redis.disconnect();
      activeCalls.delete(ws);
      return;
    }

    ws.on("message", (data: Buffer) => {
      // binary audio data from the browser
      if (Buffer.isBuffer(data)) {
        proxy.sendAudio(data);
      } else {
        // json control messages
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "end") {
            proxy.close();
          }
        } catch {}
      }
    });

    ws.on("close", () => {
      const call = activeCalls.get(ws);
      if (call) {
        call.proxy.close();
        call.redis.disconnect();
        activeCalls.delete(ws);
      }
    });

    ws.on("error", (err: Error) => {
      console.error(`[ws:${pipelineRunId}] websocket error:`, err.message);
      const call = activeCalls.get(ws);
      if (call) {
        call.proxy.close();
        call.redis.disconnect();
        activeCalls.delete(ws);
      }
    });
  });
}

/**
 * get the transcript buffer for a given websocket connection.
 * used by the coaching worker to get the last N minutes of transcript.
 */
export function getTranscriptBuffer(
  pipelineRunId: string
): TranscriptChunk[] | null {
  for (const [, call] of activeCalls) {
    if (call.pipelineRunId === pipelineRunId) {
      return call.transcriptBuffer;
    }
  }
  return null;
}
```

- [ ] **Step 2: create custom next.js server with websocket support**

Create `apps/web/server.ts`:

```typescript
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { attachWebSocketServer } from "./src/lib/ws-server";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  });

  // attach websocket server for audio streaming
  attachWebSocketServer(server);

  server.listen(port, () => {
    console.log(`> slushie web ready on http://${hostname}:${port}`);
    console.log(`> websocket audio endpoint: ws://${hostname}:${port}/ws/audio`);
  });
});
```

- [ ] **Step 3: update apps/web/package.json dev script**

Update the `"dev"` script in `apps/web/package.json`:

```json
{
  "scripts": {
    "dev": "tsx server.ts",
    "dev:next": "next dev",
    "build": "next build",
    "start": "NODE_ENV=production node dist/server.js"
  }
}
```

Also add `tsx` as a dev dependency:

```bash
cd apps/web && npm install -D tsx
```

- [ ] **Step 4: verify the websocket server starts**

```bash
cd apps/web && npm run dev
```

Expected output:
```
> slushie web ready on http://localhost:3000
> websocket audio endpoint: ws://localhost:3000/ws/audio
```

- [ ] **Step 5: commit**

```bash
git add apps/web/src/lib/ws-server.ts apps/web/server.ts apps/web/package.json
git commit -m "feat: add custom websocket server for persistent audio streaming to deepgram"
```

---

## Chunk 2: Call Lifecycle + Coaching Worker

### Task 4: Create call start/end API routes

**Files:**
- Create: `apps/web/src/app/api/calls/start/route.ts`
- Create: `apps/web/src/app/api/calls/end/route.ts`

- [ ] **Step 1: create call start route**

Create `apps/web/src/app/api/calls/start/route.ts`:

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
  const { clientId, clientName, industry } = body;

  if (!clientName) {
    return NextResponse.json(
      { error: "clientName is required" },
      { status: 400 }
    );
  }

  // create or find client
  let client;
  if (clientId) {
    client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return NextResponse.json({ error: "client not found" }, { status: 404 });
    }
  } else {
    client = await prisma.client.create({
      data: {
        name: clientName,
        industry: industry ?? "unknown",
      },
    });
  }

  // create call record
  const call = await prisma.call.create({
    data: {
      clientId: client.id,
      startedAt: new Date(),
      coachingLog: [],
    },
  });

  // create pipeline run
  const pipelineRun = await prisma.pipelineRun.create({
    data: {
      clientId: client.id,
      callId: call.id,
      status: "RUNNING",
    },
  });

  return NextResponse.json({
    callId: call.id,
    clientId: client.id,
    pipelineRunId: pipelineRun.id,
    startedAt: call.startedAt,
  });
}
```

- [ ] **Step 2: create call end route**

Create `apps/web/src/app/api/calls/end/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";
import Redis from "ioredis";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { callId, pipelineRunId, transcript } = body;

  if (!callId || !pipelineRunId) {
    return NextResponse.json(
      { error: "callId and pipelineRunId are required" },
      { status: 400 }
    );
  }

  // update call with end time and final transcript
  const endedAt = new Date();
  const call = await prisma.call.update({
    where: { id: callId },
    data: {
      endedAt,
      transcript: transcript ?? null,
    },
    include: { client: true },
  });

  if (!call) {
    return NextResponse.json({ error: "call not found" }, { status: 404 });
  }

  const durationMs = call.startedAt
    ? endedAt.getTime() - call.startedAt.getTime()
    : 0;

  // publish call.ended event to redis
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const channel = `events:${pipelineRunId}`;
  const callEndedEvent = {
    type: "call.ended",
    pipelineRunId,
    timestamp: Date.now(),
    data: {
      callId: call.id,
      clientId: call.clientId,
      duration: Math.round(durationMs / 1000),
    },
  };

  await redis.publish(channel, JSON.stringify(callEndedEvent));
  redis.disconnect();

  return NextResponse.json({
    callId: call.id,
    endedAt: call.endedAt,
    duration: Math.round(durationMs / 1000),
    clientName: call.client.name,
  });
}
```

- [ ] **Step 3: verify routes compile**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/api/calls/start apps/web/src/app/api/calls/end
git commit -m "feat: add call start/end api routes with Call and PipelineRun creation"
```

---

### Task 5: Build the coaching worker

**Files:**
- Create: `apps/worker/src/coaching.ts`
- Create: `apps/worker/src/prompts/coaching.ts`
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: create the coaching prompt template**

Create `apps/worker/src/prompts/coaching.ts`:

```typescript
export function buildCoachingPrompt(
  transcriptContext: string,
  clientIndustry: string
): string {
  return `you are a real-time coaching assistant for a slushie discovery call. the slushie team member is talking with a small business owner (industry: ${clientIndustry}) to understand their workflow and find gaps where ai-powered tools could save them time and money.

analyze the following transcript excerpt (the last 5 minutes of conversation) and return coaching suggestions.

transcript:
---
${transcriptContext}
---

return a json array of coaching cards. each card must have:
- "category": one of "dig_deeper", "gap_spotted", or "suggested"
- "text": a short, actionable suggestion (1-2 sentences, lowercase, no emojis)
- "monetaryEstimate": (only for "gap_spotted") estimated monthly cost of this gap, e.g. "$500/mo"

rules:
- "dig_deeper": the client mentioned something that sounds like a pain point but didn't give specifics. tell the team member what to ask.
- "gap_spotted": a confirmed workflow gap with enough detail to estimate monetary impact. include the estimate.
- "suggested": a general discovery question the team member should explore based on the industry and conversation flow.
- return 1-3 cards maximum. quality over quantity.
- if the conversation is still small talk or introductions, return an empty array.
- keep suggestions in lowercase, plain language, confident tone.

respond with ONLY the json array, no other text. example:
[
  {
    "category": "dig_deeper",
    "text": "they mentioned manually tracking invoices — ask how many hours per week they spend on it and whether anything falls through the cracks"
  },
  {
    "category": "gap_spotted",
    "text": "they're losing roughly 3 hours per week manually entering job data into two separate systems",
    "monetaryEstimate": "$300/mo"
  }
]`;
}
```

- [ ] **Step 2: create the coaching worker**

Create `apps/worker/src/coaching.ts`:

```typescript
import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { invokeClaudeCode } from "./claude";
import { publishEvent } from "./publish";
import { createAgentLogger } from "./logger";
import { buildCoachingPrompt } from "./prompts/coaching";
import { PHASE_TIMEOUTS } from "./queues";
import type { CoachingSuggestionEvent } from "@slushie/events";
import { createEvent } from "@slushie/events";
import { prisma } from "@slushie/db";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface CoachingJobData {
  pipelineRunId: string;
  callId: string;
  clientIndustry: string;
}

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

// in-memory transcript buffer per pipeline run
// populated by subscribing to transcript.chunk events via redis
const transcriptBuffers = new Map<string, Array<{ text: string; speaker: string; timestamp: number }>>();

/**
 * subscribe to transcript chunks for a given pipeline run.
 * this populates the in-memory buffer that the coaching worker reads.
 */
export function subscribeToTranscript(pipelineRunId: string): Redis {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const channel = `events:${pipelineRunId}`;

  if (!transcriptBuffers.has(pipelineRunId)) {
    transcriptBuffers.set(pipelineRunId, []);
  }

  redis.subscribe(channel);
  redis.on("message", (_ch: string, message: string) => {
    try {
      const event = JSON.parse(message);
      if (event.type === "transcript.chunk" && event.data.isFinal) {
        const buffer = transcriptBuffers.get(pipelineRunId);
        if (buffer) {
          buffer.push({
            text: event.data.text,
            speaker: event.data.speaker,
            timestamp: event.timestamp,
          });
        }
      }
    } catch {}
  });

  return redis;
}

/**
 * get the last N minutes of transcript for a pipeline run.
 */
function getRecentTranscript(
  pipelineRunId: string,
  windowMinutes: number = 5
): string {
  const buffer = transcriptBuffers.get(pipelineRunId);
  if (!buffer || buffer.length === 0) return "";

  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  const recent = buffer.filter((chunk) => chunk.timestamp >= cutoff);

  if (recent.length === 0) return "";

  return recent
    .map((chunk) => `[${chunk.speaker}]: ${chunk.text}`)
    .join("\n");
}

/**
 * clean up transcript buffer when a call ends.
 */
export function clearTranscriptBuffer(pipelineRunId: string): void {
  transcriptBuffers.delete(pipelineRunId);
}

/**
 * get the full transcript for final storage.
 */
export function getFullTranscript(pipelineRunId: string): string {
  const buffer = transcriptBuffers.get(pipelineRunId);
  if (!buffer || buffer.length === 0) return "";
  return buffer
    .map((chunk) => `[${chunk.speaker}]: ${chunk.text}`)
    .join("\n");
}

export function createCoachingWorker(): Worker {
  const worker = new Worker<CoachingJobData>(
    "coaching",
    async (job: Job<CoachingJobData>) => {
      const { pipelineRunId, callId, clientIndustry } = job.data;
      const log = createAgentLogger("coaching", pipelineRunId);

      log.info({ callId }, "coaching cycle triggered");

      // get last 5 minutes of transcript
      const transcriptContext = getRecentTranscript(pipelineRunId, 5);

      if (!transcriptContext) {
        log.info("no transcript context yet — skipping coaching cycle");
        return;
      }

      // create temp working directory for claude code
      const workDir = await mkdtemp(join(tmpdir(), "slushie-coaching-"));

      try {
        // write transcript context to a file for claude code
        await writeFile(
          join(workDir, "transcript.txt"),
          transcriptContext,
          "utf-8"
        );

        const prompt = buildCoachingPrompt(transcriptContext, clientIndustry);

        const result = await invokeClaudeCode({
          prompt,
          workingDirectory: workDir,
          timeoutMs: 30_000, // coaching must respond quickly — 30 second timeout
          pipelineRunId,
        });

        // parse claude code output — extract json array from the response
        let suggestions: Array<{
          category: "dig_deeper" | "gap_spotted" | "suggested";
          text: string;
          monetaryEstimate?: string;
        }> = [];

        try {
          // claude code with --output-format json wraps the result
          const parsed = JSON.parse(result.output);
          const content = parsed.result ?? parsed.content ?? result.output;
          const jsonStr = typeof content === "string" ? content : JSON.stringify(content);

          // extract json array from potential surrounding text
          const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            suggestions = JSON.parse(arrayMatch[0]);
          }
        } catch (parseErr) {
          log.warn(
            { output: result.output.slice(0, 500) },
            "failed to parse coaching suggestions from claude output"
          );
          return;
        }

        if (!Array.isArray(suggestions) || suggestions.length === 0) {
          log.info("no coaching suggestions generated this cycle");
          return;
        }

        // publish each suggestion as a coaching.suggestion event
        for (const suggestion of suggestions) {
          const event = createEvent<CoachingSuggestionEvent>(
            "coaching.suggestion",
            pipelineRunId,
            {
              category: suggestion.category,
              text: suggestion.text,
              monetaryEstimate: suggestion.monetaryEstimate,
            }
          );

          await publishEvent(event);
          log.info(
            { category: suggestion.category },
            "coaching suggestion published"
          );
        }

        // append to call's coaching log in database
        const call = await prisma.call.findUnique({
          where: { id: callId },
          select: { coachingLog: true },
        });

        const existingLog = Array.isArray(call?.coachingLog)
          ? (call.coachingLog as Array<Record<string, unknown>>)
          : [];

        await prisma.call.update({
          where: { id: callId },
          data: {
            coachingLog: [
              ...existingLog,
              ...suggestions.map((s) => ({
                ...s,
                generatedAt: new Date().toISOString(),
              })),
            ],
          },
        });
      } finally {
        // clean up temp directory
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1, // one coaching invocation at a time per worker
    }
  );

  worker.on("failed", (job, err) => {
    console.error(
      `coaching job failed for pipeline ${job?.data.pipelineRunId}:`,
      err.message
    );
  });

  return worker;
}
```

- [ ] **Step 3: create the coaching scheduler**

This runs alongside the websocket server and enqueues coaching jobs every 30 seconds for active calls.

Create `apps/worker/src/coaching-scheduler.ts`:

```typescript
import { Queue } from "bullmq";
import { logger } from "./logger";

interface ActiveCoachingSession {
  pipelineRunId: string;
  callId: string;
  clientIndustry: string;
  intervalId: NodeJS.Timeout;
}

const activeSessions = new Map<string, ActiveCoachingSession>();

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

const coachingQueue = new Queue("coaching", {
  connection: getRedisConnection(),
});

/**
 * start coaching for a call — enqueues a coaching job every 30 seconds.
 */
export function startCoachingScheduler(
  pipelineRunId: string,
  callId: string,
  clientIndustry: string
): void {
  if (activeSessions.has(pipelineRunId)) {
    logger.warn({ pipelineRunId }, "coaching scheduler already active");
    return;
  }

  logger.info({ pipelineRunId, callId }, "starting coaching scheduler (30s interval)");

  const intervalId = setInterval(async () => {
    try {
      await coachingQueue.add(
        `coaching-${pipelineRunId}-${Date.now()}`,
        {
          pipelineRunId,
          callId,
          clientIndustry,
        },
        {
          attempts: 1, // coaching is best-effort — don't retry stale context
          removeOnComplete: 100,
          removeOnFail: 100,
        }
      );
    } catch (err) {
      logger.error(
        { pipelineRunId, error: err },
        "failed to enqueue coaching job"
      );
    }
  }, 30_000); // every 30 seconds per spec

  activeSessions.set(pipelineRunId, {
    pipelineRunId,
    callId,
    clientIndustry,
    intervalId,
  });
}

/**
 * stop coaching for a call.
 */
export function stopCoachingScheduler(pipelineRunId: string): void {
  const session = activeSessions.get(pipelineRunId);
  if (session) {
    clearInterval(session.intervalId);
    activeSessions.delete(pipelineRunId);
    logger.info({ pipelineRunId }, "coaching scheduler stopped");
  }
}
```

- [ ] **Step 4: register the coaching worker in the worker entry point**

Update `apps/worker/src/index.ts`:

```typescript
import Redis from "ioredis";
import { logger } from "./logger";
import { listenerQueue, analystQueue, builderQueue, reviewerQueue, postmortemQueue } from "./queues";
import { createCoachingWorker } from "./coaching";

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

  // start coaching worker
  const coachingWorker = createCoachingWorker();
  logger.info("coaching worker registered");

  logger.info("slushie worker is running. waiting for events...");

  // graceful shutdown
  const shutdown = async () => {
    logger.info("shutting down workers...");
    await coachingWorker.close();
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

- [ ] **Step 5: verify worker compiles**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 6: commit**

```bash
git add apps/worker/src/coaching.ts apps/worker/src/coaching-scheduler.ts apps/worker/src/prompts/coaching.ts apps/worker/src/index.ts
git commit -m "feat: add coaching worker with 30-second interval and claude code invocation"
```

---

### Task 6: Wire call lifecycle to coaching scheduler and transcript subscription

**Files:**
- Create: `apps/web/src/app/api/calls/coaching/start/route.ts`
- Create: `apps/web/src/app/api/calls/coaching/stop/route.ts`

- [ ] **Step 1: create coaching start route**

This route is called by the dashboard when a call starts, after the websocket connection is established.

Create `apps/web/src/app/api/calls/coaching/start/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import Redis from "ioredis";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pipelineRunId, callId, clientIndustry } = body;

  if (!pipelineRunId || !callId) {
    return NextResponse.json(
      { error: "pipelineRunId and callId are required" },
      { status: 400 }
    );
  }

  // publish a coaching.start control event that the worker listens for
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const controlChannel = "control:coaching";

  await redis.publish(
    controlChannel,
    JSON.stringify({
      action: "start",
      pipelineRunId,
      callId,
      clientIndustry: clientIndustry ?? "unknown",
    })
  );

  redis.disconnect();

  return NextResponse.json({ ok: true, pipelineRunId });
}
```

- [ ] **Step 2: create coaching stop route**

Create `apps/web/src/app/api/calls/coaching/stop/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import Redis from "ioredis";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pipelineRunId } = body;

  if (!pipelineRunId) {
    return NextResponse.json(
      { error: "pipelineRunId is required" },
      { status: 400 }
    );
  }

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const controlChannel = "control:coaching";

  await redis.publish(
    controlChannel,
    JSON.stringify({
      action: "stop",
      pipelineRunId,
    })
  );

  redis.disconnect();

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: add control channel listener to the worker**

Create `apps/worker/src/coaching-control.ts`:

```typescript
import Redis from "ioredis";
import { logger } from "./logger";
import {
  subscribeToTranscript,
  clearTranscriptBuffer,
  getFullTranscript,
} from "./coaching";
import {
  startCoachingScheduler,
  stopCoachingScheduler,
} from "./coaching-scheduler";
import { prisma } from "@slushie/db";

const transcriptSubscriptions = new Map<string, Redis>();

interface CoachingControlMessage {
  action: "start" | "stop";
  pipelineRunId: string;
  callId?: string;
  clientIndustry?: string;
}

export function startCoachingControlListener(): void {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const controlChannel = "control:coaching";

  redis.subscribe(controlChannel);

  redis.on("message", async (_ch: string, message: string) => {
    try {
      const msg: CoachingControlMessage = JSON.parse(message);

      if (msg.action === "start" && msg.callId && msg.clientIndustry) {
        logger.info(
          { pipelineRunId: msg.pipelineRunId, callId: msg.callId },
          "coaching control: starting"
        );

        // subscribe to transcript events for this pipeline run
        const sub = subscribeToTranscript(msg.pipelineRunId);
        transcriptSubscriptions.set(msg.pipelineRunId, sub);

        // start the 30-second coaching scheduler
        startCoachingScheduler(
          msg.pipelineRunId,
          msg.callId,
          msg.clientIndustry
        );
      }

      if (msg.action === "stop") {
        logger.info(
          { pipelineRunId: msg.pipelineRunId },
          "coaching control: stopping"
        );

        // stop the coaching scheduler
        stopCoachingScheduler(msg.pipelineRunId);

        // save full transcript to database before clearing buffer
        const fullTranscript = getFullTranscript(msg.pipelineRunId);
        if (fullTranscript) {
          // find the call associated with this pipeline run
          const run = await prisma.pipelineRun.findUnique({
            where: { id: msg.pipelineRunId },
            select: { callId: true },
          });

          if (run) {
            await prisma.call.update({
              where: { id: run.callId },
              data: { transcript: fullTranscript },
            });
            logger.info(
              { pipelineRunId: msg.pipelineRunId, callId: run.callId },
              "final transcript saved to database"
            );
          }
        }

        // clean up transcript buffer
        clearTranscriptBuffer(msg.pipelineRunId);

        // unsubscribe from transcript events
        const sub = transcriptSubscriptions.get(msg.pipelineRunId);
        if (sub) {
          sub.unsubscribe();
          sub.disconnect();
          transcriptSubscriptions.delete(msg.pipelineRunId);
        }
      }
    } catch (err) {
      logger.error({ error: err, message }, "failed to process coaching control message");
    }
  });

  logger.info("coaching control listener started on channel: control:coaching");
}
```

- [ ] **Step 4: register the coaching control listener in the worker entry point**

Update `apps/worker/src/index.ts`:

```typescript
import Redis from "ioredis";
import { logger } from "./logger";
import { listenerQueue, analystQueue, builderQueue, reviewerQueue, postmortemQueue } from "./queues";
import { createCoachingWorker } from "./coaching";
import { startCoachingControlListener } from "./coaching-control";

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

  // start coaching worker
  const coachingWorker = createCoachingWorker();
  logger.info("coaching worker registered");

  // start coaching control listener
  startCoachingControlListener();

  logger.info("slushie worker is running. waiting for events...");

  // graceful shutdown
  const shutdown = async () => {
    logger.info("shutting down workers...");
    await coachingWorker.close();
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

- [ ] **Step 5: verify everything compiles**

```bash
cd apps/worker && npx tsc --noEmit && cd ../web && npx tsc --noEmit
```

Expected: no type errors in either app.

- [ ] **Step 6: commit**

```bash
git add apps/web/src/app/api/calls/coaching apps/worker/src/coaching-control.ts apps/worker/src/index.ts
git commit -m "feat: wire call lifecycle to coaching scheduler via redis control channel"
```

---

## Chunk 3: Live Call Dashboard

### Task 7: Create the browser audio capture hook

**Files:**
- Create: `apps/web/src/hooks/use-audio-capture.ts`

- [ ] **Step 1: create the audio capture hook**

Create `apps/web/src/hooks/use-audio-capture.ts`:

```typescript
"use client";

import { useCallback, useRef, useState } from "react";

interface UseAudioCaptureOptions {
  wsUrl: string;
  onMessage: (data: unknown) => void;
  onError: (error: string) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

export function useAudioCapture({
  wsUrl,
  onMessage,
  onError,
  onConnected,
  onDisconnected,
}: UseAudioCaptureOptions) {
  const [isCapturing, setIsCapturing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);

  const start = useCallback(async () => {
    try {
      // request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      // create audio context for pcm conversion
      const audioContext = new AudioContext({ sampleRate: 16000 });
      contextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // use script processor to get raw pcm data
      // buffer size 4096 at 16khz = ~256ms chunks
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // connect to websocket
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        onConnected();
        setIsCapturing(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch {
          // binary or non-json message — ignore
        }
      };

      ws.onerror = () => {
        onError("websocket connection error");
      };

      ws.onclose = () => {
        setIsCapturing(false);
        onDisconnected();
      };

      // process audio and send as 16-bit pcm
      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // convert float32 to int16 pcm
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        ws.send(pcmData.buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "failed to start audio capture";
      onError(message);
    }
  }, [wsUrl, onMessage, onError, onConnected, onDisconnected]);

  const stop = useCallback(() => {
    // send end message to server
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end" }));
    }

    // clean up audio
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (contextRef.current) {
      contextRef.current.close();
      contextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // close websocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsCapturing(false);
  }, []);

  return { isCapturing, start, stop };
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/hooks/use-audio-capture.ts
git commit -m "feat: add browser audio capture hook with pcm websocket streaming"
```

---

### Task 8: Create the SSE hook for receiving events

**Files:**
- Create: `apps/web/src/hooks/use-sse.ts`

- [ ] **Step 1: create the SSE hook**

Create `apps/web/src/hooks/use-sse.ts`:

```typescript
"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface UseSSEOptions {
  url: string;
  enabled: boolean;
  onEvent: (event: unknown) => void;
  onError?: (error: string) => void;
}

export function useSSE({ url, enabled, onEvent, onError }: UseSSEOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);

  // keep callbacks fresh without triggering reconnect
  onEventRef.current = onEvent;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled) {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const source = new EventSource(url);
    sourceRef.current = source;

    source.addEventListener("connected", () => {
      setIsConnected(true);
    });

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEventRef.current(data);
      } catch {
        // ignore non-json messages (keepalives, etc.)
      }
    };

    source.onerror = () => {
      setIsConnected(false);
      onErrorRef.current?.("sse connection error — reconnecting...");
      // EventSource auto-reconnects by default
    };

    return () => {
      source.close();
      sourceRef.current = null;
      setIsConnected(false);
    };
  }, [url, enabled]);

  const disconnect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return { isConnected, disconnect };
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/hooks/use-sse.ts
git commit -m "feat: add sse hook for receiving real-time pipeline events"
```

---

### Task 9: Build the live call dashboard page

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/calls/live/[pipelineRunId]/page.tsx`
- Create: `apps/web/src/components/call/transcript-panel.tsx`
- Create: `apps/web/src/components/call/coaching-panel.tsx`
- Create: `apps/web/src/components/call/call-header.tsx`

- [ ] **Step 1: create the call header component**

Create `apps/web/src/components/call/call-header.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface CallHeaderProps {
  clientName: string;
  isLive: boolean;
  startedAt: Date;
  onEndCall: () => void;
  isFallback: boolean;
}

export function CallHeader({
  clientName,
  isLive,
  startedAt,
  onEndCall,
  isFallback,
}: CallHeaderProps) {
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const mins = Math.floor(diff / 60)
        .toString()
        .padStart(2, "0");
      const secs = (diff % 60).toString().padStart(2, "0");
      setElapsed(`${mins}:${secs}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [isLive, startedAt]);

  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-4">
        {/* live badge */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-3 w-3 rounded-full ${
              isLive ? "animate-pulse bg-primary" : "bg-gray-400"
            }`}
          />
          <span className="text-sm font-semibold">
            {isLive ? "live" : "ended"}
          </span>
        </div>

        {/* client name */}
        <span className="text-sm font-medium text-foreground">
          {clientName}
        </span>

        {/* duration */}
        <span className="font-mono text-sm text-muted">{elapsed}</span>

        {/* fallback indicator */}
        {isFallback && (
          <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
            transcription paused — reconnecting
          </span>
        )}
      </div>

      <div>
        {isLive && (
          <button
            onClick={onEndCall}
            className="rounded bg-primary px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            end call
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: create the transcript panel component**

Create `apps/web/src/components/call/transcript-panel.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";

interface TranscriptEntry {
  text: string;
  speaker: "team" | "client";
  isFinal: boolean;
  chunkIndex: number;
  timestamp: number;
}

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
}

export function TranscriptPanel({ entries }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">transcript</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <p className="text-sm text-muted">
            waiting for audio... start speaking.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={`${entry.chunkIndex}-${entry.isFinal}`}
                className={`text-sm leading-relaxed ${
                  entry.isFinal ? "text-foreground" : "text-muted italic"
                }`}
              >
                <span
                  className={`mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                    entry.speaker === "team"
                      ? "bg-secondary/10 text-secondary"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {entry.speaker}
                </span>
                {entry.text}
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: create the coaching panel component**

Create `apps/web/src/components/call/coaching-panel.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";

interface CoachingCard {
  category: "dig_deeper" | "gap_spotted" | "suggested";
  text: string;
  monetaryEstimate?: string;
  timestamp: number;
}

interface CoachingPanelProps {
  cards: CoachingCard[];
}

const CATEGORY_STYLES = {
  dig_deeper: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-800",
    label: "dig deeper",
  },
  gap_spotted: {
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-800",
    label: "gap spotted",
  },
  suggested: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    badge: "bg-purple-100 text-purple-800",
    label: "suggested",
  },
} as const;

export function CoachingPanel({ cards }: CoachingPanelProps) {
  const topRef = useRef<HTMLDivElement>(null);

  // scroll to top when new cards arrive (newest first)
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cards.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          coaching
          {cards.length > 0 && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-white">
              {cards.length}
            </span>
          )}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div ref={topRef} />
        {cards.length === 0 ? (
          <p className="text-sm text-muted">
            coaching suggestions will appear here as gaps are detected during the
            call.
          </p>
        ) : (
          <div className="space-y-3">
            {[...cards].reverse().map((card, idx) => {
              const style = CATEGORY_STYLES[card.category];
              return (
                <div
                  key={`${card.timestamp}-${idx}`}
                  className={`rounded-lg border ${style.border} ${style.bg} p-3 transition-all duration-300 animate-in slide-in-from-right`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${style.badge}`}
                    >
                      {style.label}
                    </span>
                    {card.monetaryEstimate && (
                      <span className="text-xs font-bold text-red-700">
                        {card.monetaryEstimate}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">
                    {card.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: create the live call dashboard page**

Create `apps/web/src/app/(dashboard)/dashboard/calls/live/[pipelineRunId]/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CallHeader } from "@/components/call/call-header";
import { TranscriptPanel } from "@/components/call/transcript-panel";
import { CoachingPanel } from "@/components/call/coaching-panel";
import { useAudioCapture } from "@/hooks/use-audio-capture";
import { useSSE } from "@/hooks/use-sse";

interface TranscriptEntry {
  text: string;
  speaker: "team" | "client";
  isFinal: boolean;
  chunkIndex: number;
  timestamp: number;
}

interface CoachingCard {
  category: "dig_deeper" | "gap_spotted" | "suggested";
  text: string;
  monetaryEstimate?: string;
  timestamp: number;
}

export default function LiveCallPage() {
  const params = useParams<{ pipelineRunId: string }>();
  const router = useRouter();
  const pipelineRunId = params.pipelineRunId;

  const [isLive, setIsLive] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [clientName, setClientName] = useState("client");
  const [callId, setCallId] = useState<string | null>(null);
  const [startedAt] = useState(new Date());
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>(
    []
  );
  const [coachingCards, setCoachingCards] = useState<CoachingCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  // determine websocket url
  const wsUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/audio?pipelineRunId=${pipelineRunId}`
      : "";

  // handle incoming websocket messages (transcript chunks from deepgram proxy)
  const handleWsMessage = useCallback((data: unknown) => {
    const msg = data as {
      type: string;
      data?: Record<string, unknown>;
    };

    if (msg.type === "transcript.chunk" && msg.data) {
      const entry: TranscriptEntry = {
        text: msg.data.text as string,
        speaker: msg.data.speaker as "team" | "client",
        isFinal: msg.data.isFinal as boolean,
        chunkIndex: msg.data.chunkIndex as number,
        timestamp: Date.now(),
      };

      setTranscriptEntries((prev) => {
        // replace interim with final for the same chunk index
        if (entry.isFinal) {
          const filtered = prev.filter(
            (e) => !(e.chunkIndex === entry.chunkIndex && !e.isFinal)
          );
          return [...filtered, entry];
        }
        // for interim results, replace previous interim with same chunk index
        const filtered = prev.filter(
          (e) =>
            !(e.chunkIndex === entry.chunkIndex && !e.isFinal)
        );
        return [...filtered, entry];
      });
    }

    if (msg.type === "fallback") {
      setIsFallback(true);
    }

    if (msg.type === "connected") {
      setIsFallback(false);
    }
  }, []);

  // handle incoming SSE events (coaching suggestions from worker)
  const handleSSEEvent = useCallback((data: unknown) => {
    const event = data as {
      type: string;
      data?: Record<string, unknown>;
    };

    if (event.type === "coaching.suggestion" && event.data) {
      const card: CoachingCard = {
        category: event.data.category as CoachingCard["category"],
        text: event.data.text as string,
        monetaryEstimate: event.data.monetaryEstimate as string | undefined,
        timestamp: Date.now(),
      };
      setCoachingCards((prev) => [...prev, card]);
    }
  }, []);

  // audio capture hook
  const {
    isCapturing,
    start: startCapture,
    stop: stopCapture,
  } = useAudioCapture({
    wsUrl,
    onMessage: handleWsMessage,
    onError: (err) => setError(err),
    onConnected: () => {
      setIsLive(true);
      setError(null);
    },
    onDisconnected: () => {
      setIsLive(false);
    },
  });

  // sse hook for coaching events
  useSSE({
    url: `/api/events/${pipelineRunId}`,
    enabled: isLive,
    onEvent: handleSSEEvent,
    onError: (err) => console.warn("sse error:", err),
  });

  // start audio capture and coaching on mount
  useEffect(() => {
    if (pipelineRunId && !isCapturing) {
      startCapture();

      // start coaching scheduler via api
      fetch("/api/calls/coaching/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipelineRunId,
          callId: callId ?? pipelineRunId,
          clientIndustry: "unknown",
        }),
      }).catch((err) =>
        console.error("failed to start coaching:", err)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineRunId]);

  // end call handler
  const handleEndCall = useCallback(async () => {
    stopCapture();

    // build final transcript text
    const finalTranscript = transcriptEntries
      .filter((e) => e.isFinal)
      .map((e) => `[${e.speaker}]: ${e.text}`)
      .join("\n");

    try {
      // stop coaching
      await fetch("/api/calls/coaching/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineRunId }),
      });

      // end the call
      await fetch("/api/calls/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId: callId ?? pipelineRunId,
          pipelineRunId,
          transcript: finalTranscript,
        }),
      });
    } catch (err) {
      console.error("failed to end call:", err);
    }

    setIsLive(false);
  }, [stopCapture, transcriptEntries, pipelineRunId, callId]);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* top bar */}
      <CallHeader
        clientName={clientName}
        isLive={isLive}
        startedAt={startedAt}
        onEndCall={handleEndCall}
        isFallback={isFallback}
      />

      {/* error banner */}
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* split view: transcript left, coaching right */}
      <div className="flex flex-1 overflow-hidden">
        {/* left panel — transcript */}
        <div className="w-1/2 border-r border-gray-200 bg-white">
          <TranscriptPanel entries={transcriptEntries} />
        </div>

        {/* right panel — coaching cards */}
        <div className="w-1/2 bg-gray-50">
          <CoachingPanel cards={coachingCards} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: verify the page compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 6: commit**

```bash
git add apps/web/src/components/call apps/web/src/app/\(dashboard\)/dashboard/calls/live apps/web/src/hooks
git commit -m "feat: add live call dashboard with split transcript and coaching panels"
```

---

### Task 10: Create the new call start page

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/calls/new/page.tsx`

- [ ] **Step 1: create the new call page**

Create `apps/web/src/app/(dashboard)/dashboard/calls/new/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCallPage() {
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [industry, setIndustry] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartCall = async () => {
    if (!clientName.trim()) {
      setError("client name is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: clientName.trim(),
          industry: industry.trim() || "unknown",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "failed to start call");
      }

      const data = await res.json();

      // redirect to the live call dashboard
      router.push(`/dashboard/calls/live/${data.pipelineRunId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "something went wrong"
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md pt-12">
      <h2 className="text-2xl font-bold text-foreground">start a new call</h2>
      <p className="mt-1 text-sm text-muted">
        enter the client details and pour a fresh discovery call.
      </p>

      <div className="mt-8 space-y-4">
        <div>
          <label
            htmlFor="clientName"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            client name
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
          <label
            htmlFor="industry"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            industry
          </label>
          <input
            id="industry"
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. plumbing, cleaning, consulting"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {error && (
          <p className="text-sm text-primary">{error}</p>
        )}

        <button
          onClick={handleStartCall}
          disabled={isLoading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {isLoading ? "starting call..." : "start call"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/\(dashboard\)/dashboard/calls/new
git commit -m "feat: add new call start page with client name and industry form"
```

---

### Task 11: Create the calls list page

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/calls/page.tsx`

- [ ] **Step 1: create the calls list page**

Create `apps/web/src/app/(dashboard)/dashboard/calls/page.tsx`:

```tsx
import { prisma } from "@slushie/db";
import Link from "next/link";

export default async function CallsPage() {
  const calls = await prisma.call.findMany({
    include: {
      client: true,
      pipelineRun: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">calls</h2>
        <Link
          href="/dashboard/calls/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
        >
          start new call
        </Link>
      </div>

      {calls.length === 0 ? (
        <p className="text-sm text-muted">
          no calls yet. start one to pour your first slushie.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  client
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  industry
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  started
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {calls.map((call) => {
                const isLive = call.startedAt && !call.endedAt;
                const durationSec =
                  call.startedAt && call.endedAt
                    ? Math.round(
                        (call.endedAt.getTime() - call.startedAt.getTime()) /
                          1000
                      )
                    : null;
                const durationStr = durationSec
                  ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
                  : "--";

                return (
                  <tr key={call.id}>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {call.client.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {call.client.industry}
                    </td>
                    <td className="px-4 py-3">
                      {isLive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                          live
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-muted">
                          {call.pipelineRun?.status?.toLowerCase() ?? "ended"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {call.startedAt
                        ? new Date(call.startedAt).toLocaleString()
                        : "--"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {durationStr}
                    </td>
                    <td className="px-4 py-3">
                      {isLive && call.pipelineRun ? (
                        <Link
                          href={`/dashboard/calls/live/${call.pipelineRun.id}`}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          join call
                        </Link>
                      ) : (
                        <span className="text-sm text-muted">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/\(dashboard\)/dashboard/calls/page.tsx
git commit -m "feat: add calls list page with live status indicators"
```

---

## Chunk 4: Integration + Verification

### Task 12: Add SSE event route for coaching (dedicated coaching channel)

**Files:**
- Create: `apps/web/src/app/api/events/coaching/[pipelineRunId]/route.ts`

- [ ] **Step 1: create a dedicated coaching SSE route**

This route subscribes specifically to coaching events, filtering out transcript chunks so the coaching panel only gets the cards it needs.

Create `apps/web/src/app/api/events/coaching/[pipelineRunId]/route.ts`:

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

      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: {"pipelineRunId":"${pipelineRunId}","channel":"coaching"}\n\n`
        )
      );

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
        try {
          const event = JSON.parse(message);
          // only forward coaching-related events
          if (
            event.type === "coaching.suggestion" ||
            event.type === "call.ended"
          ) {
            controller.enqueue(encoder.encode(`data: ${message}\n\n`));
          }
        } catch {}
      });

      redis.on("error", () => {
        cleanup();
      });

      function cleanup() {
        alive = false;
        clearInterval(keepalive);
        redis.unsubscribe(channel).catch(() => {});
        redis.disconnect();
        try {
          controller.close();
        } catch {}
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

- [ ] **Step 2: commit**

```bash
git add apps/web/src/app/api/events/coaching
git commit -m "feat: add dedicated coaching sse route filtering for coaching events only"
```

---

### Task 13: Add environment setup and integration verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: update .env.example with deepgram key placeholder**

Add the following line to `.env.example` if not already present:

```
# deepgram (required for live call transcription)
DEEPGRAM_API_KEY=6e5b1b4cae0ce947c95c806e42a89c11938e7299
```

- [ ] **Step 2: create .env.local with the deepgram key (gitignored)**

```bash
echo "DEEPGRAM_API_KEY=6e5b1b4cae0ce947c95c806e42a89c11938e7299" >> .env.local
```

Note: `.env.local` is already in `.gitignore` from plan 1.

- [ ] **Step 3: verify the full web app compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: verify the full worker compiles**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 5: start the web app and verify dashboard loads**

```bash
cd apps/web && npm run dev
```

Navigate to:
- `http://localhost:3000` — slushie landing page
- `http://localhost:3000/dashboard/calls` — calls list (requires auth)
- `http://localhost:3000/dashboard/calls/new` — new call form

Expected: all pages render with slushie branding (cherry red, lowercase, inter font).

- [ ] **Step 6: start the worker and verify coaching worker registers**

```bash
cd apps/worker && npm run dev
```

Expected output includes:
```
slushie worker starting...
redis connected
queues registered
coaching worker registered
coaching control listener started on channel: control:coaching
slushie worker is running. waiting for events...
```

- [ ] **Step 7: commit any fixes**

```bash
git add -A
git commit -m "fix: resolve integration issues from plan 2 setup"
```

---

### Task 14: End-to-end call flow verification

- [ ] **Step 1: verify the call start flow works**

Open a terminal and test the call start API:

```bash
curl -X POST http://localhost:3000/api/calls/start \
  -H "Content-Type: application/json" \
  -d '{"clientName": "test plumbing co", "industry": "plumbing"}'
```

Expected response:
```json
{
  "callId": "<cuid>",
  "clientId": "<cuid>",
  "pipelineRunId": "<cuid>",
  "startedAt": "<iso timestamp>"
}
```

Note: this will return 401 if not authenticated. for local testing, temporarily bypass auth or use a browser session.

- [ ] **Step 2: verify the call end flow works**

Using the IDs from step 1:

```bash
curl -X POST http://localhost:3000/api/calls/end \
  -H "Content-Type: application/json" \
  -d '{"callId": "<callId from step 1>", "pipelineRunId": "<pipelineRunId from step 1>", "transcript": "[team]: hello\n[client]: hi there"}'
```

Expected response:
```json
{
  "callId": "<cuid>",
  "endedAt": "<iso timestamp>",
  "duration": <seconds>,
  "clientName": "test plumbing co"
}
```

- [ ] **Step 3: verify the coaching scheduler processes events**

Check worker logs during a call. When coaching runs, you should see:

```
coaching cycle triggered
invoking claude code
claude code completed
coaching suggestion published
```

- [ ] **Step 4: final commit**

```bash
git add -A
git commit -m "feat: complete plan 2 — listener agent + live call dashboard"
```

---

## Summary

**What Plan 2 produces:**
- deepgram websocket integration for real-time speech-to-text transcription
- websocket proxy with 3-retry reconnection logic and fallback mode
- custom next.js server with websocket support for persistent audio streaming
- browser audio capture hook converting microphone input to 16-bit pcm
- coaching worker that invokes `claude -p` every 30 seconds with the last 5 minutes of transcript
- coaching prompt template producing "dig_deeper", "gap_spotted", and "suggested" cards
- call start/end api routes creating Call and PipelineRun records
- `call.ended` event publishing to trigger downstream pipeline
- live call dashboard with split view: transcript left, coaching cards right
- live badge with call duration and client name in the top bar
- fallback indicator when deepgram reconnection fails
- dedicated coaching sse route for streaming coaching cards to the dashboard
- coaching control channel via redis pub/sub for start/stop lifecycle management
- calls list page with live status indicators

**What comes next:**
- Plan 3: analyst agent + builder agent + prototype kit
- Plan 4: client tracker + dev chat notifications
- Plan 5: reviewer agent + internal preview + postmortem
