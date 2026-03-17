"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AgentScorecard } from "./agent-scorecard";

interface AgentScore {
  agentType: string;
  score: number;
  summary: string;
  suggestions: string[];
}

interface PostmortemFormProps {
  pipelineRunId: string;
  agentScores: AgentScore[];
  existingFeedback: Record<string, string> | null;
  isSubmitted: boolean;
  clientNps: number | null;
  assigneeName: string | null;
  assigneeAvgNps: number | null;
}

const AGENT_ORDER = ["listener", "analyst", "builder", "reviewer"];

export function PostmortemForm({
  pipelineRunId,
  agentScores,
  existingFeedback,
  isSubmitted,
  clientNps,
  assigneeName,
  assigneeAvgNps,
}: PostmortemFormProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Record<string, string>>(
    existingFeedback ?? Object.fromEntries(AGENT_ORDER.map((a) => [a, ""]))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(isSubmitted);

  function handleFeedbackChange(agentType: string, value: string) {
    setFeedback((prev) => ({ ...prev, [agentType]: value }));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/postmortem/${pipelineRunId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "submission failed" }));
        setError(body.error ?? "submission failed");
        return;
      }

      setSubmitted(true);
      router.refresh();
    } catch {
      setError("network error — try again");
    } finally {
      setLoading(false);
    }
  }

  // sort scores by the defined agent order
  const sortedScores = AGENT_ORDER.map((agentType) => {
    const found = agentScores.find((s) => s.agentType === agentType);
    return (
      found ?? {
        agentType,
        score: 0,
        summary: "no data available",
        suggestions: [],
      }
    );
  });

  return (
    <div>
      <div className="space-y-4">
        {sortedScores.map((agentScore) => (
          <AgentScorecard
            key={agentScore.agentType}
            agentType={agentScore.agentType}
            score={agentScore.score}
            summary={agentScore.summary}
            suggestions={agentScore.suggestions}
            feedback={feedback[agentScore.agentType] ?? ""}
            onFeedbackChange={(value) =>
              handleFeedbackChange(agentScore.agentType, value)
            }
            disabled={submitted}
          />
        ))}
      </div>

      {/* NPS insights section */}
      {clientNps != null && (
        <div className="mt-4 rounded-lg border border-border bg-surface">
          <div className="border-b border-border p-4">
            <h3 className="text-sm font-bold text-foreground">NPS insights</h3>
            <p className="mt-0.5 text-xs text-muted">
              the client scored <span className="font-bold">{clientNps}/10</span>
              {assigneeName && (
                <>
                  {" "}for{" "}
                  <span className="font-bold">{assigneeName}</span>
                  {assigneeAvgNps != null && (
                    <span className="text-muted"> (avg {assigneeAvgNps})</span>
                  )}
                </>
              )}
              . what do you think drove this score?
            </p>
          </div>
          <div className="p-4">
            <label htmlFor="nps-insights" className="text-xs font-medium text-muted">
              analyst &amp; developer observations
            </label>
            <textarea
              id="nps-insights"
              value={feedback["nps_insights"] ?? ""}
              onChange={(e) => handleFeedbackChange("nps_insights", e.target.value)}
              disabled={submitted}
              placeholder={`what influenced this ${
                clientNps >= 9
                  ? "high"
                  : clientNps >= 7
                  ? "moderate"
                  : "low"
              } score? communication quality, build accuracy, turnaround time, anything ${assigneeName ? assigneeName + " " : ""}could improve?`}
              rows={4}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary disabled:opacity-60"
            />
          </div>
        </div>
      )}

      {/* submit postmortem button — triggers the skill update loop */}
      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {submitted ? (
          <div className="text-center">
            <p className="text-sm font-medium text-green-700">
              postmortem submitted — skill update agent is running
            </p>
            <p className="mt-1 text-xs text-muted">
              the postmortem agent will analyze feedback and update agent skills
            </p>
          </div>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "submitting postmortem..." : "submit postmortem"}
          </button>
        )}
      </div>
    </div>
  );
}
