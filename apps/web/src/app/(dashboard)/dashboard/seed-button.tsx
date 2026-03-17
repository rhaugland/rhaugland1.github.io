"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SeedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSeed() {
    setLoading(true);
    try {
      const res = await fetch("/api/booking/seed", { method: "POST" });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSeed}
      disabled={loading}
      className="rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
    >
      {loading ? "seeding..." : "+ demo booking"}
    </button>
  );
}
