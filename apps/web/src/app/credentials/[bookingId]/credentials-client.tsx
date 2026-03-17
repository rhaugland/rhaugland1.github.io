"use client";

import { useState } from "react";

interface CredentialsClientProps {
  bookingId: string;
  businessName: string;
  name: string;
  services: string[];
  currentStep: number;
  existingCredentials: Array<{ service: string; value: string }> | null;
}

export function CredentialsClient({
  bookingId,
  businessName,
  name,
  services,
  currentStep,
  existingCredentials,
}: CredentialsClientProps) {
  const [credentials, setCredentials] = useState<Record<string, string>>(() => {
    if (existingCredentials) {
      return Object.fromEntries(existingCredentials.map((c) => [c.service, c.value]));
    }
    return Object.fromEntries(services.map((s) => [s, ""]));
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // already past the credentials step
  if (currentStep > 10 || existingCredentials) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-surface rounded-2xl p-8 max-w-md w-full text-center border border-border">
          <div className="w-16 h-16 rounded-full bg-gradient-to-r from-red-500 to-blue-500 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">credentials already submitted</h1>
          <p className="text-muted text-sm">
            thanks, {name.split(" ")[0].toLowerCase()}. we have your credentials on file and are working on
            plugging everything in for {businessName.toLowerCase()}.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-surface rounded-2xl p-8 max-w-md w-full text-center border border-border">
          <div className="w-16 h-16 rounded-full bg-gradient-to-r from-red-500 to-blue-500 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">credentials received</h1>
          <p className="text-muted text-sm">
            thanks, {name.split(" ")[0].toLowerCase()}. we'll plug everything in and let you know when it's live.
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = Object.entries(credentials).map(([service, value]) => ({
      service,
      value,
    }));

    try {
      const res = await fetch(`/api/booking/${bookingId}/advance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials: payload }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "something went wrong");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        {/* header */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <span className="text-2xl font-bold bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
              slushie
            </span>
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            plug-in credentials
          </h1>
          <p className="text-muted text-sm">
            hey {name.split(" ")[0].toLowerCase()}, we need api keys or login credentials for the services below
            to finish wiring up {businessName.toLowerCase()}.
          </p>
        </div>

        {/* form */}
        <form onSubmit={handleSubmit} className="bg-surface rounded-2xl p-6 border border-border space-y-5">
          {services.map((service) => (
            <div key={service}>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {service}
              </label>
              <input
                type="text"
                value={credentials[service] ?? ""}
                onChange={(e) =>
                  setCredentials((prev) => ({ ...prev, [service]: e.target.value }))
                }
                placeholder={`api key or credentials for ${service}`}
                className="w-full rounded-lg bg-surface-light border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          ))}

          {error && (
            <p className="text-sm text-primary">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || Object.values(credentials).every((v) => !v.trim())}
            className="w-full rounded-lg bg-gradient-to-r from-red-500 to-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "submitting..." : "submit credentials"}
          </button>
        </form>
      </div>
    </div>
  );
}
