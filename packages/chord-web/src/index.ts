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
export { subpatch } from './dsl/index.js';

// Config
export { defineConfig, type ChordConfig } from './config.js';

// Tiers
export { TIER_LIMITS, TIER_PRICING, checkTierAccess, checkNodeLimit, type Tier, type TierLimits } from './tiers.js';

// Attribution
export { generateAttribution, generateBadgeHTML, DEFAULT_ATTRIBUTION, type PatchLineage, type AttributionConfig } from './attribution.js';

// Discovery
export { generateChordRC, generateNpmPackageJSON, generatePatchPackageIndex, NPM_KEYWORDS, type ChordRC } from './discovery.js';

// Visualizers
export {
  getAnalysisFrame, createWaveform, createSpectrum, createLevelMeter, createParticles,
  useAudioReactive, bindAudioToCSS, THEMES, getTheme,
  type AudioAnalysisFrame, type VisualizerTheme
} from './visualizers/index.js';
