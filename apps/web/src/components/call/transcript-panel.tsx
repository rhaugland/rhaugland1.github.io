"use client";

import { useEffect, useRef } from "react";

interface TranscriptEntry {
  text: string;
  speaker: "team" | "client";
  isFinal: boolean;
  chunkIndex: number;
  timestamp: number;
}

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
  minimized: boolean;
  onToggle: () => void;
}

export function TranscriptPanel({ entries, minimized, onToggle }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between border-b border-gray-200 px-4 py-2 hover:bg-gray-50 transition"
      >
        <h3 className="text-sm font-semibold text-foreground">transcript</h3>
        <span className="text-xs text-muted">{minimized ? "expand" : "minimize"}</span>
      </button>

      {/* body */}
      {!minimized && (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {entries.length === 0 ? (
            <p className="text-sm text-muted">
              waiting for audio... start speaking.
            </p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={`${entry.chunkIndex}-${entry.isFinal}`}
                  className={`text-sm leading-relaxed ${
                    entry.isFinal ? "text-foreground" : "text-muted italic"
                  }`}
                >
                  <span
                    className={`mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                      entry.speaker === "team"
                        ? "bg-secondary/10 text-secondary"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {entry.speaker}
                  </span>
                  {entry.text}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
