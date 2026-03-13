"use client";

interface AgentScorecardProps {
  agentType: string;
  score: number;
  summary: string;
  suggestions: string[];
  feedback: string;
  onFeedbackChange: (value: string) => void;
  disabled: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 8) return "text-green-600";
  if (score >= 6) return "text-yellow-500";
  return "text-red-600";
}

function getScoreBgColor(score: number): string {
  if (score >= 8) return "bg-green-50 border-green-200";
  if (score >= 6) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

export function AgentScorecard({
  agentType,
  score,
  summary,
  suggestions,
  feedback,
  onFeedbackChange,
  disabled,
}: AgentScorecardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* header with score */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <div>
          <h3 className="text-sm font-bold">{agentType} agent</h3>
          <p className="mt-0.5 text-xs text-muted">{summary}</p>
        </div>
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-lg border ${getScoreBgColor(score)}`}
        >
          <span className={`text-2xl font-extrabold ${getScoreColor(score)}`}>
            {score}
          </span>
        </div>
      </div>

      {/* postmortem agent's pattern-based improvement suggestions */}
      {suggestions.length > 0 && (
        <div className="border-b border-gray-200 p-4">
          <p className="text-xs font-medium text-muted">suggested improvements</p>
          <ul className="mt-2 space-y-1">
            {suggestions.map((suggestion, i) => (
              <li key={i} className="text-sm text-foreground">
                <span className="mr-2 text-muted">--</span>
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* employee feedback textarea */}
      <div className="p-4">
        <label
          htmlFor={`feedback-${agentType}`}
          className="text-xs font-medium text-muted"
        >
          your feedback on {agentType}
        </label>
        <textarea
          id={`feedback-${agentType}`}
          value={feedback}
          onChange={(e) => onFeedbackChange(e.target.value)}
          disabled={disabled}
          placeholder={`what did the ${agentType} agent do well? what should it improve?`}
          rows={3}
          className="mt-1 w-full rounded-lg border border-gray-200 bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary disabled:opacity-60"
        />
      </div>
    </div>
  );
}
