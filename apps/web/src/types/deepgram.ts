export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker: number;
  punctuated_word: string;
}

export interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}

export interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

export interface DeepgramTranscriptResponse {
  type: "Results";
  channel_index: [number, number];
  duration: number;
  start: number;
  is_final: boolean;
  speech_final: boolean;
  channel: DeepgramChannel;
  metadata: {
    request_id: string;
    model_info: {
      name: string;
      version: string;
      arch: string;
    };
  };
}

export interface DeepgramErrorResponse {
  type: "Error";
  description: string;
  message: string;
  variant: string;
}

export type DeepgramResponse = DeepgramTranscriptResponse | DeepgramErrorResponse;

export interface TranscriptChunk {
  text: string;
  speaker: "team" | "client";
  isFinal: boolean;
  chunkIndex: number;
  timestamp: number;
}
