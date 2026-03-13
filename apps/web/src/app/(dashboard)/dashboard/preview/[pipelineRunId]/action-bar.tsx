"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ActionBarProps {
  pipelineRunId: string;
  status: string;
}

export function ActionBar({ pipelineRunId, status }: ActionBarProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "revise" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isActionable = status === "RUNNING";

  async function handleApprove() {
    setLoading("approve");
    setError(null);

    try {
      const res = await fetch(`/api/pipeline/${pipelineRunId}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "approval failed" }));
        setError(body.error ?? "approval failed");
        return;
      }

      router.refresh();
    } catch {
      setError("network error — try again");
    } finally {
      setLoading(null);
    }
  }

  async function handleRevise() {
    setLoading("revise");
    setError(null);

    try {
      const res = await fetch(`/api/pipeline/${pipelineRunId}/revise`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "revision request failed" }));
        setError(body.error ?? "revision request failed");
        return;
      }

      router.refresh();
    } catch {
      setError("network error — try again");
    } finally {
      setLoading(null);
    }
  }

  if (status === "COMPLETED") {
    return (
      <div className="flex items-center justify-between border-t border-gray-200 bg-green-50 px-6 py-4">
        <p className="text-sm font-medium text-green-700">approved and delivered</p>
        <a
          href={`/dashboard/postmortems/${pipelineRunId}`}
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          start postmortem
        </a>
      </div>
    );
  }

  if (!isActionable) {
    return (
      <div className="flex items-center border-t border-gray-200 bg-gray-50 px-6 py-4">
        <p className="text-sm text-muted">
          {status === "STALLED"
            ? "pipeline is stalled — check the worker logs"
            : status === "CANCELLED"
              ? "pipeline was cancelled"
              : "waiting for pipeline to complete..."}
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-4">
      {error && (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={handleApprove}
          disabled={loading !== null}
          className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {loading === "approve" ? "approving..." : "approve and deliver"}
        </button>
        <button
          onClick={handleRevise}
          disabled={loading !== null}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-foreground hover:bg-gray-50 disabled:opacity-50"
        >
          {loading === "revise" ? "requesting..." : "request revisions"}
        </button>
      </div>
    </div>
  );
}
