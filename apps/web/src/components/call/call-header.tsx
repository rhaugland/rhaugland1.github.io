"use client";

import { useEffect, useState } from "react";

interface CallHeaderProps {
  clientName: string;
  isLive: boolean;
  startedAt: Date;
  onEndCall: () => void;
  isFallback: boolean;
}

export function CallHeader({
  clientName,
  isLive,
  startedAt,
  onEndCall,
  isFallback,
}: CallHeaderProps) {
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const mins = Math.floor(diff / 60)
        .toString()
        .padStart(2, "0");
      const secs = (diff % 60).toString().padStart(2, "0");
      setElapsed(`${mins}:${secs}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [isLive, startedAt]);

  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-4">
        {/* live badge */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-3 w-3 rounded-full ${
              isLive ? "animate-pulse bg-primary" : "bg-gray-400"
            }`}
          />
          <span className="text-sm font-semibold">
            {isLive ? "live" : "ended"}
          </span>
        </div>

        {/* client name */}
        <span className="text-sm font-medium text-foreground">
          {clientName}
        </span>

        {/* duration */}
        <span className="font-mono text-sm text-muted">{elapsed}</span>

        {/* fallback indicator */}
        {isFallback && (
          <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
            transcription paused — reconnecting
          </span>
        )}
      </div>

      <div>
        {isLive && (
          <button
            onClick={onEndCall}
            className="rounded bg-primary px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            end call
          </button>
        )}
      </div>
    </div>
  );
}
