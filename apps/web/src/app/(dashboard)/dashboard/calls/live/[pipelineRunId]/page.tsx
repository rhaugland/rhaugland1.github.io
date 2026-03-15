"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMediaCapture } from "@/hooks/use-media-capture";
import { useSSE } from "@/hooks/use-sse";
import { BuildPreviewPanel, type BuildPreviewPanelHandle } from "@/components/call/build-preview-panel";

interface TranscriptEntry {
  text: string;
  speaker: "team" | "client";
  isFinal: boolean;
  chunkIndex: number;
  timestamp: number;
}

interface CoachingCard {
  category: "dig_deeper" | "gap_spotted" | "suggested";
  text: string;
  monetaryEstimate?: string;
  timestamp: number;
}

// ─── Draggable Panel ───

function DraggablePanel({
  title,
  badge,
  children,
  defaultX,
  defaultY,
  defaultW,
  defaultH,
}: {
  title: string;
  badge?: number;
  children: React.ReactNode;
  defaultX: number;
  defaultY: number;
  defaultW: number;
  defaultH: number;
}) {
  const [pos, setPos] = useState({ x: defaultX, y: defaultY });
  const [size, setSize] = useState({ w: defaultW, h: defaultH });
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);
  const resizing = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onMouseDownDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: ev.clientX - offset.current.x, y: ev.clientY - offset.current.y });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [pos]);

  const onMouseDownResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;

    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      setSize({
        w: Math.max(250, startW + ev.clientX - startX),
        h: Math.max(100, startH + ev.clientY - startY),
      });
    };
    const onUp = () => {
      resizing.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [size]);

  return (
    <div
      className="absolute rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden flex flex-col"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: collapsed ? "auto" : size.h,
        zIndex: 10,
      }}
    >
      {/* header — drag handle */}
      <div
        onMouseDown={onMouseDownDrag}
        className="flex cursor-grab items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2 select-none active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {badge !== undefined && badge > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">{badge}</span>
          )}
        </div>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-xs text-muted hover:text-foreground"
        >
          {collapsed ? "expand" : "collapse"}
        </button>
      </div>

      {/* body */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      )}

      {/* resize handle */}
      {!collapsed && (
        <div
          onMouseDown={onMouseDownResize}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          style={{
            background: "linear-gradient(135deg, transparent 50%, #d1d5db 50%)",
          }}
        />
      )}
    </div>
  );
}

// ─── Main Page ───

