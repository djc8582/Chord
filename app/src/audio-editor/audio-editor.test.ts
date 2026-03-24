/**
 * Audio Editor Module Tests
 *
 * Tests covering:
 * - All audio operations (cut, copy, paste, normalize, reverse, fade, gain, silence, resample)
 * - Selection range management
 * - Undo/redo for operations
 * - Zoom/scroll state
 * - Buffer channel handling (mono and stereo)
 * - Store state management
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  cut,
  copy,
  paste,
  normalize,
  reverse,
  fadeIn,
  fadeOut,
  gain,
  silence,
  resample,
  cloneBuffer,
  bufferLength,
} from "./operations.js";
import { useAudioEditorStore } from "./store.js";
import type { AudioBuffer } from "./types.js";
import { DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM } from "./types.js";
import { magnitudeToColor, computeMagnitudeSpectrum } from "./SpectralView.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mono buffer with the given samples. */
function mono(samples: number[], sampleRate: number = 44100): AudioBuffer {
  return {
    channels: [new Float32Array(samples)],
    sampleRate,
  };
}

/** Create a stereo buffer with given left and right samples. */
function stereo(
  left: number[],
  right: number[],
  sampleRate: number = 44100,
): AudioBuffer {
  return {
    channels: [new Float32Array(left), new Float32Array(right)],
    sampleRate,
  };
}

/** Extract mono samples as a plain array for easier comparison. */
function samples(buffer: AudioBuffer, channel: number = 0): number[] {
  return Array.from(buffer.channels[channel]);
}

// ---------------------------------------------------------------------------
// Reset store before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  useAudioEditorStore.setState({
    buffer: null,
    clipId: null,
    selection: null,
    clipboard: null,
    samplesPerPixel: DEFAULT_ZOOM,
    scrollSample: 0,
    tool: "select",
    playheadSample: 0,
    isPlaying: false,
    undoStack: [],
    redoStack: [],
  });
});

// ===========================================================================
// Audio Operations — Pure Functions
// ===========================================================================

// ---------------------------------------------------------------------------
// cloneBuffer / bufferLength
// ---------------------------------------------------------------------------

describe("cloneBuffer", () => {
  it("produces a deep copy", () => {
    const original = mono([1, 2, 3, 4]);
    const cloned = cloneBuffer(original);
    expect(samples(cloned)).toEqual([1, 2, 3, 4]);
    expect(cloned.sampleRate).toBe(44100);

    // Mutating clone does not affect original
    cloned.channels[0][0] = 99;
    expect(original.channels[0][0]).toBe(1);
  });

  it("clones stereo buffers", () => {
    const original = stereo([1, 2], [3, 4]);
    const cloned = cloneBuffer(original);
    expect(samples(cloned, 0)).toEqual([1, 2]);
    expect(samples(cloned, 1)).toEqual([3, 4]);
  });
});

