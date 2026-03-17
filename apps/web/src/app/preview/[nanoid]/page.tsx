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
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">slushie</h1>
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

  let prototype: {
    id: string;
    version: number;
    previewUrl: string | null;
    manifest: unknown;
    htmlBundle: string | null;
  } | null = null;

  if (pipelineRun) {
    prototype = await prisma.prototype.findFirst({
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
        htmlBundle: true,
      },
    });
  }

  const clientName = pipelineRun?.client.name ?? "your project";

  // check payment status — only lock preview after step 5 (billing)
  if (!tracker.paidAt && tracker.currentStep > 5) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">slushie</h1>
          <div className="mt-8 rounded-2xl bg-surface shadow-lg backdrop-blur-sm p-6">
            <div className="mx-auto h-16 w-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg className="h-8 w-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-lg font-bold text-foreground">build locked</p>
            <p className="mt-2 text-sm text-muted">
              your tool is ready, but access is locked until payment is complete.
            </p>
            <p className="mt-4 text-xs text-muted">
              check your tracker link to complete payment and unlock your build.
            </p>
          </div>
        </div>
        <div className="mt-8 text-center text-xs text-muted/60">
          <p>powered by slushie</p>
        </div>
      </main>
    );
  }

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
      prototypeId={prototype?.id ?? null}
      hasHtmlBundle={!!prototype?.htmlBundle}
      manifest={prototype?.manifest ?? null}
      walkthroughSteps={walkthroughSteps}
    />
  );
}
