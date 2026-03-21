/**
 * DSP Utilities for Visualization
 *
 * Simple DFT/FFT and signal processing helpers for the visualizer module.
 * These are not optimized for real-time audio processing — they're meant
 * for visualization at display refresh rates.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A complex number represented as [real, imaginary]. */
export type Complex = [number, number];

// ---------------------------------------------------------------------------
// FFT (Radix-2 Cooley–Tukey)
// ---------------------------------------------------------------------------

/**
 * Compute the radix-2 FFT of a real-valued input signal.
 *
 * @param input - Time-domain samples. Length MUST be a power of 2.
 * @returns Array of Complex values (length = input.length).
 */
export function fft(input: Float64Array | number[]): Complex[] {
  const N = input.length;
  if (N === 0) return [];
  if (!isPowerOfTwo(N)) {
    throw new Error(`FFT input length must be a power of 2, got ${N}`);
  }

  // Convert real input to complex
  const complexInput: Complex[] = new Array(N);
  for (let i = 0; i < N; i++) {
    complexInput[i] = [input[i], 0];
  }

  return fftComplex(complexInput);
}

/**
 * In-place radix-2 Cooley–Tukey FFT on complex data.
 */
function fftComplex(data: Complex[]): Complex[] {
  const N = data.length;
  if (N <= 1) return data;

  // Bit-reversal permutation
  const result = bitReversalPermutation(data);

  // Iterative butterfly stages
  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size / 2;
    const angleStep = (-2 * Math.PI) / size;

    for (let i = 0; i < N; i += size) {
      for (let j = 0; j < halfSize; j++) {
        const angle = angleStep * j;
        const twiddleReal = Math.cos(angle);
        const twiddleImag = Math.sin(angle);

        const evenIdx = i + j;
        const oddIdx = i + j + halfSize;

        const [oddR, oddI] = result[oddIdx];
        const tR = twiddleReal * oddR - twiddleImag * oddI;
        const tI = twiddleReal * oddI + twiddleImag * oddR;

        const [evenR, evenI] = result[evenIdx];
        result[evenIdx] = [evenR + tR, evenI + tI];
        result[oddIdx] = [evenR - tR, evenI - tI];
      }
    }
  }

  return result;
}

/**
 * Bit-reversal permutation of the input array.
 */
function bitReversalPermutation(data: Complex[]): Complex[] {
  const N = data.length;
  const result: Complex[] = new Array(N);
  const bits = Math.log2(N);

  for (let i = 0; i < N; i++) {
    let reversed = 0;
    let val = i;
    for (let b = 0; b < bits; b++) {
      reversed = (reversed << 1) | (val & 1);
      val >>= 1;
    }
    result[reversed] = data[i];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Spectrum helpers
// ---------------------------------------------------------------------------

/**
 * Compute the magnitude of each FFT bin.
 *
 * @param spectrum - Complex FFT output.
 * @returns Magnitude for each bin (only the first N/2 + 1 bins are unique
 *          for real input, but we return all N for flexibility).
 */
export function magnitudes(spectrum: Complex[]): Float64Array {
  const result = new Float64Array(spectrum.length);
  for (let i = 0; i < spectrum.length; i++) {
    const [re, im] = spectrum[i];
    result[i] = Math.sqrt(re * re + im * im);
  }
  return result;
}

/**
 * Return only the first N/2 magnitudes (the meaningful part for real input).
 */
export function magnitudesHalf(spectrum: Complex[]): Float64Array {
  const halfLen = Math.floor(spectrum.length / 2);
  const result = new Float64Array(halfLen);
  for (let i = 0; i < halfLen; i++) {
    const [re, im] = spectrum[i];
    result[i] = Math.sqrt(re * re + im * im);
  }
  return result;
}

/**
 * Convert linear magnitude values to decibels.
 *
 * @param mags - Linear magnitude values.
 * @param minDb - Floor value in dB (default: -100).
 * @returns Array of dB values, clamped to [minDb, 0] relative to max.
 */
export function magnitudeToDb(mags: Float64Array, minDb: number = -100): Float64Array {
  const result = new Float64Array(mags.length);
  for (let i = 0; i < mags.length; i++) {
    if (mags[i] <= 0) {
      result[i] = minDb;
    } else {
      const db = 20 * Math.log10(mags[i]);
      result[i] = Math.max(db, minDb);
    }
  }
  return result;
}

/**
 * Map linear frequency bin indices to logarithmic scale positions.
 *
 * Given N frequency bins spanning [0, sampleRate/2], returns an array of
 * N positions in [0, 1] where each bin should be drawn on a logarithmic
 * frequency axis.
 *
 * @param binCount - Number of frequency bins.
 * @param sampleRate - Sample rate in Hz.
 * @param minFreq - Minimum displayed frequency (default: 20 Hz).
 * @param maxFreq - Maximum displayed frequency (default: sampleRate / 2).
 * @returns Float64Array of positions in [0, 1] for each bin.
 */
export function linearToLogPositions(
  binCount: number,
  sampleRate: number,
  minFreq: number = 20,
  maxFreq?: number,
): Float64Array {
  const nyquist = sampleRate / 2;
  const effectiveMax = maxFreq ?? nyquist;
  const logMin = Math.log10(Math.max(minFreq, 1));
  const logMax = Math.log10(Math.max(effectiveMax, minFreq + 1));
  const logRange = logMax - logMin;

  const positions = new Float64Array(binCount);
  const binWidth = nyquist / binCount;

  for (let i = 0; i < binCount; i++) {
    const freq = (i + 0.5) * binWidth; // Center frequency of bin
    if (freq <= 0 || freq < minFreq) {
      positions[i] = 0;
    } else if (freq >= effectiveMax) {
      positions[i] = 1;
    } else {
      positions[i] = (Math.log10(freq) - logMin) / logRange;
    }
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Signal generators (for demo / mock data)
// ---------------------------------------------------------------------------

/**
 * Generate a sine wave.
 *
 * @param length - Number of samples (should be power of 2 for FFT).
 * @param frequency - Frequency in Hz.
 * @param sampleRate - Sample rate in Hz.
 * @param amplitude - Peak amplitude (default: 1.0).
 */
export function generateSine(
  length: number,
  frequency: number,
  sampleRate: number,
  amplitude: number = 1.0,
): Float64Array {
  const buffer = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return buffer;
}

/**
 * Generate white noise.
 *
 * @param length - Number of samples.
 * @param amplitude - Peak amplitude (default: 1.0).
 */
export function generateNoise(length: number, amplitude: number = 1.0): Float64Array {
  const buffer = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = amplitude * (Math.random() * 2 - 1);
  }
  return buffer;
}

/**
 * Generate a composite signal of multiple sine waves.
 *
 * @param length - Number of samples.
 * @param frequencies - Array of [frequency, amplitude] pairs.
 * @param sampleRate - Sample rate in Hz.
 */
export function generateComposite(
  length: number,
  frequencies: Array<[number, number]>,
  sampleRate: number,
): Float64Array {
  const buffer = new Float64Array(length);
  for (const [freq, amp] of frequencies) {
    for (let i = 0; i < length; i++) {
      buffer[i] += amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Check whether a number is a power of two. */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Find the nearest power-of-two >= n.
 */
export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Apply a Hann window to a signal buffer (in-place).
 */
export function applyHannWindow(buffer: Float64Array): Float64Array {
  const N = buffer.length;
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    buffer[i] *= w;
  }
  return buffer;
}
