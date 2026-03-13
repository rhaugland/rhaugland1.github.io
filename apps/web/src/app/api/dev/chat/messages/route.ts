import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";

export async function GET() {
  const session = await auth();
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }

  const messages = await prisma.notificationMessage.findMany({
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // group by pipelineRunId — each pipeline run gets its own chat thread
  const threads: Record<
    string,
    {
      pipelineRunId: string;
      clientName: string;
      messages: typeof messages;
    }
  > = {};

  for (const msg of messages) {
    if (!threads[msg.pipelineRunId]) {
      threads[msg.pipelineRunId] = {
        pipelineRunId: msg.pipelineRunId,
        clientName: msg.clientName,
        messages: [],
      };
    }
    threads[msg.pipelineRunId].messages.push(msg);
  }

  return Response.json({
    threads: Object.values(threads),
  });
}
