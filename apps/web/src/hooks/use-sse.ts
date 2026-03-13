"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface UseSSEOptions {
  url: string;
  enabled: boolean;
  onEvent: (event: unknown) => void;
  onError?: (error: string) => void;
}

export function useSSE({ url, enabled, onEvent, onError }: UseSSEOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);

  // keep callbacks fresh without triggering reconnect
  onEventRef.current = onEvent;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled) {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const source = new EventSource(url);
    sourceRef.current = source;

    source.addEventListener("connected", () => {
      setIsConnected(true);
    });

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEventRef.current(data);
      } catch {
        // ignore non-json messages (keepalives, etc.)
      }
    };

    source.onerror = () => {
      setIsConnected(false);
      onErrorRef.current?.("sse connection error — reconnecting...");
      // EventSource auto-reconnects by default
    };

    return () => {
      source.close();
      sourceRef.current = null;
      setIsConnected(false);
    };
  }, [url, enabled]);

  const disconnect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return { isConnected, disconnect };
}
