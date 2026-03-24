/**
 * Musical constants for the jazz fusion trio.
 *
 * Key center: Eb Dorian
 * Eb Dorian: Eb F Gb Ab Bb C Db
 * MIDI: 63 65 66 68 70 72 73
 *
 * The progression is a modal jazz vamp with extensions.
 */

// ─── Frequency helpers ───

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteToMidi(note: string): number {
  const names: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
  };
  const match = note.match(/^([A-G][b#]?)(\d)$/);
  if (!match) return 60;
  return names[match[1]] + (parseInt(match[2]) + 1) * 12;
}

// ─── Eb Dorian scale degrees (semitones from Eb) ───
export const DORIAN_INTERVALS = [0, 2, 3, 5, 7, 9, 10]; // W H W W W H W

// Root MIDI for Eb3 (the key center)
export const ROOT_MIDI = 63; // Eb3

// ─── Jazz chord voicings (rootless, in MIDI offsets from root) ───
// These are typical jazz piano voicings — 3rd, 7th, 9th, 11th, 13th
export interface ChordVoicing {
  name: string;
  offsets: number[];   // semitone offsets from chord root
  rootOffset: number;  // scale degree offset (0=I, 1=ii, etc.)
  bassNote: number;    // MIDI note for bass
}

// Eb Dorian vamp progression: Ebm9 → Fm9 → Gbmaj7#11 → Abm9
// Each chord gets rootless voicings (no root — bass plays the root)
export const PROGRESSION: ChordVoicing[] = [
  {
    name: 'Ebm9',
    offsets: [3, 10, 14, 17],  // Gb, Db, F, Ab (3rd, 7th, 9th, 11th)
    rootOffset: 0,
    bassNote: 39, // Eb2
  },
  {
    name: 'Fm11',
    offsets: [3, 10, 14, 17],  // Ab, Eb, G, Bb
    rootOffset: 2,             // F is 2 semitones above Eb
    bassNote: 41, // F2
  },
  {
    name: 'Gbmaj7#11',
    offsets: [4, 11, 14, 18],  // Bb, F, A, C (maj3, maj7, #11, 13)
    rootOffset: 3,
    bassNote: 42, // Gb2
  },
  {
    name: 'Ab13',
    offsets: [4, 10, 14, 21],  // C, Gb, Bb, F (3rd, b7, 9, 13)
    rootOffset: 5,
    bassNote: 44, // Ab2
  },
];

// After modulation (up a 4th to Ab dorian)
export const PROGRESSION_MODULATED: ChordVoicing[] = [
  {
    name: 'Abm9',
    offsets: [3, 10, 14, 17],
    rootOffset: 0,
    bassNote: 44, // Ab2
  },
  {
    name: 'Bbm11',
    offsets: [3, 10, 14, 17],
    rootOffset: 2,
    bassNote: 46, // Bb2
  },
  {
    name: 'Bmaj7#11',
    offsets: [4, 11, 14, 18],
    rootOffset: 3,
    bassNote: 47, // B2
  },
  {
    name: 'Db13',
    offsets: [4, 10, 14, 21],
    rootOffset: 5,
    bassNote: 49, // Db3
  },
];

// Walking bass approach notes (chromatic and diatonic)
export const APPROACH_PATTERNS = [
  [0],          // just the target
  [-1, 0],      // chromatic below
  [1, 0],       // chromatic above
  [-2, -1, 0],  // walk up
  [2, 1, 0],    // walk down
  [5, 3, 0],    // from a 4th
  [7, 5, 0],    // from a 5th
];

// Dorian scale notes for the current key (for solo lines)
export function getScaleNotes(rootMidi: number): number[] {
  const notes: number[] = [];
  for (let octave = -1; octave <= 2; octave++) {
    for (const interval of DORIAN_INTERVALS) {
      notes.push(rootMidi + interval + octave * 12);
    }
  }
  return notes.filter(n => n >= 36 && n <= 96);
}

// ─── Tempo ───
export const BASE_TEMPO = 108; // BPM
export const RUBATO_TEMPO = 60; // slow, free tempo for intro

// ─── Timing ───
export function bpmToMs(bpm: number): number {
  return 60000 / bpm;
}

export function swingEighth(beatMs: number, swing: number = 0.6): [number, number] {
  // swing 0.5 = straight, 0.67 = triplet swing
  const long = beatMs * swing;
  const short = beatMs * (1 - swing);
  return [long, short];
}
