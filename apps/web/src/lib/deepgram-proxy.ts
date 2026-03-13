import WebSocket from "ws";
import { createDeepgramWebSocket, mapSpeakerLabel } from "./deepgram";
import type {
  DeepgramResponse,
  DeepgramTranscriptResponse,
  TranscriptChunk,
} from "@/types/deepgram";

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = [1000, 2000, 4000];

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
          if (!this.isClosed) this.attemptReconnect();
        });
        this.ws.on("error", () => {
          this.isConnected = false;
          if (!this.isClosed) this.attemptReconnect();
        });
      } catch {
        this.attemptReconnect();
      }
    }, delay);
  }
}
