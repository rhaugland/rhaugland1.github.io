"use client";

import { useCallback, useRef, useState } from "react";

interface UseMediaCaptureOptions {
  onTranscript: (data: {
    text: string;
    speaker: "team" | "client";
    isFinal: boolean;
    chunkIndex: number;
  }) => void;
  onError: (error: string) => void;
  onConnected: () => void;
}

interface UseMediaCaptureReturn {
  isCapturing: boolean;
  start: () => void;
  stop: () => void;
}

export function useMediaCapture({
  onTranscript,
  onError,
  onConnected,
}: UseMediaCaptureOptions): UseMediaCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const chunkIndexRef = useRef(0);
  const capturingRef = useRef(false);

  const start = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError("browser speech recognition not supported — use Chrome");
      return;
    }

    chunkIndexRef.current = 0;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (!text.trim()) continue;

        onTranscript({
          text,
          speaker: "team",
          isFinal: result.isFinal,
          chunkIndex: result.isFinal
            ? chunkIndexRef.current++
            : chunkIndexRef.current,
        });
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.warn("speech recognition error:", event.error);
    };

    recognition.onend = () => {
      if (capturingRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    capturingRef.current = true;
    setIsCapturing(true);
    onConnected();
  }, [onTranscript, onError, onConnected]);

  const stop = useCallback(() => {
    capturingRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    setIsCapturing(false);
  }, []);

  return { isCapturing, start, stop };
}
