import { createEventQueue } from "@slushie/events";

export const listenerQueue = createEventQueue("listener");
export const analystQueue = createEventQueue("analyst");
export const builderQueue = createEventQueue("builder");
export const reviewerQueue = createEventQueue("reviewer");
export const postmortemQueue = createEventQueue("postmortem");
export const notificationQueue = createEventQueue("notification");
export const trackerQueue = createEventQueue("tracker");

export const PHASE_TIMEOUTS = {
  listener: 60 * 60 * 1000,      // 60 min (call duration + buffer)
  analyst: 15 * 60 * 1000,       // 15 min
  builder: 45 * 60 * 1000,       // 45 min
  reviewer: 10 * 60 * 1000,      // 10 min
  gapResolution: 60 * 60 * 1000, // 60 min per cycle
} as const;
