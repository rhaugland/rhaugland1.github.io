export type EventType =
  | "transcript.chunk"
  | "coaching.suggestion"
  | "call.ended"
  | "analysis.complete"
  | "build.spec.ready"
  | "build.design.question"
  | "build.design.answer"
  | "prototype.ready"
  | "prototype.progress"
  | "review.complete"
  | "build.spec.updated"
  | "prototype.patched"
  | "resolution.complete"
  | "final.review.complete"
  | "internal.preview.ready"
  | "team.approved"
  | "client.notified"
  | "tracker.update"
  | "tracker.complete"
  | "postmortem.complete"
  | "skills.updated"
  | "build.message"
  | "build.paused"
  | "build.resumed"
  | "analyst.incremental"
  | "gap.meeting.complete";

export interface BaseEvent {
  type: EventType;
  pipelineRunId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface TranscriptChunkEvent extends BaseEvent {
  type: "transcript.chunk";
  data: {
    text: string;
    speaker: "team" | "client";
    isFinal: boolean;
    chunkIndex: number;
  };
}

export interface CoachingSuggestionEvent extends BaseEvent {
  type: "coaching.suggestion";
  data: {
    category: "dig_deeper" | "gap_spotted" | "suggested";
    text: string;
    relatedTranscriptIndex?: number;
    monetaryEstimate?: string;
  };
}

export interface CallEndedEvent extends BaseEvent {
  type: "call.ended";
  data: {
    callId: string;
    clientId: string;
    duration: number;
  };
}

export interface AnalysisCompleteEvent extends BaseEvent {
  type: "analysis.complete";
  data: {
    analysisId: string;
    gapCount: number;
    totalMonetaryImpact: string;
  };
}

export interface BuildSpecReadyEvent extends BaseEvent {
  type: "build.spec.ready";
  data: {
    buildSpecId: string;
    version: number;
    pageCount: number;
  };
}

export interface BuildDesignQuestionEvent extends BaseEvent {
  type: "build.design.question";
  data: {
    question: string;
    context: string;
    roundNumber: number;
  };
}

export interface BuildDesignAnswerEvent extends BaseEvent {
  type: "build.design.answer";
  data: {
    answer: string;
    roundNumber: number;
  };
}

export interface PrototypeReadyEvent extends BaseEvent {
  type: "prototype.ready";
  data: {
    prototypeId: string;
    version: number;
    previewUrl: string;
  };
}

export interface ReviewCompleteEvent extends BaseEvent {
  type: "review.complete";
  data: {
    gapReportId: string;
    version: number;
    coverageScore: number;
    gapCount: number;
  };
}

export interface TrackerUpdateEvent extends BaseEvent {
  type: "tracker.update";
  data: {
    step: number;
    label: string;
    subtitle: string;
  };
}

export interface ClientNotifiedEvent extends BaseEvent {
  type: "client.notified";
  data: {
    clientName: string;
    trackerUrl: string;
    prototypeUrl?: string;
    message: string;
  };
}

export interface PrototypeProgressEvent extends BaseEvent {
  type: "prototype.progress";
  data: {
    prototypeId: string;
    version: number;
    phase: string;
    percentComplete: number;
  };
}

export interface BuildSpecUpdatedEvent extends BaseEvent {
  type: "build.spec.updated";
  data: {
    buildSpecId: string;
    version: number;
    changesFromGapReport: string;
  };
}

export interface PrototypePatchedEvent extends BaseEvent {
  type: "prototype.patched";
  data: {
    prototypeId: string;
    version: number;
    patchSummary: string;
  };
}

export interface ResolutionCompleteEvent extends BaseEvent {
  type: "resolution.complete";
  data: {
    cyclesCompleted: number;
    finalPrototypeVersion: number;
  };
}

export interface FinalReviewCompleteEvent extends BaseEvent {
  type: "final.review.complete";
  data: {
    gapReportId: string;
    coverageScore: number;
    unresolvedGapCount: number;
  };
}

export interface InternalPreviewReadyEvent extends BaseEvent {
  type: "internal.preview.ready";
  data: {
    prototypeUrl: string;
    gapReportId: string;
  };
}

export interface TeamApprovedEvent extends BaseEvent {
  type: "team.approved";
  data: {
    approvedBy: string;
    prototypeVersion: number;
  };
}

export interface TrackerCompleteEvent extends BaseEvent {
  type: "tracker.complete";
  data: {
    trackerId: string;
    slug: string;
  };
}

export interface PostmortemCompleteEvent extends BaseEvent {
  type: "postmortem.complete";
  data: {
    postmortemId: string;
    agentScores: Record<string, number>;
  };
}

export interface SkillsUpdatedEvent extends BaseEvent {
  type: "skills.updated";
  data: {
    updatedAgents: string[];
    postmortemId: string;
  };
}

export interface BuildMessageEvent extends BaseEvent {
  type: "build.message";
  data: {
    text: string;
    sentBy: string;
  };
}

export interface BuildPausedEvent extends BaseEvent {
  type: "build.paused";
  data: {
    pausedBy: string;
  };
}

export interface BuildResumedEvent extends BaseEvent {
  type: "build.resumed";
  data: {
    resumedBy: string;
  };
}

export interface AnalystIncrementalEvent extends BaseEvent {
  type: "analyst.incremental";
  data: {
    transcript: string;
    pipelineRunId: string;
  };
}

export interface GapMeetingCompleteEvent extends BaseEvent {
  type: "gap.meeting.complete";
  data: {
    prototypeId: string;
    version: number;
    meetingNotes: string | null;
  };
}

export type SlushieEvent =
  | TranscriptChunkEvent
  | CoachingSuggestionEvent
  | CallEndedEvent
  | AnalysisCompleteEvent
  | BuildSpecReadyEvent
  | BuildDesignQuestionEvent
  | BuildDesignAnswerEvent
  | PrototypeReadyEvent
  | PrototypeProgressEvent
  | ReviewCompleteEvent
  | BuildSpecUpdatedEvent
  | PrototypePatchedEvent
  | ResolutionCompleteEvent
  | FinalReviewCompleteEvent
  | InternalPreviewReadyEvent
  | TeamApprovedEvent
  | TrackerUpdateEvent
  | TrackerCompleteEvent
  | ClientNotifiedEvent
  | PostmortemCompleteEvent
  | SkillsUpdatedEvent
  | BuildMessageEvent
  | BuildPausedEvent
  | BuildResumedEvent
  | AnalystIncrementalEvent
  | GapMeetingCompleteEvent;
