/**
 * Timeline module — public exports
 */

export { Timeline } from "./Timeline.js";
export { TimeRuler } from "./TimeRuler.js";
export { LaneComponent } from "./Lane.js";
export { ClipComponent } from "./Clip.js";
export {
  useTimelineStore,
  snapToGrid,
  beatToPixel,
  pixelToBeat,
  beatsToBarBeat,
  beatsToSeconds,
  secondsToBeats,
} from "./store.js";
export type { TimelineStore } from "./store.js";
export type {
  Clip,
  ClipKind,
  Lane,
  SnapSettings,
  SnapResolution,
  LoopRegion,
  VisibleRange,
  TimeDisplayMode,
} from "./types.js";
