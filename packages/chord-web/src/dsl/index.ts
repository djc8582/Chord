/**
 * Chord DSL — Write audio patches as TypeScript code.
 *
 * Usage:
 *   import { patch, osc, filter, reverb, output } from '@chord/web/dsl';
 *
 *   export default patch('my-sound', { tempo: 120, key: 'C' }, (p) => {
 *     const synth = osc({ waveform: 'saw', freq: 440 });
 *     const filt = filter({ cutoff: 2000 });
 *     synth.connect(filt).connect(output());
 *   });
 */

export { patch } from './builder.js';
export type { PatchConfig, PatchBuilder } from './types.js';
export {
  osc, filter, gain, delay, reverb, noise, mixer, output, lfo, envelope,
  kickDrum, snareDrum, hiHat, clap, tom,
  stepSequencer, euclidean, markovSequencer, gravitySequencer,
  gameOfLife, polyrhythm,
  compressor, eq, chorus, phaser, waveshaper, limiter, granular,
} from './nodes.js';
export type { NodeRef } from './types.js';
export type { NodeParams } from './nodes.js';
export { compile, decompile } from './compiler.js';
