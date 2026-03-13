import { auth } from "@/lib/auth";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const channel = "dev:chat";

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let alive = true;

      controller.enqueue(
        encoder.encode(`event: connected\ndata: {"channel":"dev:chat"}\n\n`)
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
        }
      });

      redis.on("message", (_ch: string, message: string) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
      });

      redis.on("error", () => cleanup());

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
