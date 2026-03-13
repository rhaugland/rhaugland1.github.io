import WebSocket from "ws";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen";

export interface DeepgramStreamOptions {
  encoding: "linear16";
  sampleRate: number;
  channels: number;
  model: "nova-2";
  punctuate: boolean;
  diarize: boolean;
  interimResults: boolean;
  utteranceEndMs: number;
  smartFormat: boolean;
}

const DEFAULT_OPTIONS: DeepgramStreamOptions = {
  encoding: "linear16",
  sampleRate: 16000,
  channels: 1,
  model: "nova-2",
  punctuate: true,
  diarize: true,
  interimResults: true,
  utteranceEndMs: 1000,
  smartFormat: true,
};

export function createDeepgramWebSocket(
  options: Partial<DeepgramStreamOptions> = {}
): WebSocket {
  if (!DEEPGRAM_API_KEY) {
    throw new Error("DEEPGRAM_API_KEY is not set in environment");
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  const params = new URLSearchParams({
    encoding: opts.encoding,
    sample_rate: opts.sampleRate.toString(),
    channels: opts.channels.toString(),
    model: opts.model,
    punctuate: opts.punctuate.toString(),
    diarize: opts.diarize.toString(),
    interim_results: opts.interimResults.toString(),
    utterance_end_ms: opts.utteranceEndMs.toString(),
    smart_format: opts.smartFormat.toString(),
  });

  const url = `${DEEPGRAM_WS_URL}?${params.toString()}`;

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
    },
  });

  return ws;
}

export function mapSpeakerLabel(speakerIndex: number): "team" | "client" {
  return speakerIndex === 0 ? "team" : "client";
}