describe("bufferLength", () => {
  it("returns length of first channel", () => {
    expect(bufferLength(mono([1, 2, 3]))).toBe(3);
  });

  it("returns 0 for empty buffer", () => {
    expect(bufferLength({ channels: [], sampleRate: 44100 })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cut
// ---------------------------------------------------------------------------

describe("cut", () => {
  it("removes samples in the specified range", () => {
    const buf = mono([10, 20, 30, 40, 50]);
    const result = cut(buf, 1, 3);
    expect(samples(result)).toEqual([10, 40, 50]);
    expect(bufferLength(result)).toBe(3);
  });

  it("does nothing when start === end", () => {
    const buf = mono([1, 2, 3]);
    const result = cut(buf, 1, 1);
    expect(samples(result)).toEqual([1, 2, 3]);
  });

  it("handles cutting from the beginning", () => {
    const buf = mono([10, 20, 30, 40]);
    const result = cut(buf, 0, 2);
    expect(samples(result)).toEqual([30, 40]);
  });

  it("handles cutting to the end", () => {
    const buf = mono([10, 20, 30, 40]);
    const result = cut(buf, 2, 4);
    expect(samples(result)).toEqual([10, 20]);
  });

  it("handles reversed start/end", () => {
    const buf = mono([10, 20, 30, 40, 50]);
    const result = cut(buf, 3, 1);
    expect(samples(result)).toEqual([10, 40, 50]);
  });

  it("works on stereo buffers", () => {
    const buf = stereo([1, 2, 3, 4], [5, 6, 7, 8]);
    const result = cut(buf, 1, 3);
    expect(samples(result, 0)).toEqual([1, 4]);
    expect(samples(result, 1)).toEqual([5, 8]);
  });

  it("clamps out-of-range indices", () => {
    const buf = mono([10, 20, 30]);
    const result = cut(buf, -5, 2);
    expect(samples(result)).toEqual([30]);
  });

  it("does not mutate the original", () => {
    const buf = mono([1, 2, 3, 4]);
    cut(buf, 1, 3);
    expect(samples(buf)).toEqual([1, 2, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
// copy
// ---------------------------------------------------------------------------

describe("copy", () => {
  it("extracts samples in the specified range", () => {
    const buf = mono([10, 20, 30, 40, 50]);
    const result = copy(buf, 1, 4);
    expect(samples(result)).toEqual([20, 30, 40]);
  });

  it("returns empty buffer for zero-length range", () => {
    const buf = mono([1, 2, 3]);
    const result = copy(buf, 2, 2);
    expect(bufferLength(result)).toBe(0);
  });

  it("preserves sample rate", () => {
    const buf = mono([1, 2, 3], 48000);
    const result = copy(buf, 0, 2);
    expect(result.sampleRate).toBe(48000);
  });

  it("works on stereo buffers", () => {
    const buf = stereo([10, 20, 30], [40, 50, 60]);
    const result = copy(buf, 1, 3);
    expect(samples(result, 0)).toEqual([20, 30]);
    expect(samples(result, 1)).toEqual([50, 60]);
  });
});

// ---------------------------------------------------------------------------
// paste
// ---------------------------------------------------------------------------

describe("paste", () => {
  it("inserts samples at the specified position", () => {
    const buf = mono([1, 2, 5, 6]);
    const clip = mono([3, 4]);
    const result = paste(buf, 2, clip);
    expect(samples(result)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(bufferLength(result)).toBe(6);
  });

  it("inserts at the beginning", () => {
    const buf = mono([3, 4]);
    const clip = mono([1, 2]);
    const result = paste(buf, 0, clip);
    expect(samples(result)).toEqual([1, 2, 3, 4]);
  });

  it("inserts at the end", () => {
    const buf = mono([1, 2]);
    const clip = mono([3, 4]);
    const result = paste(buf, 2, clip);
    expect(samples(result)).toEqual([1, 2, 3, 4]);
  });

  it("returns clone when clip is empty", () => {
    const buf = mono([1, 2, 3]);
    const clip = mono([]);
    const result = paste(buf, 1, clip);
    expect(samples(result)).toEqual([1, 2, 3]);
  });

  it("works on stereo buffers", () => {
    const buf = stereo([1, 4], [10, 40]);
    const clip = stereo([2, 3], [20, 30]);
    const result = paste(buf, 1, clip);
    expect(samples(result, 0)).toEqual([1, 2, 3, 4]);
    expect(samples(result, 1)).toEqual([10, 20, 30, 40]);
  });

  it("fills missing channels with silence when pasting mono into stereo", () => {
    const buf = stereo([1, 4], [10, 40]);
    const clip = mono([2, 3]);
    const result = paste(buf, 1, clip);
    expect(samples(result, 0)).toEqual([1, 2, 3, 4]);
    expect(samples(result, 1)).toEqual([10, 0, 0, 40]);
  });

  it("clamps position to buffer length", () => {
    const buf = mono([1, 2]);
    const clip = mono([3]);
    const result = paste(buf, 999, clip);
    expect(samples(result)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// normalize
// ---------------------------------------------------------------------------

describe("normalize", () => {
  it("scales buffer to target peak", () => {
    const buf = mono([0.25, -0.5, 0.1]);
    const result = normalize(buf, 1.0);
    // Peak is 0.5, so scale by 2
    expect(result.channels[0][0]).toBeCloseTo(0.5);
    expect(result.channels[0][1]).toBeCloseTo(-1.0);
    expect(result.channels[0][2]).toBeCloseTo(0.2);
  });

  it("scales to custom target peak", () => {
    const buf = mono([0.5, -0.25]);
    const result = normalize(buf, 0.5);
    // Peak is 0.5, scale by 1.0 (already at target)
    expect(result.channels[0][0]).toBeCloseTo(0.5);
    expect(result.channels[0][1]).toBeCloseTo(-0.25);
  });

  it("handles silent buffer (all zeros)", () => {
    const buf = mono([0, 0, 0]);
    const result = normalize(buf, 1.0);
    expect(samples(result)).toEqual([0, 0, 0]);
  });

  it("normalizes stereo buffer using peak across all channels", () => {
    const buf = stereo([0.25, -0.25], [0.5, -0.1]);
    const result = normalize(buf, 1.0);
    // Global peak is 0.5, scale by 2
    expect(result.channels[0][0]).toBeCloseTo(0.5);
    expect(result.channels[1][0]).toBeCloseTo(1.0);
  });

  it("does not mutate the original", () => {
    const buf = mono([0.5]);
    normalize(buf, 1.0);
    expect(buf.channels[0][0]).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// reverse
// ---------------------------------------------------------------------------

describe("reverse", () => {
  it("reverses samples in the specified range", () => {
    const buf = mono([1, 2, 3, 4, 5]);
    const result = reverse(buf, 1, 4);
    expect(samples(result)).toEqual([1, 4, 3, 2, 5]);
  });

  it("reverses entire buffer", () => {
    const buf = mono([1, 2, 3, 4]);
    const result = reverse(buf, 0, 4);
    expect(samples(result)).toEqual([4, 3, 2, 1]);
  });

  it("does nothing for single-sample range", () => {
    const buf = mono([1, 2, 3]);
    const result = reverse(buf, 1, 2);
    expect(samples(result)).toEqual([1, 2, 3]);
  });

  it("handles reversed start/end", () => {
    const buf = mono([1, 2, 3, 4, 5]);
    const result = reverse(buf, 4, 1);
    expect(samples(result)).toEqual([1, 4, 3, 2, 5]);
  });

  it("works on stereo buffers", () => {
    const buf = stereo([1, 2, 3], [4, 5, 6]);
    const result = reverse(buf, 0, 3);
    expect(samples(result, 0)).toEqual([3, 2, 1]);
    expect(samples(result, 1)).toEqual([6, 5, 4]);
  });

  it("does not mutate the original", () => {
    const buf = mono([1, 2, 3]);
    reverse(buf, 0, 3);
    expect(samples(buf)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// fadeIn
// ---------------------------------------------------------------------------

describe("fadeIn", () => {
  it("applies linear fade-in", () => {
    const buf = mono([1, 1, 1, 1]);
    const result = fadeIn(buf, 0, 4);
    // gain at i: i/4 => 0/4, 1/4, 2/4, 3/4
    expect(result.channels[0][0]).toBeCloseTo(0);
    expect(result.channels[0][1]).toBeCloseTo(0.25);
    expect(result.channels[0][2]).toBeCloseTo(0.5);
    expect(result.channels[0][3]).toBeCloseTo(0.75);
  });

  it("starts fade at the specified offset", () => {
    const buf = mono([1, 1, 1, 1, 1]);
    const result = fadeIn(buf, 2, 2);
    // Samples 0,1 unchanged; samples 2,3 faded
    expect(result.channels[0][0]).toBeCloseTo(1);
    expect(result.channels[0][1]).toBeCloseTo(1);
    expect(result.channels[0][2]).toBeCloseTo(0);   // 0/2 * 1
    expect(result.channels[0][3]).toBeCloseTo(0.5);  // 1/2 * 1
    expect(result.channels[0][4]).toBeCloseTo(1);    // untouched
  });

  it("does nothing when length is 0", () => {
    const buf = mono([1, 1, 1]);
    const result = fadeIn(buf, 0, 0);
    expect(samples(result)).toEqual([1, 1, 1]);
  });

  it("works on stereo buffers", () => {
    const buf = stereo([1, 1], [2, 2]);
    const result = fadeIn(buf, 0, 2);
    expect(result.channels[0][0]).toBeCloseTo(0);
    expect(result.channels[0][1]).toBeCloseTo(0.5);
    expect(result.channels[1][0]).toBeCloseTo(0);
    expect(result.channels[1][1]).toBeCloseTo(1.0);
  });
});

// ---------------------------------------------------------------------------
// fadeOut
// ---------------------------------------------------------------------------

describe("fadeOut", () => {
  it("applies linear fade-out", () => {
    const buf = mono([1, 1, 1, 1]);
    const result = fadeOut(buf, 0, 4);
    // gain at i: 1 - i/4 => 1, 3/4, 2/4, 1/4
    expect(result.channels[0][0]).toBeCloseTo(1);
    expect(result.channels[0][1]).toBeCloseTo(0.75);
    expect(result.channels[0][2]).toBeCloseTo(0.5);
    expect(result.channels[0][3]).toBeCloseTo(0.25);
  });

  it("starts fade at the specified offset", () => {
    const buf = mono([1, 1, 1, 1]);
    const result = fadeOut(buf, 2, 2);
    expect(result.channels[0][0]).toBeCloseTo(1);
    expect(result.channels[0][1]).toBeCloseTo(1);
    expect(result.channels[0][2]).toBeCloseTo(1);    // 1 - 0/2
    expect(result.channels[0][3]).toBeCloseTo(0.5);  // 1 - 1/2
  });

  it("does nothing when length is 0", () => {
    const buf = mono([1, 1, 1]);
    const result = fadeOut(buf, 0, 0);
    expect(samples(result)).toEqual([1, 1, 1]);
  });

  it("works on stereo buffers", () => {
    const buf = stereo([1, 1], [2, 2]);
    const result = fadeOut(buf, 0, 2);
    expect(result.channels[0][0]).toBeCloseTo(1);
    expect(result.channels[0][1]).toBeCloseTo(0.5);
    expect(result.channels[1][0]).toBeCloseTo(2);
    expect(result.channels[1][1]).toBeCloseTo(1.0);
  });
});

// ---------------------------------------------------------------------------
// gain
// ---------------------------------------------------------------------------

describe("gain", () => {
  it("multiplies samples by gain value", () => {
    const buf = mono([1, 2, 3, 4, 5]);
    const result = gain(buf, 1, 4, 2);
    expect(samples(result)).toEqual([1, 4, 6, 8, 5]);
  });

  it("applies gain of 0 to zero out range", () => {
    const buf = mono([1, 2, 3]);
    const result = gain(buf, 0, 3, 0);
    expect(samples(result)).toEqual([0, 0, 0]);
  });

  it("applies fractional gain", () => {
    const buf = mono([1, 1, 1]);
    const result = gain(buf, 0, 3, 0.5);
    expect(result.channels[0][0]).toBeCloseTo(0.5);
    expect(result.channels[0][1]).toBeCloseTo(0.5);
    expect(result.channels[0][2]).toBeCloseTo(0.5);
  });

  it("works on stereo buffers", () => {
    const buf = stereo([1, 2], [3, 4]);
    const result = gain(buf, 0, 2, 3);
    expect(samples(result, 0)).toEqual([3, 6]);
    expect(samples(result, 1)).toEqual([9, 12]);
  });

  it("does not mutate the original", () => {
    const buf = mono([1, 2, 3]);
    gain(buf, 0, 3, 5);
    expect(samples(buf)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// silence
// ---------------------------------------------------------------------------

describe("silence", () => {
  it("zeroes out the specified range", () => {
    const buf = mono([1, 2, 3, 4, 5]);
    const result = silence(buf, 1, 4);
    expect(samples(result)).toEqual([1, 0, 0, 0, 5]);
  });

  it("silences entire buffer", () => {
    const buf = mono([1, 2, 3]);
    const result = silence(buf, 0, 3);
    expect(samples(result)).toEqual([0, 0, 0]);
  });

  it("works on stereo buffers", () => {
    const buf = stereo([1, 2, 3], [4, 5, 6]);
    const result = silence(buf, 1, 2);
    expect(samples(result, 0)).toEqual([1, 0, 3]);
    expect(samples(result, 1)).toEqual([4, 0, 6]);
  });

  it("does not mutate the original", () => {
    const buf = mono([1, 2, 3]);
    silence(buf, 0, 3);
    expect(samples(buf)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// resample
// ---------------------------------------------------------------------------

describe("resample", () => {
  it("downsamples (halves the sample count when halving rate)", () => {
    const buf = mono([1, 2, 3, 4, 5, 6, 7, 8], 44100);
    const result = resample(buf, 44100, 22050);
    // New length should be approximately half
    expect(bufferLength(result)).toBe(4);
    expect(result.sampleRate).toBe(22050);
  });

  it("upsamples (doubles the sample count when doubling rate)", () => {
    const buf = mono([1, 2, 3, 4], 22050);
    const result = resample(buf, 22050, 44100);
    expect(bufferLength(result)).toBe(8);
    expect(result.sampleRate).toBe(44100);
  });

  it("returns clone when rates are equal", () => {
    const buf = mono([1, 2, 3]);
    const result = resample(buf, 44100, 44100);
    expect(samples(result)).toEqual([1, 2, 3]);
  });

  it("uses linear interpolation (intermediate values)", () => {
    const buf = mono([0, 1], 44100);
    const result = resample(buf, 44100, 88200);
    // Should have ~4 samples, with interpolated values
    expect(bufferLength(result)).toBe(4);
    // First sample should be 0, last should be close to 1
    expect(result.channels[0][0]).toBeCloseTo(0);
    // Intermediate values should be between 0 and 1
    for (let i = 0; i < bufferLength(result); i++) {
      expect(result.channels[0][i]).toBeGreaterThanOrEqual(-0.01);
      expect(result.channels[0][i]).toBeLessThanOrEqual(1.01);
    }
  });

  it("works on stereo buffers", () => {
    const buf = stereo([0, 1, 0, 1], [1, 0, 1, 0], 44100);
    const result = resample(buf, 44100, 22050);
    expect(result.channels.length).toBe(2);
    expect(bufferLength(result)).toBe(2);
  });

  it("handles invalid rates gracefully", () => {
    const buf = mono([1, 2, 3]);
    const result = resample(buf, 0, 44100);
    expect(samples(result)).toEqual([1, 2, 3]);
  });
});

// ===========================================================================
// Store — Selection Management
// ===========================================================================

describe("store: selection range", () => {
  it("starts with no selection", () => {
    expect(useAudioEditorStore.getState().selection).toBeNull();
  });

  it("setSelection sets a valid selection", () => {
    const buf = mono([1, 2, 3, 4, 5]);
    useAudioEditorStore.getState().loadBuffer(buf);
    useAudioEditorStore.getState().setSelection({ start: 1, end: 3 });
    const sel = useAudioEditorStore.getState().selection;
    expect(sel).toEqual({ start: 1, end: 3 });
  });

  it("setSelection normalizes reversed range", () => {
    const buf = mono([1, 2, 3, 4, 5]);
    useAudioEditorStore.getState().loadBuffer(buf);
    useAudioEditorStore.getState().setSelection({ start: 4, end: 1 });
    const sel = useAudioEditorStore.getState().selection;
    expect(sel).toEqual({ start: 1, end: 4 });
  });

  it("setSelection clamps to buffer bounds", () => {
    const buf = mono([1, 2, 3]);
    useAudioEditorStore.getState().loadBuffer(buf);
    useAudioEditorStore.getState().setSelection({ start: -5, end: 100 });
    const sel = useAudioEditorStore.getState().selection;
    expect(sel).toEqual({ start: 0, end: 3 });
  });

  it("setSelection(null) clears selection", () => {
    const buf = mono([1, 2, 3]);
    useAudioEditorStore.getState().loadBuffer(buf);
    useAudioEditorStore.getState().setSelection({ start: 0, end: 2 });
    useAudioEditorStore.getState().setSelection(null);
    expect(useAudioEditorStore.getState().selection).toBeNull();
  });

  it("zero-length selection becomes null", () => {
    const buf = mono([1, 2, 3]);
    useAudioEditorStore.getState().loadBuffer(buf);
    useAudioEditorStore.getState().setSelection({ start: 2, end: 2 });
    expect(useAudioEditorStore.getState().selection).toBeNull();
  });

  it("selectAll selects entire buffer", () => {
    const buf = mono([1, 2, 3, 4, 5]);
    useAudioEditorStore.getState().loadBuffer(buf);
    useAudioEditorStore.getState().selectAll();
    const sel = useAudioEditorStore.getState().selection;
    expect(sel).toEqual({ start: 0, end: 5 });
  });

  it("clearSelection clears the selection", () => {
    const buf = mono([1, 2, 3]);
    useAudioEditorStore.getState().loadBuffer(buf);
    useAudioEditorStore.getState().setSelection({ start: 0, end: 2 });
    useAudioEditorStore.getState().clearSelection();
    expect(useAudioEditorStore.getState().selection).toBeNull();
  });
});

// ===========================================================================
// Store — Undo/Redo
// ===========================================================================

describe("store: undo/redo", () => {
  it("starts with empty undo/redo stacks", () => {
    expect(useAudioEditorStore.getState().undoStack).toEqual([]);
    expect(useAudioEditorStore.getState().redoStack).toEqual([]);
    expect(useAudioEditorStore.getState().canUndo()).toBe(false);
    expect(useAudioEditorStore.getState().canRedo()).toBe(false);
  });

  it("applyOperation pushes to undo stack", () => {
    const buf = mono([1, 2, 3, 4]);
    useAudioEditorStore.getState().loadBuffer(buf);

    const newBuf = cut(buf, 1, 3);
    useAudioEditorStore.getState().applyOperation("Cut", newBuf, null);

    expect(useAudioEditorStore.getState().canUndo()).toBe(true);
    expect(useAudioEditorStore.getState().undoStack.length).toBe(1);
    expect(useAudioEditorStore.getState().undoStack[0].label).toBe("Cut");

    // Buffer should be updated
    const currentBuf = useAudioEditorStore.getState().buffer!;
    expect(samples(currentBuf)).toEqual([1, 4]);
  });

  it("undo restores previous state", () => {
    const buf = mono([1, 2, 3, 4]);
    useAudioEditorStore.getState().loadBuffer(buf);
    useAudioEditorStore.getState().setSelection({ start: 1, end: 3 });

    const newBuf = cut(buf, 1, 3);
    useAudioEditorStore.getState().applyOperation("Cut", newBuf, null);

    // Verify operation was applied
    expect(samples(useAudioEditorStore.getState().buffer!)).toEqual([1, 4]);
    expect(useAudioEditorStore.getState().selection).toBeNull();

    // Undo
    useAudioEditorStore.getState().undo();

    expect(samples(useAudioEditorStore.getState().buffer!)).toEqual([1, 2, 3, 4]);
    expect(useAudioEditorStore.getState().selection).toEqual({ start: 1, end: 3 });
    expect(useAudioEditorStore.getState().canUndo()).toBe(false);
    expect(useAudioEditorStore.getState().canRedo()).toBe(true);
  });

  it("redo reapplies the operation", () => {
    const buf = mono([1, 2, 3, 4]);
    useAudioEditorStore.getState().loadBuffer(buf);

    const newBuf = cut(buf, 1, 3);
    useAudioEditorStore.getState().applyOperation("Cut", newBuf, null);
    useAudioEditorStore.getState().undo();
    useAudioEditorStore.getState().redo();

    expect(samples(useAudioEditorStore.getState().buffer!)).toEqual([1, 4]);
    expect(useAudioEditorStore.getState().canUndo()).toBe(true);
    expect(useAudioEditorStore.getState().canRedo()).toBe(false);
  });

  it("new operation clears redo stack", () => {
    const buf = mono([1, 2, 3, 4, 5]);
    useAudioEditorStore.getState().loadBuffer(buf);

    const cut1 = cut(buf, 0, 1);
    useAudioEditorStore.getState().applyOperation("Cut 1", cut1, null);
    useAudioEditorStore.getState().undo();
    expect(useAudioEditorStore.getState().canRedo()).toBe(true);

    // Apply a different operation
    const reversed = reverse(buf, 0, 5);
    useAudioEditorStore.getState().applyOperation("Reverse", reversed, null);
    expect(useAudioEditorStore.getState().canRedo()).toBe(false);
  });

  it("multiple undo/redo cycles work correctly", () => {
    const buf = mono([1, 2, 3, 4, 5]);
    useAudioEditorStore.getState().loadBuffer(buf);

    // Operation 1: normalize
    const n = normalize(buf, 1.0);
    useAudioEditorStore.getState().applyOperation("Normalize", n);

    // Operation 2: silence
    const s = silence(n, 0, 2);
    useAudioEditorStore.getState().applyOperation("Silence", s);

    expect(useAudioEditorStore.getState().undoStack.length).toBe(2);

    // Undo twice
    useAudioEditorStore.getState().undo();
    expect(useAudioEditorStore.getState().undoStack.length).toBe(1);

    useAudioEditorStore.getState().undo();
    expect(useAudioEditorStore.getState().undoStack.length).toBe(0);
    expect(samples(useAudioEditorStore.getState().buffer!)).toEqual([1, 2, 3, 4, 5]);

    // Redo twice
    useAudioEditorStore.getState().redo();
    useAudioEditorStore.getState().redo();
    expect(useAudioEditorStore.getState().undoStack.length).toBe(2);
  });

  it("undo does nothing when stack is empty", () => {
    const buf = mono([1, 2, 3]);
    useAudioEditorStore.getState().loadBuffer(buf);
    useAudioEditorStore.getState().undo(); // Should not crash
    expect(samples(useAudioEditorStore.getState().buffer!)).toEqual([1, 2, 3]);
  });

  it("redo does nothing when stack is empty", () => {
    const buf = mono([1, 2, 3]);
    useAudioEditorStore.getState().loadBuffer(buf);
    useAudioEditorStore.getState().redo(); // Should not crash
    expect(samples(useAudioEditorStore.getState().buffer!)).toEqual([1, 2, 3]);
  });
});

// ===========================================================================
// Store — Zoom/Scroll State
// ===========================================================================

describe("store: zoom/scroll", () => {
  it("starts with default zoom", () => {
    expect(useAudioEditorStore.getState().samplesPerPixel).toBe(DEFAULT_ZOOM);
  });

  it("setSamplesPerPixel updates zoom", () => {
    useAudioEditorStore.getState().setSamplesPerPixel(50);
    expect(useAudioEditorStore.getState().samplesPerPixel).toBe(50);
  });

  it("setSamplesPerPixel clamps to min", () => {
    useAudioEditorStore.getState().setSamplesPerPixel(0);
    expect(useAudioEditorStore.getState().samplesPerPixel).toBe(MIN_ZOOM);
  });

  it("setSamplesPerPixel clamps to max", () => {
    useAudioEditorStore.getState().setSamplesPerPixel(999999);
    expect(useAudioEditorStore.getState().samplesPerPixel).toBe(MAX_ZOOM);
  });

  it("zoomIn decreases samples per pixel", () => {
    useAudioEditorStore.getState().setSamplesPerPixel(100);
    useAudioEditorStore.getState().zoomIn();
    expect(useAudioEditorStore.getState().samplesPerPixel).toBeLessThan(100);
  });

  it("zoomOut increases samples per pixel", () => {
    useAudioEditorStore.getState().setSamplesPerPixel(100);
    useAudioEditorStore.getState().zoomOut();
    expect(useAudioEditorStore.getState().samplesPerPixel).toBeGreaterThan(100);
  });

  it("setScrollSample updates scroll position", () => {
    useAudioEditorStore.getState().setScrollSample(5000);
    expect(useAudioEditorStore.getState().scrollSample).toBe(5000);
  });

  it("setScrollSample clamps to non-negative", () => {
    useAudioEditorStore.getState().setScrollSample(-100);
    expect(useAudioEditorStore.getState().scrollSample).toBe(0);
  });

  it("scroll position rounds to integer", () => {
    useAudioEditorStore.getState().setScrollSample(100.7);
    expect(useAudioEditorStore.getState().scrollSample).toBe(101);
  });
});

// ===========================================================================
// Store — Tool State
// ===========================================================================

describe("store: tool state", () => {
  it("starts with select tool", () => {
    expect(useAudioEditorStore.getState().tool).toBe("select");
  });

  it("setTool changes the active tool", () => {
    useAudioEditorStore.getState().setTool("cut");
    expect(useAudioEditorStore.getState().tool).toBe("cut");

    useAudioEditorStore.getState().setTool("draw");
    expect(useAudioEditorStore.getState().tool).toBe("draw");

    useAudioEditorStore.getState().setTool("select");
    expect(useAudioEditorStore.getState().tool).toBe("select");
  });
});

// ===========================================================================
// Store — Buffer Loading
// ===========================================================================

describe("store: buffer loading", () => {
  it("loadBuffer stores a deep copy", () => {
    const buf = mono([1, 2, 3]);
    useAudioEditorStore.getState().loadBuffer(buf, "clip-1");

    const loaded = useAudioEditorStore.getState().buffer!;
    expect(samples(loaded)).toEqual([1, 2, 3]);
    expect(useAudioEditorStore.getState().clipId).toBe("clip-1");

    // Mutating original does not affect stored buffer
    buf.channels[0][0] = 99;
    expect(loaded.channels[0][0]).toBe(1);
  });

  it("loadBuffer resets state", () => {
    const buf1 = mono([1, 2, 3]);
    useAudioEditorStore.getState().loadBuffer(buf1);
    useAudioEditorStore.getState().setSelection({ start: 0, end: 2 });
    useAudioEditorStore.getState().setScrollSample(500);

    const newBuf = cut(buf1, 0, 1);
    useAudioEditorStore.getState().applyOperation("Cut", newBuf);

    // Load a new buffer — should reset everything
    const buf2 = mono([10, 20]);
    useAudioEditorStore.getState().loadBuffer(buf2);

    expect(useAudioEditorStore.getState().selection).toBeNull();
    expect(useAudioEditorStore.getState().scrollSample).toBe(0);
    expect(useAudioEditorStore.getState().playheadSample).toBe(0);
    expect(useAudioEditorStore.getState().undoStack.length).toBe(0);
    expect(useAudioEditorStore.getState().redoStack.length).toBe(0);
  });

  it("unloadBuffer clears everything", () => {
    const buf = mono([1, 2, 3]);
    useAudioEditorStore.getState().loadBuffer(buf, "clip-1");
    useAudioEditorStore.getState().unloadBuffer();

    expect(useAudioEditorStore.getState().buffer).toBeNull();
    expect(useAudioEditorStore.getState().clipId).toBeNull();
    expect(useAudioEditorStore.getState().selection).toBeNull();
    expect(useAudioEditorStore.getState().clipboard).toBeNull();
  });
});

// ===========================================================================
// Store — Playhead
// ===========================================================================

describe("store: playhead", () => {
  it("starts at sample 0", () => {
    expect(useAudioEditorStore.getState().playheadSample).toBe(0);
  });

  it("setPlayheadSample updates position", () => {
    const buf = mono([1, 2, 3, 4, 5]);
    useAudioEditorStore.getState().loadBuffer(buf);
    useAudioEditorStore.getState().setPlayheadSample(3);
    expect(useAudioEditorStore.getState().playheadSample).toBe(3);
  });

  it("setPlayheadSample clamps to buffer bounds", () => {
    const buf = mono([1, 2, 3]);
    useAudioEditorStore.getState().loadBuffer(buf);

    useAudioEditorStore.getState().setPlayheadSample(-5);
    expect(useAudioEditorStore.getState().playheadSample).toBe(0);

    useAudioEditorStore.getState().setPlayheadSample(100);
    expect(useAudioEditorStore.getState().playheadSample).toBe(3);
  });

  it("setIsPlaying toggles playback state", () => {
    expect(useAudioEditorStore.getState().isPlaying).toBe(false);
    useAudioEditorStore.getState().setIsPlaying(true);
    expect(useAudioEditorStore.getState().isPlaying).toBe(true);
    useAudioEditorStore.getState().setIsPlaying(false);
    expect(useAudioEditorStore.getState().isPlaying).toBe(false);
  });
});

// ===========================================================================
// Store — Clipboard
// ===========================================================================

describe("store: clipboard", () => {
  it("starts with null clipboard", () => {
    expect(useAudioEditorStore.getState().clipboard).toBeNull();
  });

  it("setClipboard stores a buffer", () => {
    const clip = mono([10, 20, 30]);
    useAudioEditorStore.getState().setClipboard(clip);
    const stored = useAudioEditorStore.getState().clipboard!;
    expect(samples(stored)).toEqual([10, 20, 30]);
  });

  it("setClipboard(null) clears clipboard", () => {
    useAudioEditorStore.getState().setClipboard(mono([1]));
    useAudioEditorStore.getState().setClipboard(null);
    expect(useAudioEditorStore.getState().clipboard).toBeNull();
  });
});

// ===========================================================================
// SpectralView — magnitudeToColor
// ===========================================================================

describe("magnitudeToColor", () => {
  it("returns a valid rgb string for 0", () => {
    const color = magnitudeToColor(0);
    expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it("returns a valid rgb string for 1", () => {
    const color = magnitudeToColor(1);
    expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it("clamps values outside [0, 1]", () => {
    const colorLow = magnitudeToColor(-0.5);
    const colorHigh = magnitudeToColor(1.5);
    expect(colorLow).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    expect(colorHigh).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it("produces darker colors for lower magnitudes", () => {
    // Parse out the values and compare brightness (sum of components)
    const parseBrightness = (c: string) => {
      const m = c.match(/rgb\((\d+),(\d+),(\d+)\)/);
      return m ? parseInt(m[1]) + parseInt(m[2]) + parseInt(m[3]) : 0;
    };
    const low = parseBrightness(magnitudeToColor(0.1));
    const high = parseBrightness(magnitudeToColor(0.9));
    expect(high).toBeGreaterThan(low);
  });
});

// ===========================================================================
// SpectralView — computeMagnitudeSpectrum
// ===========================================================================

describe("computeMagnitudeSpectrum", () => {
  it("returns N/2 bins for N-sample input", () => {
    const input = new Float32Array(16);
    const result = computeMagnitudeSpectrum(input);
    expect(result.length).toBe(8);
  });

  it("DC signal concentrates energy in bin 0", () => {
    const input = new Float32Array(16).fill(1.0);
    const result = computeMagnitudeSpectrum(input);
    // Bin 0 should have the highest magnitude
    let maxBin = 0;
    let maxVal = 0;
    for (let i = 0; i < result.length; i++) {
      if (result[i] > maxVal) {
        maxVal = result[i];
        maxBin = i;
      }
    }
    expect(maxBin).toBe(0);
  });

  it("returns non-negative magnitudes", () => {
    const input = new Float32Array(32);
    for (let i = 0; i < 32; i++) {
      input[i] = Math.sin(2 * Math.PI * 4 * i / 32);
    }
    const result = computeMagnitudeSpectrum(input);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0);
    }
  });
});

// ===========================================================================
// Integration: Full edit workflow
// ===========================================================================

describe("integration: full edit workflow", () => {
  it("cut-copy-paste-undo cycle preserves data integrity", () => {
    const store = useAudioEditorStore;

    // Load a buffer
    const buf = mono([1, 2, 3, 4, 5, 6, 7, 8]);
    store.getState().loadBuffer(buf);

    // Select range [2, 5)
    store.getState().setSelection({ start: 2, end: 5 });

    // Copy
    const sel = store.getState().selection!;
    const copied = copy(store.getState().buffer!, sel.start, sel.end);
    store.getState().setClipboard(copied);
    expect(samples(store.getState().clipboard!)).toEqual([3, 4, 5]);

    // Cut
    const afterCut = cut(store.getState().buffer!, sel.start, sel.end);
    store.getState().applyOperation("Cut", afterCut, null);
    expect(samples(store.getState().buffer!)).toEqual([1, 2, 6, 7, 8]);

    // Paste at position 1
    const clip = store.getState().clipboard!;
    const afterPaste = paste(store.getState().buffer!, 1, clip);
    store.getState().applyOperation("Paste", afterPaste, { start: 1, end: 4 });
    expect(samples(store.getState().buffer!)).toEqual([1, 3, 4, 5, 2, 6, 7, 8]);

    // Undo paste
    store.getState().undo();
    expect(samples(store.getState().buffer!)).toEqual([1, 2, 6, 7, 8]);

    // Undo cut — back to original
    store.getState().undo();
    expect(samples(store.getState().buffer!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("normalize + reverse + undo restores original", () => {
    const store = useAudioEditorStore;

    const buf = mono([0.25, -0.5, 0.1, -0.25]);
    store.getState().loadBuffer(buf);

    // Normalize
    const normalized = normalize(store.getState().buffer!, 1.0);
    store.getState().applyOperation("Normalize", normalized);

    // Reverse all
    const len = bufferLength(store.getState().buffer!);
    const reversed = reverse(store.getState().buffer!, 0, len);
    store.getState().applyOperation("Reverse", reversed);

    // Two undos should restore the original
    store.getState().undo();
    store.getState().undo();

    const restored = store.getState().buffer!;
    expect(restored.channels[0][0]).toBeCloseTo(0.25);
    expect(restored.channels[0][1]).toBeCloseTo(-0.5);
    expect(restored.channels[0][2]).toBeCloseTo(0.1);
    expect(restored.channels[0][3]).toBeCloseTo(-0.25);
  });
});
