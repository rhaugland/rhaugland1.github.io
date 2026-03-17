"use client";

import { useState, useRef, useEffect } from "react";

interface DemoResult {
  email: string;
  name: string;
  businessName: string;
  bookingId: string;
}

export function DemoHeaderButtons() {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    }
    if (showPopover) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPopover]);

  async function handleDemo(preset: string) {
    setLoading(preset);
    try {
      const res = await fetch("/api/booking/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setShowPopover(true);
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative flex items-center gap-1.5" ref={popoverRef}>
      <button
        type="button"
        onClick={() => handleDemo("ryan")}
        disabled={!!loading}
        className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white hover:border-white/40 transition-all disabled:opacity-50"
      >
        {loading === "ryan" ? "..." : "demo ryan"}
      </button>
      <button
        type="button"
        onClick={() => handleDemo("adam")}
        disabled={!!loading}
        className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white hover:border-white/40 transition-all disabled:opacity-50"
      >
        {loading === "adam" ? "..." : "demo adam"}
      </button>

      {showPopover && result && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-white/10 bg-[#1a1a1a] shadow-2xl p-4 space-y-3 z-50">
          <div>
            <p className="text-xs font-bold text-white">{result.businessName}</p>
            <p className="text-[10px] text-white/50">{result.name}</p>
          </div>

          <div className="rounded-lg bg-white/5 p-2.5 space-y-1.5">
            <div>
              <p className="text-[9px] text-white/40">client email</p>
              <p className="text-[11px] text-white/80">
                {result.email}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <a
              href="/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg bg-gradient-to-r from-primary to-secondary px-3 py-2 text-center text-[10px] font-bold text-white transition-all hover:shadow-lg active:scale-[0.98]"
            >
              admin dashboard
            </a>
          </div>

          <button
            type="button"
            onClick={() => setShowPopover(false)}
            className="w-full text-[9px] text-white/30 hover:text-white/60 transition-colors"
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}
