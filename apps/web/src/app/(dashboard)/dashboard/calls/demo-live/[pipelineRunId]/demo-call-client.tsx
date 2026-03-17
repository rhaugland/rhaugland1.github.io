"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Message {
  text: string;
  timestamp: number;
}

interface DemoCallClientProps {
  pipelineRunId: string;
  businessName: string;
  clientName: string;
  previewUrl: string | null;
}

export default function DemoCallClient({
  pipelineRunId,
  businessName,
  clientName,
  previewUrl,
}: DemoCallClientProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isEnding, setIsEnding] = useState(false);
  const [startedAt] = useState<Date>(new Date());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { text: trimmed, timestamp: Date.now() }]);
    setInput("");
    inputRef.current?.focus();
  }, [input]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleEndCall = useCallback(async () => {
    if (isEnding) return;
    setIsEnding(true);

    const transcript = messages
      .map((m) => {
        const time = new Date(m.timestamp);
        const timeStr = time.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `[${timeStr}] ${m.text}`;
      })
      .join("\n");

    try {
      const res = await fetch("/api/calls/demo/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineRunId, transcript }),
      });

      if (!res.ok) {
        console.error("failed to end demo call:", await res.text());
      }
    } catch (err) {
      console.error("failed to end demo call:", err);
    }

    router.push("/dashboard");
  }, [isEnding, messages, pipelineRunId, router]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* header */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary" />
            <span className="text-sm font-bold text-foreground">slushie</span>
          </div>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {businessName}
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              demo call
            </span>
          </div>
          <CallTimer startedAt={startedAt} />
        </div>

        <button
          onClick={handleEndCall}
          disabled={isEnding}
          className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {isEnding ? "ending..." : "end call"}
        </button>
      </div>

      {/* main content — two panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* left panel — prototype iframe (60%) */}
        <div className="flex w-[60%] flex-col border-r border-border">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              className="h-full w-full"
              title="prototype preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted">
                no prototype available for this build.
              </p>
            </div>
          )}
        </div>

        {/* right panel — transcript / chat (40%) */}
        <div className="flex w-[40%] flex-col bg-surface">
          {/* panel header */}
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              client feedback
            </h2>
            <p className="text-xs text-muted">
              type what {clientName} says during the demo
            </p>
          </div>

          {/* messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <p className="text-sm text-muted">
                start typing client comments and feedback as you walk through
                the demo...
              </p>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, idx) => {
                  const time = new Date(msg.timestamp);
                  const timeStr = time.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div key={`${msg.timestamp}-${idx}`} className="group">
                      <div className="rounded-xl rounded-bl-sm bg-background px-3 py-2 shadow-sm">
                        <p className="text-sm leading-relaxed text-foreground">
                          {msg.text}
                        </p>
                      </div>
                      <p className="mt-0.5 px-1 text-[10px] text-muted">
                        {timeStr}
                      </p>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* input area */}
          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="type client feedback..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
              >
                send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CallTimer({ startedAt }: { startedAt: Date }) {
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const mins = Math.floor(diff / 60)
        .toString()
        .padStart(2, "0");
      const secs = (diff % 60).toString().padStart(2, "0");
      setElapsed(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return <span className="font-mono text-sm text-muted">{elapsed}</span>;
}
