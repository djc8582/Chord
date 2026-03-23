// @chord/web — Browser SDK for the Chord audio programming environment
// Same concepts as the desktop app: nodes, connections, parameters.
// Runs on Web Audio API.

export { Chord } from './Chord.js';
export type { Connection } from './Chord.js';
export type { ChordNode } from './nodes.js';
export { createWebAudioNode } from './nodes.js';

// DSL
export { patch, compile, decompile } from './dsl/index.js';
export { osc, filter, gain, delay, reverb, noise, mixer, output, lfo, envelope } from './dsl/index.js';
export { kickDrum, snareDrum, hiHat, clap, tom } from './dsl/index.js';
export { stepSequencer, euclidean, markovSequencer, gravitySequencer, gameOfLife, polyrhythm } from './dsl/index.js';
export { compressor, eq, chorus, phaser, waveshaper, limiter, granular } from './dsl/index.js';
