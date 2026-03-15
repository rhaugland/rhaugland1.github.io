import { auth } from "@/lib/auth";
import { DeepgramProxy } from "@/lib/deepgram-proxy";
import type { TranscriptChunk } from "@/types/deepgram";
import { createRedisSubscriber } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }

  const pipelineRunId = request.headers.get("x-pipeline-run-id");
  if (!pipelineRunId) {
    return new Response("missing x-pipeline-run-id header", { status: 400 });
  }

  const redis = createRedisSubscriber();
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
