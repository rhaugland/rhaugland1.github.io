import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TrackerClient } from "./tracker-client";

interface TrackerStep {
  step: number;
  label: string;
  subtitle: string;
  status: "done" | "active" | "pending";
  completedAt: string | null;
}

export const metadata: Metadata = {
  title: "slushie — tracking your build",
  description: "watch your custom tool come together.",
};

export default async function TrackerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tracker = await prisma.tracker.findUnique({
    where: { slug },
    include: {
      pipelineRun: {
        include: {
          client: { select: { name: true } },
        },
      },
      booking: { select: { id: true, businessName: true } },
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
          <p className="mt-4 text-foreground">this link has expired.</p>
          <p className="mt-2 text-muted text-sm">
            reach out to your slushie contact for a fresh one.
          </p>
        </div>
      </main>
    );
  }

  const steps = (tracker.steps as unknown as TrackerStep[]) ?? [];
  const clientName =
    tracker.pipelineRun?.client.name ??
    tracker.booking?.businessName ??
    "your project";

  return (
    <TrackerClient
      slug={slug}
      clientName={clientName}
      initialSteps={steps}
      currentStep={tracker.currentStep}
      prototypeNanoid={tracker.prototypeNanoid}
      bookingId={tracker.booking?.id ?? null}
    />
  );
}
