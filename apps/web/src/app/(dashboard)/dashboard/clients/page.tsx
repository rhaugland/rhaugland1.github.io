import { prisma } from "@slushie/db";
import { ClientsView } from "./clients-view";

export default async function ClientsPage() {
  // auto-delete clients that have been DONE for more than 24 hours
  const expiredCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const expiredClients = await prisma.client.findMany({
    where: { stage: "DONE", doneAt: { not: null, lt: expiredCutoff } },
    select: { id: true },
  });

  if (expiredClients.length > 0) {
    const ids = expiredClients.map((c) => c.id);
    // delete related records first
    await prisma.pipelineRun.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.call.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.client.deleteMany({ where: { id: { in: ids } } });
  }

  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { calls: true } },
      calls: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const industries = [...new Set(clients.map((c) => c.industry))].sort();
  const owners = [...new Set(clients.map((c) => c.owner).filter(Boolean))] as string[];

  const serialized = clients.map((c) => ({
    id: c.id,
    name: c.name,
    industry: c.industry,
    contactName: c.contactName,
    contactEmail: c.contactEmail,
    owner: c.owner,
    stage: c.stage,
    doneAt: c.doneAt?.toISOString() ?? null,
    callCount: c._count.calls,
    lastContactDate: c.calls[0]?.createdAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  }));

  return <ClientsView clients={serialized} industries={industries} owners={owners} />;
}
