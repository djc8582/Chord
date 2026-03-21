/**
 * Visualizer Module Tests
 *
 * Tests covering:
 * - Visualizer store state management (mode toggle, node selection)
 * - FFT/DFT produces correct frequency bins for known sine wave input
 * - Waveform data buffer management
 * - Spectrum data conversion (linear to log, magnitude to dB)
 * - Settings validation
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
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
import {
  useVisualizerStore,
  DEFAULT_SETTINGS,
  DEFAULT_COLOR_SCHEME,
  VALID_FFT_SIZES,
  isValidFftSize,
  clampSmoothing,
  clampPeakDecayRate,
} from "./store.js";
import type { VisualizerMode, FftSize } from "./store.js";

// ---------------------------------------------------------------------------
// Reset store before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  useVisualizerStore.setState({
    mode: "waveform",
    targetNodeId: null,
    targetPort: "output",
    waveformData: new Float64Array(0),
    spectrumData: new Float64Array(0),
    peakData: new Float64Array(0),
    frozen: false,
    settings: { ...DEFAULT_SETTINGS, colorScheme: { ...DEFAULT_COLOR_SCHEME } },
  });
});

// ===========================================================================
// DSP Utilities
// ===========================================================================

// ---------------------------------------------------------------------------
// isPowerOfTwo / nextPowerOfTwo
// ---------------------------------------------------------------------------

describe("isPowerOfTwo", () => {
  it("returns true for powers of two", () => {
    expect(isPowerOfTwo(1)).toBe(true);
    expect(isPowerOfTwo(2)).toBe(true);
    expect(isPowerOfTwo(4)).toBe(true);
    expect(isPowerOfTwo(256)).toBe(true);
    expect(isPowerOfTwo(1024)).toBe(true);
    expect(isPowerOfTwo(2048)).toBe(true);
  });

  it("returns false for non-powers of two", () => {
    expect(isPowerOfTwo(0)).toBe(false);
    expect(isPowerOfTwo(3)).toBe(false);
    expect(isPowerOfTwo(5)).toBe(false);
    expect(isPowerOfTwo(6)).toBe(false);
    expect(isPowerOfTwo(100)).toBe(false);
    expect(isPowerOfTwo(-4)).toBe(false);
  });
});

describe("nextPowerOfTwo", () => {
  it("returns the same value for powers of two", () => {
    expect(nextPowerOfTwo(1)).toBe(1);
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(256)).toBe(256);
    expect(nextPowerOfTwo(1024)).toBe(1024);
  });

  it("rounds up to the next power of two", () => {
    expect(nextPowerOfTwo(3)).toBe(4);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(100)).toBe(128);
    expect(nextPowerOfTwo(1000)).toBe(1024);
    expect(nextPowerOfTwo(1025)).toBe(2048);
  });

  it("handles edge cases", () => {
    expect(nextPowerOfTwo(0)).toBe(1);
    expect(nextPowerOfTwo(1)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// FFT
// ---------------------------------------------------------------------------

describe("fft", () => {
  it("returns empty array for empty input", () => {
    expect(fft([])).toEqual([]);
  });

  it("handles single-sample input", () => {
    const result = fft([5.0]);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBeCloseTo(5.0);
    expect(result[0][1]).toBeCloseTo(0.0);
  });

  it("handles DC signal (all same value)", () => {
    const dc = new Float64Array(8).fill(1.0);
    const result = fft(dc);
    expect(result).toHaveLength(8);
    // Bin 0 (DC) should have magnitude = N
    expect(result[0][0]).toBeCloseTo(8.0);
    expect(result[0][1]).toBeCloseTo(0.0);
    // All other bins should be zero
    for (let i = 1; i < 8; i++) {
      expect(Math.abs(result[i][0])).toBeLessThan(1e-10);
      expect(Math.abs(result[i][1])).toBeLessThan(1e-10);
    }
  });

  it("throws for non-power-of-two length", () => {
    expect(() => fft([1, 2, 3])).toThrow();
    expect(() => fft(new Float64Array(6))).toThrow();
  });

  it("identifies the correct frequency bin for a pure sine wave", () => {
    const N = 256;
    const sampleRate = 256; // 1 Hz per bin
    const frequency = 10;   // Should peak at bin 10

    const sine = generateSine(N, frequency, sampleRate);
    const spectrum = fft(sine);
    const mags = magnitudes(spectrum);

    // Find the bin with maximum magnitude (excluding DC)
    let maxBin = 1;
    let maxMag = 0;
    for (let i = 1; i < N / 2; i++) {
      if (mags[i] > maxMag) {
        maxMag = mags[i];
        maxBin = i;
      }
    }

    expect(maxBin).toBe(frequency);
  });

  it("identifies correct bin for higher frequency sine", () => {
    const N = 1024;
    const sampleRate = 44100;
    const frequency = 1000; // ~1000 Hz

    const sine = generateSine(N, frequency, sampleRate);
    const spectrum = fft(sine);
    const mags = magnitudes(spectrum);

    // Expected bin: frequency * N / sampleRate
    const expectedBin = Math.round((frequency * N) / sampleRate);

    let maxBin = 1;
    let maxMag = 0;
    for (let i = 1; i < N / 2; i++) {
      if (mags[i] > maxMag) {
        maxMag = mags[i];
        maxBin = i;
      }
    }

    // Should be within 1 bin of expected
    expect(Math.abs(maxBin - expectedBin)).toBeLessThanOrEqual(1);
  });

  it("produces two peaks for a composite of two sines", () => {
    const N = 512;
    const sampleRate = 512; // 1 Hz per bin

    const signal = generateComposite(N, [
      [20, 1.0],
      [50, 0.8],
    ], sampleRate);

    const spectrum = fft(signal);
    const mags = magnitudesHalf(spectrum);

    // Find top 2 peaks
    const indexed = Array.from(mags).map((m, i) => ({ bin: i, mag: m }));
    indexed.sort((a, b) => b.mag - a.mag);

    const topBins = new Set([indexed[0].bin, indexed[1].bin]);
    expect(topBins).toContain(20);
    expect(topBins).toContain(50);
  });

  it("Parseval's theorem: energy in time domain equals energy in frequency domain", () => {
    const N = 256;
    const signal = generateSine(N, 30, N, 0.7);
    const spectrum = fft(signal);

    // Time-domain energy
    let timeEnergy = 0;
    for (let i = 0; i < N; i++) {
      timeEnergy += signal[i] * signal[i];
    }

    // Frequency-domain energy (divided by N per Parseval's)
    let freqEnergy = 0;
    for (let i = 0; i < N; i++) {
      const [re, im] = spectrum[i];
      freqEnergy += re * re + im * im;
    }
    freqEnergy /= N;

    expect(freqEnergy).toBeCloseTo(timeEnergy, 5);
  });
});

// ---------------------------------------------------------------------------
// magnitudes / magnitudesHalf
// ---------------------------------------------------------------------------

describe("magnitudes", () => {
  it("computes correct magnitudes", () => {
    const mags = magnitudes([[3, 4], [0, 1], [1, 0]]);
    expect(mags[0]).toBeCloseTo(5.0);
    expect(mags[1]).toBeCloseTo(1.0);
    expect(mags[2]).toBeCloseTo(1.0);
  });

  it("returns Float64Array", () => {
    const mags = magnitudes([[1, 0]]);
    expect(mags).toBeInstanceOf(Float64Array);
  });
});

describe("magnitudesHalf", () => {
  it("returns only the first N/2 elements", () => {
    const N = 8;
    const dc = new Float64Array(N).fill(1.0);
    const spectrum = fft(dc);
    const halfMags = magnitudesHalf(spectrum);

    expect(halfMags.length).toBe(N / 2);
  });
});

// ---------------------------------------------------------------------------
// magnitudeToDb
// ---------------------------------------------------------------------------

describe("magnitudeToDb", () => {
  it("converts 1.0 to 0 dB", () => {
    const mags = new Float64Array([1.0]);
    const db = magnitudeToDb(mags);
    expect(db[0]).toBeCloseTo(0.0);
  });

  it("converts 0.1 to -20 dB", () => {
    const mags = new Float64Array([0.1]);
    const db = magnitudeToDb(mags);
    expect(db[0]).toBeCloseTo(-20.0, 1);
  });

  it("converts 0.01 to -40 dB", () => {
    const mags = new Float64Array([0.01]);
    const db = magnitudeToDb(mags);
    expect(db[0]).toBeCloseTo(-40.0, 1);
  });

  it("floors zero magnitude at minDb", () => {
    const mags = new Float64Array([0.0]);
    const db = magnitudeToDb(mags, -80);
    expect(db[0]).toBe(-80);
  });

  it("floors negative values at minDb", () => {
    // Magnitude should never be negative, but handle gracefully
    const mags = new Float64Array([-1.0]);
    const db = magnitudeToDb(mags, -100);
    expect(db[0]).toBe(-100);
  });

  it("respects custom minDb floor", () => {
    const mags = new Float64Array([1e-10]);
    const db60 = magnitudeToDb(mags, -60);
    expect(db60[0]).toBe(-60);

    const db120 = magnitudeToDb(mags, -120);
    // 20*log10(1e-10) = -200, clamped to -120
    expect(db120[0]).toBe(-120);
  });

  it("handles multiple values correctly", () => {
    const mags = new Float64Array([1.0, 0.5, 0.25, 0.0]);
    const db = magnitudeToDb(mags);

    expect(db[0]).toBeCloseTo(0.0);
    expect(db[1]).toBeCloseTo(-6.02, 1);    // 20*log10(0.5)
    expect(db[2]).toBeCloseTo(-12.04, 1);   // 20*log10(0.25)
    expect(db[3]).toBe(-100);               // floor
  });
});

// ---------------------------------------------------------------------------
// linearToLogPositions
// ---------------------------------------------------------------------------

describe("linearToLogPositions", () => {
  it("returns Float64Array of correct length", () => {
    const positions = linearToLogPositions(512, 44100);
    expect(positions).toBeInstanceOf(Float64Array);
    expect(positions.length).toBe(512);
  });

  it("positions are in [0, 1] range", () => {
    const positions = linearToLogPositions(256, 44100);
    for (let i = 0; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(0);
      expect(positions[i]).toBeLessThanOrEqual(1);
    }
  });

  it("positions are monotonically non-decreasing", () => {
    const positions = linearToLogPositions(128, 44100);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
    }
  });

  it("low-frequency bins are spaced wider than high-frequency bins in log scale", () => {
    const positions = linearToLogPositions(256, 44100);
    // Compare spacing of early bins (low freq) vs late bins (high freq)
    // In log scale, low-frequency bins should be spread out more on the axis
    // Look at bins in mid/upper range
    const lowSpacing = positions[10] - positions[5];
    const highSpacing = positions[250] - positions[245];
    // In log scale, the high-freq bins are closer together on the [0,1] axis
    // while low-freq bins spread wider -- so lowSpacing > highSpacing
    expect(lowSpacing).toBeGreaterThan(highSpacing);
  });

  it("handles custom min/max frequency", () => {
    const positions = linearToLogPositions(100, 44100, 100, 10000);
    // All values should still be in [0, 1]
    for (let i = 0; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(0);
      expect(positions[i]).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Signal generators
// ---------------------------------------------------------------------------

describe("generateSine", () => {
  it("produces correct length buffer", () => {
    const buffer = generateSine(1024, 440, 44100);
    expect(buffer.length).toBe(1024);
    expect(buffer).toBeInstanceOf(Float64Array);
  });

  it("values are within amplitude range", () => {
    const buffer = generateSine(256, 440, 44100, 0.5);
    for (let i = 0; i < buffer.length; i++) {
      expect(Math.abs(buffer[i])).toBeLessThanOrEqual(0.5 + 1e-10);
    }
  });

  it("first sample is near zero for sine", () => {
    const buffer = generateSine(1024, 100, 44100);
    expect(buffer[0]).toBeCloseTo(0, 5);
  });
});

describe("generateNoise", () => {
  it("produces correct length buffer", () => {
    const buffer = generateNoise(512);
    expect(buffer.length).toBe(512);
  });

  it("values are within amplitude range", () => {
    const buffer = generateNoise(1024, 0.8);
    for (let i = 0; i < buffer.length; i++) {
      expect(Math.abs(buffer[i])).toBeLessThanOrEqual(0.8 + 1e-10);
    }
  });

  it("is not all zeros", () => {
    const buffer = generateNoise(256);
    const hasNonZero = buffer.some((v) => v !== 0);
    expect(hasNonZero).toBe(true);
  });
});

describe("generateComposite", () => {
  it("produces correct length buffer", () => {
    const buffer = generateComposite(512, [[100, 1.0], [200, 0.5]], 44100);
    expect(buffer.length).toBe(512);
  });
});

// ---------------------------------------------------------------------------
// applyHannWindow
// ---------------------------------------------------------------------------

describe("applyHannWindow", () => {
  it("zeroes the first and last samples", () => {
    const buffer = new Float64Array([1, 1, 1, 1, 1, 1, 1, 1]);
    applyHannWindow(buffer);
    expect(buffer[0]).toBeCloseTo(0, 5);
    expect(buffer[buffer.length - 1]).toBeCloseTo(0, 5);
  });

  it("peaks near the middle", () => {
    const N = 64;
    const buffer = new Float64Array(N).fill(1.0);
    applyHannWindow(buffer);
    // The middle sample should be close to 1.0
    const mid = Math.floor(N / 2);
    expect(buffer[mid]).toBeGreaterThan(0.9);
  });
});

// ===========================================================================
// Visualizer Store
// ===========================================================================

// ---------------------------------------------------------------------------
// Mode toggle
// ---------------------------------------------------------------------------

describe("store: mode toggle", () => {
  it("starts in waveform mode", () => {
    expect(useVisualizerStore.getState().mode).toBe("waveform");
  });

  it("setMode changes the mode", () => {
    useVisualizerStore.getState().setMode("spectrum");
    expect(useVisualizerStore.getState().mode).toBe("spectrum");

    useVisualizerStore.getState().setMode("both");
    expect(useVisualizerStore.getState().mode).toBe("both");

    useVisualizerStore.getState().setMode("waveform");
    expect(useVisualizerStore.getState().mode).toBe("waveform");
  });

  it("cycleMode cycles through waveform -> spectrum -> both -> waveform", () => {
    expect(useVisualizerStore.getState().mode).toBe("waveform");

    useVisualizerStore.getState().cycleMode();
    expect(useVisualizerStore.getState().mode).toBe("spectrum");

    useVisualizerStore.getState().cycleMode();
    expect(useVisualizerStore.getState().mode).toBe("both");

    useVisualizerStore.getState().cycleMode();
    expect(useVisualizerStore.getState().mode).toBe("waveform");
  });
});

// ---------------------------------------------------------------------------
// Node selection
// ---------------------------------------------------------------------------

describe("store: node selection", () => {
  it("starts with no target node", () => {
    const state = useVisualizerStore.getState();
    expect(state.targetNodeId).toBeNull();
    expect(state.targetPort).toBe("output");
  });

  it("setTargetNode updates target node and port", () => {
    useVisualizerStore.getState().setTargetNode("node-1", "out_left");
    const state = useVisualizerStore.getState();
    expect(state.targetNodeId).toBe("node-1");
    expect(state.targetPort).toBe("out_left");
  });

  it("setTargetNode defaults port to 'output'", () => {
    useVisualizerStore.getState().setTargetNode("node-2");
    expect(useVisualizerStore.getState().targetPort).toBe("output");
  });

  it("setTargetNode clears data buffers", () => {
    // First set some data
    useVisualizerStore.getState().setWaveformData(new Float64Array([1, 2, 3]));
    useVisualizerStore.getState().setSpectrumData(new Float64Array([4, 5, 6]));

    // Now change target
    useVisualizerStore.getState().setTargetNode("node-3");

    const state = useVisualizerStore.getState();
    expect(state.waveformData.length).toBe(0);
    expect(state.spectrumData.length).toBe(0);
    expect(state.peakData.length).toBe(0);
  });

  it("setTargetNode(null) clears the target", () => {
    useVisualizerStore.getState().setTargetNode("node-1");
    useVisualizerStore.getState().setTargetNode(null);
    expect(useVisualizerStore.getState().targetNodeId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Waveform data buffer management
// ---------------------------------------------------------------------------

describe("store: waveform data buffer", () => {
  it("starts with empty buffer", () => {
    expect(useVisualizerStore.getState().waveformData.length).toBe(0);
  });

  it("setWaveformData updates the buffer", () => {
    const data = new Float64Array([0.1, 0.5, -0.3, 0.0]);
    useVisualizerStore.getState().setWaveformData(data);
    const state = useVisualizerStore.getState();
    expect(state.waveformData.length).toBe(4);
    expect(state.waveformData[1]).toBeCloseTo(0.5);
  });

  it("setWaveformData replaces previous data", () => {
    useVisualizerStore.getState().setWaveformData(new Float64Array([1, 2, 3]));
    useVisualizerStore.getState().setWaveformData(new Float64Array([4, 5]));
    expect(useVisualizerStore.getState().waveformData.length).toBe(2);
    expect(useVisualizerStore.getState().waveformData[0]).toBeCloseTo(4);
  });

  it("does not update waveform data when frozen", () => {
    useVisualizerStore.getState().setWaveformData(new Float64Array([1, 2, 3]));
    useVisualizerStore.getState().setFrozen(true);
    useVisualizerStore.getState().setWaveformData(new Float64Array([7, 8, 9]));

    // Should still have original data
    const state = useVisualizerStore.getState();
    expect(state.waveformData[0]).toBeCloseTo(1);
    expect(state.waveformData.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Spectrum data buffer management
// ---------------------------------------------------------------------------

describe("store: spectrum data buffer", () => {
  it("setSpectrumData updates the buffer", () => {
    const data = new Float64Array([10, 20, 30]);
    useVisualizerStore.getState().setSpectrumData(data);
    expect(useVisualizerStore.getState().spectrumData.length).toBe(3);
  });

  it("does not update spectrum data when frozen", () => {
    useVisualizerStore.getState().setSpectrumData(new Float64Array([1, 2]));
    useVisualizerStore.getState().setFrozen(true);
    useVisualizerStore.getState().setSpectrumData(new Float64Array([9, 8]));

    expect(useVisualizerStore.getState().spectrumData[0]).toBeCloseTo(1);
  });

  it("setPeakData updates peak hold buffer", () => {
    const peaks = new Float64Array([5, 10, 15]);
    useVisualizerStore.getState().setPeakData(peaks);
    expect(useVisualizerStore.getState().peakData.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Frozen / live toggle
// ---------------------------------------------------------------------------

describe("store: frozen/live toggle", () => {
  it("starts in live mode (not frozen)", () => {
    expect(useVisualizerStore.getState().frozen).toBe(false);
  });

  it("toggleFrozen switches between frozen and live", () => {
    useVisualizerStore.getState().toggleFrozen();
    expect(useVisualizerStore.getState().frozen).toBe(true);

    useVisualizerStore.getState().toggleFrozen();
    expect(useVisualizerStore.getState().frozen).toBe(false);
  });

  it("setFrozen sets explicit state", () => {
    useVisualizerStore.getState().setFrozen(true);
    expect(useVisualizerStore.getState().frozen).toBe(true);

    useVisualizerStore.getState().setFrozen(false);
    expect(useVisualizerStore.getState().frozen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe("store: settings", () => {
  it("starts with default settings", () => {
    const { settings } = useVisualizerStore.getState();
    expect(settings.fftSize).toBe(DEFAULT_SETTINGS.fftSize);
    expect(settings.smoothing).toBe(DEFAULT_SETTINGS.smoothing);
    expect(settings.waveformStyle).toBe(DEFAULT_SETTINGS.waveformStyle);
    expect(settings.spectrumStyle).toBe(DEFAULT_SETTINGS.spectrumStyle);
    expect(settings.logFrequencyScale).toBe(DEFAULT_SETTINGS.logFrequencyScale);
    expect(settings.dbScale).toBe(DEFAULT_SETTINGS.dbScale);
    expect(settings.autoScale).toBe(DEFAULT_SETTINGS.autoScale);
    expect(settings.peakHold).toBe(DEFAULT_SETTINGS.peakHold);
  });

  it("setFftSize updates FFT size", () => {
    useVisualizerStore.getState().setFftSize(2048);
    expect(useVisualizerStore.getState().settings.fftSize).toBe(2048);
  });

  it("setFftSize clears spectrum data", () => {
    useVisualizerStore.getState().setSpectrumData(new Float64Array([1, 2, 3]));
    useVisualizerStore.getState().setFftSize(512);
    expect(useVisualizerStore.getState().spectrumData.length).toBe(0);
  });

  it("setFftSize rejects invalid sizes", () => {
    useVisualizerStore.getState().setFftSize(1024);
    // Try to set an invalid size — should be ignored
    useVisualizerStore.getState().setFftSize(300 as FftSize);
    expect(useVisualizerStore.getState().settings.fftSize).toBe(1024);
  });

  it("setSmoothing clamps to [0, 1]", () => {
    useVisualizerStore.getState().setSmoothing(0.5);
    expect(useVisualizerStore.getState().settings.smoothing).toBe(0.5);

    useVisualizerStore.getState().setSmoothing(-0.5);
    expect(useVisualizerStore.getState().settings.smoothing).toBe(0);

    useVisualizerStore.getState().setSmoothing(1.5);
    expect(useVisualizerStore.getState().settings.smoothing).toBe(1);
  });

  it("setColorScheme merges partial scheme", () => {
    useVisualizerStore.getState().setColorScheme({ waveformColor: "#ff0000" });
    const { colorScheme } = useVisualizerStore.getState().settings;
    expect(colorScheme.waveformColor).toBe("#ff0000");
    // Other colors should remain at defaults
    expect(colorScheme.spectrumColor).toBe(DEFAULT_COLOR_SCHEME.spectrumColor);
    expect(colorScheme.backgroundColor).toBe(DEFAULT_COLOR_SCHEME.backgroundColor);
  });

  it("setWaveformStyle updates the style", () => {
    useVisualizerStore.getState().setWaveformStyle("filled");
    expect(useVisualizerStore.getState().settings.waveformStyle).toBe("filled");
  });

  it("setSpectrumStyle updates the style", () => {
    useVisualizerStore.getState().setSpectrumStyle("line");
    expect(useVisualizerStore.getState().settings.spectrumStyle).toBe("line");
  });

  it("setLogFrequencyScale toggles log scale", () => {
    useVisualizerStore.getState().setLogFrequencyScale(false);
    expect(useVisualizerStore.getState().settings.logFrequencyScale).toBe(false);
  });

  it("setDbScale toggles dB scale", () => {
    useVisualizerStore.getState().setDbScale(false);
    expect(useVisualizerStore.getState().settings.dbScale).toBe(false);
  });

  it("setAutoScale toggles auto-scaling", () => {
    useVisualizerStore.getState().setAutoScale(false);
    expect(useVisualizerStore.getState().settings.autoScale).toBe(false);
  });

  it("setPeakHold toggles peak hold", () => {
    useVisualizerStore.getState().setPeakHold(true);
    expect(useVisualizerStore.getState().settings.peakHold).toBe(true);
  });

  it("setPeakHold(false) clears peak data", () => {
    useVisualizerStore.getState().setPeakData(new Float64Array([1, 2, 3]));
    useVisualizerStore.getState().setPeakHold(true);
    // Peak data should still be there
    expect(useVisualizerStore.getState().peakData.length).toBe(3);

    useVisualizerStore.getState().setPeakHold(false);
    expect(useVisualizerStore.getState().peakData.length).toBe(0);
  });

  it("setPeakDecayRate clamps to [0, 10]", () => {
    useVisualizerStore.getState().setPeakDecayRate(3.0);
    expect(useVisualizerStore.getState().settings.peakDecayRate).toBe(3.0);

    useVisualizerStore.getState().setPeakDecayRate(-1);
    expect(useVisualizerStore.getState().settings.peakDecayRate).toBe(0);

    useVisualizerStore.getState().setPeakDecayRate(20);
    expect(useVisualizerStore.getState().settings.peakDecayRate).toBe(10);
  });

  it("resetSettings restores all defaults", () => {
    // Change several settings
    useVisualizerStore.getState().setFftSize(2048);
    useVisualizerStore.getState().setSmoothing(0.3);
    useVisualizerStore.getState().setWaveformStyle("filled");
    useVisualizerStore.getState().setSpectrumStyle("line");
    useVisualizerStore.getState().setColorScheme({ waveformColor: "#ff0000" });

    useVisualizerStore.getState().resetSettings();

    const { settings } = useVisualizerStore.getState();
    expect(settings.fftSize).toBe(DEFAULT_SETTINGS.fftSize);
    expect(settings.smoothing).toBe(DEFAULT_SETTINGS.smoothing);
    expect(settings.waveformStyle).toBe(DEFAULT_SETTINGS.waveformStyle);
    expect(settings.spectrumStyle).toBe(DEFAULT_SETTINGS.spectrumStyle);
    expect(settings.colorScheme.waveformColor).toBe(DEFAULT_COLOR_SCHEME.waveformColor);
  });
});

// ---------------------------------------------------------------------------
// Settings validation helpers
// ---------------------------------------------------------------------------

describe("settings validation", () => {
  it("isValidFftSize validates supported sizes", () => {
    expect(isValidFftSize(256)).toBe(true);
    expect(isValidFftSize(512)).toBe(true);
    expect(isValidFftSize(1024)).toBe(true);
    expect(isValidFftSize(2048)).toBe(true);

    expect(isValidFftSize(128)).toBe(false);
    expect(isValidFftSize(300)).toBe(false);
    expect(isValidFftSize(4096)).toBe(false);
    expect(isValidFftSize(0)).toBe(false);
  });

  it("VALID_FFT_SIZES contains all supported sizes", () => {
    expect(VALID_FFT_SIZES).toEqual([256, 512, 1024, 2048]);
  });

  it("clampSmoothing clamps to [0, 1]", () => {
    expect(clampSmoothing(0.5)).toBe(0.5);
    expect(clampSmoothing(0)).toBe(0);
    expect(clampSmoothing(1)).toBe(1);
    expect(clampSmoothing(-0.1)).toBe(0);
    expect(clampSmoothing(1.1)).toBe(1);
  });

  it("clampPeakDecayRate clamps to [0, 10]", () => {
    expect(clampPeakDecayRate(5)).toBe(5);
    expect(clampPeakDecayRate(0)).toBe(0);
    expect(clampPeakDecayRate(10)).toBe(10);
    expect(clampPeakDecayRate(-1)).toBe(0);
    expect(clampPeakDecayRate(15)).toBe(10);
  });
});
