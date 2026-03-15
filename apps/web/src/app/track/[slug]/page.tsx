import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TrackerClient } from "./tracker-client";
import { TrackerLogin } from "./tracker-login";
import { getTrackerSession } from "@/lib/tracker-auth";

interface TrackerStep {
  step: number;
  label: string;
  subtitle: string;
  status: "done" | "active" | "pending";
  completedAt: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  SINGLE_SCOOP: "single scoop",
  DOUBLE_BLEND: "double blend",
  TRIPLE_FREEZE: "triple freeze",
};

const PLAN_PRICES: Record<string, string> = {
  SINGLE_SCOOP: "$3,500",
  DOUBLE_BLEND: "$6,000",
  TRIPLE_FREEZE: "$8,500",
};

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
          call: {
            select: {
              analysis: {
                select: {
                  buildSpecs: {
                    orderBy: { version: "desc" as const },
                    take: 1,
                    select: {
                      prototypes: {
                        orderBy: { version: "desc" as const },
                        take: 1,
                        select: { previewUrl: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      booking: { select: { id: true, businessName: true, meetingTime: true, plan: true, email: true, freeAddonEarned: true } },
    },
  });

  if (!tracker) {
    notFound();
  }

  // auth check: if tracker has a password set, require login
  if (tracker.passwordHash) {
    const session = await getTrackerSession();
    if (session?.slug !== slug) {
      return (
        <TrackerLogin
          slug={slug}
          businessName={tracker.booking?.businessName ?? "your project"}
        />
      );
    }
  }

  // check if this email has a free add-on from a previous booking
  const hasFreeAddon = tracker.booking?.email
    ? !!(await prisma.booking.findFirst({
        where: {
          email: tracker.booking.email,
          freeAddonEarned: true,
          id: { not: tracker.booking.id },
        },
        select: { id: true },
      }))
    : false;

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

  const buildPreviewUrl =
    tracker.pipelineRun?.call?.analysis?.buildSpecs?.[0]?.prototypes?.[0]?.previewUrl ?? null;

  return (
    <TrackerClient
      slug={slug}
      clientName={clientName}
      initialSteps={steps}
      currentStep={tracker.currentStep}
      prototypeNanoid={tracker.prototypeNanoid}
      bookingId={tracker.booking?.id ?? null}
      meetingTime={tracker.booking?.meetingTime?.toISOString() ?? null}
      buildPreviewUrl={buildPreviewUrl}
      revisionStatus={tracker.revisionStatus}
      pluginStatus={tracker.pluginStatus}
      isPaid={!!tracker.paidAt}
      planLabel={PLAN_LABELS[tracker.booking?.plan ?? ""] ?? "custom"}
      planPrice={
        hasFreeAddon && tracker.booking?.plan === "SINGLE_SCOOP"
          ? "$0"
          : PLAN_PRICES[tracker.booking?.plan ?? ""] ?? "$0"
      }
      hasFreeAddon={hasFreeAddon && tracker.booking?.plan === "SINGLE_SCOOP"}
      surveyCompleted={!!tracker.npsCompletedAt}
    />
  );
}
