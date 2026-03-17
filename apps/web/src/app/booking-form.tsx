"use client";

import { useState, useRef, type KeyboardEvent } from "react";

type Plan = "SINGLE_SCOOP" | "DOUBLE_BLEND" | "TRIPLE_FREEZE";

const COMMON_TOOLS = [
  "google sheets",
  "quickbooks",
  "salesforce",
  "hubspot",
  "slack",
  "zapier",
  "airtable",
  "notion",
  "stripe",
  "shopify",
  "mailchimp",
  "excel",
  "google drive",
  "trello",
  "asana",
  "monday.com",
  "freshbooks",
  "xero",
  "square",
  "calendly",
];

export function BookingForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [plan, setPlan] = useState<Plan>("DOUBLE_BLEND");
  const [description, setDescription] = useState("");
  const [techStack, setTechStack] = useState<string[]>([]);
  const [techInput, setTechInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ bookingId: string } | null>(null);
  const techInputRef = useRef<HTMLInputElement>(null);

  function addTag(tag: string) {
    const cleaned = tag.trim().toLowerCase();
    if (cleaned && !techStack.includes(cleaned) && !atToolLimit) {
      setTechStack([...techStack, cleaned]);
    }
    setTechInput("");
    setShowSuggestions(false);
  }

  function removeTag(tag: string) {
    setTechStack(techStack.filter((t) => t !== tag));
  }

  function handleTechKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (techInput.trim()) addTag(techInput);
    } else if (e.key === "Backspace" && !techInput && techStack.length > 0) {
      removeTag(techStack[techStack.length - 1]);
    }
  }

  const filteredSuggestions = techInput.length > 0
    ? COMMON_TOOLS.filter(
        (t) => t.includes(techInput.toLowerCase()) && !techStack.includes(t)
      ).slice(0, 5)
    : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const fullDescription = techStack.length > 0
      ? `${description}\n\ntools/tech stack: ${techStack.join(", ")}`
      : description;

    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          businessName,
          plan,
          description: fullDescription,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "something went wrong");
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      setBooked({ bookingId: data.bookingId });
    } catch {
      setError("something went wrong. please try again.");
      setSubmitting(false);
    }
  }

  const planOptions: Array<{ value: Plan; label: string; price: string; maxTools: number }> = [
    { value: "SINGLE_SCOOP", label: "single scoop", price: "$3,500", maxTools: 1 },
    { value: "DOUBLE_BLEND", label: "double blend", price: "$6,000", maxTools: 2 },
    { value: "TRIPLE_FREEZE", label: "triple freeze", price: "$8,500", maxTools: 3 },
  ];

  const maxTools = planOptions.find((o) => o.value === plan)!.maxTools;
  const atToolLimit = techStack.length >= maxTools;

  if (booked) {
    return (
      <div className="text-center space-y-5">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-secondary/20">
          <svg className="h-7 w-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-2xl font-extrabold text-foreground">we're on it!</h3>
          <p className="mt-2 text-sm text-muted">
            we're already building your first prototype, {name}. your rep will reach out to schedule a discovery call.
          </p>
        </div>

        <div className="rounded-xl bg-surface border border-border p-4 text-left space-y-2">
          <p className="text-sm text-muted">
            check your email for a confirmation. we'll send you updates as your build progresses.
          </p>
        </div>
      </div>
    );
  }

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
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="your business"
        />
      </div>

      {/* plan selector with prices */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          pick your flavor
        </label>
        <div className="grid grid-cols-3 gap-2">
          {planOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setPlan(opt.value);
                if (techStack.length > opt.maxTools) {
                  setTechStack(techStack.slice(0, opt.maxTools));
                }
              }}
              className={`rounded-lg border-2 px-3 py-3 text-center transition-all ${
                plan === opt.value
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-foreground hover:border-primary/50"
              }`}
            >
              <span className="block text-sm font-medium">{opt.label}</span>
              <span
                className={`block text-lg font-extrabold mt-0.5 ${
                  plan === opt.value ? "text-white" : "text-foreground"
                }`}
              >
                {opt.price}
              </span>
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
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          placeholder="tell us about the spreadsheet, the copy-paste nightmare, the thing that eats your afternoon..."
        />
      </div>

      {/* tech stack tags */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          what tools do you use?
        </label>
        <div className="rounded-lg border border-border bg-surface px-3 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          <div className="flex flex-wrap gap-1.5 mb-1">
            {techStack.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-primary/70 text-primary/50"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="relative">
            {!atToolLimit && (
              <input
                ref={techInputRef}
                type="text"
                value={techInput}
                onChange={(e) => {
                  setTechInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onKeyDown={handleTechKeyDown}
                className="w-full border-0 bg-transparent p-0 py-1 text-sm text-foreground focus:outline-none focus:ring-0"
                placeholder={techStack.length === 0 ? "type or pick — google sheets, quickbooks, slack..." : "add another..."}
              />
            )}
            {/* suggestions dropdown */}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
                {filteredSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(suggestion)}
                    className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-primary/5 first:rounded-t-lg last:rounded-b-lg"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          {planOptions.find((o) => o.value === plan)!.label} includes {maxTools} backend plug-in{maxTools > 1 ? "s" : ""} — upgrade your flavor for more
        </p>
      </div>

      {/* error */}
      {error && (
        <p className="text-sm text-primary font-medium">{error}</p>
      )}

      {/* submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "submitting..." : "start building →"}
      </button>
    </form>
  );
}
