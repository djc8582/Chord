import { Chord } from './Chord.js';
import { ChordSymbol } from './harmonic-sequencer.js';

export interface SoloNote {
  pitch: number;    // MIDI note
  duration: number; // seconds
  velocity: number; // 0-1
  rest?: boolean;   // true = silence
}

export class SoloGenerator {
  private engine: Chord;
  private lastPitch: number = 60; // track last pitch for continuity across phrases

  constructor(engine: Chord) {
    this.engine = engine;
  }

  /**
   * Generate a melodic phrase.
   * energy: 0=sparse, 1=dense (affects note count and rhythm)
   * tension: 0=inside/consonant, 1=outside/chromatic
   */
  generatePhrase(
    chord: ChordSymbol,
    scale: number[],
    energy: number,
    tension: number,
  ): SoloNote[] {
    const noteCount = 4 + Math.floor(Math.random() * 12 * energy);
    const notes: SoloNote[] = [];

    // Start near chord root in octave 4-5 (MIDI 60-72)
    let currentPitch = this.pickStartingPitch(chord);
    let direction = Math.random() < 0.5 ? 1 : -1;
    let stepsInDirection = 0;
    const directionChangeThreshold = 3 + Math.floor(Math.random() * 3); // 3-5 notes

    for (let i = 0; i < noteCount; i++) {
      // Sine arc for velocity: start moderate, peak middle, end quiet
      const phase = i / Math.max(1, noteCount - 1); // 0 to 1
      const arcVelocity = 0.4 + 0.4 * Math.sin(phase * Math.PI);

      // Duration varies with energy: high energy = shorter notes
      const baseDuration = 0.15 + (1 - energy) * 0.3;
      const durationVariance = baseDuration * 0.3;
      const duration = baseDuration + (Math.random() - 0.5) * 2 * durationVariance;

      notes.push({
        pitch: currentPitch,
        duration: Math.max(0.05, duration),
        velocity: Math.min(1, Math.max(0.1, arcVelocity)),
      });

      // Decide next pitch
      stepsInDirection++;
      if (stepsInDirection >= directionChangeThreshold) {
        direction *= -1;
        stepsInDirection = 0;
      }

      currentPitch = this.nextPitch(
        currentPitch,
        direction,
        chord,
        scale,
        tension,
        i,
        noteCount,
      );

      // Clamp to playable range
      currentPitch = this.clampRange(currentPitch);
    }

    // End phrase with a rest (breathing room)
    notes.push({
      pitch: 0,
      duration: 0.3 + Math.random() * 0.7,
      velocity: 0,
      rest: true,
    });

    this.lastPitch = currentPitch;
    return notes;
  }

  /**
   * Play a phrase through the engine. Returns total duration in seconds.
   */
  playPhrase(phrase: SoloNote[]): number {
    let elapsed = 0;

    for (const note of phrase) {
      if (note.rest) {
        // Just wait — silence
        elapsed += note.duration;
        continue;
      }

      const freq = this.midiToFreq(note.pitch);
      const noteElapsed = elapsed;

      setTimeout(() => {
        this.engine.playNote(freq, note.duration, note.velocity);
      }, noteElapsed * 1000);

      elapsed += note.duration;
    }

    return elapsed;
  }

  // --- Private helpers ---

  private pickStartingPitch(chord: ChordSymbol): number {
    // Start on a chord tone in octave 4-5 (MIDI 60-72)
    const rootInRange = 60 + (chord.root % 12);
    if (chord.tones.length > 0) {
      const tone = chord.tones[Math.floor(Math.random() * chord.tones.length)];
      const pitch = rootInRange + tone;
      return this.clampRange(pitch);
    }
    return rootInRange;
  }

  private nextPitch(
    current: number,
    direction: number,
    chord: ChordSymbol,
    scale: number[],
    tension: number,
    noteIndex: number,
    totalNotes: number,
  ): number {
    // Low tension (< 0.3): step through scale
    if (tension < 0.3) {
      return this.scaleStep(current, direction, chord, scale);
    }

    // Moderate tension (0.3 - 0.7): mix scale steps with chromatic, add enclosures
    if (tension < 0.7) {
      // 40% chance of enclosure
      if (Math.random() < 0.4) {
        return this.enclosure(current, direction, chord, scale);
      }
      // 50% scale step, 50% chromatic
      if (Math.random() < 0.5) {
        return this.scaleStep(current, direction, chord, scale);
      }
      return current + direction; // chromatic half step
    }

    // High tension (> 0.7): wide leaps and chromatic movement
    if (Math.random() < 0.4) {
      // Wide leap: tritone, minor 7th, octave
      const leaps = [6, 10, 12];
      const leap = leaps[Math.floor(Math.random() * leaps.length)];
      return current + direction * leap;
    }
    // Chromatic runs
    const chromaticSteps = 1 + Math.floor(Math.random() * 2);
    return current + direction * chromaticSteps;
  }

  private scaleStep(
    current: number,
    direction: number,
    chord: ChordSymbol,
    scale: number[],
  ): number {
    // Find the closest scale tone in the given direction
    const root = chord.root % 12;
    const currentDegree = ((current % 12) - root + 12) % 12;

    // Build all scale pitches near current
    const candidates: number[] = [];
    for (let octave = -1; octave <= 1; octave++) {
      for (const degree of scale) {
        const pitch = current - (currentDegree - degree) + octave * 12;
        if (direction > 0 && pitch > current && pitch <= current + 7) {
          candidates.push(pitch);
        } else if (direction < 0 && pitch < current && pitch >= current - 7) {
          candidates.push(pitch);
        }
      }
    }

    if (candidates.length === 0) {
      // Fallback: whole step
      return current + direction * 2;
    }

    // Pick the nearest
    candidates.sort((a, b) => Math.abs(a - current) - Math.abs(b - current));
    return candidates[0];
  }

  private enclosure(
    current: number,
    direction: number,
    chord: ChordSymbol,
    scale: number[],
  ): number {
    // Enclosure: approach target from above AND below
    // Target is a chord tone nearby
    const root = chord.root % 12;
    const chordPitches = chord.tones.map((t) => {
      let p = current - ((current % 12) - root - t + 24) % 12;
      // Find nearest instance
      while (p < current - 6) p += 12;
      while (p > current + 6) p -= 12;
      return p;
    });

    // Pick nearest chord tone as target
    chordPitches.sort((a, b) => Math.abs(a - current) - Math.abs(b - current));
    const target = chordPitches[0] ?? current + direction * 2;

    // Return approach note (one above or below target)
    if (direction > 0) {
      return target + 1; // approach from above, next note will resolve down
    } else {
      return target - 1; // approach from below
    }
  }

  private clampRange(pitch: number): number {
    // Keep pitch in MIDI range 48-84
    while (pitch < 48) pitch += 12;
    while (pitch > 84) pitch -= 12;
    return pitch;
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
}
