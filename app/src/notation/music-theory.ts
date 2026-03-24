/**
 * Notation Module — Music Theory Utilities
 *
 * Pure functions for converting between MIDI data and standard notation concepts.
 */

import type { Note } from "../piano-roll/types";
import type {
  KeySignature,
  TimeSignature,
  NoteType,
  NoteDuration,
  StaffPosition,
  Accidental,
  Measure,
  MeasureNote,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Note names using sharps. */
const NOTE_NAMES_SHARP = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

/** Note names using flats. */
const NOTE_NAMES_FLAT = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
] as const;

/**
 * The "white key" pitch classes: C=0, D=2, E=4, F=5, G=7, A=9, B=11.
 * These are the natural notes (no sharps/flats).
 */
const NATURAL_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);

/**
 * Order of sharps in key signatures: F, C, G, D, A, E, B
 * These are pitch classes: F=5, C=0, G=7, D=2, A=9, E=4, B=11
 */
const SHARP_ORDER = [5, 0, 7, 2, 9, 4, 11];

/**
 * Order of flats in key signatures: B, E, A, D, G, C, F
 * These are pitch classes: B=11, E=4, A=9, D=2, G=7, C=0, F=5
 */
const FLAT_ORDER = [11, 4, 9, 2, 7, 0, 5];

/**
 * Diatonic step positions (semitones from C) mapped to staff positions
 * (number of diatonic steps from C).
 * C=0, D=1, E=2, F=3, G=4, A=5, B=6
 */
const PITCH_CLASS_TO_DIATONIC: Record<number, number> = {
  0: 0, // C
  2: 1, // D
  4: 2, // E
  5: 3, // F
  7: 4, // G
  9: 5, // A
  11: 6, // B
};

/**
 * For chromatic pitches (sharps/flats), map to nearest diatonic step below.
 * C#/Db -> C(0), D#/Eb -> D(1), F#/Gb -> F(3), G#/Ab -> G(4), A#/Bb -> A(5)
 */
const CHROMATIC_TO_DIATONIC_BELOW: Record<number, number> = {
  1: 0,  // C#/Db -> C
  3: 1,  // D#/Eb -> D
  6: 3,  // F#/Gb -> F
  8: 4,  // G#/Ab -> G
  10: 5, // A#/Bb -> A
};

// ---------------------------------------------------------------------------
// midiToNoteName
// ---------------------------------------------------------------------------

/**
 * Convert a MIDI pitch number to a note name with octave.
 * MIDI 60 = C4 (middle C), MIDI 69 = A4, MIDI 0 = C-1, MIDI 127 = G9.
 *
 * @param pitch - MIDI pitch number (0-127)
 * @param useFlats - If true, use flat names instead of sharp names
 * @returns Note name string (e.g. "C4", "D#5", "Bb3")
 */
export function midiToNoteName(pitch: number, useFlats = false): string {
  const pitchClass = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;
  const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  return `${names[pitchClass]}${octave}`;
}

// ---------------------------------------------------------------------------
// durationToNoteType
// ---------------------------------------------------------------------------

/**
 * Convert a beat duration (in quarter-note beats) to a notation note type.
 * Supports dotted notes.
 *
 * @param beats - Duration in quarter-note beats
 * @returns NoteDuration with type and dot count, or null if no exact match
 */
export function durationToNoteType(beats: number): NoteDuration {
  // Standard durations in beats (quarter note = 1 beat)
  const standardDurations: [number, NoteType][] = [
    [4, "whole"],
    [2, "half"],
    [1, "quarter"],
    [0.5, "eighth"],
    [0.25, "16th"],
    [0.125, "32nd"],
  ];

  // Check exact match
  for (const [dur, type] of standardDurations) {
    if (Math.abs(beats - dur) < 0.001) {
      return { type, dots: 0 };
    }
  }

  // Check single-dotted (1.5x)
  for (const [dur, type] of standardDurations) {
    const dotted = dur * 1.5;
    if (Math.abs(beats - dotted) < 0.001) {
      return { type, dots: 1 };
    }
  }

  // Check double-dotted (1.75x)
  for (const [dur, type] of standardDurations) {
    const doubleDotted = dur * 1.75;
    if (Math.abs(beats - doubleDotted) < 0.001) {
      return { type, dots: 2 };
    }
  }

  // Fallback: find the closest smaller standard duration
  for (const [dur, type] of standardDurations) {
    if (beats >= dur) {
      return { type, dots: 0 };
    }
  }

  return { type: "32nd", dots: 0 };
}

