"use client";

import { useState } from "react";
import { GapReportPanel } from "./gap-report-panel";
import { DashboardPreviewClient } from "./dashboard-preview-client";

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

interface PreviewLayoutProps {
  clientName: string;
  status: string;
  prototypeVersion: number | null;
  gapReportVersion: number | null;
  coverageScore: number;
  gaps: Gap[];
  tradeoffs: Tradeoff[];
  hasGapReport: boolean;
  manifest: unknown;
  prototypeId: string | null;
  hasHtmlBundle: boolean;
  flaggedDecisions: Decision[];
}

export function PreviewLayout({
  clientName,
  status,
  prototypeVersion,
  gapReportVersion,
  coverageScore,
  gaps,
  tradeoffs,
  hasGapReport,
  manifest,
  prototypeId,
  hasHtmlBundle,
  flaggedDecisions,
}: PreviewLayoutProps) {
  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-bold">{clientName}</h2>
            <p className="text-sm text-muted">
              internal preview
              {prototypeVersion ? ` — prototype v${prototypeVersion}` : ""}
              {gapReportVersion ? ` — gap report v${gapReportVersion}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPanelOpen(!panelOpen)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:border-primary transition-colors"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${panelOpen ? "" : "rotate-180"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {panelOpen ? "hide gap analysis" : "show gap analysis"}
          </button>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === "COMPLETED"
                ? "bg-green-100 text-green-700"
                : status === "RUNNING"
                  ? "bg-blue-100 text-blue-700"
                  : status === "STALLED"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
            }`}
          >
            {status.toLowerCase()}
          </span>
        </div>
      </div>

      {/* split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* left panel: gap report — collapsible */}
        <div
          className={`overflow-y-auto border-r border-border bg-surface transition-all duration-300 ${
            panelOpen ? "w-1/2" : "w-0 border-r-0"
          }`}
          style={{ minWidth: panelOpen ? undefined : 0 }}
        >
          {panelOpen && (
            <>
              {hasGapReport ? (
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
            </>
          )}
        </div>

        {/* right panel: prototype preview — expands to full width when panel collapsed */}
        <div className="flex-1 flex flex-col bg-white/5">
          <DashboardPreviewClient
            manifest={manifest}
            prototypeId={prototypeId}
            hasHtmlBundle={hasHtmlBundle}
            flaggedDecisions={flaggedDecisions}
            prototypeVersion={prototypeVersion ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
