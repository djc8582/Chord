/**
 * Visualizer Store
 *
 * Zustand store managing visualization state: mode selection, target node,
 * waveform/spectrum data buffers, and display settings.
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Visualization display mode. */
export type VisualizerMode = "waveform" | "spectrum" | "both";

/** Waveform rendering style. */
export type WaveformStyle = "line" | "filled";

/** Spectrum rendering style. */
export type SpectrumStyle = "bars" | "line";

/** Supported FFT sizes. */
export type FftSize = 256 | 512 | 1024 | 2048;

/** Valid FFT sizes as a readonly array for runtime validation. */
export const VALID_FFT_SIZES: readonly FftSize[] = [256, 512, 1024, 2048] as const;

/** Color scheme for visualizations. */
export interface ColorScheme {
  waveformColor: string;
  spectrumColor: string;
  backgroundColor: string;
  gridColor: string;
  peakColor: string;
}

/** Default dark color scheme. */
export const DEFAULT_COLOR_SCHEME: ColorScheme = {
  waveformColor: "#22c55e",     // green
  spectrumColor: "#3b82f6",     // blue
  backgroundColor: "#111827",   // dark gray
  gridColor: "#374151",         // gray
  peakColor: "#ef4444",         // red
};

/** Visualizer display settings. */
export interface VisualizerSettings {
  fftSize: FftSize;
  colorScheme: ColorScheme;
  smoothing: number;               // 0..1, exponential smoothing factor
  waveformStyle: WaveformStyle;
  spectrumStyle: SpectrumStyle;
  logFrequencyScale: boolean;
  dbScale: boolean;
  autoScale: boolean;
  peakHold: boolean;
  peakDecayRate: number;           // dB per frame
}

/** Default settings. */
export const DEFAULT_SETTINGS: VisualizerSettings = {
  fftSize: 1024,
  colorScheme: DEFAULT_COLOR_SCHEME,
  smoothing: 0.8,
  waveformStyle: "line",
  spectrumStyle: "bars",
  logFrequencyScale: true,
  dbScale: true,
  autoScale: true,
  peakHold: false,
  peakDecayRate: 0.5,
};

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface VisualizerStore {
  // Current display mode
  mode: VisualizerMode;

  // Target node whose audio to visualize (null = none)
  targetNodeId: string | null;
  targetPort: string;

  // Data buffers
  waveformData: Float64Array;
  spectrumData: Float64Array;
  peakData: Float64Array;

  // Live/frozen toggle
  frozen: boolean;

  // Settings
  settings: VisualizerSettings;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /** Switch visualization mode. */
  setMode: (mode: VisualizerMode) => void;

  /** Cycle through modes: waveform -> spectrum -> both -> waveform. */
  cycleMode: () => void;

  /** Set target node to visualize. */
  setTargetNode: (nodeId: string | null, port?: string) => void;

  /** Update waveform data buffer. */
  setWaveformData: (data: Float64Array) => void;

  /** Update spectrum data buffer. */
  setSpectrumData: (data: Float64Array) => void;

  /** Update peak-hold data. */
  setPeakData: (data: Float64Array) => void;

  /** Toggle frozen/live mode. */
  toggleFrozen: () => void;

  /** Set frozen state explicitly. */
  setFrozen: (frozen: boolean) => void;

  // Settings mutations
  setFftSize: (size: FftSize) => void;
  setSmoothing: (value: number) => void;
  setColorScheme: (scheme: Partial<ColorScheme>) => void;
  setWaveformStyle: (style: WaveformStyle) => void;
  setSpectrumStyle: (style: SpectrumStyle) => void;
  setLogFrequencyScale: (enabled: boolean) => void;
  setDbScale: (enabled: boolean) => void;
  setAutoScale: (enabled: boolean) => void;
  setPeakHold: (enabled: boolean) => void;
  setPeakDecayRate: (rate: number) => void;

  /** Reset all settings to defaults. */
  resetSettings: () => void;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function isValidFftSize(size: number): size is FftSize {
  return VALID_FFT_SIZES.includes(size as FftSize);
}

export function clampSmoothing(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function clampPeakDecayRate(rate: number): number {
  return Math.max(0, Math.min(10, rate));
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useVisualizerStore = create<VisualizerStore>((set) => ({
  mode: "waveform",
  targetNodeId: null,
  targetPort: "output",
  waveformData: new Float64Array(0),
  spectrumData: new Float64Array(0),
  peakData: new Float64Array(0),
  frozen: false,
  settings: { ...DEFAULT_SETTINGS, colorScheme: { ...DEFAULT_COLOR_SCHEME } },

  setMode: (mode) => set({ mode }),

  cycleMode: () =>
    set((state) => {
      const order: VisualizerMode[] = ["waveform", "spectrum", "both"];
      const idx = order.indexOf(state.mode);
      return { mode: order[(idx + 1) % order.length] };
    }),

  setTargetNode: (nodeId, port) =>
    set({
      targetNodeId: nodeId,
      targetPort: port ?? "output",
      // Clear buffers on target change
      waveformData: new Float64Array(0),
      spectrumData: new Float64Array(0),
      peakData: new Float64Array(0),
    }),

  setWaveformData: (data) =>
    set((state) => (state.frozen ? state : { waveformData: data })),

  setSpectrumData: (data) =>
    set((state) => (state.frozen ? state : { spectrumData: data })),

  setPeakData: (data) =>
    set((state) => (state.frozen ? state : { peakData: data })),

  toggleFrozen: () => set((state) => ({ frozen: !state.frozen })),

  setFrozen: (frozen) => set({ frozen }),

  setFftSize: (size) => {
    if (!isValidFftSize(size)) return;
    set((state) => ({
      settings: { ...state.settings, fftSize: size },
      // Clear spectrum data when FFT size changes
      spectrumData: new Float64Array(0),
      peakData: new Float64Array(0),
    }));
  },

  setSmoothing: (value) =>
    set((state) => ({
      settings: { ...state.settings, smoothing: clampSmoothing(value) },
    })),

  setColorScheme: (scheme) =>
    set((state) => ({
      settings: {
        ...state.settings,
        colorScheme: { ...state.settings.colorScheme, ...scheme },
      },
    })),

  setWaveformStyle: (style) =>
    set((state) => ({ settings: { ...state.settings, waveformStyle: style } })),

  setSpectrumStyle: (style) =>
    set((state) => ({ settings: { ...state.settings, spectrumStyle: style } })),

  setLogFrequencyScale: (enabled) =>
    set((state) => ({
      settings: { ...state.settings, logFrequencyScale: enabled },
    })),

  setDbScale: (enabled) =>
    set((state) => ({ settings: { ...state.settings, dbScale: enabled } })),

  setAutoScale: (enabled) =>
    set((state) => ({ settings: { ...state.settings, autoScale: enabled } })),

  setPeakHold: (enabled) =>
    set((state) => ({
      settings: { ...state.settings, peakHold: enabled },
      // Clear peak data when disabling
      peakData: enabled ? state.peakData : new Float64Array(0),
    })),

  setPeakDecayRate: (rate) =>
    set((state) => ({
      settings: { ...state.settings, peakDecayRate: clampPeakDecayRate(rate) },
    })),

  resetSettings: () =>
    set({
      settings: { ...DEFAULT_SETTINGS, colorScheme: { ...DEFAULT_COLOR_SCHEME } },
    }),
}));
