// @chord/web — Browser SDK for the Chord audio programming environment
// Same concepts as the desktop app: nodes, connections, parameters.
// Runs on Web Audio API.

export { Chord } from './Chord.js';
export type { Connection } from './Chord.js';
export type { ChordNode } from './nodes.js';
export { createWebAudioNode } from './nodes.js';
