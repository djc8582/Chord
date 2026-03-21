/**
 * Audio Operations — Pure Functions
 *
 * Destructive audio editing operations. All functions are pure — they accept
 * an AudioBuffer and return a new AudioBuffer without mutating the input.
 *
 * Every operation works on all channels in the buffer simultaneously.
 */

import type { AudioBuffer } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a deep copy of an AudioBuffer. */
export function cloneBuffer(buffer: AudioBuffer): AudioBuffer {
  return {
    channels: buffer.channels.map((ch) => new Float32Array(ch)),
    sampleRate: buffer.sampleRate,
  };
}

/** Return the number of samples (length of the first channel, or 0). */
export function bufferLength(buffer: AudioBuffer): number {
  return buffer.channels.length > 0 ? buffer.channels[0].length : 0;
}

/** Clamp a sample index to [0, length]. */
function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length, Math.round(index)));
}

/** Normalize start/end so start <= end and both are clamped. */
function normalizeRange(
  start: number,
  end: number,
  length: number,
): [number, number] {
  const s = clampIndex(Math.min(start, end), length);
  const e = clampIndex(Math.max(start, end), length);
  return [s, e];
}

// ---------------------------------------------------------------------------
// Cut — remove samples in range, return new buffer
// ---------------------------------------------------------------------------

/**
 * Remove samples in the range [start, end) from the buffer.
 * Returns a new buffer with the samples removed.
 */
export function cut(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
  const len = bufferLength(buffer);
  const [s, e] = normalizeRange(start, end, len);
  if (s === e) return cloneBuffer(buffer);

  const newLength = len - (e - s);
  const channels = buffer.channels.map((ch) => {
    const result = new Float32Array(newLength);
    // Copy before selection
    result.set(ch.subarray(0, s), 0);
    // Copy after selection
    result.set(ch.subarray(e), s);
    return result;
  });

  return { channels, sampleRate: buffer.sampleRate };
}

// ---------------------------------------------------------------------------
// Copy — extract samples in range
// ---------------------------------------------------------------------------

/**
 * Extract a copy of samples in the range [start, end).
 * Returns a new buffer containing only those samples.
 */
export function copy(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
  const len = bufferLength(buffer);
  const [s, e] = normalizeRange(start, end, len);

  const channels = buffer.channels.map((ch) => {
    return new Float32Array(ch.subarray(s, e));
  });

  return { channels, sampleRate: buffer.sampleRate };
}

// ---------------------------------------------------------------------------
// Paste — insert samples at position
// ---------------------------------------------------------------------------

/**
 * Insert the samples from `clip` into `buffer` at the given position.
 * The clip is inserted between existing samples (non-destructive splice).
 * If the clip has fewer channels than the buffer, missing channels are
 * filled with silence. If the clip has more channels, extra are ignored.
 */
export function paste(
  buffer: AudioBuffer,
  position: number,
  clip: AudioBuffer,
): AudioBuffer {
  const len = bufferLength(buffer);
  const pos = clampIndex(position, len);
  const clipLen = bufferLength(clip);
  if (clipLen === 0) return cloneBuffer(buffer);

  const newLength = len + clipLen;
  const numChannels = buffer.channels.length;

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const result = new Float32Array(newLength);
    const src = buffer.channels[ch];
    const clipSrc = ch < clip.channels.length
      ? clip.channels[ch]
      : new Float32Array(clipLen); // silence for missing channels

    // Before insertion point
    result.set(src.subarray(0, pos), 0);
    // Inserted clip
    result.set(clipSrc, pos);
    // After insertion point
    result.set(src.subarray(pos), pos + clipLen);
    channels.push(result);
  }

  return { channels, sampleRate: buffer.sampleRate };
}

// ---------------------------------------------------------------------------
// Normalize — scale to target peak level
// ---------------------------------------------------------------------------

/**
 * Scale the entire buffer so that the peak amplitude equals `targetPeak`.
 * Default targetPeak is 1.0 (0 dBFS).
 */
export function normalize(buffer: AudioBuffer, targetPeak: number = 1.0): AudioBuffer {
  // Find the current peak across all channels
  let currentPeak = 0;
  for (const ch of buffer.channels) {
    for (let i = 0; i < ch.length; i++) {
      const abs = Math.abs(ch[i]);
      if (abs > currentPeak) currentPeak = abs;
    }
  }

  if (currentPeak === 0) return cloneBuffer(buffer);

  const scale = targetPeak / currentPeak;
  const channels = buffer.channels.map((ch) => {
    const result = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      result[i] = ch[i] * scale;
    }
    return result;
  });

  return { channels, sampleRate: buffer.sampleRate };
}

// ---------------------------------------------------------------------------
// Reverse — reverse samples in range
// ---------------------------------------------------------------------------

