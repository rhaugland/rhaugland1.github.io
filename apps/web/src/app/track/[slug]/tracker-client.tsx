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
}

function StepIndicator({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500">
        <svg
          className="h-5 w-5 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="relative flex h-10 w-10 items-center justify-center">
        <div className="absolute h-10 w-10 animate-ping rounded-full bg-primary opacity-25" />
        <div className="relative h-6 w-6 rounded-full bg-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300">
      <div className="h-3 w-3 rounded-full bg-gray-400" />
    </div>
  );
}

function StepConnector({ status }: { status: "done" | "active" | "pending" }) {
  return (
    <div className="mx-auto my-1 h-8 w-0.5">
      <div
        className={`h-full w-full transition-colors duration-500 ${
          status === "done" ? "bg-green-500" : "bg-gray-300"
        }`}
      />
    </div>
  );
}

export function TrackerClient({
  slug,
  clientName,
  initialSteps,
  currentStep: initialCurrentStep,
  prototypeNanoid,
  bookingId,
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
      // browser will auto-reconnect
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

  const isComplete = currentStep === 5 && steps[4]?.status === "done";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center slushie-gradient px-4">
      <div className="w-full max-w-md">
        {/* header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold text-primary">slushie</h1>
          <p className="mt-2 text-foreground text-sm">
            {isComplete
              ? `${clientName}, your tool is ready.`
              : `hey ${clientName} — we're blending something for you.`}
          </p>
          {connected && !isComplete && (
            <p className="mt-1 text-xs text-muted">live updates</p>
          )}
        </div>

        {/* step list */}
        <div className="rounded-2xl bg-white/80 p-6 shadow-lg backdrop-blur-sm">
          {steps.map((step, index) => (
            <div key={step.step}>
              <div className="flex items-center gap-4">
                <StepIndicator status={step.status} />
                <div className="flex-1">
                  <p
                    className={`text-sm font-semibold ${
                      step.status === "active"
                        ? "text-primary"
                        : step.status === "done"
                        ? "text-foreground"
                        : "text-muted"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p
                    className={`text-xs ${
                      step.status === "pending" ? "text-muted/50" : "text-muted"
                    }`}
                  >
                    {step.subtitle}
                  </p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className="ml-5">
                  <StepConnector status={steps[index + 1].status === "pending" ? "pending" : "done"} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* cancelled state */}
        {cancelled && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-4 text-center">
            <p className="text-sm font-medium text-red-700">booking cancelled</p>
            <p className="mt-1 text-xs text-red-500">your meeting has been cancelled.</p>
          </div>
        )}

        {/* rescheduled confirmation */}
        {rescheduled && !cancelled && (
          <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-4 text-center">
            <p className="text-sm font-medium text-green-700">meeting rescheduled!</p>
            <p className="mt-1 text-xs text-green-500">you'll receive an updated calendar invite.</p>
          </div>
        )}

        {/* cancel / reschedule actions — only during step 1 for bookings */}
        {canModify && !showReschedule && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={openReschedule}
              disabled={actionLoading}
              className="flex-1 rounded-lg border-2 border-primary bg-white px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              reschedule
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={actionLoading}
              className="flex-1 rounded-lg border-2 border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
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
                className="text-xs text-muted hover:text-foreground"
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
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {rescheduleSlots.map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => { setRescheduleDay(day.date); setRescheduleSlot(null); }}
                      className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        rescheduleDay === day.date
                          ? "bg-foreground text-white"
                          : "bg-white border border-gray-200 text-foreground hover:border-foreground/30"
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                {currentDaySlots && (
                  <div className="grid grid-cols-4 gap-2">
                    {currentDaySlots.times.map((time) => (
                      <button
                        key={time.start}
                        type="button"
                        onClick={() => setRescheduleSlot(time.start)}
                        className={`rounded-lg border-2 px-2 py-2 text-sm font-medium transition-all ${
                          rescheduleSlot === time.start
                            ? "border-primary bg-primary text-white"
                            : "border-gray-200 bg-white text-foreground hover:border-primary/50"
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
                  className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary py-2.5 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* prototype link — only shows when ready */}
        {isComplete && prototypeNanoid && (
          <div className="mt-6 text-center">
            <a
              href={`/preview/${prototypeNanoid}`}
              className="inline-block rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105"
            >
              take a look
            </a>
          </div>
        )}

        {/* auto-refresh hint */}
        {!isComplete && currentStep > 0 && (
          <p className="mt-6 text-center text-xs text-muted">
            this page updates automatically. no need to refresh.
          </p>
        )}
      </div>

      {/* footer */}
      <div className="mt-12 text-center text-xs text-muted/60">
        <p>powered by slushie</p>
      </div>
    </main>
  );
}
