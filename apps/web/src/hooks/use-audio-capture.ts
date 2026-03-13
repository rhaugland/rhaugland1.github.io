"use client";

import { useCallback, useRef, useState } from "react";

interface UseAudioCaptureOptions {
  wsUrl: string;
  onMessage: (data: unknown) => void;
  onError: (error: string) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

export function useAudioCapture({
  wsUrl,
  onMessage,
  onError,
  onConnected,
  onDisconnected,
}: UseAudioCaptureOptions) {
  const [isCapturing, setIsCapturing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);

  const start = useCallback(async () => {
    try {
      // request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      // create audio context for pcm conversion
      const audioContext = new AudioContext({ sampleRate: 16000 });
      contextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // use script processor to get raw pcm data
      // buffer size 4096 at 16khz = ~256ms chunks
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // connect to websocket
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        onConnected();
        setIsCapturing(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch {
          // binary or non-json message — ignore
        }
      };

      ws.onerror = () => {
        onError("websocket connection error");
      };

      ws.onclose = () => {
        setIsCapturing(false);
        onDisconnected();
      };

      // process audio and send as 16-bit pcm
      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // convert float32 to int16 pcm
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        ws.send(pcmData.buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "failed to start audio capture";
      onError(message);
    }
  }, [wsUrl, onMessage, onError, onConnected, onDisconnected]);

  const stop = useCallback(() => {
    // send end message to server
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end" }));
    }

    // clean up audio
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (contextRef.current) {
      contextRef.current.close();
      contextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // close websocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsCapturing(false);
  }, []);

  return { isCapturing, start, stop };
}