// ---------------------------------------------------------------------------
// pitchToStaffPosition
// ---------------------------------------------------------------------------

/**
 * Calculate the vertical staff position for a given MIDI pitch.
 *
 * Treble clef: bottom line = E4 (MIDI 64), top line = F5 (MIDI 77).
 * Bass clef: bottom line = G2 (MIDI 43), top line = A3 (MIDI 57).
 *
 * Position 0 = bottom staff line, each increment = one staff space/line.
 * 5 lines = positions 0, 2, 4, 6, 8 (even = line, odd = space).
 *
 * @param pitch - MIDI pitch number
 * @param clef - "treble" or "bass"
 * @returns StaffPosition with line position and ledger line info
 */
export function pitchToStaffPosition(
  pitch: number,
  clef: "treble" | "bass",
): StaffPosition {
  // Reference pitches for the bottom line of each clef
  // Treble: bottom line = E4 (MIDI 64)
  // Bass:   bottom line = G2 (MIDI 43)
  // bottomLinePitch: treble = E4 (MIDI 64), bass = G2 (MIDI 43)
  const bottomLineNote = clef === "treble" ? 2 : 4; // E=2 diatonic, G=4 diatonic
  const bottomLineOctave = clef === "treble" ? 4 : 2;

  // Calculate the diatonic position of the pitch
  const pitchClass = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;

  // Get diatonic step (0-6, C through B)
  let diatonicStep: number;
  if (NATURAL_PITCH_CLASSES.has(pitchClass)) {
    diatonicStep = PITCH_CLASS_TO_DIATONIC[pitchClass];
  } else {
    // For accidentals, use the note below (sharp interpretation)
    diatonicStep = CHROMATIC_TO_DIATONIC_BELOW[pitchClass];
  }

  // Calculate position relative to bottom line
  const octaveDiff = octave - bottomLineOctave;
  const stepDiff = diatonicStep - bottomLineNote;
  const line = octaveDiff * 7 + stepDiff;

  // Calculate ledger lines
  let ledgerLines = 0;
  let ledgerDirection: "above" | "below" | "none" = "none";

  if (line < 0) {
    // Below the staff — ledger lines needed for every other position below 0
    ledgerLines = Math.ceil(Math.abs(line) / 2);
    ledgerDirection = "below";
  } else if (line > 8) {
    // Above the staff — ledger lines for every other position above 8
    ledgerLines = Math.ceil((line - 8) / 2);
    ledgerDirection = "above";
  }

  return { line, ledgerLines, ledgerDirection };
}

// ---------------------------------------------------------------------------
// needsAccidental
// ---------------------------------------------------------------------------

/**
 * Determine if a pitch needs an accidental marking given the key signature.
 *
 * @param pitch - MIDI pitch number
 * @param keySignature - Current key signature
 * @returns The accidental type needed, or "none"
 */
