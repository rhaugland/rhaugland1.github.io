import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import { PreviewLayout } from "./preview-layout";

interface Gap {
  type: "missed" | "simplified" | "deferred";
  feature: string;
  description: string;
  reason: string;
  severity: "high" | "medium" | "low";
}

interface Tradeoff {
  decision: string;
  chose: string;
  alternative: string;
  rationale: string;
}

interface Decision {
  description: string;
  context: string;
  flagged: boolean;
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ pipelineRunId: string }>;
}) {
  const { pipelineRunId } = await params;

  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: {
      client: true,
      call: {
        include: {
          analysis: {
            include: {
              buildSpecs: {
                orderBy: { version: "asc" },
                include: {
                  prototypes: {
                    orderBy: { version: "asc" },
                    include: {
                      gapReports: {
                        orderBy: { version: "desc" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!run) notFound();

  const allSpecs = run.call.analysis?.buildSpecs ?? [];
  const allPrototypes = allSpecs.flatMap((s) => s.prototypes);
  const allGapReports = allPrototypes.flatMap((p) => p.gapReports);

  // latest prototype is the one we show
  const latestPrototype = allPrototypes.length > 0 ? allPrototypes[allPrototypes.length - 1] : null;

  // gap report: use the most recent one across ALL prototypes (so it persists after v2 build)
  const latestGapReport = allGapReports.length > 0 ? allGapReports[0] : null; // already ordered desc

  const coverageScore = latestGapReport?.coverageScore ?? 0;
  const gaps = (latestGapReport?.gaps as Gap[] | null) ?? [];
  const tradeoffs = (latestGapReport?.tradeoffs as Tradeoff[] | null) ?? [];
  const decisionLog = (latestPrototype?.decisionLog as Decision[] | null) ?? [];
  const flaggedDecisions = decisionLog.filter((d) => d.flagged);

  return (
    <PreviewLayout
      clientName={run.client.name}
      status={run.status}
      prototypeVersion={latestPrototype?.version ?? null}
      gapReportVersion={latestGapReport?.version ?? null}
      coverageScore={coverageScore}
      gaps={gaps}
      tradeoffs={tradeoffs}
      hasGapReport={!!latestGapReport}
      manifest={latestPrototype?.manifest ?? null}
      prototypeId={latestPrototype?.id ?? null}
      hasHtmlBundle={!!latestPrototype?.htmlBundle}
      flaggedDecisions={flaggedDecisions}
    />
  );
}
