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
  currentStep?: number;
  clientFeedback?: string | null;
  revisionStatus?: string | null;
  pluginCredentials?: Array<{ service: string; value: string }> | null;
  pluginStatus?: string | null;
  isPaid?: boolean;
  npsScore?: number | null;
  freeAddonEarned?: boolean;
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
  currentStep,
  clientFeedback,
  revisionStatus,
  pluginCredentials,
  pluginStatus,
  isPaid,
  npsScore,
  freeAddonEarned,
}: BookingCardProps) {
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const [showEmployees, setShowEmployees] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [changesPending, setChangesPending] = useState(false);
  const [editedFeedback, setEditedFeedback] = useState(clientFeedback ?? "");
  const [clientRevisionLoading, setClientRevisionLoading] = useState(false);
  const [clientBuildPending, setClientBuildPending] = useState(revisionStatus === "building");
  const [pluginLoading, setPluginLoading] = useState(false);
  const [pluginConnecting, setPluginConnecting] = useState(pluginStatus === "connecting");

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

  async function handleApprove() {
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/booking/${id}/build-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleRequestChanges() {
    if (!feedback.trim()) return;
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/booking/${id}/build-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_changes", feedback: feedback.trim() }),
      });
      if (res.ok) {
        setShowFeedback(false);
        setFeedback("");
        setChangesPending(true);
      }
    } finally {
      setReviewLoading(false);
    }
  }

  async function handlePushToBot() {
    if (!editedFeedback.trim()) return;
    setClientRevisionLoading(true);
    try {
      const res = await fetch(`/api/booking/${id}/client-revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push_to_bot", feedback: editedFeedback.trim() }),
      });
      if (res.ok) {
        setClientBuildPending(true);
      }
    } finally {
      setClientRevisionLoading(false);
    }
  }

  async function handleRepushToClient() {
    setClientRevisionLoading(true);
    try {
      const res = await fetch(`/api/booking/${id}/client-revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push_to_client" }),
      });
      if (res.ok) {
        setClientBuildPending(false);
        router.refresh();
      }
    } finally {
      setClientRevisionLoading(false);
    }
  }

  async function handlePluginConnect() {
    setPluginLoading(true);
    try {
      const res = await fetch(`/api/booking/${id}/plugin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      if (res.ok) {
        setPluginConnecting(true);
      }
    } finally {
      setPluginLoading(false);
    }
  }

  async function handlePluginComplete() {
    setPluginLoading(true);
    try {
      const res = await fetch(`/api/booking/${id}/plugin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setPluginLoading(false);
    }
  }

  const isSlushieReview = currentStep === 3;
  const isClientReview = currentStep === 4;
  const isPluginStep = currentStep === 5;
  const hasClientFeedback = isClientReview && revisionStatus === "revision_received" && clientFeedback;
  const hasCredentials = isPluginStep && pluginStatus === "credentials_received" && pluginCredentials && pluginCredentials.length > 0;

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

      {/* slushie review actions — step 3 */}
      {isSlushieReview && !changesPending && !showFeedback && (
        <div className="mt-2 space-y-1.5">
          {buildPreviewUrl && (
            <a
              href={buildPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5 text-[10px] font-bold text-primary hover:border-primary/40 transition-colors"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              view build
            </a>
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleApprove}
              disabled={reviewLoading}
              className="flex-1 rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
            >
              {reviewLoading ? "..." : "approve"}
            </button>
            <button
              type="button"
              onClick={() => setShowFeedback(true)}
              disabled={reviewLoading}
              className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-[10px] font-medium text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              suggest changes
            </button>
          </div>
        </div>
      )}

      {/* feedback text box */}
      {isSlushieReview && showFeedback && !changesPending && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="describe the changes you'd like..."
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none resize-none"
            rows={3}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleRequestChanges}
              disabled={reviewLoading || !feedback.trim()}
              className="flex-1 rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
            >
              {reviewLoading ? "sending..." : "send"}
            </button>
            <button
              type="button"
              onClick={() => { setShowFeedback(false); setFeedback(""); }}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-[10px] font-medium text-muted hover:text-foreground transition-colors"
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {/* changes pending indicator */}
      {isSlushieReview && changesPending && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-medium text-amber-700">changes pending...</span>
          </div>
          <div className="flex gap-1.5">
            {buildPreviewUrl && (
              <a
                href={buildPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center rounded-md border border-gray-300 px-2 py-1.5 text-[10px] font-medium text-foreground hover:border-primary hover:text-primary transition-colors"
              >
                view build
              </a>
            )}
            <button
              type="button"
              onClick={() => setChangesPending(false)}
              className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-[10px] font-medium text-foreground hover:border-primary hover:text-primary transition-colors"
            >
              review again
            </button>
          </div>
        </div>
      )}

      {/* client revision received — step 4 */}
      {hasClientFeedback && !clientBuildPending && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-2 py-1">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-[10px] font-bold text-primary">client revision request</span>
          </div>
          <textarea
            value={editedFeedback}
            onChange={(e) => setEditedFeedback(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none resize-none"
            rows={3}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handlePushToBot}
              disabled={clientRevisionLoading || !editedFeedback.trim()}
              className="flex-1 rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
            >
              {clientRevisionLoading ? "pushing..." : "push to developer bot"}
            </button>
          </div>
        </div>
      )}

      {/* client build changes in progress — step 4 */}
      {isClientReview && clientBuildPending && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-medium text-amber-700">developer bot building changes...</span>
          </div>
          <div className="flex gap-1.5">
            {buildPreviewUrl && (
              <a
                href={buildPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center rounded-md border border-gray-300 px-2 py-1.5 text-[10px] font-medium text-foreground hover:border-primary hover:text-primary transition-colors"
              >
                view build
              </a>
            )}
            <button
              type="button"
              onClick={handleRepushToClient}
              disabled={clientRevisionLoading}
              className="flex-1 rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
            >
              {clientRevisionLoading ? "pushing..." : "push to client"}
            </button>
          </div>
        </div>
      )}

      {/* client review waiting — step 4 with no revision yet */}
      {isClientReview && !hasClientFeedback && !clientBuildPending && (
        <div className="mt-2">
          <div className="flex items-center gap-1.5 rounded-md bg-blue-50 border border-blue-200 px-2 py-1.5">
            <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[10px] font-medium text-blue-700">waiting for client approval...</span>
          </div>
        </div>
      )}

      {/* plug-in step 5: waiting for credentials */}
      {isPluginStep && !hasCredentials && !pluginConnecting && (
        <div className="mt-2">
          <div className="flex items-center gap-1.5 rounded-md bg-blue-50 border border-blue-200 px-2 py-1.5">
            <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[10px] font-medium text-blue-700">waiting for client credentials...</span>
          </div>
        </div>
      )}

      {/* plug-in step 5: credentials received — connect */}
      {hasCredentials && !pluginConnecting && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-2 py-1">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-[10px] font-bold text-primary">client credentials received</span>
          </div>
          <div className="rounded-md bg-gray-50 border border-gray-200 p-2 space-y-1">
            {pluginCredentials!.map((cred, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                <span className="font-medium text-foreground">{cred.service}:</span>
                <span className="text-muted font-mono truncate">{cred.value}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handlePluginConnect}
            disabled={pluginLoading}
            className="w-full rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            {pluginLoading ? "connecting..." : "connect — push to developer bot"}
          </button>
        </div>
      )}

      {/* plug-in step 5: developer bot connecting */}
      {isPluginStep && pluginConnecting && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-medium text-amber-700">developer bot connecting workflow...</span>
          </div>
          <button
            type="button"
            onClick={handlePluginComplete}
            disabled={pluginLoading}
            className="w-full rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            {pluginLoading ? "completing..." : "mark connected — advance to billing"}
          </button>
        </div>
      )}

      {/* billing step 6 */}
      {currentStep === 6 && (
        <div className="mt-2">
          {isPaid ? (
            <div className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-[10px] font-bold text-primary">payment received</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5">
              <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[10px] font-medium text-amber-700">waiting for client payment...</span>
            </div>
          )}
        </div>
      )}

      {/* survey step 7 */}
      {currentStep === 7 && (
        <div className="mt-2">
          {npsScore != null ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5">
                <span className="text-[10px] font-bold text-primary">NPS: {npsScore}/10</span>
                {freeAddonEarned && (
                  <span className="text-[10px] font-medium text-secondary">free add-on earned</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-md bg-blue-50 border border-blue-200 px-2 py-1.5">
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-[10px] font-medium text-blue-700">waiting for client survey...</span>
            </div>
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
