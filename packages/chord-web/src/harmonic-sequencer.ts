import { Chord } from './Chord.js';

export interface ChordSymbol {
  name: string;
  root: number;      // MIDI note
  tones: number[];   // all chord tones as MIDI offsets from root (0, 3, 7, 10, 14, etc.)
}

export interface CompEvent {
  time: number;        // 0-15 (16th note position within bar)
  voicing: number[];   // MIDI notes to play
  duration: number;    // seconds
  velocity: number;    // 0-1
}

type VoicingStrategy = 'shell' | 'shell-extension' | 'quartal' | 'drop2' | 'cluster';

export class HarmonicSequencer {
  private engine: Chord;
  private progression: ChordSymbol[] = [];
  private chordIndex: number = 0;

  constructor(engine: Chord) {
    this.engine = engine;
  }

  setProgression(chords: ChordSymbol[]): void {
    this.progression = chords;
    this.chordIndex = 0;
  }

  generateBar(density: number, tension: number): CompEvent[] {
    const chord = this.getCurrentChord();
    if (!chord) return [];

    // Build rhythm grid using jazz comping heuristics
    const hits = this.generateCompingRhythm(density);

    // Generate voicings for each hit
    const events: CompEvent[] = [];
    for (const time of hits) {
      const strategy = this.pickVoicingStrategy();
      const voicing = this.buildVoicing(chord, strategy, tension);
      const isStab = Math.random() < 0.5;
      const duration = isStab
        ? 0.1 + Math.random() * 0.1   // short stab: 0.1-0.2s
        : 0.3 + Math.random() * 0.5;  // sustained: 0.3-0.8s
      const velocity = 0.4 + Math.random() * 0.4; // 0.4-0.8

      events.push({ time, voicing, duration, velocity });
    }

    return events;
  }

  advanceChord(): ChordSymbol {
    if (this.progression.length === 0) {
      throw new Error('No progression set');
    }
    this.chordIndex = (this.chordIndex + 1) % this.progression.length;
    return this.progression[this.chordIndex];
  }

  getCurrentChord(): ChordSymbol {
    if (this.progression.length === 0) {
      throw new Error('No progression set');
    }
    return this.progression[this.chordIndex];
  }

  playEvent(event: CompEvent): void {
    const midiToFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

    for (const note of event.voicing) {
      const freq = midiToFreq(note);
      this.engine.playNote(freq, event.duration, event.velocity);
    }
  }

  // --- Private helpers ---

  private generateCompingRhythm(density: number): number[] {
    // 16th note grid positions 0-15
    // Jazz comping probabilities per position
    const baseProbability: number[] = [
      0.05, // 0: beat 1 downbeat — rarely
      0.15, // 1
      0.25, // 2: "and" of 1
      0.20, // 3
      0.30, // 4: beat 2
      0.15, // 5
      0.35, // 6: "and" of 2
      0.20, // 7
      0.25, // 8: beat 3
      0.15, // 9
      0.30, // 10: "and" of 3
      0.25, // 11
      0.20, // 12: beat 4
      0.15, // 13
      0.55, // 14: "and" of 4 — most common
      0.20, // 15
    ];

    const hits: number[] = [];
    let lastHit = -3; // ensure minimum gap

    for (let i = 0; i < 16; i++) {
      // Enforce minimum 2-subdivision gap between hits
      if (i - lastHit < 2) continue;

      const prob = baseProbability[i] * (0.5 + density);
      if (Math.random() < prob) {
        hits.push(i);
        lastHit = i;
      }
    }

    // Ensure at least one hit per bar
    if (hits.length === 0) {
      hits.push(14); // "and of 4" as default
    }

    return hits;
  }

  private pickVoicingStrategy(): VoicingStrategy {
    const roll = Math.random();
    if (roll < 0.30) return 'shell';
    if (roll < 0.50) return 'shell-extension';
    if (roll < 0.65) return 'quartal';
    if (roll < 0.85) return 'drop2';
    return 'cluster';
  }

  private buildVoicing(
    chord: ChordSymbol,
    strategy: VoicingStrategy,
    tension: number,
  ): number[] {
    const root = chord.root;
    const tones = chord.tones; // offsets from root

    // Ensure we have enough tones to work with
    const third = tones.find((t) => t >= 3 && t <= 4) ?? tones[1] ?? 4;
    const seventh = tones.find((t) => t >= 10 && t <= 11) ?? tones[tones.length - 1] ?? 10;
    const fifth = tones.find((t) => t === 7) ?? 7;
    const extensions = tones.filter((t) => t > 11); // 9ths, 11ths, 13ths

    // Base register: place voicings around middle C area (MIDI 48-72)
    const baseOctave = 48 + root % 12;

    switch (strategy) {
      case 'shell': {
        // 3rd + 7th only
        return [baseOctave + third, baseOctave + seventh];
      }

      case 'shell-extension': {
        // 3rd + 7th + one extension
        const ext =
          extensions.length > 0
            ? extensions[Math.floor(Math.random() * extensions.length)]
            : 14; // default to 9th
        return [baseOctave + third, baseOctave + seventh, baseOctave + ext];
      }

      case 'quartal': {
        // Stacked 4ths from a chord tone
        const startTone = tones[Math.floor(Math.random() * tones.length)];
        const base = baseOctave + startTone;
        return [base, base + 5, base + 10, base + 15];
      }

      case 'drop2': {
        // Close position top 4 notes, then drop 2nd from top an octave
        const selected = [0, third, fifth, seventh].map((t) => baseOctave + t);
        selected.sort((a, b) => a - b);
        if (selected.length >= 4) {
          // Drop the 2nd-highest note down an octave
          selected[selected.length - 2] -= 12;
          selected.sort((a, b) => a - b);
        }
        return selected;
      }

      case 'cluster': {
        // Close position — all available tones in one octave range
        const available = tones.slice(0, 4).map((t) => baseOctave + t);
        available.sort((a, b) => a - b);
        return available;
      }

      default:
        return [baseOctave, baseOctave + third, baseOctave + seventh];
    }
  }
}
