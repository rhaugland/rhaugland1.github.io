"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface BookingCardProps {
  id: string;
  name: string;
  businessName: string;
  plan: string;
  meetingTime: string;
  trackingSlug: string | null;
  assignee: { id: string; name: string } | null;
  employees: Array<{ id: string; name: string }>;
  stepLabel?: string;
  stepNumber?: number;
  buildStatus?: "none" | "analyzing" | "building" | "ready";
  buildPreviewUrl?: string;
  pipelineRunId?: string | null;
}

export function BookingCard({
  id,
  name,
  businessName,
  plan,
  meetingTime,
  trackingSlug,
  assignee,
  employees,
  stepLabel,
  stepNumber,
  buildStatus,
  buildPreviewUrl,
  pipelineRunId,
}: BookingCardProps) {
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const [showEmployees, setShowEmployees] = useState(false);

  const meetingLabel = new Date(meetingTime).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  async function handleClaim(employeeId: string) {
    setClaiming(true);
    try {
      const res = await fetch(`/api/booking/${id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setClaiming(false);
      setShowEmployees(false);
    }
  }

  async function handleUnclaim() {
    setClaiming(true);
    try {
      const res = await fetch(`/api/booking/${id}/claim`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="rounded-lg bg-white border border-gray-200 p-3 shadow-sm">
      {/* step badge — shown in "my meetings" view */}
      {stepLabel && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-[10px] font-bold text-secondary">
            step {stepNumber}
          </span>
          <span className="text-[10px] text-muted">{stepLabel}</span>
        </div>
      )}

      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{businessName}</p>
          <p className="text-xs text-muted truncate">{name}</p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          {plan}
        </span>
      </div>

      {/* meeting time */}
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {meetingLabel}
      </div>

      {/* build status */}
      {buildStatus && buildStatus !== "none" && (
        <div className="mt-2">
          {buildStatus === "analyzing" && (
            <div className="flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5">
              <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[10px] font-medium text-amber-700">analyzing intake...</span>
            </div>
          )}
          {buildStatus === "building" && (
            <div className="flex items-center gap-1.5 rounded-md bg-blue-50 border border-blue-200 px-2 py-1.5">
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-[10px] font-medium text-blue-700">building prototype...</span>
            </div>
          )}
          {buildStatus === "ready" && (
            <a
              href={buildPreviewUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5 hover:border-primary/40 transition-colors"
            >
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-[10px] font-bold text-primary">initial build ready — view</span>
            </a>
          )}
        </div>
      )}

      {/* start call — shown for claimed bookings on meeting day */}
      {assignee && pipelineRunId && new Date(meetingTime).toDateString() === new Date().toDateString() && (
        <a
          href={`/dashboard/calls/live/${pipelineRunId}`}
          className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-secondary px-3 py-2 text-xs font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          start call
        </a>
      )}

      {/* assignee / claim */}
      <div className="mt-3 relative">
        {assignee ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-full bg-secondary/20 flex items-center justify-center text-[10px] font-bold text-secondary">
                {assignee.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-foreground">{assignee.name}</span>
            </div>
            <button
              type="button"
              onClick={handleUnclaim}
              disabled={claiming}
              className="text-[10px] text-muted hover:text-red-500 transition-colors disabled:opacity-50"
            >
              release
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowEmployees(!showEmployees)}
              disabled={claiming}
              className="w-full rounded-md border-2 border-dashed border-gray-300 py-1.5 text-xs font-medium text-muted hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              {claiming ? "claiming..." : "claim"}
            </button>
            {showEmployees && (
              <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                {employees.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => handleClaim(emp.id)}
                    className="block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-primary/5 first:rounded-t-lg last:rounded-b-lg"
                  >
                    {emp.name}
                  </button>
                ))}
                {employees.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted">no employees yet</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* track link */}
      {trackingSlug && (
        <a
          href={`/track/${trackingSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-center text-[10px] text-muted hover:text-primary transition-colors"
        >
          view tracker
        </a>
      )}
    </div>
  );
}
