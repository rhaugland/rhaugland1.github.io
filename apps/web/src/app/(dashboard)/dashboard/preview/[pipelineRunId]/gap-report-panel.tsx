"use client";

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

interface GapReportPanelProps {
  coverageScore: number;
  gaps: Gap[];
  tradeoffs: Tradeoff[];
}

const gapTypeColors: Record<string, { bg: string; text: string; label: string }> = {
  missed: { bg: "bg-red-100", text: "text-red-700", label: "missed" },
  simplified: { bg: "bg-yellow-100", text: "text-yellow-700", label: "simplified" },
  deferred: { bg: "bg-blue-100", text: "text-blue-700", label: "deferred" },
};

const severityColors: Record<string, string> = {
  high: "text-red-600",
  medium: "text-yellow-600",
  low: "text-muted",
};

function getCoverageColor(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 80) return "text-green-500";
  if (score >= 70) return "text-yellow-500";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

export function GapReportPanel({
  coverageScore,
  gaps,
  tradeoffs,
}: GapReportPanelProps) {
  const missedGaps = gaps.filter((g) => g.type === "missed");
  const simplifiedGaps = gaps.filter((g) => g.type === "simplified");
  const deferredGaps = gaps.filter((g) => g.type === "deferred");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* coverage score */}
      <div className="border-b border-border p-6">
        <p className="text-sm text-muted">coverage score</p>
        <p className={`text-6xl font-extrabold ${getCoverageColor(coverageScore)}`}>
          {coverageScore}
        </p>
        <p className="mt-1 text-xs text-muted">out of 100</p>
      </div>

      {/* categorized gaps */}
      <div className="border-b border-border p-6">
        <h3 className="text-sm font-bold">gaps ({gaps.length})</h3>
        <div className="mt-2 flex gap-3 text-xs">
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
            {missedGaps.length} missed
          </span>
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-yellow-700">
            {simplifiedGaps.length} simplified
          </span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
            {deferredGaps.length} deferred
          </span>
        </div>

        {gaps.length === 0 ? (
          <p className="mt-3 text-sm text-muted">no gaps found</p>
        ) : (
          <div className="mt-3 space-y-3">
            {gaps.map((gap, i) => {
              const typeStyle = gapTypeColors[gap.type] ?? gapTypeColors.missed;
              return (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeStyle.bg} ${typeStyle.text}`}
                    >
                      {typeStyle.label}
                    </span>
                    <span
                      className={`text-xs font-medium ${severityColors[gap.severity] ?? "text-muted"}`}
                    >
                      {gap.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium">{gap.feature}</p>
                  <p className="mt-0.5 text-sm text-muted">{gap.description}</p>
                  <p className="mt-1 text-xs text-muted">
                    <span className="font-medium">reason:</span> {gap.reason}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* tradeoffs */}
      {tradeoffs.length > 0 && (
        <div className="p-6">
          <h3 className="text-sm font-bold">tradeoff explanations ({tradeoffs.length})</h3>
          <div className="mt-3 space-y-3">
            {tradeoffs.map((tradeoff, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{tradeoff.decision}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="font-medium text-green-600">chose</p>
                    <p className="text-muted">{tradeoff.chose}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted">alternative</p>
                    <p className="text-muted">{tradeoff.alternative}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted">
                  <span className="font-medium">rationale:</span> {tradeoff.rationale}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
