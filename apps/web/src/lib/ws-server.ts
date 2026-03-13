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
  const wss = new WebSocketServer({ server, path: "/ws/audio" });

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
        redis.publish(channel, JSON.stringify(event));
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(event));
        }
      },
      (error: Error) => {
        console.error(`[ws:${pipelineRunId}] deepgram error:`, error.message);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", data: { message: error.message } }));
        }
      },
      () => {
        console.error(`[ws:${pipelineRunId}] deepgram reconnection failed — fallback mode`);
        const call = activeCalls.get(ws);
        if (call) call.fallbackTriggered = true;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "fallback",
            data: { message: "transcription connection lost. coaching paused. audio will be processed after the call." },
          }));
        }
      }
    );

    activeCalls.set(ws, { proxy, redis, pipelineRunId, transcriptBuffer, fallbackTriggered: false });

    try {
      await proxy.connect();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "connected", data: { pipelineRunId } }));
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
      if (Buffer.isBuffer(data)) {
        proxy.sendAudio(data);
      } else {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "end") proxy.close();
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

export function getTranscriptBuffer(pipelineRunId: string): TranscriptChunk[] | null {
  for (const [, call] of activeCalls) {
    if (call.pipelineRunId === pipelineRunId) return call.transcriptBuffer;
  }
  return null;
}
