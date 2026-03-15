"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface TrackerStep {
  step: number;
  label: string;
  subtitle: string;
  status: "done" | "active" | "pending";
  completedAt: string | null;
}

interface TimeSlot {
  start: string;
  label: string;
}

interface DaySlots {
  date: string;
  label: string;
  times: TimeSlot[];
}

interface TrackerClientProps {
  slug: string;
  clientName: string;
  initialSteps: TrackerStep[];
  currentStep: number;
  prototypeNanoid: string | null;
  bookingId: string | null;
  meetingTime: string | null;
  buildPreviewUrl: string | null;
  revisionStatus: string | null;
  pluginStatus: string | null;
  isPaid: boolean;
  planLabel: string;
  planPrice: string;
  hasFreeAddon: boolean;
  surveyCompleted: boolean;
}

export function TrackerClient({
  slug,
  clientName,
  initialSteps,
  currentStep: initialCurrentStep,
  prototypeNanoid,
  bookingId,
  meetingTime,
  buildPreviewUrl,
  revisionStatus: initialRevisionStatus,
  pluginStatus: initialPluginStatus,
  isPaid: initialIsPaid,
  planLabel,
  planPrice,
  hasFreeAddon,
  surveyCompleted: initialSurveyCompleted,
}: TrackerClientProps) {
  const [steps, setSteps] = useState<TrackerStep[]>(initialSteps);
  const [currentStep, setCurrentStep] = useState(initialCurrentStep);
  const [connected, setConnected] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<DaySlots[]>([]);
  const [rescheduleDay, setRescheduleDay] = useState<string | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rescheduled, setRescheduled] = useState(false);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionText, setRevisionText] = useState("");
  const [revisionStatus, setRevisionStatus] = useState(initialRevisionStatus);
  const [revisionSent, setRevisionSent] = useState(initialRevisionStatus === "revision_received");
  const [credentials, setCredentials] = useState<Array<{ service: string; value: string }>>([
    { service: "", value: "" },
  ]);
  const [credentialsSent, setCredentialsSent] = useState(
    initialPluginStatus === "credentials_received" || initialPluginStatus === "connecting" || initialPluginStatus === "connected"
  );
  const [pluginStatus, setPluginStatus] = useState(initialPluginStatus);
  const [paid, setPaid] = useState(initialIsPaid);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [npsFeedback, setNpsFeedback] = useState("");
  const [surveyCompleted, setSurveyCompleted] = useState(initialSurveyCompleted);
  const [earnedAddon, setEarnedAddon] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(`/api/track/${slug}/events`);

    eventSource.addEventListener("connected", () => {
      setConnected(true);
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "tracker.update" && data.steps) {
          setSteps(data.steps);
          setCurrentStep(data.step);
          // if we moved past step 4, clear revision state
          if (data.step > 4) {
            setRevisionSent(false);
            setRevisionStatus(null);
          }
        }
        if (data.type === "revision.ready") {
          // team pushed updated build back for client review
          setRevisionSent(false);
          setRevisionStatus(null);
        }
        if (data.type === "plugin.connecting") {
          setPluginStatus("connecting");
        }
      } catch {
        // ignore malformed messages
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, [slug]);

  // detect return from Stripe checkout
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("paid") === "true" && !paid) {
      setPaid(true);
    }
  }, [searchParams, paid]);

  const canModify = bookingId && currentStep <= 1 && !cancelled;

  async function handleCancel() {
    if (!bookingId || !confirm("are you sure you want to cancel your booking?")) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/booking/${bookingId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error ?? "failed to cancel");
      } else {
        setCancelled(true);
      }
    } catch {
      setActionError("something went wrong. please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function openReschedule() {
    setShowReschedule(true);
    setLoadingSlots(true);
    setActionError(null);
    try {
      const res = await fetch("/api/booking/slots");
      const data = await res.json();
      setRescheduleSlots(data.slots ?? []);
      if (data.slots?.length > 0) {
        setRescheduleDay(data.slots[0].date);
      }
    } catch {
      setActionError("couldn't load available times");
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleReschedule() {
    if (!bookingId || !rescheduleSlot) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/booking/${bookingId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingTime: rescheduleSlot }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error ?? "failed to reschedule");
      } else {
        setRescheduled(true);
        setShowReschedule(false);
      }
    } catch {
      setActionError("something went wrong. please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClientApprove() {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/track/${slug}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error ?? "failed to approve");
      } else {
        const data = await res.json();
        setCurrentStep(data.currentStep);
        // update steps locally
        setSteps((prev) =>
          prev.map((s, i) => ({
            ...s,
            status: i < data.currentStep - 1 ? "done" : i === data.currentStep - 1 ? "active" : "pending",
            completedAt: i < data.currentStep - 1 ? s.completedAt ?? new Date().toISOString() : s.completedAt,
          })) as TrackerStep[]
        );
        setRevisionStatus(null);
        setRevisionSent(false);
      }
    } catch {
      setActionError("something went wrong. please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClientRevision() {
    if (!revisionText.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/track/${slug}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_revision", feedback: revisionText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error ?? "failed to send revision");
      } else {
        setShowRevisionForm(false);
        setRevisionText("");
        setRevisionSent(true);
        setRevisionStatus("revision_received");
      }
    } catch {
      setActionError("something went wrong. please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmitCredentials() {
    const validCreds = credentials.filter((c) => c.service.trim() && c.value.trim());
    if (validCreds.length === 0) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/track/${slug}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials: validCreds }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error ?? "failed to send credentials");
      } else {
        setCredentialsSent(true);
        setPluginStatus("credentials_received");
      }
    } catch {
      setActionError("something went wrong. please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  function addCredentialRow() {
    setCredentials([...credentials, { service: "", value: "" }]);
  }

  function updateCredential(index: number, field: "service" | "value", val: string) {
    setCredentials((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: val } : c))
    );
  }

  function removeCredential(index: number) {
    if (credentials.length <= 1) return;
    setCredentials((prev) => prev.filter((_, i) => i !== index));
  }

  async function handlePayment() {
    setPaymentLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (data.free) {
        // free add-on redeemed — mark paid and advance locally
        setPaid(true);
        setCurrentStep(7);
        setSteps((prev) =>
          prev.map((s, i) => ({
            ...s,
            status: i < 6 ? "done" : i === 6 ? "active" : s.status,
            completedAt: i < 6 && !s.completedAt ? new Date().toISOString() : s.completedAt,
          })) as TrackerStep[]
        );
      } else if (data.url) {
        window.location.href = data.url;
      } else {
        setActionError(data.error ?? "failed to create payment session");
      }
    } catch {
      setActionError("something went wrong. please try again.");
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleSubmitSurvey() {
    if (npsScore === null) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/track/${slug}/survey`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: npsScore, feedback: npsFeedback }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error ?? "failed to submit survey");
      } else {
        setSurveyCompleted(true);
        setEarnedAddon(true);
        // mark all steps done locally
        setSteps((prev) =>
          prev.map((s) => ({
            ...s,
            status: "done",
            completedAt: s.completedAt ?? new Date().toISOString(),
          })) as TrackerStep[]
        );
      }
    } catch {
      setActionError("something went wrong. please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  const currentDaySlots = rescheduleSlots.find((s) => s.date === rescheduleDay);
  const totalSteps = steps.length;
  const isComplete = steps.every((s) => s.status === "done");
  const progressPercent = totalSteps > 0
    ? (steps.filter((s) => s.status === "done").length / totalSteps) * 100
    : 0;

  const meetingLabel = meetingTime
    ? new Date(meetingTime).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  // find the active step to highlight in detail card
  // for bookings at step 1 (meeting confirmed but not yet happened), show step 1 info
  const waitingForMeeting = bookingId && currentStep <= 1;
  const activeStep = waitingForMeeting
    ? steps[0]
    : (steps.find((s) => s.status === "active") ?? steps.find((s) => s.status === "pending") ?? null);

  const isMeetingDay = meetingTime
    ? new Date(meetingTime).toDateString() === new Date().toDateString()
    : true;

  return (
    <main className="flex min-h-screen flex-col items-center slushie-gradient px-4 py-10 sm:justify-center sm:py-0">
      <div className="w-full max-w-2xl">
        {/* header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-primary">slushie</h1>
          <p className="mt-2 text-foreground text-sm">
            {isComplete
              ? `${clientName}, your tool is ready.`
              : `hey ${clientName} — we're blending something for you.`}
          </p>
          {connected && !isComplete && (
            <p className="mt-1 text-xs text-muted">live updates</p>
          )}
        </div>

        {/* domino's-style progress bar */}
        <div className="rounded-2xl bg-white/80 shadow-lg backdrop-blur-sm overflow-hidden">
          {/* progress bar */}
          <div className="relative px-4 sm:px-6 pt-6 pb-2">
            {/* track */}
            <div className="relative h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-700 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {/* dots on the track */}
            <div className="absolute inset-x-4 sm:inset-x-6 top-6 flex justify-between">
              {steps.map((step) => (
                <div key={step.step} className="relative flex flex-col items-center" style={{ width: 0 }}>
                  <div
                    className={`h-2 w-2 rounded-full transition-all duration-500 ${
                      step.status === "done"
                        ? "bg-white ring-2 ring-primary scale-100"
                        : step.status === "active"
                        ? "bg-primary ring-2 ring-primary/30 scale-150"
                        : "bg-gray-300"
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* step labels — scrollable on mobile */}
          <div className="overflow-x-auto px-4 sm:px-6 pb-4 pt-3">
            <div className="flex justify-between" style={{ minWidth: `${steps.length * 80}px` }}>
              {steps.map((step) => (
                <div
                  key={step.step}
                  className="flex flex-col items-center text-center"
                  style={{ width: `${100 / steps.length}%` }}
                >
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                      step.status === "done"
                        ? "bg-gradient-to-br from-primary to-secondary text-white"
                        : step.status === "active"
                        ? "bg-primary text-white ring-4 ring-primary/20"
                        : "bg-gray-200 text-muted"
                    }`}
                  >
                    {step.status === "done" ? (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      step.step
                    )}
                  </div>
                  <p
                    className={`mt-1.5 text-[10px] sm:text-xs leading-tight font-medium px-1 ${
                      step.status === "active"
                        ? "text-primary"
                        : step.status === "done"
                        ? "text-foreground"
                        : "text-muted/60"
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* meeting info card — shown while waiting for meeting (step 1) */}
        {waitingForMeeting && !cancelled && (
          <div className="mt-4 rounded-xl bg-white border border-gray-200 p-4 sm:p-5">
            <p className="text-sm font-bold text-foreground">meeting confirmed</p>
            <p className="text-xs text-muted mt-0.5">your blend is scheduled. we'll see you there.</p>
            {meetingLabel && (
              <div className="mt-3 rounded-lg bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/15 px-3 py-3">
                <p className="text-xs text-muted">your meeting</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{meetingLabel}</p>
              </div>
            )}
          </div>
        )}

        {/* active step detail card — shown for steps beyond the meeting */}
        {!isComplete && !waitingForMeeting && activeStep && (
          <div className="mt-4 rounded-xl bg-white border border-gray-200 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <p className="text-xs font-medium text-primary">step {activeStep.step} of {totalSteps}</p>
            </div>
            <p className="text-sm font-bold text-foreground">{activeStep.label}</p>
            <p className="text-xs text-muted mt-0.5">{activeStep.subtitle}</p>

            {/* step 2: show join call link — only clickable on meeting day */}
            {activeStep.step === 2 && (
              isMeetingDay ? (
                <a
                  href={bookingId ? `/call/${bookingId}` : "#"}
                  className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  join your call
                </a>
              ) : (
                <div className="mt-3 rounded-lg bg-gray-100 border border-gray-200 px-4 py-3 text-center">
                  <p className="text-sm font-medium text-muted">call opens day of your meeting</p>
                  {meetingLabel && (
                    <p className="text-xs text-muted/70 mt-0.5">{meetingLabel}</p>
                  )}
                </div>
              )
            )}

            {/* step 4: client build approval */}
            {activeStep.step === 4 && !revisionSent && !showRevisionForm && (
              <div className="mt-4 space-y-3">
                {buildPreviewUrl && (
                  <a
                    href={buildPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/15 px-4 py-3 text-sm font-medium text-primary hover:border-primary/30 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    view your build
                  </a>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClientApprove}
                    disabled={actionLoading}
                    className="flex-1 rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-50"
                  >
                    {actionLoading ? "approving..." : "approve build"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRevisionForm(true)}
                    disabled={actionLoading}
                    className="flex-1 rounded-lg border-2 border-primary bg-white px-4 py-3 text-sm font-medium text-primary active:bg-primary/5 hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    request revision
                  </button>
                </div>
              </div>
            )}

            {/* step 4: revision form */}
            {activeStep.step === 4 && showRevisionForm && !revisionSent && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted">describe the changes you'd like and we'll get right on it.</p>
                <textarea
                  value={revisionText}
                  onChange={(e) => setRevisionText(e.target.value)}
                  placeholder="tell us what you'd like changed..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none resize-none"
                  rows={4}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClientRevision}
                    disabled={actionLoading || !revisionText.trim()}
                    className="flex-1 rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-50"
                  >
                    {actionLoading ? "sending..." : "send revision request"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowRevisionForm(false); setRevisionText(""); }}
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-muted hover:text-foreground transition-colors"
                  >
                    cancel
                  </button>
                </div>
              </div>
            )}

            {/* step 4: revision sent confirmation */}
            {activeStep.step === 4 && revisionSent && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/15 px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <p className="text-sm font-medium text-foreground">revision request sent</p>
                  </div>
                  <p className="text-xs text-muted">our team is working on your changes. this page will update when the new build is ready for review.</p>
                </div>
                {buildPreviewUrl && (
                  <a
                    href={buildPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-xs text-muted hover:text-primary transition-colors"
                  >
                    view current build
                  </a>
                )}
              </div>
            )}

            {/* step 5: plug-in — credential submission */}
            {activeStep.step === 5 && !credentialsSent && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted">
                  we need your login credentials for the tools in your workflow so we can connect everything up.
                  these are sent securely to our team.
                </p>

                <div className="space-y-2">
                  {credentials.map((cred, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={cred.service}
                        onChange={(e) => updateCredential(i, "service", e.target.value)}
                        placeholder="service (e.g. HubSpot)"
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none"
                      />
                      <input
                        type="text"
                        value={cred.value}
                        onChange={(e) => updateCredential(i, "value", e.target.value)}
                        placeholder="login / API key"
                        className="flex-[2] rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none"
                      />
                      {credentials.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCredential(i)}
                          className="shrink-0 rounded-lg border border-gray-300 px-2 text-muted hover:text-red-500 hover:border-red-300 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addCredentialRow}
                  className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-medium text-muted hover:border-primary hover:text-primary transition-colors"
                >
                  + add another service
                </button>

                <button
                  type="button"
                  onClick={handleSubmitCredentials}
                  disabled={actionLoading || credentials.every((c) => !c.service.trim() || !c.value.trim())}
                  className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-50"
                >
                  {actionLoading ? "sending..." : "send credentials"}
                </button>
              </div>
            )}

            {/* step 5: credentials sent — waiting for connection */}
            {activeStep.step === 5 && credentialsSent && (
              <div className="mt-4">
                <div className="rounded-lg bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/15 px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <p className="text-sm font-medium text-foreground">
                      {pluginStatus === "connecting" ? "connecting your tools..." : "credentials received"}
                    </p>
                  </div>
                  <p className="text-xs text-muted">
                    {pluginStatus === "connecting"
                      ? "our developer is wiring everything up. this page will update when it's live."
                      : "our team has your credentials and will begin connecting shortly."}
                  </p>
                </div>
              </div>
            )}

            {/* step 6: billing */}
            {activeStep.step === 6 && !paid && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg bg-white border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs text-muted">your plan</p>
                      <p className="text-sm font-bold text-foreground">{planLabel}</p>
                    </div>
                    <p className="text-2xl font-extrabold text-foreground">{planPrice}</p>
                  </div>
                  {hasFreeAddon ? (
                    <>
                      <div className="rounded-lg bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/15 px-3 py-2 mb-3">
                        <p className="text-xs font-bold text-primary">free add-on reward applied!</p>
                        <p className="text-[10px] text-muted mt-0.5">
                          you earned this from a previous survey. this single scoop is on us.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handlePayment}
                        disabled={paymentLoading}
                        className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-50"
                      >
                        {paymentLoading ? "claiming..." : "claim free build"}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted mb-3">
                        your tool is built, tested, and connected. complete payment to unlock full access.
                      </p>
                      <button
                        type="button"
                        onClick={handlePayment}
                        disabled={paymentLoading}
                        className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-50"
                      >
                        {paymentLoading ? "opening checkout..." : "pay now"}
                      </button>
                    </>
                  )}
                </div>
                {!hasFreeAddon && (
                  <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    secure payment via stripe
                  </div>
                )}
              </div>
            )}

            {/* step 6: paid confirmation */}
            {activeStep.step === 6 && paid && (
              <div className="mt-4">
                <div className="rounded-lg bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/15 px-4 py-3 text-center">
                  <p className="text-sm font-bold text-foreground">payment received!</p>
                  <p className="text-xs text-muted mt-1">your build is now fully unlocked. almost done.</p>
                </div>
              </div>
            )}

            {/* step 7: NPS survey */}
            {activeStep.step === 7 && !surveyCompleted && (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs text-muted mb-1">
                    complete this quick survey and get a <span className="font-bold text-primary">free workflow add-on</span> as a thank you.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-foreground mb-2">
                    how likely are you to recommend slushie to a friend or colleague?
                  </p>
                  <div className="flex gap-1">
                    {Array.from({ length: 11 }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setNpsScore(i)}
                        className={`flex-1 rounded-md py-2.5 text-xs font-bold transition-all ${
                          npsScore === i
                            ? "bg-gradient-to-r from-primary to-secondary text-white shadow-md scale-110"
                            : "bg-gray-100 text-foreground hover:bg-gray-200"
                        }`}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-muted">not likely</span>
                    <span className="text-[10px] text-muted">extremely likely</span>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-foreground mb-2">
                    anything you'd like to share? <span className="text-muted font-normal">(optional)</span>
                  </p>
                  <textarea
                    value={npsFeedback}
                    onChange={(e) => setNpsFeedback(e.target.value)}
                    placeholder="tell us what you loved, or what we could do better..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none resize-none"
                    rows={3}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSubmitSurvey}
                  disabled={actionLoading || npsScore === null}
                  className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-50"
                >
                  {actionLoading ? "submitting..." : "submit & claim free add-on"}
                </button>
              </div>
            )}

            {/* step 7: survey completed */}
            {activeStep.step === 7 && surveyCompleted && (
              <div className="mt-4">
                <div className="rounded-lg bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/15 px-4 py-4 text-center">
                  <p className="text-sm font-bold text-foreground">thank you for your feedback!</p>
                  <p className="text-xs text-muted mt-1">
                    you've earned a <span className="font-bold text-primary">free workflow add-on</span>.
                  </p>
                  <a
                    href="/book?addon=true"
                    className="mt-3 inline-block rounded-lg bg-gradient-to-r from-primary to-secondary px-6 py-2.5 text-xs font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg"
                  >
                    book your free add-on
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* completion card */}
        {isComplete && (
          <div className="mt-4 rounded-xl bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/15 p-5 text-center">
            <p className="text-lg font-extrabold text-foreground">your blend is ready!</p>
            <p className="text-xs text-muted mt-1">every step is complete. time to take a sip.</p>
            {earnedAddon && (
              <div className="mt-3 rounded-lg bg-white border border-primary/20 px-3 py-3">
                <p className="text-xs font-bold text-primary">free add-on unlocked!</p>
                <p className="text-[10px] text-muted mt-0.5 mb-2">
                  you earned a free single scoop workflow tool. book it whenever you're ready.
                </p>
                <a
                  href="/book?addon=true"
                  className="block w-full text-center rounded-lg bg-gradient-to-r from-primary to-secondary px-3 py-2.5 text-xs font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg"
                >
                  book your free add-on
                </a>
              </div>
            )}
            {prototypeNanoid && (
              <a
                href={`/preview/${prototypeNanoid}`}
                className="mt-4 block w-full rounded-lg bg-gradient-to-r from-primary to-secondary py-3.5 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg"
              >
                take a look
              </a>
            )}
          </div>
        )}

        {/* cancelled state */}
        {cancelled && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-4 text-center">
            <p className="text-sm font-medium text-red-700">booking cancelled</p>
            <p className="mt-1 text-xs text-red-500">your meeting has been cancelled.</p>
          </div>
        )}

        {/* rescheduled confirmation */}
        {rescheduled && !cancelled && (
          <div className="mt-4 rounded-xl bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/15 p-4 text-center">
            <p className="text-sm font-medium text-foreground">meeting rescheduled!</p>
            <p className="mt-1 text-xs text-muted">you'll receive an updated calendar invite.</p>
          </div>
        )}

        {/* cancel / reschedule actions — only during step 1 for bookings */}
        {canModify && !showReschedule && (
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={openReschedule}
              disabled={actionLoading}
              className="flex-1 rounded-lg border-2 border-primary bg-white px-4 py-3 sm:py-2.5 text-sm font-medium text-primary active:bg-primary/5 hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              reschedule
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={actionLoading}
              className="flex-1 rounded-lg border-2 border-red-300 bg-white px-4 py-3 sm:py-2.5 text-sm font-medium text-red-600 active:bg-red-50 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {actionLoading ? "cancelling..." : "cancel booking"}
            </button>
          </div>
        )}

        {/* reschedule slot picker */}
        {canModify && showReschedule && (
          <div className="mt-4 rounded-xl bg-white border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">pick a new time</p>
              <button
                type="button"
                onClick={() => { setShowReschedule(false); setRescheduleSlot(null); setActionError(null); }}
                className="text-xs text-muted hover:text-foreground active:text-foreground"
              >
                cancel
              </button>
            </div>
            {loadingSlots ? (
              <p className="text-center text-sm text-muted py-4">loading times...</p>
            ) : rescheduleSlots.length === 0 ? (
              <p className="text-center text-sm text-muted py-4">no available times right now.</p>
            ) : (
              <>
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                  {rescheduleSlots.map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => { setRescheduleDay(day.date); setRescheduleSlot(null); }}
                      className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        rescheduleDay === day.date
                          ? "bg-foreground text-white"
                          : "bg-white border border-gray-200 text-foreground active:border-foreground/30 hover:border-foreground/30"
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                {currentDaySlots && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {currentDaySlots.times.map((time) => (
                      <button
                        key={time.start}
                        type="button"
                        onClick={() => setRescheduleSlot(time.start)}
                        className={`rounded-lg border-2 px-2 py-2.5 sm:py-2 text-sm font-medium transition-all ${
                          rescheduleSlot === time.start
                            ? "border-primary bg-primary text-white"
                            : "border-gray-200 bg-white text-foreground active:border-primary/50 hover:border-primary/50"
                        }`}
                      >
                        {time.label}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleReschedule}
                  disabled={!rescheduleSlot || actionLoading}
                  className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary py-3 sm:py-2.5 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? "rescheduling..." : "confirm new time"}
                </button>
              </>
            )}
          </div>
        )}

        {/* action error */}
        {actionError && (
          <p className="mt-2 text-center text-sm text-red-600 font-medium">{actionError}</p>
        )}

        {/* auto-refresh hint */}
        {!isComplete && currentStep > 0 && (
          <p className="mt-6 text-center text-xs text-muted">
            this page updates automatically. no need to refresh.
          </p>
        )}
      </div>

      {/* footer */}
      <div className="mt-8 sm:mt-12 text-center text-xs text-muted/60">
        <p>powered by slushie</p>
      </div>
    </main>
  );
}
