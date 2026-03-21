/**
 * Notation Module — Type definitions
 *
 * Types for music notation display, staff rendering, and MusicXML export.
 */

// ---------------------------------------------------------------------------
// Clef
// ---------------------------------------------------------------------------

/** Supported clef types. */
export type Clef = "treble" | "bass" | "grand";

// ---------------------------------------------------------------------------
// Key Signature
// ---------------------------------------------------------------------------

/**
 * Key signature representation.
 * `sharps` > 0 means N sharps; `sharps` < 0 means |N| flats; 0 = C major / A minor.
 * Range: -7 (Cb major) to +7 (C# major).
 */
export interface KeySignature {
  /** Positive = sharps, negative = flats, 0 = no accidentals. */
  fifths: number;
}

/** Well-known key signatures. */
export const KEY_SIGNATURES: Record<string, KeySignature> = {
  "C major":  { fifths: 0 },
  "G major":  { fifths: 1 },
  "D major":  { fifths: 2 },
  "A major":  { fifths: 3 },
  "E major":  { fifths: 4 },
  "B major":  { fifths: 5 },
  "F# major": { fifths: 6 },
  "C# major": { fifths: 7 },
  "F major":  { fifths: -1 },
  "Bb major": { fifths: -2 },
  "Eb major": { fifths: -3 },
  "Ab major": { fifths: -4 },
  "Db major": { fifths: -5 },
  "Gb major": { fifths: -6 },
  "Cb major": { fifths: -7 },
};

// ---------------------------------------------------------------------------
// Time Signature
// ---------------------------------------------------------------------------

/** Time signature (e.g. 4/4, 3/4, 6/8). */
export interface TimeSignature {
  /** Beats per measure. */
  beats: number;
  /** Beat unit (4 = quarter note, 8 = eighth note, etc.). */
  beatType: number;
}

// ---------------------------------------------------------------------------
// Note Type (duration names)
// ---------------------------------------------------------------------------

/** Standard note duration types used in notation. */
export type NoteType =
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "16th"
  | "32nd";

/** A note duration with optional dot. */
export interface NoteDuration {
  type: NoteType;
  dots: number;
}

// ---------------------------------------------------------------------------
// Accidental
// ---------------------------------------------------------------------------

/** Accidental types. */
export type Accidental = "sharp" | "flat" | "natural" | "none";

// ---------------------------------------------------------------------------
// Staff position
// ---------------------------------------------------------------------------

/**
 * Vertical position on a staff, measured in half-steps from the bottom
 * staff line. Positive = up, negative = below bottom line.
 */
export interface StaffPosition {
  /** Line/space position (0 = bottom line, 1 = first space, etc.). */
  line: number;
  /** Whether ledger lines are needed. */
  ledgerLines: number;
  /** Ledger line direction: above or below the staff. */
  ledgerDirection: "above" | "below" | "none";
}

// ---------------------------------------------------------------------------
// Measure
// ---------------------------------------------------------------------------

/** A note placed within a measure (for notation). */
export interface MeasureNote {
  /** Original note ID from the piano roll. */
  id: string;
  /** MIDI pitch. */
  pitch: number;
  /** Position within the measure in beats. */
  beatInMeasure: number;
  /** Duration in beats. */
  duration: number;
  /** Velocity. */
  velocity: number;
}

/** A single measure of music. */
export interface Measure {
  /** Measure number (1-based). */
  number: number;
  /** Notes in this measure. */
  notes: MeasureNote[];
  /** Time signature for this measure. */
  timeSignature: TimeSignature;
}

// ---------------------------------------------------------------------------
// MusicXML export options
// ---------------------------------------------------------------------------

/** Options for MusicXML export. */
export interface MusicXMLExportOptions {
  /** Title of the piece. */
  title?: string;
  /** Composer name. */
  composer?: string;
  /** Clef to use. */
  clef?: Clef;
  /** Key signature. */
  keySignature?: KeySignature;
  /** Time signature. */
  timeSignature?: TimeSignature;
  /** Divisions per quarter note (default: 4). */
  divisions?: number;
}