export default function LiveCallPage() {
  const params = useParams<{ pipelineRunId: string }>();
  const router = useRouter();
  const pipelineRunId = params.pipelineRunId;

  const [isLive, setIsLive] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [coachingCards, setCoachingCards] = useState<CoachingCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);
  const coachingBottomRef = useRef<HTMLDivElement>(null);
  const buildPreviewRef = useRef<BuildPreviewPanelHandle | null>(null);
  const [buildPanelX, setBuildPanelX] = useState(972);
  const [buildPanelY, setBuildPanelY] = useState(80);
  const [initialPreviewUrl, setInitialPreviewUrl] = useState<string | null>(null);

  // responsive build panel position + load existing prototype
  useEffect(() => {
    if (window.innerWidth < 1500) {
      setBuildPanelX(528);
      setBuildPanelY(600);
    }
    // fetch existing prototype preview URL if pipeline already has a build
    fetch(`/api/calls/build/status?pipelineRunId=${pipelineRunId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.previewUrl) setInitialPreviewUrl(data.previewUrl);
      })
      .catch(() => {});
  }, [pipelineRunId]);

  // auto scroll
  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcriptEntries.length]);
  useEffect(() => {
    coachingBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [coachingCards.length]);

  const handleTranscript = useCallback(
    (data: { text: string; speaker: "team" | "client"; isFinal: boolean; chunkIndex: number }) => {
      const entry: TranscriptEntry = { ...data, timestamp: Date.now() };
      setTranscriptEntries((prev) => {
        const filtered = prev.filter(
          (e) => !(e.chunkIndex === entry.chunkIndex && !e.isFinal)
        );
        return [...filtered, entry];
      });
    },
    []
  );

  const handleSSEEvent = useCallback((data: unknown) => {
    const event = data as { type: string; data?: Record<string, unknown> };
    if (event.type === "coaching.suggestion" && event.data) {
      setCoachingCards((prev) => [
        ...prev,
        {
          category: event.data!.category as CoachingCard["category"],
          text: event.data!.text as string,
          monetaryEstimate: event.data!.monetaryEstimate as string | undefined,
          timestamp: Date.now(),
        },
      ]);
    }

    // route build events to build preview panel
    const buildEventTypes = [
      "prototype.progress", "prototype.ready", "prototype.patched",
      "build.message", "build.paused", "build.resumed",
      "build.spec.ready", "build.spec.updated", "analysis.complete",
    ];
    if (buildEventTypes.includes(event.type)) {
      buildPreviewRef.current?.handleBuildEvent(event);
    }
  }, []);

  const { isCapturing, start: startCapture, stop: stopCapture } = useMediaCapture({
    onTranscript: handleTranscript,
    onError: (err) => setError(err),
    onConnected: () => {
      setIsLive(true);
      setStartedAt(new Date());
      setError(null);
    },
  });

  useSSE({
    url: `/api/events/${pipelineRunId}`,
    enabled: isLive,
    onEvent: handleSSEEvent,
    onError: (err) => console.warn("sse error:", err),
  });

  const handleStart = useCallback(() => {
    startCapture();
    fetch("/api/calls/coaching/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pipelineRunId,
        callId: pipelineRunId,
        clientIndustry: "unknown",
      }),
    }).catch((err) => console.error("failed to start coaching:", err));

    // advance booking tracker to step 2 (meeting in progress)
    fetch("/api/calls/start-tracker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineRunId }),
    }).catch(() => {});
  }, [startCapture, pipelineRunId]);

  const handleEndCall = useCallback(async () => {
    stopCapture();
    setIsLive(false);
    setIsEnded(true);

    const finalTranscript = transcriptEntries
      .filter((e) => e.isFinal)
      .map((e) => `[${e.speaker}]: ${e.text}`)
      .join("\n");

    try {
      await fetch("/api/calls/coaching/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineRunId }),
      });
      await fetch("/api/calls/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineRunId, transcript: finalTranscript }),
      });

      // advance booking tracker to step 3 (build completion)
      await fetch(`/api/calls/advance-tracker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineRunId }),
      }).catch(() => {});
    } catch (err) {
      console.error("failed to end call:", err);
    }
  }, [stopCapture, transcriptEntries, pipelineRunId]);

  const CATEGORY_STYLES = {
    dig_deeper: { bg: "bg-blue-500", label: "dig deeper" },
    gap_spotted: { bg: "bg-red-500", label: "gap spotted" },
    suggested: { bg: "bg-purple-500", label: "suggested" },
  } as const;

  return (
    <div className="relative h-[calc(100vh-64px)] overflow-hidden bg-gray-100">
      {/* top bar */}
      <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between bg-white/90 backdrop-blur px-6 py-3 border-b border-gray-200">
        <div className="flex items-center gap-4">
          {isLive && (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-primary" />
                <span className="text-sm font-semibold">live</span>
              </div>
              <CallTimer startedAt={startedAt} />
            </>
          )}
          {isEnded && (
            <span className="text-sm font-semibold text-muted">call ended</span>
          )}
          {!isLive && !isEnded && (
            <span className="text-sm text-muted">ready to start</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!isLive && !isEnded && (
            <button
              onClick={handleStart}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              start call
            </button>
          )}
          {isLive && (
            <button
              onClick={handleEndCall}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              end call
            </button>
          )}
          {isEnded && (
            <button
              onClick={() => router.push("/dashboard/calls")}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-muted transition hover:border-gray-400"
            >
              back to calls
            </button>
          )}
        </div>
      </div>

      {/* error */}
      {error && (
        <div className="absolute left-0 right-0 top-[57px] z-20 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* draggable panels */}
      <div className="pt-[57px] h-full">
        {/* transcript panel */}
        <DraggablePanel
          title="transcript"
          defaultX={24}
          defaultY={80}
          defaultW={480}
          defaultH={500}
        >
          <div className="px-4 py-3">
            {transcriptEntries.length === 0 ? (
              <p className="text-sm text-muted">
                {isLive ? "listening... start speaking." : "transcript will appear here."}
              </p>
            ) : (
              <div className="space-y-2">
                {transcriptEntries.map((entry) => (
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
                <div ref={transcriptBottomRef} />
              </div>
            )}
          </div>
        </DraggablePanel>

        {/* coaching panel */}
        <DraggablePanel
          title="coaching"
          badge={coachingCards.length}
          defaultX={528}
          defaultY={80}
          defaultW={420}
          defaultH={500}
        >
          <div className="px-4 py-3">
            {coachingCards.length === 0 ? (
              <p className="text-sm text-muted">
                coaching tips will appear here as gaps are detected...
              </p>
            ) : (
              <div className="space-y-2">
                {coachingCards.map((card, idx) => {
                  const style = CATEGORY_STYLES[card.category];
                  const time = new Date(card.timestamp);
                  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                  return (
                    <div key={`${card.timestamp}-${idx}`} className="flex justify-start">
                      <div className="max-w-[90%]">
                        <div className={`${style.bg} rounded-2xl rounded-bl-sm px-3 py-2 text-white shadow-sm`}>
                          <div className="mb-0.5 flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase opacity-80">{style.label}</span>
                            {card.monetaryEstimate && (
                              <span className="text-[10px] font-bold opacity-90">{card.monetaryEstimate}</span>
                            )}
                          </div>
                          <p className="text-sm leading-snug">{card.text}</p>
                        </div>
                        <p className="mt-0.5 px-1 text-[10px] text-muted">{timeStr}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={coachingBottomRef} />
              </div>
            )}
          </div>
        </DraggablePanel>

        {/* build preview panel */}
        <DraggablePanel
          title="build preview"
          defaultX={buildPanelX}
          defaultY={buildPanelY}
          defaultW={500}
          defaultH={600}
        >
          <BuildPreviewPanel
            ref={buildPreviewRef}
            pipelineRunId={pipelineRunId}
            isLive={isLive}
            initialPreviewUrl={initialPreviewUrl}
          />
        </DraggablePanel>
      </div>
    </div>
  );
}

function CallTimer({ startedAt }: { startedAt: Date | null }) {
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const mins = Math.floor(diff / 60).toString().padStart(2, "0");
      const secs = (diff % 60).toString().padStart(2, "0");
      setElapsed(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return <span className="font-mono text-sm text-muted">{elapsed}</span>;
}
