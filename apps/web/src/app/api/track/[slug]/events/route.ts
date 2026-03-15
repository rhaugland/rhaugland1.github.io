import { createRedisSubscriber } from "@/lib/redis";
import { prisma } from "@slushie/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // verify slug exists — security via unguessable nanoid
  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    select: { id: true, pipelineRunId: true, expiresAt: true },
  });

  if (!tracker) {
    return new Response("not found", { status: 404 });
  }

  if (tracker.expiresAt && tracker.expiresAt < new Date()) {
    return new Response("this link has expired", { status: 410 });
  }

  const redis = createRedisSubscriber();
  const channel = `tracker:${tracker.pipelineRunId ?? tracker.id}`;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let alive = true;

      controller.enqueue(
        encoder.encode(`event: connected\ndata: {"slug":"${slug}"}\n\n`)
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
