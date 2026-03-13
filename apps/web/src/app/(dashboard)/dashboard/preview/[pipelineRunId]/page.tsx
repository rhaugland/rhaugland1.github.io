import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import { GapReportPanel } from "./gap-report-panel";
import { ActionBar } from "./action-bar";

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
                orderBy: { version: "desc" },
                take: 1,
                include: {
                  prototypes: {
                    orderBy: { version: "desc" },
                    take: 1,
                    include: {
                      gapReports: {
                        orderBy: { version: "desc" },
                        take: 1,
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

  const latestSpec = run.call.analysis?.buildSpecs[0] ?? null;
  const latestPrototype = latestSpec?.prototypes[0] ?? null;
  const latestGapReport = latestPrototype?.gapReports[0] ?? null;

  const coverageScore = latestGapReport?.coverageScore ?? 0;
  const gaps = (latestGapReport?.gaps as Gap[] | null) ?? [];
  const tradeoffs = (latestGapReport?.tradeoffs as Tradeoff[] | null) ?? [];
  const decisionLog = (latestPrototype?.decisionLog as Decision[] | null) ?? [];
  const previewUrl = latestPrototype?.previewUrl ?? null;
  const flaggedDecisions = decisionLog.filter((d) => d.flagged);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h2 className="text-xl font-bold">{run.client.name}</h2>
          <p className="text-sm text-muted">
            internal preview
            {latestPrototype
              ? ` — prototype v${latestPrototype.version}`
              : ""}
            {latestGapReport
              ? ` — gap report v${latestGapReport.version}`
              : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            run.status === "COMPLETED"
              ? "bg-green-100 text-green-700"
              : run.status === "RUNNING"
                ? "bg-blue-100 text-blue-700"
                : run.status === "STALLED"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-red-100 text-red-700"
          }`}
        >
          {run.status.toLowerCase()}
        </span>
      </div>

      {/* split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* left panel: final gap report with coverage score, categorized gaps, reasons, tradeoffs */}
        <div className="w-1/2 overflow-y-auto border-r border-gray-200 bg-white">
          {latestGapReport ? (
            <GapReportPanel
              coverageScore={coverageScore}
              gaps={gaps}
              tradeoffs={tradeoffs}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted">
                no gap report yet — waiting for reviewer agent
              </p>
            </div>
          )}
        </div>

        {/* right panel: embedded prototype preview + builder's flagged decisions */}
        <div className="w-1/2 flex flex-col bg-gray-100">
          {previewUrl ? (
            <>
              <iframe
                src={previewUrl}
                title="prototype preview"
                className="flex-1 border-0"
                sandbox="allow-scripts allow-same-origin"
              />
              {flaggedDecisions.length > 0 && (
                <div className="border-t border-gray-200 bg-yellow-50 p-4">
                  <h4 className="text-xs font-bold text-yellow-700">
                    flagged decisions ({flaggedDecisions.length})
                  </h4>
                  <div className="mt-2 space-y-2">
                    {flaggedDecisions.map((decision, i) => (
                      <div key={i} className="rounded border border-yellow-200 bg-white p-2">
                        <p className="text-xs font-medium">{decision.description}</p>
                        <p className="mt-0.5 text-xs text-muted">{decision.context}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted">
                no prototype yet — waiting for builder agent
              </p>
            </div>
          )}
        </div>
      </div>

      {/* action bar: "approve and deliver" / "request revisions" */}
      <ActionBar pipelineRunId={pipelineRunId} status={run.status} />
    </div>
  );
}
