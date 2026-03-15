"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface DaySlots {
  date: string;
  label: string;
  times: Array<{ start: string; label: string }>;
}

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
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [slots, setSlots] = useState<DaySlots[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSlots() {
      try {
        const res = await fetch("/api/booking/slots");
        const data = await res.json();
        setSlots(data.slots ?? []);
        if (data.slots?.length > 0) {
          setSelectedDay(data.slots[0].date);
        }
      } catch {
        setError("couldn't load available times");
      } finally {
        setLoadingSlots(false);
      }
    }
    loadSlots();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !description.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/booking/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentBookingId: bookingId,
          description: description.trim(),
          meetingTime: selectedSlot,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "something went wrong");
        return;
      }

      router.push(`/track/${data.trackingSlug}`);
    } catch {
      setError("something went wrong. please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const currentDaySlots = slots.find((s) => s.date === selectedDay);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center slushie-gradient px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-primary">slushie</h1>
          <p className="mt-2 text-sm text-foreground">
            hey {name} — let's schedule workflow {workflowNumber} of {totalWorkflows}
          </p>
          <p className="mt-1 text-xs text-muted">
            {planLabel} for {businessName}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="rounded-2xl bg-white/80 shadow-lg backdrop-blur-sm p-6 space-y-5">
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none resize-none"
              />
            </div>

            {/* time picker */}
            <div>
              <p className="block text-xs font-medium text-muted mb-2">pick a meeting time</p>

              {loadingSlots ? (
                <p className="text-center text-sm text-muted py-4">loading times...</p>
              ) : slots.length === 0 ? (
                <p className="text-center text-sm text-muted py-4">no available times right now. check back soon.</p>
              ) : (
                <>
                  {/* day tabs */}
                  <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
                    {slots.map((day) => (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => { setSelectedDay(day.date); setSelectedSlot(null); }}
                        className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                          selectedDay === day.date
                            ? "bg-foreground text-white"
                            : "bg-white border border-gray-200 text-foreground hover:border-foreground/30"
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>

                  {/* time slots */}
                  {currentDaySlots && (
                    <div className="grid grid-cols-3 gap-2">
                      {currentDaySlots.times.map((time) => (
                        <button
                          key={time.start}
                          type="button"
                          onClick={() => setSelectedSlot(time.start)}
                          className={`rounded-lg border-2 px-2 py-2.5 text-sm font-medium transition-all ${
                            selectedSlot === time.start
                              ? "border-primary bg-primary text-white"
                              : "border-gray-200 bg-white text-foreground hover:border-primary/50"
                          }`}
                        >
                          {time.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !selectedSlot || !description.trim()}
              className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-50"
            >
              {submitting ? "scheduling..." : "schedule workflow"}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-muted/60">
          powered by slushie
        </p>
      </div>
    </main>
  );
}
