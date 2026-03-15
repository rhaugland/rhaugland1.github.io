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
  minimized: boolean;
  onToggle: () => void;
}

const CATEGORY_STYLES = {
  dig_deeper: {
    bg: "bg-blue-500",
    label: "dig deeper",
  },
  gap_spotted: {
    bg: "bg-red-500",
    label: "gap spotted",
  },
  suggested: {
    bg: "bg-purple-500",
    label: "suggested",
  },
} as const;

export function CoachingPanel({ cards, minimized, onToggle }: CoachingPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cards.length]);

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between border-b border-gray-200 px-4 py-2 hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">coaching</h3>
          {cards.length > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">
              {cards.length}
            </span>
          )}
        </div>
        <span className="text-xs text-muted">{minimized ? "expand" : "minimize"}</span>
      </button>

      {/* body */}
      {!minimized && (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {cards.length === 0 ? (
            <p className="text-sm text-muted">
              coaching tips will appear here as gaps are detected...
            </p>
          ) : (
            <div className="space-y-2">
              {cards.map((card, idx) => {
                const style = CATEGORY_STYLES[card.category];
                const time = new Date(card.timestamp);
                const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                return (
                  <div key={`${card.timestamp}-${idx}`} className="flex justify-start">
                    <div className="max-w-[85%]">
                      <div
                        className={`${style.bg} rounded-2xl rounded-bl-sm px-3 py-2 text-white shadow-sm`}
                      >
                        <div className="mb-0.5 flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase opacity-80">
                            {style.label}
                          </span>
                          {card.monetaryEstimate && (
                            <span className="text-[10px] font-bold opacity-90">
                              {card.monetaryEstimate}
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-snug">{card.text}</p>
                      </div>
                      <p className="mt-0.5 px-1 text-[10px] text-muted">{timeStr}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
