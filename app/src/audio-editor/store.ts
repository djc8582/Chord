/**
 * Audio Editor Store
 *
 * Zustand store managing all audio editor state: loaded buffer, selection,
 * zoom/scroll, active tool, clipboard, playhead, and undo/redo history.
 *
 * Pattern follows the existing Chord modules (visualizer/store, piano-roll/store).
 */

import { create } from "zustand";
import type {
  AudioBuffer,
  SelectionRange,
  EditorTool,
  HistoryEntry,
} from "./types.js";
import {
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  MAX_UNDO_HISTORY,
} from "./types.js";
import { cloneBuffer, bufferLength } from "./operations.js";

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface AudioEditorStore {
  // --- Buffer ---
  /** The currently loaded audio buffer (null if nothing loaded). */
  buffer: AudioBuffer | null;
  /** Reference clip ID from the timeline (for saving back). */
  clipId: string | null;

  // --- Selection ---
  selection: SelectionRange | null;

  // --- Clipboard ---
  clipboard: AudioBuffer | null;

  // --- Zoom & scroll ---
  /** Samples per pixel. Higher = more zoomed out. */
  samplesPerPixel: number;
  /** Scroll offset in samples. */
  scrollSample: number;

  // --- Tool ---
  tool: EditorTool;

  // --- Playhead ---
  /** Playhead position in samples. */
  playheadSample: number;
  isPlaying: boolean;

  // --- Undo/redo ---
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  // --- Actions: buffer management ---
  loadBuffer: (buffer: AudioBuffer, clipId?: string) => void;
  unloadBuffer: () => void;

  // --- Actions: selection ---
  setSelection: (range: SelectionRange | null) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // --- Actions: clipboard ---
  setClipboard: (clip: AudioBuffer | null) => void;

  // --- Actions: zoom/scroll ---
  setSamplesPerPixel: (spp: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollSample: (sample: number) => void;

  // --- Actions: tool ---
  setTool: (tool: EditorTool) => void;

  // --- Actions: playhead ---
  setPlayheadSample: (sample: number) => void;
  setIsPlaying: (playing: boolean) => void;

  // --- Actions: apply operation (with undo tracking) ---
  /**
   * Apply an audio operation. Pushes the current buffer state onto the
   * undo stack and replaces the buffer with the result.
   */
  applyOperation: (
    label: string,
    newBuffer: AudioBuffer,
    newSelection?: SelectionRange | null,
  ) => void;

  // --- Actions: undo/redo ---
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useAudioEditorStore = create<AudioEditorStore>((set, get) => ({
  // --- Initial state ---
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

  // --- Buffer management ---
  loadBuffer: (buffer, clipId) => {
    set({
      buffer: cloneBuffer(buffer),
      clipId: clipId ?? null,
      selection: null,
      scrollSample: 0,
      playheadSample: 0,
      isPlaying: false,
      undoStack: [],
      redoStack: [],
    });
  },

  unloadBuffer: () => {
    set({
      buffer: null,
      clipId: null,
      selection: null,
      clipboard: null,
      scrollSample: 0,
      playheadSample: 0,
      isPlaying: false,
      undoStack: [],
      redoStack: [],
    });
  },

  // --- Selection ---
  setSelection: (range) => {
    if (range === null) {
      set({ selection: null });
      return;
    }
    const buf = get().buffer;
    const len = buf ? bufferLength(buf) : 0;
    const start = Math.max(0, Math.min(range.start, len));
    const end = Math.max(0, Math.min(range.end, len));
    if (start === end) {
      set({ selection: null });
      return;
    }
    set({
      selection: {
        start: Math.min(start, end),
        end: Math.max(start, end),
      },
    });
  },

  selectAll: () => {
    const buf = get().buffer;
    if (!buf) return;
    const len = bufferLength(buf);
    if (len === 0) return;
    set({ selection: { start: 0, end: len } });
  },

  clearSelection: () => set({ selection: null }),

  // --- Clipboard ---
  setClipboard: (clip) => set({ clipboard: clip }),

  // --- Zoom/scroll ---
  setSamplesPerPixel: (spp) => {
    set({ samplesPerPixel: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, spp)) });
  },

  zoomIn: () => {
    const state = get();
    state.setSamplesPerPixel(Math.round(state.samplesPerPixel / 1.5));
  },

  zoomOut: () => {
    const state = get();
    state.setSamplesPerPixel(Math.round(state.samplesPerPixel * 1.5));
  },

  setScrollSample: (sample) => {
    set({ scrollSample: Math.max(0, Math.round(sample)) });
  },

  // --- Tool ---
  setTool: (tool) => set({ tool }),

  // --- Playhead ---
  setPlayheadSample: (sample) => {
    const buf = get().buffer;
    const len = buf ? bufferLength(buf) : 0;
    set({ playheadSample: Math.max(0, Math.min(sample, len)) });
  },

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  // --- Apply operation (with undo) ---
  applyOperation: (label, newBuffer, newSelection) => {
    const state = get();
    if (!state.buffer) return;

    // Push current state onto undo stack
    const entry: HistoryEntry = {
      label,
      buffer: cloneBuffer(state.buffer),
      selection: state.selection,
    };

    const undoStack = [...state.undoStack, entry];
    // Trim undo stack if too large
    if (undoStack.length > MAX_UNDO_HISTORY) {
      undoStack.shift();
    }

    set({
      buffer: newBuffer,
      selection: newSelection !== undefined ? newSelection : state.selection,
      undoStack,
      redoStack: [], // Clear redo stack on new operation
    });
  },

  // --- Undo/redo ---
  undo: () => {
    const state = get();
    if (state.undoStack.length === 0 || !state.buffer) return;

    const undoStack = [...state.undoStack];
    const entry = undoStack.pop()!;

    // Save current state for redo
    const redoEntry: HistoryEntry = {
      label: entry.label,
      buffer: cloneBuffer(state.buffer),
      selection: state.selection,
    };

    set({
      buffer: entry.buffer,
      selection: entry.selection,
      undoStack,
      redoStack: [...state.redoStack, redoEntry],
    });
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0 || !state.buffer) return;

    const redoStack = [...state.redoStack];
    const entry = redoStack.pop()!;

    // Save current state for undo
    const undoEntry: HistoryEntry = {
      label: entry.label,
      buffer: cloneBuffer(state.buffer),
      selection: state.selection,
    };

    set({
      buffer: entry.buffer,
      selection: entry.selection,
      undoStack: [...state.undoStack, undoEntry],
      redoStack,
    });
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}));
