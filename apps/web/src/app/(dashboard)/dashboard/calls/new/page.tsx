"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const INDUSTRIES = [
  "plumbing",
  "cleaning",
  "consulting",
  "accounting",
  "legal",
  "real estate",
  "other",
];

export default function NewCallPage() {
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [industry, setIndustry] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartCall = async () => {
    if (!clientName.trim()) {
      setError("client name is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: clientName.trim(),
          industry: industry || "other",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "failed to start call");
      }

      const data = await res.json();

      // redirect to the live call dashboard
      router.push(`/dashboard/calls/live/${data.pipelineRunId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "something went wrong"
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md pt-12">
      <h2 className="text-2xl font-bold text-foreground">start a new call</h2>
      <p className="mt-1 text-sm text-muted">
        enter the client details and pour a fresh discovery call.
      </p>

      <div className="mt-8 space-y-4">
        <div>
          <label
            htmlFor="clientName"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            client name
          </label>
          <input
            id="clientName"
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="e.g. mike's plumbing"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label
            htmlFor="industry"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            industry
          </label>
          <select
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">select an industry</option>
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-sm text-primary">{error}</p>
        )}

        <button
          onClick={handleStartCall}
          disabled={isLoading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {isLoading ? "starting call..." : "start call"}
        </button>
      </div>
    </div>
  );
}
