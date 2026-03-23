/**
 * Chord Visualizer Ecosystem
 *
 * Visualizers:
 *   createWaveform()    Oscilloscope display
 *   createSpectrum()    Frequency analyzer
 *   createLevelMeter()  RMS/Peak meter
 *   createParticles()   Audio-reactive particles
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

export { getAnalysisFrame } from './analysis.js';
export { createWaveform, type WaveformOptions } from './Waveform.js';
export { createSpectrum, type SpectrumOptions } from './Spectrum.js';
export { createLevelMeter, type LevelMeterOptions } from './LevelMeter.js';
export { createParticles, type ParticlesOptions } from './Particles.js';
export { useAudioReactive, bindAudioToCSS } from './hooks.js';
export { THEMES, getTheme, type AudioAnalysisFrame, type VisualizerTheme } from './types.js';
