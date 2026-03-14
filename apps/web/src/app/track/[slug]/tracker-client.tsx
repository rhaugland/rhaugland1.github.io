"use client";

import { useEffect, useState } from "react";

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
}

export function TrackerClient({
  slug,
  clientName,
  initialSteps,
  currentStep: initialCurrentStep,
  prototypeNanoid,
  bookingId,
  meetingTime,
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
  const activeStep = steps.find((s) => s.status === "active") ?? steps[steps.length - 1];

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

        {/* active step detail card */}
        {!isComplete && activeStep && (
          <div className="mt-4 rounded-xl bg-white border border-gray-200 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <p className="text-xs font-medium text-primary">step {activeStep.step} of {totalSteps}</p>
            </div>
            <p className="text-sm font-bold text-foreground">{activeStep.label}</p>
            <p className="text-xs text-muted mt-0.5">{activeStep.subtitle}</p>

            {/* step 1: show meeting date/time */}
            {activeStep.step === 1 && meetingLabel && (
              <div className="mt-3 rounded-lg bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/15 px-3 py-2.5">
                <p className="text-xs text-muted">your meeting</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{meetingLabel}</p>
              </div>
            )}

            {/* step 2: show join call link */}
            {activeStep.step === 2 && (
              <a
                href={bookingId ? `/call/${bookingId}` : "#"}
                className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                join your call
              </a>
            )}
          </div>
        )}

        {/* completion card */}
        {isComplete && (
          <div className="mt-4 rounded-xl bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/15 p-5 text-center">
            <p className="text-lg font-extrabold text-foreground">your blend is ready!</p>
            <p className="text-xs text-muted mt-1">every step is complete. time to take a sip.</p>
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
