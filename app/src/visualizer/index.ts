/**
 * Visualizer Module
 *
 * Audio visualization components: waveform oscilloscope and frequency
 * spectrum analyzer.
 */

export { Visualizer } from "./Visualizer.js";
export type { VisualizerProps } from "./Visualizer.js";

export { Waveform } from "./Waveform.js";
export type { WaveformProps } from "./Waveform.js";

export { Spectrum } from "./Spectrum.js";
export type { SpectrumProps } from "./Spectrum.js";

export { useVisualizerStore } from "./store.js";
export type {
  VisualizerStore,
  VisualizerMode,
  VisualizerSettings,
  WaveformStyle,
  SpectrumStyle,
  FftSize,
  ColorScheme,
} from "./store.js";
export {
  DEFAULT_COLOR_SCHEME,
  DEFAULT_SETTINGS,
  VALID_FFT_SIZES,
  isValidFftSize,
  clampSmoothing,
  clampPeakDecayRate,
} from "./store.js";

export {
  fft,
  magnitudes,
  magnitudesHalf,
  magnitudeToDb,
  linearToLogPositions,
  generateSine,
  generateNoise,
  generateComposite,
  isPowerOfTwo,
  nextPowerOfTwo,
  applyHannWindow,
} from "./dsp.js";
export type { Complex } from "./dsp.js";
