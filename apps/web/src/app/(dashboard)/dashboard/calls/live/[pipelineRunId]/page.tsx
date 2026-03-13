"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CallHeader } from "@/components/call/call-header";
import { TranscriptPanel } from "@/components/call/transcript-panel";
import { CoachingPanel } from "@/components/call/coaching-panel";
import { useAudioCapture } from "@/hooks/use-audio-capture";
import { useSSE } from "@/hooks/use-sse";

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

export default function LiveCallPage() {
  const params = useParams<{ pipelineRunId: string }>();
  const pipelineRunId = params.pipelineRunId;

  const [isLive, setIsLive] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [clientName] = useState("client");
  const [callId] = useState<string | null>(null);
  const [startedAt] = useState(new Date());
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>(
    []
  );
  const [coachingCards, setCoachingCards] = useState<CoachingCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  // determine websocket url
  const wsUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/audio?pipelineRunId=${pipelineRunId}`
      : "";

  // handle incoming websocket messages (transcript chunks from deepgram proxy)
  const handleWsMessage = useCallback((data: unknown) => {
    const msg = data as {
      type: string;
      data?: Record<string, unknown>;
    };

    if (msg.type === "transcript.chunk" && msg.data) {
      const entry: TranscriptEntry = {
        text: msg.data.text as string,
        speaker: msg.data.speaker as "team" | "client",
        isFinal: msg.data.isFinal as boolean,
        chunkIndex: msg.data.chunkIndex as number,
        timestamp: Date.now(),
      };

      setTranscriptEntries((prev) => {
        // replace interim with final for the same chunk index
        if (entry.isFinal) {
          const filtered = prev.filter(
            (e) => !(e.chunkIndex === entry.chunkIndex && !e.isFinal)
          );
          return [...filtered, entry];
        }
        // for interim results, replace previous interim with same chunk index
        const filtered = prev.filter(
          (e) =>
            !(e.chunkIndex === entry.chunkIndex && !e.isFinal)
        );
        return [...filtered, entry];
      });
    }

    if (msg.type === "fallback") {
      setIsFallback(true);
    }

    if (msg.type === "connected") {
      setIsFallback(false);
    }
  }, []);

  // handle incoming SSE events (coaching suggestions from worker)
  const handleSSEEvent = useCallback((data: unknown) => {
    const event = data as {
      type: string;
      data?: Record<string, unknown>;
    };

    if (event.type === "coaching.suggestion" && event.data) {
      const card: CoachingCard = {
        category: event.data.category as CoachingCard["category"],
        text: event.data.text as string,
        monetaryEstimate: event.data.monetaryEstimate as string | undefined,
        timestamp: Date.now(),
      };
      setCoachingCards((prev) => [...prev, card]);
    }
  }, []);

  // audio capture hook
  const {
    isCapturing,
    start: startCapture,
    stop: stopCapture,
  } = useAudioCapture({
    wsUrl,
    onMessage: handleWsMessage,
    onError: (err) => setError(err),
    onConnected: () => {
      setIsLive(true);
      setError(null);
    },
    onDisconnected: () => {
      setIsLive(false);
    },
  });

  // sse hook for coaching events
  useSSE({
    url: `/api/events/${pipelineRunId}`,
    enabled: isLive,
    onEvent: handleSSEEvent,
    onError: (err) => console.warn("sse error:", err),
  });

  // start audio capture and coaching on mount
  useEffect(() => {
    if (pipelineRunId && !isCapturing) {
      startCapture();

      // start coaching scheduler via api
      fetch("/api/calls/coaching/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipelineRunId,
          callId: callId ?? pipelineRunId,
          clientIndustry: "unknown",
        }),
      }).catch((err) =>
        console.error("failed to start coaching:", err)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineRunId]);

  // end call handler
  const handleEndCall = useCallback(async () => {
    stopCapture();

    // build final transcript text
    const finalTranscript = transcriptEntries
      .filter((e) => e.isFinal)
      .map((e) => `[${e.speaker}]: ${e.text}`)
      .join("\n");

    try {
      // stop coaching
      await fetch("/api/calls/coaching/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineRunId }),
      });

      // end the call
      await fetch("/api/calls/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId: callId ?? pipelineRunId,
          pipelineRunId,
          transcript: finalTranscript,
        }),
      });
    } catch (err) {
      console.error("failed to end call:", err);
    }

    setIsLive(false);
  }, [stopCapture, transcriptEntries, pipelineRunId, callId]);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* top bar */}
      <CallHeader
        clientName={clientName}
        isLive={isLive}
        startedAt={startedAt}
        onEndCall={handleEndCall}
        isFallback={isFallback}
      />

      {/* error banner */}
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* split view: transcript left, coaching right */}
      <div className="flex flex-1 overflow-hidden">
        {/* left panel — transcript */}
        <div className="w-1/2 border-r border-gray-200 bg-white">
          <TranscriptPanel entries={transcriptEntries} />
        </div>

        {/* right panel — coaching cards */}
        <div className="w-1/2 bg-gray-50">
          <CoachingPanel cards={coachingCards} />
        </div>
      </div>
    </div>
  );
}
