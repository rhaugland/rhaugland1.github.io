"use client";

import { useState } from "react";

interface SurveyClientProps {
  bookingId: string;
  businessName: string;
  name: string;
  currentStep: number;
  existingScore: number | null;
}

export function SurveyClient({
  bookingId,
  businessName,
  name,
  currentStep,
  existingScore,
}: SurveyClientProps) {
  const [score, setScore] = useState<number | null>(existingScore);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // already completed
  if (existingScore !== null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-surface rounded-2xl p-8 max-w-md w-full text-center border border-border">
          <div className="w-16 h-16 rounded-full bg-gradient-to-r from-red-500 to-blue-500 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">thanks for your feedback</h1>
          <p className="text-muted text-sm">
            you gave slushie a {existingScore}/10. we appreciate you taking the time,{" "}
            {name.split(" ")[0].toLowerCase()}.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-surface rounded-2xl p-8 max-w-md w-full text-center border border-border">
          <div className="w-16 h-16 rounded-full bg-gradient-to-r from-red-500 to-blue-500 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">thanks for your feedback</h1>
          <p className="text-muted text-sm">
            you gave slushie a {score}/10. we appreciate it,{" "}
            {name.split(" ")[0].toLowerCase()}.
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (score === null) return;

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/booking/${bookingId}/advance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ npsScore: score, npsFeedback: feedback.trim() || null }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "something went wrong");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        {/* header */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <span className="text-2xl font-bold bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
              slushie
            </span>
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            how likely are you to recommend slushie?
          </h1>
          <p className="text-muted text-sm">
            hey {name.split(" ")[0].toLowerCase()}, we'd love to know how your experience went
            with {businessName.toLowerCase()}.
          </p>
        </div>

        {/* form */}
        <form onSubmit={handleSubmit} className="bg-surface rounded-2xl p-6 border border-border space-y-6">
          {/* nps score buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted">not likely</span>
              <span className="text-xs text-muted">extremely likely</span>
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setScore(i)}
                  className={`flex-1 aspect-square rounded-lg text-sm font-medium transition-all ${
                    score === i
                      ? "bg-gradient-to-r from-red-500 to-blue-500 text-white shadow-lg scale-110"
                      : "bg-surface-light border border-border text-muted hover:text-foreground hover:border-foreground/20"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* feedback textarea */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              anything else you'd like to share? (optional)
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="tell us what went well or what we could improve"
              className="w-full rounded-lg bg-surface-light border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-primary">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || score === null}
            className="w-full rounded-lg bg-gradient-to-r from-red-500 to-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "submitting..." : "submit feedback"}
          </button>
        </form>
      </div>
    </div>
  );
}
