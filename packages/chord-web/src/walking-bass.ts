import { Chord } from './Chord.js';
import { ChordSymbol } from './harmonic-sequencer.js';

export interface BassNote {
  pitch: number;    // MIDI note
  duration: number; // seconds
  velocity: number; // 0-1
  ghost?: boolean;  // ghost note (very short, quiet)
}

export class WalkingBassGenerator {
  private engine: Chord;

  constructor(engine: Chord) {
    this.engine = engine;
  }

  /**
   * Generate 4 bass notes for one bar.
   * Beat 4 approaches the next chord's root chromatically.
   */
  generateBar(
    currentChord: ChordSymbol,
    nextChord: ChordSymbol,
    scale: number[],
    energy: number,
  ): BassNote[] {
    const notes: BassNote[] = [];
    const baseDuration = 0.3 + (1 - energy) * 0.4; // higher energy = shorter notes
    const baseVelocity = 0.5 + energy * 0.3;

    // Beat 1: root (80%) or 5th (20%)
    const beat1Pitch = this.pickBeat1(currentChord);
    notes.push({
      pitch: beat1Pitch,
      duration: baseDuration,
      velocity: baseVelocity + Math.random() * 0.1,
    });

    // Maybe insert ghost note between beat 1 and 2
    if (Math.random() < 0.15) {
      notes.push(this.makeGhostNote(beat1Pitch, scale, currentChord));
    }

    // Beat 3: another chord tone
    const beat3Pitch = this.pickChordTone(currentChord, [beat1Pitch]);

    // Beat 2: scale/chord tone that moves toward beat 3
    const beat2Pitch = this.pickApproachingTone(beat1Pitch, beat3Pitch, currentChord, scale);
    notes.push({
      pitch: beat2Pitch,
      duration: baseDuration,
      velocity: baseVelocity * 0.9,
    });

    // Maybe insert ghost note between beat 2 and 3
    if (Math.random() < 0.15) {
      notes.push(this.makeGhostNote(beat2Pitch, scale, currentChord));
    }

    // Beat 3
    notes.push({
      pitch: beat3Pitch,
      duration: baseDuration,
      velocity: baseVelocity * 0.85,
    });

    // Maybe insert ghost note between beat 3 and 4
    if (Math.random() < 0.15) {
      notes.push(this.makeGhostNote(beat3Pitch, scale, currentChord));
    }

    // Beat 4: chromatic approach to next chord root
    const beat4Pitch = this.chromaticApproach(nextChord);
    notes.push({
      pitch: beat4Pitch,
      duration: baseDuration * 0.8,
      velocity: baseVelocity * 0.95,
    });

    return notes;
  }

  /**
   * Play a bass note through the engine.
   * Sets oscillator frequency, sub-oscillator frequency (octave below),
   * and briefly opens the filter for a pluck envelope.
   */
  playNote(
    note: BassNote,
    bassOscId: string,
    bassSubId: string,
    bassFilterId: string,
  ): void {
    const freq = this.midiToFreq(note.pitch);
    const subFreq = freq / 2;

    this.engine.setParameter(bassOscId, 'frequency', freq);
    this.engine.setParameter(bassSubId, 'frequency', subFreq);

    // Pluck envelope: open filter, then close
    const filterOpen = note.ghost ? 400 : 800 + note.velocity * 2000;
    this.engine.setParameter(bassFilterId, 'frequency', filterOpen);

    // Close filter after a short attack for pluck character
    const decayMs = note.ghost ? 30 : 60 + note.duration * 200;
    setTimeout(() => {
      this.engine.setParameter(bassFilterId, 'frequency', 200);
    }, decayMs);
  }

  // --- Private helpers ---

  private pickBeat1(chord: ChordSymbol): number {
    const root = this.toBassRange(chord.root);
    if (Math.random() < 0.8) {
      return root;
    }
    // 5th
    const fifth = chord.tones.find((t) => t === 7);
    return fifth !== undefined ? this.toBassRange(chord.root + fifth) : root;
  }

  private pickChordTone(chord: ChordSymbol, avoid: number[]): number {
    const candidates = chord.tones
      .map((t) => this.toBassRange(chord.root + t))
      .filter((p) => !avoid.includes(p));

    if (candidates.length === 0) {
      // Fallback: root shifted by an octave if possible
      return this.toBassRange(chord.root + 12);
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private pickApproachingTone(
    from: number,
    toward: number,
    chord: ChordSymbol,
    scale: number[],
  ): number {
    // Collect chord tones and scale tones in bass range
    const chordPitches = chord.tones.map((t) => this.toBassRange(chord.root + t));
    const scalePitches = scale.map((s) => this.toBassRange(chord.root + s));
    const allTones = [...new Set([...chordPitches, ...scalePitches])];

    // Pick the tone closest to the midpoint between from and toward
    const midpoint = (from + toward) / 2;
    const direction = toward > from ? 1 : -1;

    // Filter for tones that move in the right direction
    const moving = allTones.filter((t) =>
      direction > 0 ? t > from && t <= toward : t < from && t >= toward,
    );

    if (moving.length > 0) {
      // Pick one closest to midpoint
      moving.sort((a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint));
      return moving[0];
    }

    // Fallback: just step by scale degree
    return this.toBassRange(from + direction * 2);
  }

  private chromaticApproach(nextChord: ChordSymbol): number {
    const target = this.toBassRange(nextChord.root);
    const roll = Math.random();

    if (roll < 0.5) {
      // Half step below (50%)
      return target - 1;
    } else if (roll < 0.8) {
      // Half step above (30%)
      return target + 1;
    } else {
      // Whole step below (20%)
      return target - 2;
    }
  }

  private makeGhostNote(nearPitch: number, scale: number[], chord: ChordSymbol): BassNote {
    // Ghost note: chromatic neighbor or passing tone
    const offset = Math.random() < 0.5 ? 1 : -1;
    const pitch = this.clampBassRange(nearPitch + offset);
    return {
      pitch,
      duration: 0.08,
      velocity: 0.15 + Math.random() * 0.1,
      ghost: true,
    };
  }

  /** Transpose a MIDI pitch into the bass range (36-60). */
  private toBassRange(midi: number): number {
    let pitch = midi % 12;
    // Place in octave 2-3 (MIDI 36-60)
    pitch += 36;
    if (pitch < 36) pitch += 12;
    if (pitch > 60) pitch -= 12;
    return pitch;
  }

  private clampBassRange(midi: number): number {
    if (midi < 36) return midi + 12;
    if (midi > 60) return midi - 12;
    return midi;
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
}