/**
 * Reverse the samples in the range [start, end).
 * Samples outside the range are left unchanged.
 */
export function reverse(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
  const len = bufferLength(buffer);
  const [s, e] = normalizeRange(start, end, len);

  const channels = buffer.channels.map((ch) => {
    const result = new Float32Array(ch);
    // Reverse in place within [s, e)
    let lo = s;
    let hi = e - 1;
    while (lo < hi) {
      const tmp = result[lo];
      result[lo] = result[hi];
      result[hi] = tmp;
      lo++;
      hi--;
    }
    return result;
  });

  return { channels, sampleRate: buffer.sampleRate };
}

// ---------------------------------------------------------------------------
// Fade In
// ---------------------------------------------------------------------------

/**
 * Apply a linear fade-in starting at `start` for `length` samples.
 * Samples before `start` are unaffected; samples from `start` to
 * `start + length` are scaled from 0 to 1 linearly.
 */
export function fadeIn(
  buffer: AudioBuffer,
  start: number,
  length: number,
): AudioBuffer {
  const bufLen = bufferLength(buffer);
  const s = clampIndex(start, bufLen);
  const fadeLen = Math.max(0, Math.min(length, bufLen - s));
  if (fadeLen === 0) return cloneBuffer(buffer);

  const channels = buffer.channels.map((ch) => {
    const result = new Float32Array(ch);
    for (let i = 0; i < fadeLen; i++) {
      const gain = i / fadeLen;
      result[s + i] *= gain;
    }
    return result;
  });

  return { channels, sampleRate: buffer.sampleRate };
}

// ---------------------------------------------------------------------------
// Fade Out
// ---------------------------------------------------------------------------

/**
 * Apply a linear fade-out starting at `start` for `length` samples.
 * Samples from `start` to `start + length` are scaled from 1 to 0 linearly.
 */
export function fadeOut(
  buffer: AudioBuffer,
  start: number,
  length: number,
): AudioBuffer {
  const bufLen = bufferLength(buffer);
  const s = clampIndex(start, bufLen);
  const fadeLen = Math.max(0, Math.min(length, bufLen - s));
  if (fadeLen === 0) return cloneBuffer(buffer);

  const channels = buffer.channels.map((ch) => {
    const result = new Float32Array(ch);
    for (let i = 0; i < fadeLen; i++) {
      const gain = 1 - i / fadeLen;
      result[s + i] *= gain;
    }
    return result;
  });

  return { channels, sampleRate: buffer.sampleRate };
}

// ---------------------------------------------------------------------------
// Gain — apply gain to range
// ---------------------------------------------------------------------------

/**
 * Multiply all samples in [start, end) by `gainValue`.
 */
export function gain(
  buffer: AudioBuffer,
  start: number,
  end: number,
  gainValue: number,
): AudioBuffer {
  const len = bufferLength(buffer);
  const [s, e] = normalizeRange(start, end, len);

  const channels = buffer.channels.map((ch) => {
    const result = new Float32Array(ch);
    for (let i = s; i < e; i++) {
      result[i] *= gainValue;
    }
    return result;
  });

  return { channels, sampleRate: buffer.sampleRate };
}

// ---------------------------------------------------------------------------
// Silence — zero out range
// ---------------------------------------------------------------------------

/**
 * Set all samples in [start, end) to zero.
 */
export function silence(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
  const len = bufferLength(buffer);
  const [s, e] = normalizeRange(start, end, len);

  const channels = buffer.channels.map((ch) => {
    const result = new Float32Array(ch);
    for (let i = s; i < e; i++) {
      result[i] = 0;
    }
    return result;
  });

  return { channels, sampleRate: buffer.sampleRate };
}

// ---------------------------------------------------------------------------
// Resample — simple linear interpolation
// ---------------------------------------------------------------------------

/**
 * Resample the buffer from `fromRate` to `toRate` using linear interpolation.
 * The output buffer has a proportionally different length.
 */
export function resample(
  buffer: AudioBuffer,
  fromRate: number,
  toRate: number,
): AudioBuffer {
  if (fromRate <= 0 || toRate <= 0) return cloneBuffer(buffer);
  if (fromRate === toRate) return cloneBuffer(buffer);

  const ratio = fromRate / toRate;
  const srcLen = bufferLength(buffer);
  const dstLen = Math.max(1, Math.round(srcLen / ratio));

  const channels = buffer.channels.map((ch) => {
    const result = new Float32Array(dstLen);
    for (let i = 0; i < dstLen; i++) {
      const srcPos = i * ratio;
      const idx0 = Math.floor(srcPos);
      const idx1 = Math.min(idx0 + 1, srcLen - 1);
      const frac = srcPos - idx0;
      result[i] = ch[idx0] * (1 - frac) + ch[idx1] * frac;
    }
    return result;
  });

  return { channels, sampleRate: toRate };
}
