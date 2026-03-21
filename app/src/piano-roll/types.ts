/**
 * Piano Roll — Type definitions
 *
 * Core types for the MIDI note editor.
 */

// ---------------------------------------------------------------------------
// Note
// ---------------------------------------------------------------------------

/** A single MIDI note in the piano roll. */
export interface Note {
  id: string;
  /** MIDI pitch number (0–127). Middle C = 60. */
  pitch: number;
  /** Start position in beats (quarter notes). */
  start: number;
  /** Duration in beats (quarter notes). */
  duration: number;
  /** Note velocity (0–127). */
  velocity: number;
  /** Optional MIDI channel (0–15). Defaults to 0. */
  channel?: number;
}

// ---------------------------------------------------------------------------
// Snap / Quantize
// ---------------------------------------------------------------------------

/** Snap grid divisions. The numeric value is the fraction of a beat. */
export type SnapValue =
  | "1/1"   // whole note (4 beats)
  | "1/2"   // half note (2 beats)
  | "1/4"   // quarter note (1 beat)
  | "1/8"   // eighth note (0.5 beats)
  | "1/16"  // sixteenth note (0.25 beats)
  | "1/32"  // thirty-second note (0.125 beats)
  | "1/4T"  // quarter triplet
  | "1/8T"  // eighth triplet
  | "1/16T" // sixteenth triplet
  | "1/32T"; // thirty-second triplet

/** Convert a SnapValue to its beat duration. */
export function snapValueToBeats(snap: SnapValue): number {
  switch (snap) {
    case "1/1":
      return 4;
    case "1/2":
      return 2;
    case "1/4":
      return 1;
    case "1/8":
      return 0.5;
    case "1/16":
      return 0.25;
    case "1/32":
      return 0.125;
    case "1/4T":
      return 4 / 3;
    case "1/8T":
      return 2 / 3;
    case "1/16T":
      return 1 / 3;
    case "1/32T":
      return 1 / 6;
  }
}

/** Snap a beat position to the nearest grid line. */
export function snapToGrid(beat: number, snap: SnapValue): number {
  const gridSize = snapValueToBeats(snap);
  return Math.round(beat / gridSize) * gridSize;
}

/** Snap a beat position to the nearest grid line (floor only — for note starts). */
export function snapToGridFloor(beat: number, snap: SnapValue): number {
  const gridSize = snapValueToBeats(snap);
  return Math.floor(beat / gridSize) * gridSize;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/** The currently active editing tool. */
export type Tool = "select" | "draw" | "erase";

// ---------------------------------------------------------------------------
// Selection rectangle (rubber-band)
// ---------------------------------------------------------------------------

/** Rectangle used for rubber-band selection (in beat/pitch space). */
export interface SelectionRect {
  startBeat: number;
  endBeat: number;
  startPitch: number;
  endPitch: number;
}

// ---------------------------------------------------------------------------
// Piano helpers
// ---------------------------------------------------------------------------

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/**
 * Convert a MIDI pitch number to a human-readable note name.
 * Uses the convention where MIDI 60 = C4 (middle C).
 * MIDI 0 = C-1, MIDI 127 = G9.
 */
export function midiPitchToName(pitch: number): string {
  const noteName = NOTE_NAMES[pitch % 12];
  const octave = Math.floor(pitch / 12) - 1;
  return `${noteName}${octave}`;
}

/**
 * Return true if the given MIDI pitch is a black key.
 */
export function isBlackKey(pitch: number): boolean {
  const note = pitch % 12;
  // C#, D#, F#, G#, A# = indices 1, 3, 6, 8, 10
  return note === 1 || note === 3 || note === 6 || note === 8 || note === 10;
}

/**
 * Map velocity (0–127) to an HSL color string.
 * Low velocity = cool (blue), high velocity = warm (red/orange).
 */
export function velocityToColor(velocity: number): string {
  // Clamp 0-127
  const v = Math.max(0, Math.min(127, velocity));
  // Map to hue: 240 (blue) down to 0 (red)
  const hue = Math.round(240 - (v / 127) * 240);
  const saturation = 70;
  const lightness = 50;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
