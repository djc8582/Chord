/**
 * Chord Visualizer Ecosystem
 *
 * Wave 1 — Core:
 *   createWaveform()    Oscilloscope display
 *   createSpectrum()    Frequency analyzer
 *   createLevelMeter()  RMS/Peak meter
 *   createParticles()   Audio-reactive particles
 *
 * Wave 2 — Musical:
 *   createPianoRoll()     Live piano roll
 *   createChordDisplay()  Chord/note detection display
 *   createDrumGrid()      Step sequencer grid
 *   createMelodyContour() Pitch contour tracker
 *
 * Wave 3 — Creative:
 *   createGeometry()      Audio-reactive wireframe sphere
 *   createKaleidoscope()  Kaleidoscope mirror effect
 *
 * Wave 4 — UI Primitives:
 *   createAudioBackground()  Audio-reactive gradient background
 *   createAudioLoader()      Audio-reactive loading spinner
 *
 * Wave 5 — Advanced:
 *   createSpectrogram()   Time-frequency heatmap
 *   createStereoField()   Goniometer/vectorscope
 *   createTerrain()       3D landscape from spectrum
 *   createNetwork()       Constellation/network graph
 *
 * Wave 6 — Composition:
 *   createNodeGraph()     Signal flow visualization
 *   createSequencerGrid() Universal sequencer display
 *
 * Analysis:
 *   getAnalysisFrame()  Extract analysis from Chord engine
 *
 * UI Primitives:
 *   useAudioReactive()  React hook for audio-reactive UI
 *   bindAudioToCSS()    Inject CSS custom properties from audio
 *
 * Themes:
 *   THEMES, getTheme()  Built-in visual themes
 */

// Wave 1
export { getAnalysisFrame } from './analysis.js';
export { createWaveform, type WaveformOptions } from './Waveform.js';
export { createSpectrum, type SpectrumOptions } from './Spectrum.js';
export { createLevelMeter, type LevelMeterOptions } from './LevelMeter.js';
export { createParticles, type ParticlesOptions } from './Particles.js';
export { useAudioReactive, bindAudioToCSS } from './hooks.js';
export { THEMES, getTheme, type AudioAnalysisFrame, type VisualizerTheme } from './types.js';

// Wave 2 — Musical
export { createPianoRoll, type PianoRollOptions } from './PianoRoll.js';
export { createChordDisplay, type ChordDisplayOptions } from './ChordDisplay.js';
export { createDrumGrid, type DrumGridOptions } from './DrumGrid.js';
export { createMelodyContour, type MelodyContourOptions } from './MelodyContour.js';

// Wave 3 — Creative
export { createGeometry, type GeometryOptions } from './Geometry.js';
export { createKaleidoscope, type KaleidoscopeOptions } from './Kaleidoscope.js';

// Wave 4 — UI Primitives
export { createAudioBackground, type AudioBackgroundOptions } from './AudioBackground.js';
export { createAudioLoader, type AudioLoaderOptions } from './AudioLoader.js';

// Wave 5 — Advanced
export { createSpectrogram, type SpectrogramOptions } from './Spectrogram.js';
export { createStereoField, type StereoFieldOptions } from './StereoField.js';
export { createTerrain, type TerrainOptions } from './Terrain.js';
export { createNetwork, type NetworkOptions } from './Network.js';

// Wave 6 — Composition
export { createNodeGraph, type NodeGraphOptions } from './NodeGraph.js';
export { createSequencerGrid, type SequencerGridOptions } from './SequencerGrid.js';
