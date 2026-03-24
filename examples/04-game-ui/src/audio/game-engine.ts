/**
 * Game Audio Engine — Adaptive music that responds to gameplay state.
 *
 * Architecture:
 *   Base layer:   gentle pad (always playing, filtered darker during combat)
 *   Combat layer: aggressive oscillator + noise (fades in with danger level)
 *   Drums:        euclidean percussion (density increases with danger)
 *
 * Patterns demonstrated:
 *   - Adaptive crossfading between musical layers
 *   - Continuous parameter mapping from game state
 *   - One-shot sounds for events (hits, achievements)
 */

import { Chord } from '@chord/web';

export interface GameAudioControls {
  engine: Chord;
  /** Set danger level 0 (peaceful) to 1 (intense combat) */
  setDanger: (level: number) => void;
  /** Set player health 0-1 */
  setHealth: (health: number) => void;
  /** Trigger a hit/damage sound */
  triggerHit: () => void;
  /** Trigger an achievement/score sound */
  triggerAchievement: (tier: number) => void;
  /** Trigger a glitch effect */
  triggerGlitch: () => void;
}

export function createGameAudio(): GameAudioControls {
  const engine = new Chord();

  // ─── Base Pad Layer (always playing) ───
  const padOsc1 = engine.addNode('oscillator');
  const padOsc2 = engine.addNode('oscillator');
  const padFilter = engine.addNode('filter');
  const padLfo = engine.addNode('lfo');
  const padReverb = engine.addNode('reverb');

  engine.setParameter(padOsc1, 'waveform', 1); // saw
  engine.setParameter(padOsc1, 'frequency', 130.81); // C3
  engine.setParameter(padOsc1, 'detune', -8);
  engine.setParameter(padOsc1, 'gain', 0.15);
  engine.setParameter(padOsc2, 'waveform', 1);
  engine.setParameter(padOsc2, 'frequency', 130.81);
  engine.setParameter(padOsc2, 'detune', 8);
  engine.setParameter(padOsc2, 'gain', 0.15);
  engine.setParameter(padFilter, 'cutoff', 2000);
  engine.setParameter(padFilter, 'resonance', 0.2);
  engine.setParameter(padLfo, 'rate', 0.1);
  engine.setParameter(padLfo, 'depth', 600);
  engine.setParameter(padReverb, 'decay', 3.5);
  engine.setParameter(padReverb, 'mix', 0.25);

  engine.connect(padOsc1, 'out', padFilter, 'in');
  engine.connect(padOsc2, 'out', padFilter, 'in');
  engine.connect(padLfo, 'out', padFilter, 'cutoff');
  engine.connect(padFilter, 'out', padReverb, 'in');

  // ─── Combat Layer (fades in with danger) ───
  const combatOsc = engine.addNode('oscillator');
  const combatNoise = engine.addNode('noise');
  const combatFilter = engine.addNode('filter');
  const combatDist = engine.addNode('waveshaper');

  engine.setParameter(combatOsc, 'waveform', 2); // square
  engine.setParameter(combatOsc, 'frequency', 65.41); // C2
  engine.setParameter(combatOsc, 'gain', 0); // starts silent
  engine.setParameter(combatNoise, 'color', 0); // white
  engine.setParameter(combatNoise, 'gain', 0); // starts silent
  engine.setParameter(combatFilter, 'cutoff', 800);
  engine.setParameter(combatFilter, 'resonance', 0.4);
  engine.setParameter(combatDist, 'drive', 0.3);
  engine.setParameter(combatDist, 'mode', 2); // tape
  engine.setParameter(combatDist, 'mix', 0.4);

  engine.connect(combatOsc, 'out', combatFilter, 'in');
  engine.connect(combatNoise, 'out', combatFilter, 'in');
  engine.connect(combatFilter, 'out', combatDist, 'in');
  engine.connect(combatDist, 'out', padReverb, 'in');

  // ─── Percussion (density = danger) ───
  const perc = engine.addNode('euclidean');
  const kick = engine.addNode('kickDrum');
  const hat = engine.addNode('hiHat');
  const drumComp = engine.addNode('compressor');

  engine.setParameter(perc, 'steps', 16);
  engine.setParameter(perc, 'pulses', 3); // sparse at start
  engine.setParameter(perc, 'tempo', 100);
  engine.setParameter(kick, 'frequency', 50);
  engine.setParameter(kick, 'body_decay', 0.25);
  engine.setParameter(kick, 'drive', 0.15);
  engine.setParameter(hat, 'decay', 0.03);
  engine.setParameter(hat, 'tone', 0.5);
  engine.setParameter(drumComp, 'threshold', -10);
  engine.setParameter(drumComp, 'ratio', 3);

  engine.connect(perc, 'out', kick, 'in');
  engine.connect(perc, 'out', hat, 'in');
  engine.connect(kick, 'out', drumComp, 'in');
  engine.connect(hat, 'out', drumComp, 'in');
  engine.connect(drumComp, 'out', padReverb, 'in');

  return {
    engine,

    setDanger(level: number) {
      const d = Math.max(0, Math.min(1, level));

      // Pad gets darker with more danger
      engine.setParameter(padFilter, 'cutoff', 2000 - d * 1400);

      // Combat layer fades in
      engine.setParameter(combatOsc, 'gain', d * 0.2);
      engine.setParameter(combatNoise, 'gain', d * 0.04);
      engine.setParameter(combatFilter, 'cutoff', 400 + d * 2000);
      engine.setParameter(combatDist, 'drive', 0.1 + d * 0.5);

      // Percussion gets denser
      engine.setParameter(perc, 'pulses', Math.round(3 + d * 9));
      engine.setParameter(perc, 'tempo', 100 + d * 40);
    },

    setHealth(health: number) {
      const h = Math.max(0, Math.min(1, health));
      // Low health: filter gets very dark, distortion increases
      engine.setParameter(padFilter, 'resonance', 0.2 + (1 - h) * 0.5);
      // Master volume dips slightly at very low health
      engine.setMasterVolume(0.3 + h * 0.2);
    },

    triggerHit() {
      // Short descending pitch — percussive, unsettling
      engine.playNote(220, 0.15, 0.3);
      setTimeout(() => engine.playNote(110, 0.1, 0.2), 50);
    },

    triggerAchievement(tier: number) {
      // Ascending notes — more notes for higher tier
      const freqs = [523, 659, 784, 1047]; // C5, E5, G5, C6
      const count = Math.min(tier + 1, freqs.length);
      for (let i = 0; i < count; i++) {
        setTimeout(() => engine.playNote(freqs[i], 0.25, 0.2), i * 120);
      }
    },

    triggerGlitch() {
      // Rapid parameter chaos for 300ms
      const origCutoff = 2000;
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        setTimeout(() => {
          engine.setParameter(padFilter, 'cutoff', Math.random() * 8000 + 200);
          engine.setParameter(combatDist, 'drive', Math.random());
        }, i * 50);
      }
      // Restore after glitch
      setTimeout(() => {
        engine.setParameter(padFilter, 'cutoff', origCutoff);
        engine.setParameter(combatDist, 'drive', 0.3);
      }, steps * 50 + 50);
    },
  };
}
