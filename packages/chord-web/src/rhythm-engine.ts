import { Chord } from './Chord.js';

export interface DrumTrack {
  nodeId: string;
  steps: number[];          // 0=rest, 0.01-1.0=velocity
  probability?: number[];   // per-step hit probability (0-1), defaults to all 1
  velocityVariance?: number; // random velocity spread ±, default 0.1
  humanize?: number;         // timing variance in ms, default 5
  mutateEvery?: number;      // mutate pattern every N bars, 0=never
  velocityMap?: Record<string, [number, number]>; // param → [minVal, maxVal] scaled by velocity
}

interface InternalTrack {
  name: string;
  track: DrumTrack;
}

export class RhythmEngine {
  private engine: Chord;
  private tempo: number;
  private tracks: Map<string, DrumTrack> = new Map();
  private running: boolean = false;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private currentStep: number = 0;
  private barCount: number = 0;
  private beatCount: number = 0;

  swing: number = 0.55;

  constructor(engine: Chord, tempo: number) {
    this.engine = engine;
    this.tempo = tempo;
  }

  addTrack(name: string, track: DrumTrack): void {
    this.tracks.set(name, track);
  }

  removeTrack(name: string): void {
    this.tracks.delete(name);
  }

  setTempo(bpm: number): void {
    this.tempo = bpm;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.currentStep = 0;
    this.barCount = 0;
    this.beatCount = 0;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  tick(): void {
    const stepsPerBar = 16;

    for (const [name, track] of this.tracks) {
      const stepIndex = this.currentStep % track.steps.length;
      const velocity = track.steps[stepIndex];

      if (velocity <= 0) continue;

      // Probability gate
      const prob = track.probability?.[stepIndex] ?? 1;
      if (Math.random() >= prob) continue;

      // Velocity humanization
      const variance = track.velocityVariance ?? 0.1;
      const humanizedVelocity = Math.min(
        1,
        Math.max(0.01, velocity * (1 + (Math.random() - 0.5) * 2 * variance))
      );

      // Apply velocityMap parameters before triggering
      if (track.velocityMap) {
        for (const [param, [minVal, maxVal]] of Object.entries(track.velocityMap)) {
          const scaled = minVal + humanizedVelocity * (maxVal - minVal);
          this.engine.setParameter(track.nodeId, param, scaled);
        }
      }

      // Timing humanization
      const humanizeMs = track.humanize ?? 5;
      const timingOffset = (Math.random() - 0.5) * 2 * humanizeMs;

      if (timingOffset > 1) {
        setTimeout(() => {
          this.engine.triggerNode(track.nodeId);
        }, timingOffset);
      } else {
        this.engine.triggerNode(track.nodeId);
      }
    }

    // Advance step counters
    this.currentStep++;
    if (this.currentStep % 4 === 0) {
      this.beatCount++;
    }
    if (this.currentStep % stepsPerBar === 0) {
      this.barCount++;
      this.maybeMutatePatterns();
    }
  }

  private scheduleNext(): void {
    if (!this.running) return;

    const sixteenthDuration = (60 / this.tempo) / 4; // seconds per 16th note
    const halfBeat = sixteenthDuration; // one 16th note = half an 8th

    // Apply swing: odd 16th notes are delayed
    const isOddSixteenth = this.currentStep % 2 === 1;
    const swingDelay = isOddSixteenth ? this.swing * halfBeat * 1000 : 0;
    const intervalMs = sixteenthDuration * 1000;

    this.tick();

    // Schedule next tick
    const nextDelay = intervalMs + (isOddSixteenth ? -swingDelay : swingDelay);
    this.timerId = setTimeout(() => {
      this.scheduleNext();
    }, Math.max(1, nextDelay));
  }

  private maybeMutatePatterns(): void {
    for (const [name, track] of this.tracks) {
      const mutateEvery = track.mutateEvery ?? 0;
      if (mutateEvery <= 0) continue;
      if (this.barCount % mutateEvery !== 0) continue;

      // Pick a random step and flip rest ↔ ghost note
      const stepIndex = Math.floor(Math.random() * track.steps.length);
      if (track.steps[stepIndex] === 0) {
        // Rest → ghost note (velocity 0.1–0.3)
        track.steps[stepIndex] = 0.1 + Math.random() * 0.2;
      } else if (track.steps[stepIndex] <= 0.3) {
        // Ghost note → rest
        track.steps[stepIndex] = 0;
      } else {
        // Full hit → ghost note
        track.steps[stepIndex] = 0.1 + Math.random() * 0.2;
      }
    }
  }
}
