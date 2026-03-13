"use client";

import { useEffect, useRef } from "react";

interface CoachingCard {
  category: "dig_deeper" | "gap_spotted" | "suggested";
  text: string;
  monetaryEstimate?: string;
  timestamp: number;
}

interface CoachingPanelProps {
  cards: CoachingCard[];
}

const CATEGORY_STYLES = {
  dig_deeper: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-800",
    label: "dig deeper",
  },
  gap_spotted: {
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-800",
    label: "gap spotted",
  },
  suggested: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    badge: "bg-purple-100 text-purple-800",
    label: "suggested",
  },
} as const;

export function CoachingPanel({ cards }: CoachingPanelProps) {
  const topRef = useRef<HTMLDivElement>(null);

  // scroll to top when new cards arrive (newest first)
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cards.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          coaching
          {cards.length > 0 && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-white">
              {cards.length}
            </span>
          )}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div ref={topRef} />
        {cards.length === 0 ? (
          <p className="text-sm text-muted">
            coaching suggestions will appear here as gaps are detected during the
            call.
          </p>
        ) : (
          <div className="space-y-3">
            {[...cards].reverse().map((card, idx) => {
              const style = CATEGORY_STYLES[card.category];
              return (
                <div
                  key={`${card.timestamp}-${idx}`}
                  className={`rounded-lg border ${style.border} ${style.bg} p-3 transition-all duration-300`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${style.badge}`}
                    >
                      {style.label}
                    </span>
                    {card.monetaryEstimate && (
                      <span className="text-xs font-bold text-red-700">
                        {card.monetaryEstimate}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">
                    {card.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
