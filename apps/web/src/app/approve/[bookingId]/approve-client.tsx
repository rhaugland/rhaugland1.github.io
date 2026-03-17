"use client";

import { useState } from "react";

interface ApproveClientProps {
  bookingId: string;
  businessName: string;
  name: string;
  previewUrl: string | null;
  prototypeId: string | null;
  currentStep: number;
}

export function ApproveClient({
  bookingId,
  businessName,
  name,
  previewUrl,
  prototypeId,
  currentStep,
}: ApproveClientProps) {
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyApproved = currentStep > 9;

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/booking/${bookingId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "failed to approve");
      }
      setApproved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // already approved state
  if (alreadyApproved || approved) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {approved ? "build approved" : "already approved"}
          </h1>
          <p className="mt-3 text-sm text-muted">
            {approved
              ? `thanks, ${name.split(" ")[0]}. your build for ${businessName} has been approved. we'll start plugging it in.`
              : `the build for ${businessName} has already been approved. no action needed.`}
          </p>
          <div className="mt-8">
            <span className="text-lg font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              slushie
            </span>
          </div>
        </div>
      </div>
    );
  }

  const iframeSrc = prototypeId
    ? `/api/prototype/${prototypeId}/html`
    : previewUrl;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* header */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-lg font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            slushie
          </span>
          <span className="text-xs text-muted">
            built for {businessName}
          </span>
        </div>
        <span className="text-[10px] text-muted">approval review</span>
      </div>

      {/* prototype preview */}
      <div className="relative flex-1">
        {iframeSrc ? (
          <iframe
            src={iframeSrc}
            className="w-full border-0"
            style={{ minHeight: "calc(100vh - 120px)" }}
            title="prototype preview"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <div className="flex h-full min-h-[60vh] items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                your prototype is being prepared.
              </p>
              <p className="mt-2 text-sm text-muted">
                check back soon -- we're putting the finishing touches on it.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* sticky approve bar */}
      <div className="sticky bottom-0 border-t border-border bg-surface px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              ready to approve?
            </p>
            <p className="text-xs text-muted">
              once approved, we'll start plugging your build in.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <p className="text-xs text-primary">{error}</p>
            )}
            <button
              onClick={handleApprove}
              disabled={loading}
              className="rounded-full bg-gradient-to-r from-primary to-secondary px-8 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:scale-105 hover:shadow-md disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? "approving..." : "approve build"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
