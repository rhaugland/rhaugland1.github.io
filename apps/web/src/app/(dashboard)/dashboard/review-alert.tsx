"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ReviewAlertProps {
  id: string;
  businessName: string;
  name: string;
  plan: string;
  meetingTime: string | null;
}

export function ReviewAlert({ id, businessName, name, plan, meetingTime }: ReviewAlertProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const meetingLabel = meetingTime
    ? new Date(meetingTime).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  async function handleReview(action: "confirm" | "release") {
    setLoading(true);
    try {
      const res = await fetch(`/api/booking/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {businessName} rescheduled their meeting
          </p>
          <p className="text-xs text-muted mt-0.5">
            {name} — {plan}
          </p>
          {meetingLabel && (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
              <svg className="h-3.5 w-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              new time: {meetingLabel}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => handleReview("confirm")}
            disabled={loading}
            className="rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            keep it
          </button>
          <button
            type="button"
            onClick={() => handleReview("release")}
            disabled={loading}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            release
          </button>
        </div>
      </div>
    </div>
  );
}
