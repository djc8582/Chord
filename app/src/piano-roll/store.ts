/**
 * Piano Roll Store
 *
 * Zustand store managing the complete state of the MIDI note editor.
 * Handles notes, selection, zoom/scroll, snap settings, tool state,
 * and velocity editing.
 */

import { create } from "zustand";
import type { Note, SnapValue, Tool, SelectionRect } from "./types";
import { snapToGrid, snapValueToBeats } from "./types";

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let nextId = 1;

/** Generate a unique note ID. */
export function generateNoteId(): string {
  return `note-${nextId++}`;
}

/** Reset the ID counter (useful for tests). */
export function resetNoteIdCounter(): void {
  nextId = 1;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface PianoRollStore {
  // --- Notes ---
  notes: Note[];

  // --- Selection ---
  selectedNoteIds: Set<string>;
  selectionRect: SelectionRect | null;

  // --- Zoom (pixels per unit) ---
  zoomX: number; // pixels per beat
  zoomY: number; // pixels per semitone (pitch row)

  // --- Scroll position ---
  scrollX: number; // in beats
  scrollY: number; // in MIDI pitch (top pitch visible)

  // --- Snap / quantize ---
  snapEnabled: boolean;
  snapValue: SnapValue;

  // --- Velocity editing ---
  velocityEditMode: boolean;

  // --- Tool ---
  tool: Tool;

  // --- Note CRUD ---
  addNote: (note: Omit<Note, "id">) => string;
  removeNote: (noteId: string) => void;
  removeSelectedNotes: () => void;
  updateNote: (noteId: string, updates: Partial<Omit<Note, "id">>) => void;
  moveNote: (noteId: string, deltaPitch: number, deltaStart: number) => void;
  resizeNote: (noteId: string, newDuration: number) => void;
  setNoteVelocity: (noteId: string, velocity: number) => void;

  // --- Selection ---
  selectNote: (noteId: string, addToSelection?: boolean) => void;
  deselectNote: (noteId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSelectionRect: (rect: SelectionRect | null) => void;
  selectNotesInRect: (rect: SelectionRect) => void;
  toggleNoteSelection: (noteId: string) => void;

  // --- Move / resize selected ---
  moveSelectedNotes: (deltaPitch: number, deltaStart: number) => void;
  resizeSelectedNotes: (deltaDuration: number) => void;
  setSelectedNotesVelocity: (velocity: number) => void;

  // --- Quantize ---
  quantizeSelectedNotes: () => void;
  quantizeAllNotes: () => void;

  // --- Zoom ---
  setZoomX: (zoom: number) => void;
  setZoomY: (zoom: number) => void;

  // --- Scroll ---
  setScrollX: (scroll: number) => void;
  setScrollY: (scroll: number) => void;

  // --- Snap ---
  setSnapEnabled: (enabled: boolean) => void;
  setSnapValue: (value: SnapValue) => void;

  // --- Velocity edit mode ---
  setVelocityEditMode: (enabled: boolean) => void;

  // --- Tool ---
  setTool: (tool: Tool) => void;

  // --- Bulk ---
  setNotes: (notes: Note[]) => void;
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const usePianoRollStore = create<PianoRollStore>((set, get) => ({
  // --- Initial state ---
  notes: [],
  selectedNoteIds: new Set<string>(),
  selectionRect: null,
  zoomX: 80,   // 80 px per beat
  zoomY: 14,   // 14 px per semitone row
  scrollX: 0,
  scrollY: 84, // Start around C5 area (top of view)
  snapEnabled: true,
  snapValue: "1/4" as SnapValue,
  velocityEditMode: false,
  tool: "select" as Tool,

  // --- Note CRUD ---

  addNote: (noteData) => {
    const id = generateNoteId();
    const note: Note = { ...noteData, id };
    set((state) => ({ notes: [...state.notes, note] }));
    return id;
  },

  removeNote: (noteId) => {
    set((state) => {
      const newSelected = new Set(state.selectedNoteIds);
      newSelected.delete(noteId);
      return {
        notes: state.notes.filter((n) => n.id !== noteId),
        selectedNoteIds: newSelected,
      };
    });
  },

  removeSelectedNotes: () => {
    set((state) => {
      const selected = state.selectedNoteIds;
      return {
        notes: state.notes.filter((n) => !selected.has(n.id)),
        selectedNoteIds: new Set<string>(),
      };
    });
  },

  updateNote: (noteId, updates) => {
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === noteId ? { ...n, ...updates } : n,
      ),
    }));
  },

  moveNote: (noteId, deltaPitch, deltaStart) => {
    const store = get();
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id !== noteId) return n;
        let newPitch = Math.max(0, Math.min(127, n.pitch + deltaPitch));
        let newStart = Math.max(0, n.start + deltaStart);
        if (store.snapEnabled) {
          newStart = snapToGrid(newStart, store.snapValue);
        }
        return { ...n, pitch: newPitch, start: newStart };
      }),
    }));
  },

  resizeNote: (noteId, newDuration) => {
    const store = get();
    const minDuration = store.snapEnabled
      ? snapValueToBeats(store.snapValue)
      : 0.0625; // 1/64 beat minimum
    const clamped = Math.max(minDuration, newDuration);
    const snapped = store.snapEnabled
      ? snapToGrid(clamped, store.snapValue) || minDuration
      : clamped;
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === noteId ? { ...n, duration: snapped } : n,
      ),
    }));
  },

  setNoteVelocity: (noteId, velocity) => {
    const clamped = Math.max(0, Math.min(127, Math.round(velocity)));
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === noteId ? { ...n, velocity: clamped } : n,
      ),
    }));
  },

  // --- Selection ---

  selectNote: (noteId, addToSelection = false) => {
    set((state) => {
      const newSelected = addToSelection
        ? new Set(state.selectedNoteIds)
        : new Set<string>();
      newSelected.add(noteId);
      return { selectedNoteIds: newSelected };
    });
  },

  deselectNote: (noteId) => {
    set((state) => {
      const newSelected = new Set(state.selectedNoteIds);
      newSelected.delete(noteId);
      return { selectedNoteIds: newSelected };
    });
  },

  selectAll: () => {
    set((state) => ({
      selectedNoteIds: new Set(state.notes.map((n) => n.id)),
    }));
  },

  clearSelection: () => {
    set({ selectedNoteIds: new Set<string>(), selectionRect: null });
  },

  setSelectionRect: (rect) => {
    set({ selectionRect: rect });
  },

  selectNotesInRect: (rect) => {
    const minBeat = Math.min(rect.startBeat, rect.endBeat);
    const maxBeat = Math.max(rect.startBeat, rect.endBeat);
    const minPitch = Math.min(rect.startPitch, rect.endPitch);
    const maxPitch = Math.max(rect.startPitch, rect.endPitch);

    set((state) => {
      const ids = new Set<string>();
      for (const note of state.notes) {
        const noteEnd = note.start + note.duration;
        // Note overlaps the rectangle if its range intersects
        if (
          noteEnd > minBeat &&
          note.start < maxBeat &&
          note.pitch >= minPitch &&
          note.pitch <= maxPitch
        ) {
          ids.add(note.id);
        }
      }
      return { selectedNoteIds: ids, selectionRect: null };
    });
  },

  toggleNoteSelection: (noteId) => {
    set((state) => {
      const newSelected = new Set(state.selectedNoteIds);
      if (newSelected.has(noteId)) {
        newSelected.delete(noteId);
      } else {
        newSelected.add(noteId);
      }
      return { selectedNoteIds: newSelected };
    });
  },

  // --- Move / resize selected ---

  moveSelectedNotes: (deltaPitch, deltaStart) => {
    const store = get();
    set((state) => ({
      notes: state.notes.map((n) => {
        if (!state.selectedNoteIds.has(n.id)) return n;
        let newPitch = Math.max(0, Math.min(127, n.pitch + deltaPitch));
        let newStart = Math.max(0, n.start + deltaStart);
        if (store.snapEnabled) {
          newStart = snapToGrid(newStart, store.snapValue);
        }
        return { ...n, pitch: newPitch, start: newStart };
      }),
    }));
  },

  resizeSelectedNotes: (deltaDuration) => {
    const store = get();
    const minDuration = store.snapEnabled
      ? snapValueToBeats(store.snapValue)
      : 0.0625;
    set((state) => ({
      notes: state.notes.map((n) => {
        if (!state.selectedNoteIds.has(n.id)) return n;
        let newDuration = n.duration + deltaDuration;
        newDuration = Math.max(minDuration, newDuration);
        if (store.snapEnabled) {
          newDuration = snapToGrid(newDuration, store.snapValue) || minDuration;
        }
        return { ...n, duration: newDuration };
      }),
    }));
  },

  setSelectedNotesVelocity: (velocity) => {
    const clamped = Math.max(0, Math.min(127, Math.round(velocity)));
    set((state) => ({
      notes: state.notes.map((n) =>
        state.selectedNoteIds.has(n.id) ? { ...n, velocity: clamped } : n,
      ),
    }));
  },

  // --- Quantize ---

  quantizeSelectedNotes: () => {
    const store = get();
    set((state) => ({
      notes: state.notes.map((n) => {
        if (!state.selectedNoteIds.has(n.id)) return n;
        return {
          ...n,
          start: snapToGrid(n.start, store.snapValue),
          duration:
            snapToGrid(n.duration, store.snapValue) ||
            snapValueToBeats(store.snapValue),
        };
      }),
    }));
  },

  quantizeAllNotes: () => {
    const store = get();
    set((state) => ({
      notes: state.notes.map((n) => ({
        ...n,
        start: snapToGrid(n.start, store.snapValue),
        duration:
          snapToGrid(n.duration, store.snapValue) ||
          snapValueToBeats(store.snapValue),
      })),
    }));
  },

  // --- Zoom ---

  setZoomX: (zoom) => set({ zoomX: Math.max(10, Math.min(500, zoom)) }),
  setZoomY: (zoom) => set({ zoomY: Math.max(4, Math.min(40, zoom)) }),

  // --- Scroll ---

  setScrollX: (scroll) => set({ scrollX: Math.max(0, scroll) }),
  setScrollY: (scroll) => set({ scrollY: Math.max(0, Math.min(127, scroll)) }),

  // --- Snap ---

  setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
  setSnapValue: (value) => set({ snapValue: value }),

  // --- Velocity edit mode ---

  setVelocityEditMode: (enabled) => set({ velocityEditMode: enabled }),

  // --- Tool ---

  setTool: (tool) => set({ tool }),

  // --- Bulk ---

  setNotes: (notes) => set({ notes }),
  clear: () =>
    set({
      notes: [],
      selectedNoteIds: new Set<string>(),
      selectionRect: null,
    }),
}));
