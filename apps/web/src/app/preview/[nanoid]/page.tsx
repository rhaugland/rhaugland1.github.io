import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PreviewClient } from "./preview-client";

export const metadata: Metadata = {
  title: "slushie — your prototype",
  description: "take a look at what we built for you.",
};

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ nanoid: string }>;
}) {
  const { nanoid } = await params;

  // find tracker by prototypeNanoid — security via unguessable url
  const tracker = await prisma.tracker.findUnique({
    where: { prototypeNanoid: nanoid },
    include: {
      pipelineRun: {
        include: {
          client: { select: { name: true } },
        },
      },
    },
  });

  if (!tracker) {
    notFound();
  }

  // expired links get a friendly message — 30 day expiry per spec
  if (tracker.expiresAt && tracker.expiresAt < new Date()) {
    return (
      <main className="flex min-h-screen items-center justify-center slushie-gradient">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-primary">slushie</h1>
          <p className="mt-4 text-foreground">this prototype link has expired.</p>
          <p className="mt-2 text-muted text-sm">
            reach out to your slushie contact for a fresh one.
          </p>
        </div>
      </main>
    );
  }

  // find the latest prototype for this pipeline run
  const pipelineRun = tracker.pipelineRun;

  // query through the chain: pipelineRun -> call -> analysis -> buildSpec -> prototype
  const prototype = await prisma.prototype.findFirst({
    where: {
      buildSpec: {
        analysis: {
          callId: pipelineRun.callId,
        },
      },
    },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      previewUrl: true,
      manifest: true,
    },
  });

  const clientName = pipelineRun.client.name;

  // extract walkthrough steps from prototype manifest
  interface WalkthroughStep {
    target_component: string;
    step: number;
    text: string;
  }

  let walkthroughSteps: WalkthroughStep[] = [];
  if (prototype?.manifest && typeof prototype.manifest === "object") {
    const manifest = prototype.manifest as { walkthrough?: WalkthroughStep[] };
    walkthroughSteps = manifest.walkthrough ?? [];
  }

  return (
    <PreviewClient
      nanoid={nanoid}
      clientName={clientName}
      prototypeUrl={prototype?.previewUrl ?? null}
      walkthroughSteps={walkthroughSteps}
    />
  );
}