export function needsAccidental(
  pitch: number,
  keySignature: KeySignature,
): Accidental {
  const pitchClass = ((pitch % 12) + 12) % 12;

  // Build the set of altered pitch classes from the key signature
  const alteredPitches = new Set<number>();
  if (keySignature.fifths > 0) {
    // Sharps
    for (let i = 0; i < Math.min(keySignature.fifths, 7); i++) {
      alteredPitches.add(SHARP_ORDER[i]);
    }
  } else if (keySignature.fifths < 0) {
    // Flats
    for (let i = 0; i < Math.min(Math.abs(keySignature.fifths), 7); i++) {
      alteredPitches.add(FLAT_ORDER[i]);
    }
  }

  // Check if this pitch class is natural
  const isNatural = NATURAL_PITCH_CLASSES.has(pitchClass);

  if (keySignature.fifths > 0) {
    // Key has sharps
    if (!isNatural) {
      // Chromatic note — is it one of the key's sharps?
      // The sharp raises the natural by 1 semitone
      const naturalBelow = pitchClass - 1;
      if (alteredPitches.has(naturalBelow)) {
        // This sharp is "in key", no accidental needed
        return "none";
      }
      // Not in key — needs a sharp
      return "sharp";
    } else {
      // Natural note — but is it normally sharped in this key?
      if (alteredPitches.has(pitchClass)) {
        // This note is normally sharped, but we're playing the natural — needs a natural sign
        return "natural";
      }
      return "none";
    }
  } else if (keySignature.fifths < 0) {
    // Key has flats
    if (!isNatural) {
      // Chromatic note — is it one of the key's flats?
      // The flat lowers the natural by 1 semitone
      const naturalAbove = pitchClass + 1;
      if (alteredPitches.has(naturalAbove)) {
        // This flat is "in key", no accidental needed
        return "none";
      }
      // Not in key — needs a flat
      return "flat";
    } else {
      // Natural note — but is it normally flatted in this key?
      if (alteredPitches.has(pitchClass)) {
        // This note is normally flatted, but we're playing the natural — needs a natural sign
        return "natural";
      }
      return "none";
    }
  } else {
    // C major / A minor — no key signature accidentals
    if (!isNatural) {
      return "sharp";
    }
    return "none";
  }
}

// ---------------------------------------------------------------------------
// beatsToMeasures
// ---------------------------------------------------------------------------

/**
 * Group notes into measures based on time signature.
 *
 * @param notes - Array of Note objects from the piano roll
 * @param timeSignature - Time signature to use for measure grouping
 * @returns Array of Measure objects
 */
export function beatsToMeasures(
  notes: Note[],
  timeSignature: TimeSignature,
): Measure[] {
  if (notes.length === 0) return [];

  // Calculate beats per measure
  // For time signatures: beats * (4 / beatType) gives beats in quarter notes
  const beatsPerMeasure = timeSignature.beats * (4 / timeSignature.beatType);

  // Find the last beat position
  const maxBeat = Math.max(...notes.map((n) => n.start + n.duration));
  const measureCount = Math.ceil(maxBeat / beatsPerMeasure);

  const measures: Measure[] = [];

  for (let m = 0; m < measureCount; m++) {
    const measureStart = m * beatsPerMeasure;
    const measureEnd = measureStart + beatsPerMeasure;

    const measureNotes: MeasureNote[] = [];

    for (const note of notes) {
      const noteEnd = note.start + note.duration;

      // Does this note overlap with this measure?
      if (note.start < measureEnd && noteEnd > measureStart) {
        // Clip note to measure boundaries
        const clippedStart = Math.max(note.start, measureStart);
        const clippedEnd = Math.min(noteEnd, measureEnd);
        const clippedDuration = clippedEnd - clippedStart;

        measureNotes.push({
          id: note.id,
          pitch: note.pitch,
          beatInMeasure: clippedStart - measureStart,
          duration: clippedDuration,
          velocity: note.velocity,
        });
      }
    }

    measures.push({
      number: m + 1,
      notes: measureNotes,
      timeSignature,
    });
  }

  return measures;
}

// ---------------------------------------------------------------------------
// Helper: get pitch name components for MusicXML
// ---------------------------------------------------------------------------

/**
 * Get the pitch step (A-G), octave, and alter value for MusicXML.
 *
 * @param midiPitch - MIDI pitch number
 * @returns Object with step, octave, and alter
 */
export function midiPitchToMusicXML(midiPitch: number): {
  step: string;
  octave: number;
  alter: number;
} {
  const pitchClass = ((midiPitch % 12) + 12) % 12;
  const octave = Math.floor(midiPitch / 12) - 1;

  // Map pitch class to step and alter
  const mapping: [string, number][] = [
    ["C", 0],   // 0
    ["C", 1],   // 1
    ["D", 0],   // 2
    ["D", 1],   // 3
    ["E", 0],   // 4
    ["F", 0],   // 5
    ["F", 1],   // 6
    ["G", 0],   // 7
    ["G", 1],   // 8
    ["A", 0],   // 9
    ["A", 1],   // 10
    ["B", 0],   // 11
  ];

  const [step, alter] = mapping[pitchClass];
  return { step, octave, alter };
}
