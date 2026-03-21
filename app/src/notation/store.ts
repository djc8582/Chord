/**
 * Notation Store
 *
 * Zustand store managing the notation view state: clef, key/time signature,
 * zoom, scroll, and selected notes (linked to piano-roll selection).
 */

import { create } from "zustand";
import type { Clef, KeySignature, TimeSignature } from "./types";

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface NotationStore {
  // --- Clef ---
  clef: Clef;
  setClef: (clef: Clef) => void;

  // --- Key Signature ---
  keySignature: KeySignature;
  setKeySignature: (ks: KeySignature) => void;

  // --- Time Signature ---
  timeSignature: TimeSignature;
  setTimeSignature: (ts: TimeSignature) => void;

  // --- Zoom ---
  zoom: number;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;

  // --- Scroll ---
  scrollX: number;
  scrollY: number;
  setScrollX: (x: number) => void;
  setScrollY: (y: number) => void;

  // --- Selected Notes (linked to piano-roll) ---
  selectedNoteIds: Set<string>;
  setSelectedNoteIds: (ids: Set<string>) => void;
  clearSelection: () => void;

  // --- Reset ---
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_STATE = {
  clef: "treble" as Clef,
  keySignature: { fifths: 0 } as KeySignature,
  timeSignature: { beats: 4, beatType: 4 } as TimeSignature,
  zoom: 1.0,
  scrollX: 0,
  scrollY: 0,
  selectedNoteIds: new Set<string>(),
};

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useNotationStore = create<NotationStore>((set) => ({
  ...DEFAULT_STATE,
  selectedNoteIds: new Set<string>(),

  setClef: (clef) => set({ clef }),

  setKeySignature: (keySignature) => set({ keySignature }),

  setTimeSignature: (timeSignature) => set({ timeSignature }),

  setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(4.0, zoom)) }),

  zoomIn: () =>
    set((state) => ({ zoom: Math.min(4.0, state.zoom * 1.25) })),

  zoomOut: () =>
    set((state) => ({ zoom: Math.max(0.25, state.zoom / 1.25) })),

  setScrollX: (scrollX) => set({ scrollX: Math.max(0, scrollX) }),

  setScrollY: (scrollY) => set({ scrollY }),

  setSelectedNoteIds: (selectedNoteIds) => set({ selectedNoteIds }),

  clearSelection: () => set({ selectedNoteIds: new Set<string>() }),

  reset: () =>
    set({
      ...DEFAULT_STATE,
      selectedNoteIds: new Set<string>(),
    }),
}));
