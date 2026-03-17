"use client";

import { useState } from "react";

interface NextWorkflowFormProps {
  bookingId: string;
  name: string;
  businessName: string;
  planLabel: string;
  workflowNumber: number;
  totalWorkflows: number;
}

export function NextWorkflowForm({
  bookingId,
  name,
  businessName,
  planLabel,
  workflowNumber,
  totalWorkflows,
}: NextWorkflowFormProps) {
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/booking/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentBookingId: bookingId,
          description: description.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "something went wrong");
        return;
      }

      setSuccess(true);
    } catch {
      setError("something went wrong. please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">slushie</h1>
          <div className="mt-6 rounded-2xl bg-surface shadow-lg backdrop-blur-sm p-6 space-y-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-secondary/20">
              <svg className="h-7 w-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-bold text-foreground">we're on it!</p>
            <p className="text-xs text-muted">
              workflow {workflowNumber} of {totalWorkflows} for {businessName} is now being built. check your email for updates.
            </p>
          </div>
          <p className="mt-6 text-center text-xs text-muted/60">powered by slushie</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">slushie</h1>
          <p className="mt-2 text-sm text-foreground">
            hey {name} — let's start workflow {workflowNumber} of {totalWorkflows}
          </p>
          <p className="mt-1 text-xs text-muted">
            {planLabel} for {businessName}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="rounded-2xl bg-surface shadow-lg backdrop-blur-sm p-6 space-y-5">
            {/* description */}
            <div>
              <label htmlFor="description" className="block text-xs font-medium text-muted mb-1">
                what should we build this time?
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="describe the workflow you'd like us to build..."
                required
                rows={4}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none resize-none"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !description.trim()}
              className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-50"
            >
              {submitting ? "starting build..." : "start building →"}
            </button>
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          we'll start building immediately — your rep will reach out to schedule a discovery call.
        </p>

        <p className="mt-6 text-center text-xs text-muted/60">
          powered by slushie
        </p>
      </div>
    </main>
  );
}
