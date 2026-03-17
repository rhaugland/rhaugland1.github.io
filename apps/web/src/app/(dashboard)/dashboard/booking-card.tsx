"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface BookingCardProps {
  id: string;
  name: string;
  businessName: string;
  plan: string;
  meetingTime: string | null;
  trackingSlug: string | null;
  assignee: { id: string; name: string } | null;
  employees: Array<{ id: string; name: string }>;
  employeeAvgNps?: Record<string, number>;
  stepLabel?: string;
  stepNumber?: number;
  buildStatus?: "none" | "analyzing" | "building" | "ready";
  buildPreviewUrl?: string;
  v1PreviewUrl?: string;
  v2Status?: "awaiting-meeting" | "in-meeting" | "analyzing" | "gap-report" | "building" | "ready" | null;
  v2PreviewUrl?: string;
  latestVersion?: number;
  pipelineStartedAt?: string | null;
  pipelineRunId?: string | null;
  currentStep?: number;
  clientFeedback?: string | null;
  revisionStatus?: string | null;
  pluginCredentials?: Array<{ service: string; value: string }> | null;
  pluginStatus?: string | null;
  isPaid?: boolean;
  npsScore?: number | null;
  freeAddonEarned?: boolean;
  postmortemStatus?: "pending" | "reviewed" | null;
  postmortemPipelineRunId?: string | null;
  nextWorkflowStatus?: "eligible" | "scheduled" | null;
  workflowLabel?: string | null;
  discoveryEmailStatus?: string | null;
  discoveryEmailSentAt?: string | null;
  demoEmailStatus?: string | null;
  demoEmailSentAt?: string | null;
  demoMeetingTime?: string | null;
  reviewMessages?: Array<{ from: string; text: string; at: string }> | null;
  reviewStatus?: string | null;
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
  employeeAvgNps,
  stepLabel,
  stepNumber,
  buildStatus,
  buildPreviewUrl,
  v1PreviewUrl,
  v2Status,
  v2PreviewUrl,
  latestVersion,
  pipelineStartedAt,
  pipelineRunId,
  currentStep,
  clientFeedback,
  revisionStatus,
  pluginCredentials,
  pluginStatus,
  isPaid,
  npsScore,
  freeAddonEarned,
  postmortemStatus,
  postmortemPipelineRunId,
  nextWorkflowStatus,
  workflowLabel,
  discoveryEmailStatus,
  discoveryEmailSentAt,
  demoEmailStatus,
  demoEmailSentAt,
  demoMeetingTime,
  reviewMessages,
  reviewStatus,
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
  const [advancing, setAdvancing] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");
  const [discoveryAction, setDiscoveryAction] = useState<string | null>(null);
  const [emailBody, setEmailBody] = useState(
    `Hi ${name},\n\nWe've finished building your first prototype for ${businessName} — take a look at it on your tracker page!\n\nWe'd love to schedule a discovery call to walk through your workflow together so we can build something even better. What times work for you this week?\n\nLooking forward to it,\nThe slushie team`
  );
  const [scheduleMeetingTime, setScheduleMeetingTime] = useState("");
  const [demoAction, setDemoAction] = useState<string | null>(null);
  const [demoEmailBody, setDemoEmailBody] = useState(
    `Hi ${name},\n\nWe've completed the discovery build for ${businessName} and we'd love to walk you through a live demo of everything we've built.\n\nWhat times work for you this week?\n\nLooking forward to it,\nThe slushie team`
  );
  const [scheduleDemoTime, setScheduleDemoTime] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewSending, setReviewSending] = useState(false);
  const [emailFullscreen, setEmailFullscreen] = useState<"discovery" | "demo" | null>(null);

  // build time — show elapsed time during builds
  useEffect(() => {
    if (!pipelineStartedAt || buildStatus === "none") return;
    // step 1: show during intake build
    // step 4: show during discovery build
    // step 7: show during demo build
    const isIntakeBuild = currentStep === 1 && buildStatus !== "ready";
    const isDiscoveryBuild = currentStep === 4 && v2Status && !["ready", "awaiting-meeting", "in-meeting"].includes(v2Status);
    const isDemoBuild = currentStep === 7 && v2Status && !["ready", "awaiting-meeting", "in-meeting"].includes(v2Status);
    if (!isIntakeBuild && !isDiscoveryBuild && !isDemoBuild) return;

    const started = new Date(pipelineStartedAt).getTime();

    function tick() {
      const elapsed = Date.now() - started;
      const mins = Math.floor(elapsed / 60000);
      const secs = Math.floor((elapsed % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")} elapsed`);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pipelineStartedAt, buildStatus, currentStep, v2Status]);

  // poll for build status changes every 15s
  const needsPoll =
    (currentStep === 1 && buildStatus !== "ready") ||
    (currentStep === 4 && v2Status && !["ready", "awaiting-meeting", "in-meeting"].includes(v2Status)) ||
    (currentStep === 7 && v2Status && !["ready", "awaiting-meeting", "in-meeting"].includes(v2Status)) ||
    (currentStep === 8 && reviewStatus === "building");
  useEffect(() => {
    if (!needsPoll) return;
    const interval = setInterval(() => {
      router.refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [needsPoll, router]);

  const meetingLabel = meetingTime
    ? new Date(meetingTime).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

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

  async function handleAdvance() {
    setAdvancing(true);
    try {
      const res = await fetch(`/api/booking/${id}/advance`, { method: "PATCH" });
      if (res.ok) router.refresh();
    } finally {
      setAdvancing(false);
    }
  }

  async function handleDiscoveryAction(action: string, meetingTimeVal?: string) {
    setDiscoveryAction(action);
    try {
      const res = await fetch(`/api/booking/${id}/schedule-discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(meetingTimeVal ? { meetingTime: meetingTimeVal } : {}) }),
      });
      if (res.ok) router.refresh();
    } finally {
      setDiscoveryAction(null);
    }
  }

  async function handleDemoAction(action: string, meetingTimeVal?: string) {
    setDemoAction(action);
    try {
      const res = await fetch(`/api/booking/${id}/schedule-demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(meetingTimeVal ? { meetingTime: meetingTimeVal } : {}) }),
      });
      if (res.ok) router.refresh();
    } finally {
      setDemoAction(null);
    }
  }

  async function handleReviewMessage() {
    if (!reviewMessage.trim()) return;
    setReviewSending(true);
    try {
      const res = await fetch(`/api/booking/${id}/internal-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reviewMessage.trim() }),
      });
      if (res.ok) {
        setReviewMessage("");
        router.refresh();
      }
    } finally {
      setReviewSending(false);
    }
  }

  const isClientReview = currentStep === 9;
  const isPluginStep = currentStep === 10;
  const hasClientFeedback = isClientReview && revisionStatus === "revision_received" && clientFeedback;
  const hasCredentials = isPluginStep && pluginStatus === "credentials_received" && pluginCredentials && pluginCredentials.length > 0;

  return (
    <div className="rounded-lg bg-surface border border-border p-3 shadow-sm">
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
        <div className="flex items-center gap-1 shrink-0">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {plan}
          </span>
          {workflowLabel && (
            <span className="rounded-full bg-secondary/10 px-1.5 py-0.5 text-[9px] font-bold text-secondary">
              #{workflowLabel}
            </span>
          )}
        </div>
      </div>

      {/* meeting times */}
      {(meetingLabel || demoMeetingTime) && (
        <div className="mt-2 space-y-1">
          {meetingLabel && (
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              discovery: {meetingLabel}
            </div>
          )}
          {demoMeetingTime && (
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              demo: {new Date(demoMeetingTime).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 1: intake build progress ═══ */}
      {currentStep === 1 && buildStatus && buildStatus !== "none" && (
        <div className="mt-2 space-y-1.5">
          {buildStatus === "analyzing" && (
            <div className="flex items-center justify-between rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[10px] font-medium text-amber-400">analyzing intake</span>
              </div>
              {timeLeft && <span className="text-[9px] text-amber-400/70">{timeLeft}</span>}
            </div>
          )}
          {buildStatus === "building" && (
            <div className="flex items-center justify-between rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-[10px] font-medium text-blue-400">building intake prototype</span>
              </div>
              {timeLeft && <span className="text-[9px] text-blue-400/70">{timeLeft}</span>}
            </div>
          )}
          {buildStatus === "ready" && (
            <div className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-[10px] font-bold text-primary">intake build ready</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 2: schedule discovery ═══ */}
      {currentStep === 2 && (
        <div className="mt-2 space-y-1.5">
          {/* always show intake prototype preview */}
          {v1PreviewUrl && (
            <a
              href={v1PreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5 hover:border-primary/40 transition-colors"
            >
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-[10px] font-bold text-primary">intake build ready — view</span>
            </a>
          )}

          {/* email scheduling UI */}
          {!discoveryEmailStatus && (
            <div className="rounded-md border border-border bg-surface-light p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-bold text-muted uppercase tracking-wide">discovery scheduling email</p>
                <button
                  type="button"
                  onClick={() => setEmailFullscreen("discovery")}
                  className="rounded p-0.5 text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                  title="expand editor"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                  </svg>
                </button>
              </div>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="w-full rounded-md border border-border px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none resize-none"
                rows={4}
              />
              <button
                type="button"
                onClick={() => handleDiscoveryAction("send_email")}
                disabled={discoveryAction === "send_email"}
                className="w-full rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                {discoveryAction === "send_email" ? "sending..." : "send discovery email"}
              </button>
            </div>
          )}

          {discoveryEmailStatus === "sent" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <svg className="h-3 w-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-[10px] font-medium text-blue-400">email sent</span>
                </div>
                {discoveryEmailSentAt && (
                  <span className="text-[9px] text-blue-400/70">
                    {new Date(discoveryEmailSentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDiscoveryAction("mark_responded")}
                disabled={discoveryAction === "mark_responded"}
                className="w-full rounded-md border border-border px-2 py-1.5 text-[10px] font-medium text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                {discoveryAction === "mark_responded" ? "updating..." : "mark responded"}
              </button>
            </div>
          )}

          {discoveryEmailStatus === "responded" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-2 py-1.5">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-[10px] font-bold text-primary">client responded</span>
              </div>
              <div className="rounded-md border border-border bg-surface-light p-2 space-y-1.5">
                <label className="text-[9px] font-bold text-muted uppercase tracking-wide">schedule meeting</label>
                <input
                  type="datetime-local"
                  value={scheduleMeetingTime}
                  onChange={(e) => setScheduleMeetingTime(e.target.value)}
                  className="w-full rounded-md border border-border px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleDiscoveryAction("schedule_meeting", scheduleMeetingTime)}
                  disabled={discoveryAction === "schedule_meeting" || !scheduleMeetingTime}
                  className="w-full rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
                >
                  {discoveryAction === "schedule_meeting" ? "scheduling..." : "schedule meeting"}
                </button>
              </div>
            </div>
          )}

          {discoveryEmailStatus === "scheduled" && (
            <div className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5">
              <svg className="h-3 w-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[10px] font-bold text-primary">meeting scheduled</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 3: discovery meeting ═══ */}
      {currentStep === 3 && (
        <div className="mt-2 space-y-1.5">
          {v1PreviewUrl && (
            <a
              href={v1PreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5 hover:border-primary/40 transition-colors"
            >
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-[10px] font-bold text-primary">view intake prototype</span>
            </a>
          )}

          {/* gap meeting controls — reuse existing gap meeting logic */}
          {pipelineRunId && v2Status === "awaiting-meeting" && (
            <a
              href={`/dashboard/calls/live/${pipelineRunId}`}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-2 text-[11px] font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              join discovery meeting
            </a>
          )}
          {pipelineRunId && v2Status === "in-meeting" && (
            <GapMeetingButton pipelineRunId={pipelineRunId} action="complete" onComplete={() => router.refresh()} />
          )}

          {/* show build progress if meeting done and discovery build started */}
          {v2Status && !["ready", "awaiting-meeting", "in-meeting"].includes(v2Status) && (
            <div className="rounded-md border border-border bg-surface-light p-2 space-y-1">
              <p className="text-[9px] font-bold text-muted uppercase tracking-wide">discovery build starting...</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 4: discovery build progress ═══ */}
      {currentStep === 4 && (
        <div className="mt-2 space-y-1.5">
          {v2Status && !["ready", "awaiting-meeting", "in-meeting"].includes(v2Status) && (
            <div className="rounded-md border border-border bg-surface-light p-2 space-y-1">
              <p className="text-[9px] font-bold text-muted uppercase tracking-wide">discovery build progress</p>
              <V2ProgressSteps status={v2Status as "analyzing" | "gap-report" | "building"} elapsed={timeLeft} />
            </div>
          )}

          {v2Status === "ready" && v2PreviewUrl && (
            <a
              href={v2PreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5 hover:border-primary/40 transition-colors"
            >
              <div className="h-2 w-2 rounded-full bg-secondary" />
              <span className="text-[10px] font-bold text-secondary">
                v{latestVersion ?? 2} discovery build ready — view
              </span>
            </a>
          )}
        </div>
      )}

      {/* ═══ STEP 5: schedule demo ═══ */}
      {currentStep === 5 && (
        <div className="mt-2 space-y-1.5">
          {/* show discovery build preview */}
          {v2PreviewUrl && (
            <a
              href={v2PreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5 hover:border-primary/40 transition-colors"
            >
              <div className="h-2 w-2 rounded-full bg-secondary" />
              <span className="text-[10px] font-bold text-secondary">discovery build ready — view</span>
            </a>
          )}

          {/* demo email scheduling UI */}
          {!demoEmailStatus && (
            <div className="rounded-md border border-border bg-surface-light p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-bold text-muted uppercase tracking-wide">demo scheduling email</p>
                <button
                  type="button"
                  onClick={() => setEmailFullscreen("demo")}
                  className="rounded p-0.5 text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                  title="expand editor"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                  </svg>
                </button>
              </div>
              <textarea
                value={demoEmailBody}
                onChange={(e) => setDemoEmailBody(e.target.value)}
                className="w-full rounded-md border border-border px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none resize-none"
                rows={4}
              />
              <button
                type="button"
                onClick={() => handleDemoAction("send_email")}
                disabled={demoAction === "send_email"}
                className="w-full rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                {demoAction === "send_email" ? "sending..." : "send demo email"}
              </button>
            </div>
          )}

          {demoEmailStatus === "sent" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <svg className="h-3 w-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-[10px] font-medium text-blue-400">demo email sent</span>
                </div>
                {demoEmailSentAt && (
                  <span className="text-[9px] text-blue-400/70">
                    {new Date(demoEmailSentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDemoAction("mark_responded")}
                disabled={demoAction === "mark_responded"}
                className="w-full rounded-md border border-border px-2 py-1.5 text-[10px] font-medium text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                {demoAction === "mark_responded" ? "updating..." : "mark responded"}
              </button>
            </div>
          )}

          {demoEmailStatus === "responded" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-2 py-1.5">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-[10px] font-bold text-primary">client responded</span>
              </div>
              <div className="rounded-md border border-border bg-surface-light p-2 space-y-1.5">
                <label className="text-[9px] font-bold text-muted uppercase tracking-wide">schedule demo</label>
                <input
                  type="datetime-local"
                  value={scheduleDemoTime}
                  onChange={(e) => setScheduleDemoTime(e.target.value)}
                  className="w-full rounded-md border border-border px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleDemoAction("schedule_demo", scheduleDemoTime)}
                  disabled={demoAction === "schedule_demo" || !scheduleDemoTime}
                  className="w-full rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
                >
                  {demoAction === "schedule_demo" ? "scheduling..." : "schedule demo"}
                </button>
              </div>
            </div>
          )}

          {demoEmailStatus === "scheduled" && (
            <div className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5">
              <svg className="h-3 w-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[10px] font-bold text-primary">demo scheduled</span>
              {demoMeetingTime && (
                <span className="text-[9px] text-primary/70 ml-auto">
                  {new Date(demoMeetingTime).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 6: demo call ═══ */}
      {currentStep === 6 && (
        <div className="mt-2 space-y-1.5">
          {demoMeetingTime && (
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              demo: {new Date(demoMeetingTime).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
          )}
          {pipelineRunId && (
            <a
              href={`/dashboard/calls/demo-live/${pipelineRunId}`}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-2 text-[11px] font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              join demo call
            </a>
          )}
        </div>
      )}

      {/* ═══ STEP 7: demo build ═══ */}
      {currentStep === 7 && (
        <div className="mt-2 space-y-1.5">
          {v2Status && !["ready", "awaiting-meeting", "in-meeting"].includes(v2Status) && (
            <div className="rounded-md border border-border bg-surface-light p-2 space-y-1">
              <p className="text-[9px] font-bold text-muted uppercase tracking-wide">demo build progress</p>
              <V2ProgressSteps status={v2Status as "analyzing" | "gap-report" | "building"} elapsed={timeLeft} />
            </div>
          )}

          {v2Status === "ready" && v2PreviewUrl && (
            <a
              href={v2PreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5 hover:border-primary/40 transition-colors"
            >
              <div className="h-2 w-2 rounded-full bg-secondary" />
              <span className="text-[10px] font-bold text-secondary">
                v{latestVersion ?? 3} demo build ready — view
              </span>
            </a>
          )}
        </div>
      )}

      {/* ═══ STEP 8: internal review / polish ═══ */}
      {currentStep === 8 && (
        <div className="mt-2 space-y-1.5">
          {/* chat-like review messages */}
          {reviewMessages && reviewMessages.length > 0 && (
            <div className="rounded-md border border-border bg-surface-light p-2 space-y-1 max-h-48 overflow-y-auto">
              {reviewMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.from === "system" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rounded-md px-2 py-1 max-w-[85%] ${
                      msg.from === "system"
                        ? "bg-secondary/10 text-secondary"
                        : "bg-primary/10 text-foreground"
                    }`}
                  >
                    <p className="text-[10px]">{msg.text}</p>
                    <p className="text-[8px] text-muted mt-0.5">
                      {new Date(msg.at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* building indicator */}
          {reviewStatus === "building" && (
            <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
              <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[10px] font-medium text-amber-400">developer bot building changes...</span>
            </div>
          )}

          {/* ready: preview + advance */}
          {reviewStatus === "ready" && (
            <div className="space-y-1.5">
              {v2PreviewUrl && (
                <a
                  href={v2PreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5 hover:border-primary/40 transition-colors"
                >
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-[10px] font-bold text-primary">review build ready — view</span>
                </a>
              )}
              <button
                type="button"
                onClick={handleAdvance}
                disabled={advancing}
                className="w-full rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                {advancing ? "advancing..." : "advance to client approval"}
              </button>
            </div>
          )}

          {/* message input */}
          {reviewStatus !== "building" && (
            <div className="rounded-md border border-border bg-surface-light p-2 space-y-1.5">
              <textarea
                value={reviewMessage}
                onChange={(e) => setReviewMessage(e.target.value)}
                placeholder="type review notes or change requests..."
                className="w-full rounded-md border border-border px-2 py-1.5 text-xs text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none resize-none"
                rows={2}
              />
              <button
                type="button"
                onClick={handleReviewMessage}
                disabled={reviewSending || !reviewMessage.trim()}
                className="w-full rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                {reviewSending ? "sending..." : "send review message"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 9: client approval ═══ */}
      {isClientReview && (
        <div className="mt-2 space-y-1.5">
          {!hasClientFeedback && !clientBuildPending && revisionStatus !== "approved" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-1.5">
                <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-[10px] font-medium text-blue-400">waiting for client approval...</span>
              </div>
              <button
                type="button"
                onClick={handleAdvance}
                disabled={advancing}
                className="w-full rounded-md border border-border px-2 py-1.5 text-[10px] font-medium text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                {advancing ? "sending..." : "send approval link"}
              </button>
            </div>
          )}
          {revisionStatus === "approved" && (
            <div className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5">
              <svg className="h-3 w-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[10px] font-bold text-primary">client approved</span>
            </div>
          )}
          {hasClientFeedback && !clientBuildPending && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-2 py-1">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-[10px] font-bold text-primary">client revision request</span>
              </div>
              <textarea
                value={editedFeedback}
                onChange={(e) => setEditedFeedback(e.target.value)}
                className="w-full rounded-md border border-border px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none resize-none"
                rows={3}
              />
              <button
                type="button"
                onClick={handlePushToBot}
                disabled={clientRevisionLoading || !editedFeedback.trim()}
                className="flex-1 rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                {clientRevisionLoading ? "pushing..." : "push to developer bot"}
              </button>
            </div>
          )}
          {isClientReview && clientBuildPending && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
                <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[10px] font-medium text-amber-400">developer bot building changes...</span>
              </div>
              <div className="flex gap-1.5">
                {buildPreviewUrl && (
                  <a
                    href={buildPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center rounded-md border border-border px-2 py-1.5 text-[10px] font-medium text-foreground hover:border-primary hover:text-primary transition-colors"
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
        </div>
      )}

      {/* ═══ STEP 10: plug-in / credentials ═══ */}
      {isPluginStep && !hasCredentials && !pluginConnecting && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-1.5">
            <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[10px] font-medium text-blue-400">waiting for client credentials...</span>
          </div>
          <button
            type="button"
            onClick={handleAdvance}
            disabled={advancing}
            className="w-full rounded-md border border-border px-2 py-1.5 text-[10px] font-medium text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            {advancing ? "sending..." : "send credentials request"}
          </button>
        </div>
      )}

      {hasCredentials && !pluginConnecting && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-2 py-1">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-[10px] font-bold text-primary">client credentials received</span>
          </div>
          <div className="rounded-md bg-surface-light border border-border p-2 space-y-1">
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

      {isPluginStep && pluginConnecting && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-medium text-amber-400">developer bot connecting workflow...</span>
          </div>
          <button
            type="button"
            onClick={handlePluginComplete}
            disabled={pluginLoading}
            className="w-full rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            {pluginLoading ? "completing..." : "mark connected — advance to payment"}
          </button>
        </div>
      )}

      {/* ═══ STEP 11: payment ═══ */}
      {currentStep === 11 && (
        <div className="mt-2">
          {isPaid ? (
            <div className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-[10px] font-bold text-primary">payment received</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
              <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[10px] font-medium text-amber-400">waiting for client payment...</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 12: satisfaction survey ═══ */}
      {currentStep === 12 && (
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
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-1.5">
                <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-[10px] font-medium text-blue-400">waiting for client survey...</span>
              </div>
              <button
                type="button"
                onClick={handleAdvance}
                disabled={advancing}
                className="w-full rounded-md border border-border px-2 py-1.5 text-[10px] font-medium text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                {advancing ? "sending..." : "send survey link"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* postmortem (after step 12) */}
      {postmortemStatus && currentStep && currentStep > 12 && (
        <div className="mt-2 space-y-1.5">
          {npsScore != null && (
            <div className="flex items-center justify-between rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5">
              <span className="text-[10px] font-bold text-primary">client NPS: {npsScore}/10</span>
              {assignee && employeeAvgNps?.[assignee.id] != null && (
                <span className="text-[10px] text-muted">
                  {assignee.name} avg: {employeeAvgNps[assignee.id]}
                </span>
              )}
            </div>
          )}
          {freeAddonEarned && (
            <div className="flex items-center gap-1.5 rounded-md bg-primary/5 border border-primary/15 px-2 py-1">
              <span className="text-[10px] font-medium text-primary">free add-on earned</span>
            </div>
          )}
          {postmortemPipelineRunId ? (
            <a
              href={`/dashboard/postmortems/${postmortemPipelineRunId}`}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-bold transition-colors ${
                postmortemStatus === "reviewed"
                  ? "bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 text-primary"
                  : "bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:border-amber-300"
              }`}
            >
              {postmortemStatus === "reviewed" ? (
                <>
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  postmortem reviewed
                </>
              ) : (
                <>
                  <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  review postmortem
                </>
              )}
            </a>
          ) : (
            <div className="flex items-center gap-1.5 rounded-md bg-surface-light border border-border px-2 py-1.5">
              <span className="text-[10px] text-muted">no pipeline run — postmortem unavailable</span>
            </div>
          )}
        </div>
      )}

      {/* next workflow status */}
      {nextWorkflowStatus && (
        <div className="mt-2">
          {nextWorkflowStatus === "scheduled" ? (
            <div className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-2 py-1.5">
              <svg className="h-3 w-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[10px] font-bold text-primary">
                next workflow scheduled {workflowLabel && `(${workflowLabel})`}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-1.5">
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-[10px] font-medium text-blue-400">
                waiting for client to schedule next workflow {workflowLabel && `(${workflowLabel})`}
              </span>
            </div>
          )}
        </div>
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
              {employeeAvgNps?.[assignee.id] != null && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary" title="avg NPS">
                  {employeeAvgNps[assignee.id]}
                </span>
              )}
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
              className="w-full rounded-md border-2 border-dashed border-border py-1.5 text-xs font-medium text-muted hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              {claiming ? "claiming..." : "claim"}
            </button>
            {showEmployees && (
              <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
                {employees.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => handleClaim(emp.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-foreground hover:bg-primary/5 first:rounded-t-lg last:rounded-b-lg"
                  >
                    <span>{emp.name}</span>
                    {employeeAvgNps?.[emp.id] != null && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                        {employeeAvgNps[emp.id]}
                      </span>
                    )}
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

      {/* fullscreen email editor overlay */}
      {emailFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setEmailFullscreen(null)}>
          <div className="w-full max-w-2xl mx-4 rounded-xl border border-border bg-surface shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">
                {emailFullscreen === "discovery" ? "discovery scheduling email" : "demo scheduling email"}
              </p>
              <button
                type="button"
                onClick={() => setEmailFullscreen(null)}
                className="rounded p-1 text-muted hover:text-foreground hover:bg-surface-light transition-colors"
                title="close"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <textarea
              value={emailFullscreen === "discovery" ? emailBody : demoEmailBody}
              onChange={(e) => emailFullscreen === "discovery" ? setEmailBody(e.target.value) : setDemoEmailBody(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none resize-none"
              rows={14}
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                if (emailFullscreen === "discovery") {
                  handleDiscoveryAction("send_email");
                } else {
                  handleDemoAction("send_email");
                }
                setEmailFullscreen(null);
              }}
              disabled={emailFullscreen === "discovery" ? discoveryAction === "send_email" : demoAction === "send_email"}
              className="w-full rounded-md bg-gradient-to-r from-primary to-secondary px-3 py-2 text-sm font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
            >
              {emailFullscreen === "discovery"
                ? (discoveryAction === "send_email" ? "sending..." : "send discovery email")
                : (demoAction === "send_email" ? "sending..." : "send demo email")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GapMeetingButton({
  pipelineRunId,
  action,
  onComplete,
}: {
  pipelineRunId: string;
  action: "start" | "complete";
  onComplete: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(`/api/pipeline/${pipelineRunId}/gap-meeting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "complete" ? { notes: notes.trim() || null } : {}),
        }),
      });
      if (res.ok) onComplete();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-surface-light p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
        <span className="text-[10px] font-bold text-primary">discovery meeting in progress</span>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="meeting notes — what did the client want changed?"
        className="w-full rounded-md border border-border px-2 py-1.5 text-xs text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none resize-none"
        rows={3}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full rounded-md bg-gradient-to-r from-primary to-secondary px-2 py-1.5 text-[10px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? "completing..." : "end meeting — start discovery build"}
      </button>
    </div>
  );
}

const V2_STAGES = [
  { key: "analyzing", label: "analyzing updates" },
  { key: "gap-report", label: "generating gap report" },
  { key: "building", label: "building v2" },
] as const;

function V2ProgressSteps({ status, elapsed }: { status: "analyzing" | "gap-report" | "building"; elapsed: string }) {
  const activeIndex = V2_STAGES.findIndex((s) => s.key === status);

  return (
    <div className="space-y-0.5">
      {V2_STAGES.map((stage, i) => {
        const isDone = i < activeIndex;
        const isActive = i === activeIndex;
        const isPending = i > activeIndex;

        return (
          <div key={stage.key} className="flex items-center gap-1.5">
            {isDone && (
              <svg className="h-3 w-3 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {isActive && (
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse shrink-0 ml-[1px]" />
            )}
            {isPending && (
              <div className="h-2 w-2 rounded-full bg-white/10 shrink-0 ml-[2px]" />
            )}
            <span
              className={`text-[10px] ${
                isDone ? "text-primary font-medium" : isActive ? "text-amber-400 font-medium" : "text-muted/40"
              }`}
            >
              {stage.label}
            </span>
            {isActive && elapsed && (
              <span className="text-[9px] font-mono text-amber-400/70 ml-auto">{elapsed}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
