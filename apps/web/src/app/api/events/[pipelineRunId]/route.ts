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
