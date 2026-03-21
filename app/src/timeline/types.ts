/**
 * Timeline module — Type definitions
 *
 * All types used by the timeline/arrangement view. These are UI-local types
 * that complement the document-model TimelineData type.
 */

// ---------------------------------------------------------------------------
// Clip types
// ---------------------------------------------------------------------------

/** The kind of content a clip represents. */
export type ClipKind = "audio" | "midi" | "automation" | "trigger";

/** A clip placed on a lane in the timeline. */
export interface Clip {
  id: string;
  /** The lane this clip belongs to. */
  laneId: string;
  /** Start position in beats (quarter notes from the beginning). */
  startBeat: number;
  /** Duration in beats (quarter notes). */
  durationBeats: number;
  /** What type of content this clip holds. */
  kind: ClipKind;
  /** Display name. */
  name: string;
  /** Display color (CSS color string). */
  color: string;
  /** Whether the clip is muted. */
  muted: boolean;
}

// ---------------------------------------------------------------------------
// Lane types
// ---------------------------------------------------------------------------

/** A lane (horizontal track row) in the timeline. */
export interface Lane {
  id: string;
  /** Display name. */
  name: string;
  /** Optional reference to a canvas node. */
  nodeId?: string;
  /** Height in pixels. */
  height: number;
  /** Whether the lane is muted. */
  muted: boolean;
  /** Whether the lane is soloed. */
  solo: boolean;
  /** Whether the lane is armed for recording. */
  armed: boolean;
  /** Color accent for the lane header. */
  color: string;
}

// ---------------------------------------------------------------------------
// Snap settings
// ---------------------------------------------------------------------------

/** Grid snap resolution in beats. */
export type SnapResolution =
  | 0.0625  // 1/64 note
  | 0.125   // 1/32 note
  | 0.25    // 1/16 note
  | 0.5     // 1/8 note
  | 1       // 1/4 note (beat)
  | 2       // 1/2 note
  | 4;      // whole note (bar in 4/4)

export interface SnapSettings {
  enabled: boolean;
  resolution: SnapResolution;
}

// ---------------------------------------------------------------------------
// Loop region
// ---------------------------------------------------------------------------

/** A loop region defined by start and end beats. */
export interface LoopRegion {
  startBeat: number;
  endBeat: number;
}

// ---------------------------------------------------------------------------
// Visible range
// ---------------------------------------------------------------------------

/** The visible beat range in the viewport. */
export interface VisibleRange {
  startBeat: number;
  endBeat: number;
}

// ---------------------------------------------------------------------------
// Time display mode
// ---------------------------------------------------------------------------

export type TimeDisplayMode = "bars" | "seconds";

// ---------------------------------------------------------------------------
// Default colors for lanes
// ---------------------------------------------------------------------------

export const LANE_COLORS = [
  "#f97316", // orange
  "#3b82f6", // blue
  "#a855f7", // purple
  "#22c55e", // green
  "#ef4444", // red
  "#eab308", // yellow
  "#06b6d4", // cyan
  "#ec4899", // pink
];

export const DEFAULT_LANE_HEIGHT = 80;
export const MIN_ZOOM = 2;    // pixels per beat at minimum zoom
export const MAX_ZOOM = 200;  // pixels per beat at maximum zoom
export const DEFAULT_ZOOM = 40; // pixels per beat
export const DEFAULT_TEMPO = 120;
