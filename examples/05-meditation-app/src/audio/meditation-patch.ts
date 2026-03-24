/**
 * Meditation Audio Patch
 *
 * Builds a gentle ambient drone designed for breathing meditation.
 * The patch has these layers:
 *   1. Sub-bass drone (sine, very low, grounding)
 *   2. Mid pad (2 detuned triangles through slow-breathing filter)
 *   3. Air texture (pink noise, very quiet, like breath)
 *   4. Large reverb with high damping (dark, enveloping)
 *
 * Exposed controls:
 *   - breathPhase: 0 (exhale) to 1 (peak inhale) — drives filter + volume
 *   - bowlStrike(): triggers a singing bowl note
 */

import { Chord } from '@chord/web';

export interface MeditationControls {
  engine: Chord;
  filterId: string;
  padGainId: string;
  /** Set breath phase 0 (exhale, quiet, dark) to 1 (inhale peak, brighter, louder) */
  setBreathPhase: (phase: number) => void;
  /** Play a singing bowl strike at a random pentatonic pitch */
  bowlStrike: () => void;
}

export function createMeditationPatch(): MeditationControls {
  const engine = new Chord();

  // ─── Sub-bass drone ───
  const sub = engine.addNode('oscillator');
  engine.setParameter(sub, 'waveform', 0); // sine
  engine.setParameter(sub, 'frequency', 65.41); // C2
  engine.setParameter(sub, 'gain', 0.12);

  const subFilter = engine.addNode('filter');
  engine.setParameter(subFilter, 'cutoff', 150);
  engine.setParameter(subFilter, 'resonance', 0);
  engine.connect(sub, 'out', subFilter, 'in');

  // ─── Mid pad — two detuned triangle waves ───
  const pad1 = engine.addNode('oscillator');
  const pad2 = engine.addNode('oscillator');
  engine.setParameter(pad1, 'waveform', 3); // triangle
  engine.setParameter(pad1, 'frequency', 261.63); // C4
  engine.setParameter(pad1, 'detune', -6);
  engine.setParameter(pad1, 'gain', 0.08);
  engine.setParameter(pad2, 'waveform', 3);
  engine.setParameter(pad2, 'frequency', 261.63);
  engine.setParameter(pad2, 'detune', 6);
  engine.setParameter(pad2, 'gain', 0.08);

  const padFilter = engine.addNode('filter');
  engine.setParameter(padFilter, 'cutoff', 800); // starts dark
  engine.setParameter(padFilter, 'resonance', 0.15);

  const padGain = engine.addNode('gain');
  engine.setParameter(padGain, 'gain', 0.5);

  engine.connect(pad1, 'out', padFilter, 'in');
  engine.connect(pad2, 'out', padFilter, 'in');
  engine.connect(padFilter, 'out', padGain, 'in');

  // ─── Slow LFO for gentle autonomous movement ───
  const lfo = engine.addNode('lfo');
  engine.setParameter(lfo, 'rate', 0.03); // very slow — 33 second cycle
  engine.setParameter(lfo, 'depth', 200);
  engine.connect(lfo, 'out', padFilter, 'cutoff');

  // ─── Breath texture — very quiet pink noise ───
  const breath = engine.addNode('noise');
  engine.setParameter(breath, 'color', 1); // pink
  engine.setParameter(breath, 'gain', 0.015);

  const breathFilter = engine.addNode('filter');
  engine.setParameter(breathFilter, 'cutoff', 2000);
  engine.setParameter(breathFilter, 'resonance', 0.2);
  engine.setParameter(breathFilter, 'type', 2); // bandpass
  engine.connect(breath, 'out', breathFilter, 'in');

  // ─── Master reverb — large, dark, enveloping ───
  const reverb = engine.addNode('reverb');
  engine.setParameter(reverb, 'decay', 6);
  engine.setParameter(reverb, 'mix', 0.35);
  engine.setParameter(reverb, 'damping', 0.8); // very dark

  // Connect all layers to reverb
  engine.connect(subFilter, 'out', reverb, 'in');
  engine.connect(padGain, 'out', reverb, 'in');
  engine.connect(breathFilter, 'out', reverb, 'in');

  // Singing bowl frequencies — C major pentatonic
  const bowlFreqs = [261.63, 329.63, 392.00, 523.25, 659.25];

  return {
    engine,
    filterId: padFilter,
    padGainId: padGain,

    setBreathPhase(phase: number) {
      const p = Math.max(0, Math.min(1, phase));
      // Inhale: filter opens, volume rises
      // Exhale: filter closes, volume drops
      engine.setParameter(padFilter, 'cutoff', 500 + p * 2000);
      engine.setParameter(padGain, 'gain', 0.3 + p * 0.4);
      engine.setParameter(breathFilter, 'cutoff', 1000 + p * 3000);
      engine.setParameter(breath, 'gain', 0.01 + p * 0.02);
    },

    bowlStrike() {
      const freq = bowlFreqs[Math.floor(Math.random() * bowlFreqs.length)];
      // Long, quiet, reverberant bell strike
      engine.playNote(freq, 3.0, 0.12);
    },
  };
}
