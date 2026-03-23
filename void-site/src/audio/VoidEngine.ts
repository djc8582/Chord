/**
 * VOID Audio Engine — powered entirely by @chord/web
 *
 * Every sound is created through Chord's node graph API.
 * Zero raw Web Audio API calls. This IS the point of Chord.
 */

import { Chord } from '@chord/web';

export class VoidEngine {
  private chord: Chord;
  private _started = false;

  // Node IDs for the ambient patch
  private bass = '';
  private pad1 = '';
  private pad2 = '';
  private pad3 = '';
  private padFilter = '';
  private lfo = '';
  private mixer = '';
  private delay = '';
  private reverb = '';
  private masterGain = '';
  private output = '';

  constructor() {
    this.chord = new Chord();
  }

  get started() { return this._started; }
  get chordInstance() { return this.chord; }

  async start(): Promise<void> {
    // === Build the entire patch using Chord's API ===
    // No AudioContext, no createOscillator — just Chord nodes

    // Master chain
    this.mixer = this.chord.addNode('mixer');
    this.delay = this.chord.addNode('delay');
    this.reverb = this.chord.addNode('reverb');
    this.masterGain = this.chord.addNode('gain');
    this.output = this.chord.addNode('output');

    this.chord.setParameter(this.delay, 'time', 0.375);
    this.chord.setParameter(this.delay, 'feedback', 0.25);
    this.chord.setParameter(this.delay, 'mix', 0.15);
    this.chord.setParameter(this.reverb, 'room_size', 0.85);
    this.chord.setParameter(this.reverb, 'damping', 0.3);
    this.chord.setParameter(this.reverb, 'mix', 0.4);
    this.chord.setParameter(this.masterGain, 'gain', 0.5);

    this.chord.connect(this.mixer, 'out', this.delay, 'in');
    this.chord.connect(this.delay, 'out', this.reverb, 'in');
    this.chord.connect(this.reverb, 'out', this.masterGain, 'in');
    this.chord.connect(this.masterGain, 'out', this.output, 'in');

    // Bass drone (C2 sine) — starts silent
    this.bass = this.chord.addNode('oscillator');
    this.chord.setParameter(this.bass, 'frequency', 65.41);
    this.chord.setParameter(this.bass, 'waveform', 0);
    this.chord.setParameter(this.bass, 'gain', 0.0);

    // Pad voices (C minor: C4 + Eb4 + G4, detuned saws) — start silent
    this.pad1 = this.chord.addNode('oscillator');
    this.chord.setParameter(this.pad1, 'frequency', 261.6);
    this.chord.setParameter(this.pad1, 'waveform', 1);
    this.chord.setParameter(this.pad1, 'detune', -7);
    this.chord.setParameter(this.pad1, 'gain', 0.0);

    this.pad2 = this.chord.addNode('oscillator');
    this.chord.setParameter(this.pad2, 'frequency', 311.1);
    this.chord.setParameter(this.pad2, 'waveform', 1);
    this.chord.setParameter(this.pad2, 'detune', 5);
    this.chord.setParameter(this.pad2, 'gain', 0.0);

    this.pad3 = this.chord.addNode('oscillator');
    this.chord.setParameter(this.pad3, 'frequency', 392.0);
    this.chord.setParameter(this.pad3, 'waveform', 1);
    this.chord.setParameter(this.pad3, 'detune', 8);
    this.chord.setParameter(this.pad3, 'gain', 0.0);

    // Pad filter + LFO modulation
    this.padFilter = this.chord.addNode('filter');
    this.chord.setParameter(this.padFilter, 'cutoff', 400);
    this.chord.setParameter(this.padFilter, 'resonance', 1.5);

    this.lfo = this.chord.addNode('lfo');
    this.chord.setParameter(this.lfo, 'rate', 0.08);
    this.chord.setParameter(this.lfo, 'depth', 0.6);

    // Wire everything — all through Chord
    this.chord.connect(this.pad1, 'out', this.padFilter, 'in');
    this.chord.connect(this.pad2, 'out', this.padFilter, 'in');
    this.chord.connect(this.pad3, 'out', this.padFilter, 'in');
    this.chord.connect(this.lfo, 'out', this.padFilter, 'cutoff_mod');
    this.chord.connect(this.bass, 'out', this.mixer, 'in1');
    this.chord.connect(this.padFilter, 'out', this.mixer, 'in2');

    await this.chord.start();
    this._started = true;
  }

  /** Trigger the opening boom — all through Chord's playNote */
  playBoom(): void {
    if (!this._started) return;
    this.chord.playNote(65, 4, 0.5);   // C2 boom, long reverb tail
    this.chord.playNote(44, 5, 0.3);   // sub octave
    this.chord.playNote(131, 2, 0.2);  // C3 mid body
    setTimeout(() => this.fadeInAmbient(), 2500);
  }

  /** Fade in the ambient drone */
  private fadeInAmbient(): void {
    let step = 0;
    const steps = 60;
    const interval = setInterval(() => {
      step++;
      const t = step / steps;
      this.chord.setParameter(this.bass, 'gain', t * 0.15);
      this.chord.setParameter(this.pad1, 'gain', t * 0.06);
      this.chord.setParameter(this.pad2, 'gain', t * 0.06);
      this.chord.setParameter(this.pad3, 'gain', t * 0.06);
      if (step >= steps) clearInterval(interval);
    }, 33);
  }

  // === All controls go through Chord ===

  playNote(freq: number, dur = 0.5, vol = 0.2) { this.chord.playNote(freq, dur, vol); }
  setFilterCutoff(v: number) { this.chord.setParameter(this.padFilter, 'cutoff', v); }
  setReverbMix(v: number) { this.chord.setParameter(this.reverb, 'mix', v); }
  setMasterVolume(v: number) { this.chord.setParameter(this.masterGain, 'gain', v); }
  setDelayTime(v: number) { this.chord.setParameter(this.delay, 'time', v); }
  setLfoRate(v: number) { this.chord.setParameter(this.lfo, 'rate', v); }
  setBassFreq(f: number) { this.chord.setParameter(this.bass, 'frequency', f); }

  setPadChord(freqs: [number, number, number]) {
    this.chord.setParameter(this.pad1, 'frequency', freqs[0]);
    this.chord.setParameter(this.pad2, 'frequency', freqs[1]);
    this.chord.setParameter(this.pad3, 'frequency', freqs[2]);
  }

  // === Analysis — through Chord ===
  getRMS(): number { return this.chord.getRMS?.() ?? 0; }
  getWaveformData() { return new Float32Array(this.chord.getWaveformData?.() ?? []); }
  getFrequencyData() { return new Float32Array(this.chord.getFrequencyData?.() ?? []); }
}
