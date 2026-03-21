/**
 * Timeline Store
 *
 * Zustand store managing all timeline/arrangement state: playhead position,
 * zoom level, visible range, lanes, clips, selection, snap settings, and
 * loop region.
 *
 * Pattern follows canvas/store.ts — Zustand for UI state, with actions that
 * can later sync to the Yjs document model.
 */

import { create } from "zustand";
import type {
  Clip,
  ClipKind,
  Lane,
  SnapSettings,
  SnapResolution,
  LoopRegion,
  VisibleRange,
  TimeDisplayMode,
} from "./types.js";
import {
  LANE_COLORS,
  DEFAULT_LANE_HEIGHT,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  DEFAULT_TEMPO,
} from "./types.js";

// ---------------------------------------------------------------------------
// ID generation (matches document-model pattern)
// ---------------------------------------------------------------------------

let idCounter = 0;

function generateTimelineId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Snap helper
// ---------------------------------------------------------------------------

/**
 * Snap a beat position to the nearest grid line based on snap settings.
 */
export function snapToGrid(beat: number, snap: SnapSettings): number {
  if (!snap.enabled) return beat;
  return Math.round(beat / snap.resolution) * snap.resolution;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface TimelineStore {
  // --- Transport / playhead ---
  playheadBeat: number;
  isPlaying: boolean;
  tempo: number;

  // --- Zoom & scroll ---
  /** Pixels per beat. Higher = more zoomed in. */
  zoom: number;
  visibleRange: VisibleRange;
  /** Horizontal scroll offset in beats. */
  scrollBeat: number;

  // --- Time display ---
  timeDisplayMode: TimeDisplayMode;

  // --- Lanes ---
  lanes: Lane[];
  laneOrder: string[];

  // --- Clips ---
  clips: Clip[];

  // --- Selection ---
  selectedClipIds: string[];
  selectedLaneIds: string[];

  // --- Snap ---
  snap: SnapSettings;

  // --- Loop ---
  loopRegion: LoopRegion | null;
  loopEnabled: boolean;

  // --- Transport actions ---
  setPlayheadBeat: (beat: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setTempo: (bpm: number) => void;
  togglePlayback: () => void;

  // --- Zoom & scroll actions ---
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollBeat: (beat: number) => void;
  setVisibleRange: (range: VisibleRange) => void;

  // --- Time display actions ---
  setTimeDisplayMode: (mode: TimeDisplayMode) => void;

  // --- Lane actions ---
  addLane: (name: string, nodeId?: string) => string;
  removeLane: (laneId: string) => void;
  reorderLanes: (orderedIds: string[]) => void;
  updateLane: (laneId: string, updates: Partial<Omit<Lane, "id">>) => void;
  setLaneMuted: (laneId: string, muted: boolean) => void;
  setLaneSolo: (laneId: string, solo: boolean) => void;
  setLaneArmed: (laneId: string, armed: boolean) => void;

  // --- Clip actions ---
  addClip: (
    laneId: string,
    startBeat: number,
    durationBeats: number,
    kind: ClipKind,
    name?: string,
  ) => string;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, newLaneId: string, newStartBeat: number) => void;
  resizeClip: (clipId: string, newDurationBeats: number) => void;
  updateClip: (clipId: string, updates: Partial<Omit<Clip, "id">>) => void;
  setClipMuted: (clipId: string, muted: boolean) => void;

  // --- Selection actions ---
  selectClip: (clipId: string) => void;
  deselectClip: (clipId: string) => void;
  selectClips: (clipIds: string[]) => void;
  clearClipSelection: () => void;
  selectLane: (laneId: string) => void;
  clearLaneSelection: () => void;
  removeSelectedClips: () => void;

  // --- Snap actions ---
  setSnapEnabled: (enabled: boolean) => void;
  setSnapResolution: (resolution: SnapResolution) => void;

  // --- Loop actions ---
  setLoopRegion: (region: LoopRegion) => void;
  clearLoopRegion: () => void;
  setLoopEnabled: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  // --- Initial state ---
  playheadBeat: 0,
  isPlaying: false,
  tempo: DEFAULT_TEMPO,

  zoom: DEFAULT_ZOOM,
  visibleRange: { startBeat: 0, endBeat: 32 },
  scrollBeat: 0,

  timeDisplayMode: "bars",

  lanes: [],
  laneOrder: [],

  clips: [],

  selectedClipIds: [],
  selectedLaneIds: [],

  snap: {
    enabled: true,
    resolution: 1,
  },

  loopRegion: null,
  loopEnabled: false,

  // --- Transport actions ---
  setPlayheadBeat: (beat) => set({ playheadBeat: Math.max(0, beat) }),

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  setTempo: (bpm) => set({ tempo: Math.max(1, Math.min(999, bpm)) }),

  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  // --- Zoom & scroll actions ---
  setZoom: (zoom) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    set({ zoom: clamped });
    // Recalculate visible range based on new zoom
    const state = get();
    const viewportWidthBeats = getViewportWidthInBeats(clamped);
    set({
      visibleRange: {
        startBeat: state.scrollBeat,
        endBeat: state.scrollBeat + viewportWidthBeats,
      },
    });
  },

  zoomIn: () => {
    const state = get();
    state.setZoom(state.zoom * 1.25);
  },

  zoomOut: () => {
    const state = get();
    state.setZoom(state.zoom / 1.25);
  },

  setScrollBeat: (beat) => {
    const scrollBeat = Math.max(0, beat);
    const state = get();
    const viewportWidthBeats = getViewportWidthInBeats(state.zoom);
    set({
      scrollBeat,
      visibleRange: {
        startBeat: scrollBeat,
        endBeat: scrollBeat + viewportWidthBeats,
      },
    });
  },

  setVisibleRange: (range) => set({ visibleRange: range }),

  // --- Time display actions ---
  setTimeDisplayMode: (mode) => set({ timeDisplayMode: mode }),

  // --- Lane actions ---
  addLane: (name, nodeId) => {
    const id = generateTimelineId("lane");
    const state = get();
    const colorIndex = state.lanes.length % LANE_COLORS.length;
    const lane: Lane = {
      id,
      name,
      nodeId,
      height: DEFAULT_LANE_HEIGHT,
      muted: false,
      solo: false,
      armed: false,
      color: LANE_COLORS[colorIndex],
    };
    set({
      lanes: [...state.lanes, lane],
      laneOrder: [...state.laneOrder, id],
    });
    return id;
  },

  removeLane: (laneId) => {
    set((state) => ({
      lanes: state.lanes.filter((l) => l.id !== laneId),
      laneOrder: state.laneOrder.filter((id) => id !== laneId),
      // Also remove all clips on this lane
      clips: state.clips.filter((c) => c.laneId !== laneId),
      // Clear selection if removed lane was selected
      selectedLaneIds: state.selectedLaneIds.filter((id) => id !== laneId),
      selectedClipIds: state.selectedClipIds.filter((clipId) => {
        const clip = state.clips.find((c) => c.id === clipId);
        return clip ? clip.laneId !== laneId : false;
      }),
    }));
  },

  reorderLanes: (orderedIds) => {
    const state = get();
    // Validate that all provided IDs exist
    const laneMap = new Map(state.lanes.map((l) => [l.id, l]));
    const validIds = orderedIds.filter((id) => laneMap.has(id));
    // Add any missing lane IDs at the end
    const missingIds = state.laneOrder.filter((id) => !validIds.includes(id));
    const newOrder = [...validIds, ...missingIds];
    set({ laneOrder: newOrder });
  },

  updateLane: (laneId, updates) => {
    set((state) => ({
      lanes: state.lanes.map((l) =>
        l.id === laneId ? { ...l, ...updates } : l,
      ),
    }));
  },

  setLaneMuted: (laneId, muted) => {
    get().updateLane(laneId, { muted });
  },

  setLaneSolo: (laneId, solo) => {
    get().updateLane(laneId, { solo });
  },

  setLaneArmed: (laneId, armed) => {
    get().updateLane(laneId, { armed });
  },

  // --- Clip actions ---
  addClip: (laneId, startBeat, durationBeats, kind, name) => {
    const id = generateTimelineId("clip");
    const state = get();
    const snappedStart = snapToGrid(startBeat, state.snap);
    const snappedDuration = Math.max(
      state.snap.enabled ? state.snap.resolution : 0.0625,
      snapToGrid(durationBeats, state.snap) || durationBeats,
    );

    // Pick color based on kind
    const kindColors: Record<ClipKind, string> = {
      audio: "#f97316",
      midi: "#3b82f6",
      automation: "#a855f7",
      trigger: "#22c55e",
    };

    const clip: Clip = {
      id,
      laneId,
      startBeat: snappedStart,
      durationBeats: snappedDuration,
      kind,
      name: name ?? `${kind} clip`,
      color: kindColors[kind],
      muted: false,
    };
    set({ clips: [...state.clips, clip] });
    return id;
  },

  removeClip: (clipId) => {
    set((state) => ({
      clips: state.clips.filter((c) => c.id !== clipId),
      selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId),
    }));
  },

  moveClip: (clipId, newLaneId, newStartBeat) => {
    const state = get();
    const snappedStart = snapToGrid(newStartBeat, state.snap);
    set((state) => ({
      clips: state.clips.map((c) =>
        c.id === clipId
          ? { ...c, laneId: newLaneId, startBeat: Math.max(0, snappedStart) }
          : c,
      ),
    }));
  },

  resizeClip: (clipId, newDurationBeats) => {
    const state = get();
    const minDuration = state.snap.enabled ? state.snap.resolution : 0.0625;
    const snappedDuration = Math.max(
      minDuration,
      snapToGrid(newDurationBeats, state.snap) || newDurationBeats,
    );
    set((state) => ({
      clips: state.clips.map((c) =>
        c.id === clipId ? { ...c, durationBeats: snappedDuration } : c,
      ),
    }));
  },

  updateClip: (clipId, updates) => {
    set((state) => ({
      clips: state.clips.map((c) =>
        c.id === clipId ? { ...c, ...updates } : c,
      ),
    }));
  },

  setClipMuted: (clipId, muted) => {
    get().updateClip(clipId, { muted });
  },

  // --- Selection actions ---
  selectClip: (clipId) => {
    set((state) => ({
      selectedClipIds: state.selectedClipIds.includes(clipId)
        ? state.selectedClipIds
        : [...state.selectedClipIds, clipId],
    }));
  },

  deselectClip: (clipId) => {
    set((state) => ({
      selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId),
    }));
  },

  selectClips: (clipIds) => {
    set({ selectedClipIds: clipIds });
  },

  clearClipSelection: () => set({ selectedClipIds: [] }),

  selectLane: (laneId) => {
    set((state) => ({
      selectedLaneIds: state.selectedLaneIds.includes(laneId)
        ? state.selectedLaneIds
        : [...state.selectedLaneIds, laneId],
    }));
  },

  clearLaneSelection: () => set({ selectedLaneIds: [] }),

  removeSelectedClips: () => {
    set((state) => ({
      clips: state.clips.filter(
        (c) => !state.selectedClipIds.includes(c.id),
      ),
      selectedClipIds: [],
    }));
  },

  // --- Snap actions ---
  setSnapEnabled: (enabled) => {
    set((state) => ({
      snap: { ...state.snap, enabled },
    }));
  },

  setSnapResolution: (resolution) => {
    set((state) => ({
      snap: { ...state.snap, resolution },
    }));
  },

  // --- Loop actions ---
  setLoopRegion: (region) => {
    // Ensure start < end
    const startBeat = Math.min(region.startBeat, region.endBeat);
    const endBeat = Math.max(region.startBeat, region.endBeat);
    set({ loopRegion: { startBeat, endBeat }, loopEnabled: true });
  },

  clearLoopRegion: () => set({ loopRegion: null, loopEnabled: false }),

  setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate how many beats fit in the viewport given a zoom level.
 * Assumes a default viewport width of 1200px. The actual viewport width
 * should be measured at runtime and used with setVisibleRange.
 */
function getViewportWidthInBeats(zoom: number, viewportPx = 1200): number {
  return viewportPx / zoom;
}

/**
 * Convert a beat position to a pixel X coordinate.
 */
export function beatToPixel(beat: number, zoom: number, scrollBeat: number): number {
  return (beat - scrollBeat) * zoom;
}

/**
 * Convert a pixel X coordinate to a beat position.
 */
export function pixelToBeat(px: number, zoom: number, scrollBeat: number): number {
  return px / zoom + scrollBeat;
}

/**
 * Convert beats to a bar/beat string (assuming 4/4 time).
 */
export function beatsToBarBeat(beat: number, beatsPerBar = 4): { bar: number; beat: number } {
  const bar = Math.floor(beat / beatsPerBar) + 1;
  const beatInBar = (beat % beatsPerBar) + 1;
  return { bar, beat: beatInBar };
}

/**
 * Convert beats to seconds given a tempo.
 */
export function beatsToSeconds(beats: number, tempo: number): number {
  return (beats / tempo) * 60;
}

/**
 * Convert seconds to beats given a tempo.
 */
export function secondsToBeats(seconds: number, tempo: number): number {
  return (seconds * tempo) / 60;
}
