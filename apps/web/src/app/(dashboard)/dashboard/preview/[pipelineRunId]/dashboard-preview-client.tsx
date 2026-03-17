"use client";

import { ManifestRenderer } from "@/components/manifest-renderer";
import type { PrototypeManifest } from "@slushie/prototype-kit/src/renderer/types";

interface Decision {
  description: string;
  context: string;
  flagged: boolean;
}

interface DashboardPreviewClientProps {
  manifest: unknown;
  prototypeId: string | null;
  hasHtmlBundle: boolean;
  flaggedDecisions: Decision[];
  prototypeVersion?: number;
}

export function DashboardPreviewClient({
  manifest,
  prototypeId,
  hasHtmlBundle,
  flaggedDecisions,
  prototypeVersion,
}: DashboardPreviewClientProps) {
  // prefer HTML bundle (new agentic builds) over manifest (legacy)
  const useIframe = hasHtmlBundle && prototypeId;

  const hasManifest =
    !useIframe &&
    manifest &&
    typeof manifest === "object" &&
    (manifest as PrototypeManifest).pages?.length > 0;

  // v1 = dark theme, v2+ = light theme (for legacy manifest rendering)
  const themeOverride: "dark" | "light" = (prototypeVersion ?? 1) <= 1 ? "dark" : "light";

  return (
    <>
      {useIframe ? (
        <>
          <iframe
            src={`/api/prototype/${prototypeId}/html`}
            className="flex-1 w-full border-0"
            style={{ minHeight: "calc(100vh - 140px)" }}
            title="prototype preview"
            sandbox="allow-scripts allow-same-origin"
          />
          {flaggedDecisions.length > 0 && (
            <FlaggedDecisionsPanel decisions={flaggedDecisions} />
          )}
        </>
      ) : hasManifest ? (
        <>
          <div className="flex-1 overflow-y-auto">
            <ManifestRenderer manifest={manifest as PrototypeManifest} themeOverride={themeOverride} />
          </div>
          {flaggedDecisions.length > 0 && (
            <FlaggedDecisionsPanel decisions={flaggedDecisions} />
          )}
        </>
      ) : (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted">
            no prototype yet — waiting for builder agent
          </p>
        </div>
      )}
    </>
  );
}

function FlaggedDecisionsPanel({ decisions }: { decisions: Decision[] }) {
  return (
    <div className="border-t border-border bg-yellow-50 p-4">
      <h4 className="text-xs font-bold text-yellow-700">
        flagged decisions ({decisions.length})
      </h4>
      <div className="mt-2 space-y-2">
        {decisions.map((decision, i) => (
          <div
            key={i}
            className="rounded border border-yellow-200 bg-white p-2"
          >
            <p className="text-xs font-medium">
              {decision.description}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {decision.context}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
