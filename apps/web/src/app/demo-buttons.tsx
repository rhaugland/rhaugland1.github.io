"use client";

import { useState } from "react";

interface DemoResult {
  trackingSlug: string;
  tempPassword: string;
  email: string;
  name: string;
  businessName: string;
}

export function DemoButtons() {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDemo(preset: string) {
    setLoading(preset);
    setError(null);

    try {
      const res = await fetch("/api/booking/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "failed to create demo");
        return;
      }

      setResult(data);
    } catch {
      setError("something went wrong");
    } finally {
      setLoading(null);
    }
  }

  if (result) {
    const trackerUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/track/${result.trackingSlug}`;

    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-4">
        <div className="text-center">
          <p className="text-sm font-bold text-white">demo booking created!</p>
          <p className="mt-1 text-xs text-white/60">
            {result.businessName} — {result.name}
          </p>
        </div>

        <div className="rounded-lg bg-white/10 p-3 space-y-2">
          <div>
            <p className="text-[10px] text-white/50">client tracker</p>
            <a
              href={`/track/${result.trackingSlug}`}
              className="text-xs text-white hover:text-primary transition-colors break-all"
            >
              {trackerUrl}
            </a>
          </div>
          <div>
            <p className="text-[10px] text-white/50">login</p>
            <p className="text-xs text-white">
              {result.email} / <code className="bg-white/10 px-1 rounded text-primary font-bold">{result.tempPassword}</code>
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <a
            href={`/track/${result.trackingSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-2.5 text-center text-xs font-bold text-white transition-all hover:shadow-lg active:scale-[0.98]"
          >
            open client view
          </a>
          <a
            href="/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg border border-white/20 px-4 py-2.5 text-center text-xs font-medium text-white hover:bg-white/10 transition-colors"
          >
            open admin dashboard
          </a>
        </div>

        <button
          type="button"
          onClick={() => setResult(null)}
          className="w-full text-[10px] text-white/40 hover:text-white/70 transition-colors"
        >
          create another demo
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
      <p className="text-center text-xs text-white/50 mb-3">test the full flow</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handleDemo("ryan")}
          disabled={!!loading}
          className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-white/10 hover:border-white/30 active:scale-[0.98] disabled:opacity-50"
        >
          {loading === "ryan" ? (
            <span className="text-white/60">creating...</span>
          ) : (
            <>
              <span className="block text-xs text-white/50">demo</span>
              <span className="block font-bold">ryan</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => handleDemo("adam")}
          disabled={!!loading}
          className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-white/10 hover:border-white/30 active:scale-[0.98] disabled:opacity-50"
        >
          {loading === "adam" ? (
            <span className="text-white/60">creating...</span>
          ) : (
            <>
              <span className="block text-xs text-white/50">demo</span>
              <span className="block font-bold">adam</span>
            </>
          )}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-center text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
