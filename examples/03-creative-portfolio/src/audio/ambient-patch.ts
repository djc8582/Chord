/**
 * Ambient Patch — Generative music definition using the Chord DSL.
 *
 * Demonstrates:
 * - patch() to declare a named, keyed, tempo-synced patch
 * - osc() with detuning for warm stereo width
 * - filter() with LFO modulation for evolving timbre
 * - Effects chain: chorus -> delay -> reverb
 * - noise() for textural fill
 * - p.expose() to create named parameter handles for real-time control
 *
 * The DSL builds a declarative graph of nodes and connections. The Chord
 * engine compiles this into a live Web Audio graph when instantiated.
 */

import { patch, osc, filter, reverb, output, lfo, noise, chorus, delay } from '@chord/web';

export default patch('portfolio-ambient', { tempo: 70, key: 'C', scale: 'minor' }, (p) => {
  // --- Oscillators: two detuned saws create a warm, wide pad ---
  const pad1 = osc({ waveform: 'saw', detune: -8 });
  const pad2 = osc({ waveform: 'saw', detune: 8 });

  // --- Filter: lowpass sculpts the brightness of the pad ---
  const filt = filter({ cutoff: 1500, resonance: 0.2 });

  // --- LFO: slow sine modulates filter cutoff for organic movement ---
  const mod = lfo({ rate: 0.1, depth: 800 });

  // --- Effects chain: chorus for shimmer, delay for space, reverb for depth ---
  const ch = chorus({ rate: 0.3, depth: 0.3, mix: 0.2 });
  const del = delay({ time: 0.375, feedback: 0.2, mix: 0.12 });
  const rev = reverb({ decay: 4, mix: 0.3, damping: 0.7 });

  // --- Texture: pink noise adds air and presence at low volume ---
  const tex = noise({ color: 'pink' });

  // --- Routing ---
  // LFO modulates the filter cutoff
  mod.connect(filt, 'out', 'cutoff_mod');

  // Both pads feed into the filter
  pad1.connect(filt);
  pad2.connect(filt);

  // Filter -> chorus -> delay -> reverb -> output
  filt.connect(ch).connect(del).connect(rev).connect(output());

  // Noise texture feeds directly into the reverb for ambient wash
  tex.connect(rev);

  // --- Exposed Parameters ---
  // These let the UI (or mouse position) control the patch in real time.
  // useMouseAudio maps mouseX -> brightness, mouseY -> space.
  p.expose('brightness', filt, 'cutoff', { min: 200, max: 6000 });
  p.expose('space', rev, 'mix', { min: 0.1, max: 0.5 });
});
