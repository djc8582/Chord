// @chord/web — Browser SDK for the Chord audio programming environment.
//
// Two APIs:
//   High-level:  const music = Chord.create('warm ambient'); music.start();
//   Low-level:   const engine = new Chord(); engine.addNode('oscillator'); ...
//
// Runs on Web Audio API. Zero dependencies. ~50KB.

export { Chord } from './Chord.js';
export { ChordPatch } from './ChordPatch.js';
export { Sounds } from './sounds.js';
export type { Connection } from './Chord.js';
export type { ChordNode } from './nodes.js';
export { createWebAudioNode, resolveNodeType, getNodeTypes } from './nodes.js';

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
  // Wave 1
  getAnalysisFrame, createWaveform, createSpectrum, createLevelMeter, createParticles,
  useAudioReactive, bindAudioToCSS, THEMES, getTheme,
  type AudioAnalysisFrame, type VisualizerTheme,
  type WaveformOptions, type SpectrumOptions, type LevelMeterOptions, type ParticlesOptions,
  // Wave 2 — Musical
  createPianoRoll, type PianoRollOptions,
  createChordDisplay, type ChordDisplayOptions,
  createDrumGrid, type DrumGridOptions,
  createMelodyContour, type MelodyContourOptions,
  // Wave 3 — Creative
  createGeometry, type GeometryOptions,
  createKaleidoscope, type KaleidoscopeOptions,
  // Wave 4 — UI Primitives
  createAudioBackground, type AudioBackgroundOptions,
  createAudioLoader, type AudioLoaderOptions,
  // Wave 5 — Advanced
  createSpectrogram, type SpectrogramOptions,
  createStereoField, type StereoFieldOptions,
  createTerrain, type TerrainOptions,
  createNetwork, type NetworkOptions,
  // Wave 6 — Composition
  createNodeGraph, type NodeGraphOptions,
  createSequencerGrid, type SequencerGridOptions,
} from './visualizers/index.js';

// Generative Music Systems
export { RhythmEngine, type DrumTrack } from './rhythm-engine.js';
export { HarmonicSequencer, type ChordSymbol, type CompEvent } from './harmonic-sequencer.js';
export { WalkingBassGenerator, type BassNote } from './walking-bass.js';
export { SoloGenerator, type SoloNote } from './solo-generator.js';
