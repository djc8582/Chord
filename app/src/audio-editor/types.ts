/**
 * Audio Editor — Type definitions
 *
 * Types for the destructive waveform editor. Represents multi-channel audio
 * buffers, selection ranges, tool modes, and undo history.
 */

// ---------------------------------------------------------------------------
// Audio buffer
// ---------------------------------------------------------------------------

/**
 * A multi-channel audio buffer. Each channel is a Float32Array of samples.
 * Mono = 1 channel, stereo = 2 channels.
 */
export interface AudioBuffer {
  /** Per-channel sample data. */
  channels: Float32Array[];
  /** Sample rate in Hz. */
  sampleRate: number;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** A contiguous selection range in samples. */
export interface SelectionRange {
  /** Start sample index (inclusive). */
  start: number;
  /** End sample index (exclusive). */
  end: number;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/** Active editing tool. */
export type EditorTool = "select" | "cut" | "draw";

// ---------------------------------------------------------------------------
// Undo history
// ---------------------------------------------------------------------------

/** A snapshot of the audio buffer for undo/redo. */
export interface HistoryEntry {
  /** Description of the operation. */
  label: string;
  /** Buffer state after this operation. */
  buffer: AudioBuffer;
  /** Selection state after this operation. */
  selection: SelectionRange | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MIN_ZOOM = 1;       // samples per pixel at minimum zoom
export const MAX_ZOOM = 10000;   // samples per pixel at maximum zoom
export const DEFAULT_ZOOM = 100; // samples per pixel
export const MAX_UNDO_HISTORY = 50;
