"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

interface ActivityEntry {
  id: string;
  type: "progress" | "system" | "message";
  text: string;
  timestamp: number;
  sender?: string;
  percentComplete?: number;
}

interface BuildPreviewPanelProps {
  pipelineRunId: string;
  isLive: boolean;
  initialPreviewUrl?: string | null;
}

export interface BuildPreviewPanelHandle {
  handleBuildEvent: (event: {
    type: string;
    data?: Record<string, unknown>;
    timestamp?: number;
  }) => void;
}

export const BuildPreviewPanel = forwardRef<BuildPreviewPanelHandle, BuildPreviewPanelProps>(
  function BuildPreviewPanel({ pipelineRunId, isLive, initialPreviewUrl }, ref) {
    const [activityLog, setActivityLog] = useState<ActivityEntry[]>(
      initialPreviewUrl
        ? [{ id: "initial", type: "system", text: "initial build loaded", timestamp: Date.now() }]
        : []
    );
    const [previewUrl, setPreviewUrl] = useState<string | null>(initialPreviewUrl ?? null);
    const previewUrlRef = useRef<string | null>(initialPreviewUrl ?? null); // ref to avoid stale closure
    const [isPaused, setIsPaused] = useState(false);
    const [messageText, setMessageText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const logBottomRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // auto-scroll activity log
    useEffect(() => {
      logBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activityLog.length]);

    const addEntry = useCallback((entry: Omit<ActivityEntry, "id">) => {
      setActivityLog((prev) => [
        ...prev,
        { ...entry, id: `${entry.timestamp}-${Math.random().toString(36).slice(2, 6)}` },
      ]);
    }, []);

    // called by the parent page when SSE events arrive
    const handleBuildEvent = useCallback(
      (event: { type: string; data?: Record<string, unknown>; timestamp?: number }) => {
        const ts = event.timestamp ?? Date.now();

        switch (event.type) {
          case "prototype.progress": {
            const phase = (event.data?.phase as string) ?? "working";
            const pct = (event.data?.percentComplete as number) ?? 0;
            addEntry({ type: "progress", text: phase, timestamp: ts, percentComplete: pct });
            break;
          }
          case "prototype.ready": {
            const url = event.data?.previewUrl as string;
            const version = event.data?.version as number;
            if (url) {
              setPreviewUrl(url);
              previewUrlRef.current = url;
            }
            addEntry({ type: "system", text: `prototype v${version ?? 1} ready`, timestamp: ts });
            break;
          }
          case "prototype.patched": {
            addEntry({ type: "system", text: "prototype updated", timestamp: ts });
            // reload iframe with cached url from ref (avoids stale closure)
            if (iframeRef.current && previewUrlRef.current) {
              iframeRef.current.src = previewUrlRef.current;
            }
            break;
          }
          case "build.message": {
            addEntry({
              type: "message",
              text: event.data?.text as string,
              sender: event.data?.sentBy as string,
              timestamp: ts,
            });
            break;
          }
          case "build.paused": {
            setIsPaused(true);
            addEntry({ type: "system", text: "build paused", timestamp: ts });
            break;
          }
          case "build.resumed": {
            setIsPaused(false);
            addEntry({ type: "system", text: "build resumed", timestamp: ts });
            break;
          }
          case "build.spec.ready": {
            const v = event.data?.version as number;
            addEntry({ type: "system", text: `build spec v${v ?? 1} ready`, timestamp: ts });
            break;
          }
          case "build.spec.updated": {
            const v = event.data?.version as number;
            addEntry({ type: "system", text: `build spec updated v${v ?? "?"}`, timestamp: ts });
            break;
          }
          case "analysis.complete": {
            addEntry({ type: "system", text: "analysis complete", timestamp: ts });
            break;
          }
        }
      },
      [addEntry]
    );

    useImperativeHandle(ref, () => ({ handleBuildEvent }), [handleBuildEvent]);

    const handleSendMessage = useCallback(async () => {
      if (!messageText.trim() || isSending) return;
      setIsSending(true);
      try {
        await fetch("/api/calls/build/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipelineRunId, text: messageText.trim() }),
        });
        setMessageText("");
      } catch (err) {
        console.error("failed to send message:", err);
      } finally {
        setIsSending(false);
      }
    }, [messageText, isSending, pipelineRunId]);

    const handlePauseResume = useCallback(async () => {
      const endpoint = isPaused ? "/api/calls/build/resume" : "/api/calls/build/pause";
      try {
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipelineRunId }),
        });
      } catch (err) {
        console.error("failed to pause/resume:", err);
      }
    }, [isPaused, pipelineRunId]);

    const handleRefreshIframe = useCallback(() => {
      if (iframeRef.current && previewUrlRef.current) {
        iframeRef.current.src = previewUrlRef.current;
      }
    }, []);

    const formatTime = (ts: number) => {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    return (
      <div className="flex h-full flex-col">
        {/* activity log — top 30% */}
        <div className="h-[30%] overflow-y-auto border-b border-gray-100 px-3 py-2">
          {activityLog.length === 0 ? (
            <p className="text-sm text-muted">
              {isLive ? "build activity will appear here..." : "start a call to begin building."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {activityLog.map((entry) => {
                if (entry.type === "message") {
                  return (
                    <div key={entry.id} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 rounded bg-secondary/10 px-1.5 py-0.5 text-[10px] font-semibold text-secondary">
                        {entry.sender ?? "you"}
                      </span>
                      <p className="text-sm text-foreground">{entry.text}</p>
                      <span className="ml-auto shrink-0 text-[10px] text-muted">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>
                  );
                }

                if (entry.type === "system") {
                  return (
                    <div key={entry.id} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted">{formatTime(entry.timestamp)}</span>
                      <span className="text-xs font-medium text-muted">{entry.text}</span>
                    </div>
                  );
                }

                // progress entry
                return (
                  <div key={entry.id} className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-secondary" />
                    <span className="text-xs text-foreground">{entry.text}</span>
                    {entry.percentComplete !== undefined && (
                      <span className="text-[10px] text-muted">{entry.percentComplete}%</span>
                    )}
                    <span className="ml-auto text-[10px] text-muted">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                );
              })}
              <div ref={logBottomRef} />
            </div>
          )}
        </div>

        {/* iframe preview — bottom 70% */}
        <div className="relative flex-1 bg-gray-50">
          {previewUrl ? (
            <>
              <iframe
                ref={iframeRef}
                src={previewUrl}
                className="h-full w-full border-0"
                title="prototype preview"
              />
              <button
                onClick={handleRefreshIframe}
                className="absolute right-2 top-2 rounded bg-white/80 px-2 py-1 text-[10px] text-muted shadow-sm hover:bg-white hover:text-foreground"
              >
                refresh
              </button>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted">build will appear here as it takes shape...</p>
            </div>
          )}
        </div>

        {/* controls bar */}
        <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="suggest something to the builder..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            disabled={!isLive}
          />
          <button
            onClick={handleSendMessage}
            disabled={!messageText.trim() || isSending || !isLive}
            className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            send
          </button>
          <button
            onClick={handlePauseResume}
            disabled={!isLive}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              isPaused
                ? "border-green-300 text-green-700 hover:bg-green-50"
                : "border-yellow-300 text-yellow-700 hover:bg-yellow-50"
            } disabled:opacity-50`}
          >
            {isPaused ? "resume" : "pause"}
          </button>
        </div>
      </div>
    );
  }
);
