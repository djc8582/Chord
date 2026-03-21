/**
 * Live Mode Store
 *
 * Zustand store for performance mode: setlist management, navigation,
 * panic state, and tap-tempo BPM calculation.
 */

import { create } from "zustand";
import type { SetlistEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface LiveModeStore {
  // -- Live mode state ------------------------------------------------------

  /** Whether live/performance mode is currently active. */
  isActive: boolean;

  /** Ordered setlist for the performance. */
  setlist: SetlistEntry[];

  /** Index of the currently active setlist entry (-1 if none). */
  currentIndex: number;

  /** Whether a MIDI/audio panic is in progress. */
  isPanicking: boolean;

  /** Current BPM (beats per minute). */
  bpm: number;

  /** Whether the setlist sidebar is visible. */
  sidebarOpen: boolean;

  /** Timestamps of recent taps for tap-tempo calculation. */
  tapTimestamps: number[];

  // -- Activation -----------------------------------------------------------

  /** Enter live/performance mode. */
  activate: () => void;

  /** Exit live/performance mode. */
  deactivate: () => void;

  // -- Navigation -----------------------------------------------------------

  /** Advance to the next setlist entry (wraps to first). */
  next: () => void;

  /** Go back to the previous setlist entry (wraps to last). */
  prev: () => void;

  /** Jump directly to a specific setlist index. */
  goTo: (index: number) => void;

  // -- Setlist CRUD ---------------------------------------------------------

  /** Append a new entry to the setlist. Returns the new entry. */
  addEntry: (entry: SetlistEntry) => void;

  /** Remove an entry by its ID. */
  removeEntry: (entryId: string) => void;

  /** Move an entry from one index to another. */
  reorderEntry: (fromIndex: number, toIndex: number) => void;

  /** Update fields on an existing entry. */
  updateEntry: (entryId: string, updates: Partial<Omit<SetlistEntry, "id">>) => void;

  // -- Panic ----------------------------------------------------------------

  /** Trigger panic: all-notes-off / audio reset. */
  panic: () => void;

  /** Clear the panicking flag (called after panic completes). */
  clearPanic: () => void;

  // -- Tap tempo ------------------------------------------------------------

  /** Record a tap for BPM calculation. */
  tap: (timestamp?: number) => void;

  /** Reset tap tempo state. */
  resetTaps: () => void;

  // -- Sidebar --------------------------------------------------------------

  /** Toggle the setlist sidebar visibility. */
  toggleSidebar: () => void;

  /** Set sidebar visibility explicitly. */
  setSidebarOpen: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Tap-tempo helper
// ---------------------------------------------------------------------------

/**
 * Calculate BPM from an array of tap timestamps.
 * Requires at least 2 taps. Uses the average interval between consecutive
 * taps. Discards taps older than 3 seconds from the most recent.
 */
export function calculateBpmFromTaps(timestamps: number[]): number | null {
  if (timestamps.length < 2) return null;

  const recent = timestamps.slice(-8); // keep last 8 taps max
  const intervals: number[] = [];

  for (let i = 1; i < recent.length; i++) {
    intervals.push(recent[i] - recent[i - 1]);
  }

  if (intervals.length === 0) return null;

  const avgInterval = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
  if (avgInterval <= 0) return null;

  const bpm = 60000 / avgInterval;

  // Clamp to reasonable range
  return Math.round(Math.max(20, Math.min(300, bpm)));
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useLiveModeStore = create<LiveModeStore>((set, get) => ({
  isActive: false,
  setlist: [],
  currentIndex: -1,
  isPanicking: false,
  bpm: 120,
  sidebarOpen: true,
  tapTimestamps: [],

  // -- Activation -----------------------------------------------------------

  activate: () => {
    const { setlist } = get();
    set({
      isActive: true,
      currentIndex: setlist.length > 0 ? 0 : -1,
    });
  },

  deactivate: () => {
    set({ isActive: false });
  },

  // -- Navigation -----------------------------------------------------------

  next: () => {
    const { setlist, currentIndex } = get();
    if (setlist.length === 0) return;
    const nextIndex = (currentIndex + 1) % setlist.length;
    set({ currentIndex: nextIndex });
  },

  prev: () => {
    const { setlist, currentIndex } = get();
    if (setlist.length === 0) return;
    const prevIndex = currentIndex <= 0 ? setlist.length - 1 : currentIndex - 1;
    set({ currentIndex: prevIndex });
  },

  goTo: (index) => {
    const { setlist } = get();
    if (setlist.length === 0) return;
    // Clamp to valid range
    const clamped = Math.max(0, Math.min(setlist.length - 1, index));
    set({ currentIndex: clamped });
  },

  // -- Setlist CRUD ---------------------------------------------------------

  addEntry: (entry) => {
    set((state) => {
      const newSetlist = [...state.setlist, entry];
      // If this is the first entry and we're active, select it
      const newIndex =
        state.currentIndex === -1 && state.isActive ? 0 : state.currentIndex;
      return { setlist: newSetlist, currentIndex: newIndex };
    });
  },

  removeEntry: (entryId) => {
    set((state) => {
      const idx = state.setlist.findIndex((e) => e.id === entryId);
      if (idx === -1) return state;

      const newSetlist = state.setlist.filter((e) => e.id !== entryId);
      let newIndex = state.currentIndex;

      if (newSetlist.length === 0) {
        newIndex = -1;
      } else if (idx < state.currentIndex) {
        // Removed entry was before current — shift index down
        newIndex = state.currentIndex - 1;
      } else if (idx === state.currentIndex) {
        // Removed the current entry — clamp
        newIndex = Math.min(state.currentIndex, newSetlist.length - 1);
      }

      return { setlist: newSetlist, currentIndex: newIndex };
    });
  },

  reorderEntry: (fromIndex, toIndex) => {
    set((state) => {
      if (
        fromIndex < 0 ||
        fromIndex >= state.setlist.length ||
        toIndex < 0 ||
        toIndex >= state.setlist.length
      ) {
        return state;
      }

      const newSetlist = [...state.setlist];
      const [moved] = newSetlist.splice(fromIndex, 1);
      newSetlist.splice(toIndex, 0, moved);

      // Track where the current selection ends up
      let newIndex = state.currentIndex;
      if (state.currentIndex === fromIndex) {
        newIndex = toIndex;
      } else if (fromIndex < state.currentIndex && toIndex >= state.currentIndex) {
        newIndex = state.currentIndex - 1;
      } else if (fromIndex > state.currentIndex && toIndex <= state.currentIndex) {
        newIndex = state.currentIndex + 1;
      }

      return { setlist: newSetlist, currentIndex: newIndex };
    });
  },

  updateEntry: (entryId, updates) => {
    set((state) => ({
      setlist: state.setlist.map((e) =>
        e.id === entryId ? { ...e, ...updates } : e,
      ),
    }));
  },

  // -- Panic ----------------------------------------------------------------

  panic: () => {
    set({ isPanicking: true });
  },

  clearPanic: () => {
    set({ isPanicking: false });
  },

  // -- Tap tempo ------------------------------------------------------------

  tap: (timestamp) => {
    const now = timestamp ?? Date.now();
    const { tapTimestamps } = get();

    // Discard taps older than 3 seconds from this tap
    const recent = tapTimestamps.filter((t) => now - t < 3000);
    const newTimestamps = [...recent, now];

    const bpm = calculateBpmFromTaps(newTimestamps);

    set({
      tapTimestamps: newTimestamps,
      ...(bpm !== null ? { bpm } : {}),
    });
  },

  resetTaps: () => {
    set({ tapTimestamps: [] });
  },

  // -- Sidebar --------------------------------------------------------------

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
  },
}));
