"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface TimeSlot {
  start: string;
  label: string;
}

interface DaySlots {
  date: string;
  label: string;
  times: TimeSlot[];
}

type Plan = "SINGLE_SCOOP" | "DOUBLE_BLEND" | "TRIPLE_FREEZE";

export function BookingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [plan, setPlan] = useState<Plan>("DOUBLE_BLEND");
  const [description, setDescription] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<DaySlots[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/booking/slots")
      .then((res) => res.json())
      .then((data) => {
        setSlots(data.slots ?? []);
        if (data.slots?.length > 0) {
          setSelectedDay(data.slots[0].date);
        }
      })
      .catch(() => setError("couldn't load available times"))
      .finally(() => setLoadingSlots(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) {
      setError("please pick a time");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          businessName,
          plan,
          description,
          meetingTime: selectedSlot,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "something went wrong");
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      router.push(`/track/${data.trackingSlug}`);
    } catch {
      setError("something went wrong. please try again.");
      setSubmitting(false);
    }
  }

  const planOptions: Array<{ value: Plan; label: string }> = [
    { value: "SINGLE_SCOOP", label: "single scoop" },
    { value: "DOUBLE_BLEND", label: "double blend" },
    { value: "TRIPLE_FREEZE", label: "triple freeze" },
  ];

  const currentDaySlots = slots.find((s) => s.date === selectedDay);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* name */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          name
        </label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="your name"
        />
      </div>

      {/* email */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="you@company.com"
        />
      </div>

      {/* business name */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          business name
        </label>
        <input
          type="text"
          required
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="your business"
        />
      </div>

      {/* plan selector */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          pick your flavor
        </label>
        <div className="grid grid-cols-3 gap-2">
          {planOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPlan(opt.value)}
              className={`rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                plan === opt.value
                  ? "border-primary bg-primary text-white"
                  : "border-gray-200 bg-white text-foreground hover:border-primary/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* description */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          what's the workflow that's eating your time?
        </label>
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          placeholder="tell us about the spreadsheet, the copy-paste nightmare, the thing that eats your afternoon..."
        />
      </div>

      {/* calendar picker */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          pick a time
        </label>
        {loadingSlots ? (
          <div className="text-center py-8 text-sm text-muted">
            loading available times...
          </div>
        ) : slots.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted">
            no available times right now. check back soon.
          </div>
        ) : (
          <div className="space-y-3">
            {/* day tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {slots.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDay(day.date)}
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
              <div className="grid grid-cols-4 gap-2">
                {currentDaySlots.times.map((time) => (
                  <button
                    key={time.start}
                    type="button"
                    onClick={() => setSelectedSlot(time.start)}
                    className={`rounded-lg border-2 px-2 py-2 text-sm font-medium transition-all ${
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
          </div>
        )}
      </div>

      {/* error */}
      {error && (
        <p className="text-sm text-primary font-medium">{error}</p>
      )}

      {/* submit */}
      <button
        type="submit"
        disabled={submitting || !selectedSlot}
        className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "booking..." : "book your blend →"}
      </button>
    </form>
  );
}
