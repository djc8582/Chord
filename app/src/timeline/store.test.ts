/**
 * Timeline Store Tests
 *
 * Tests covering:
 * - Store initializes with correct defaults
 * - Playhead position updates
 * - Zoom changes visible range
 * - Clip CRUD (add, move, resize, delete)
 * - Lane management (add, remove, reorder)
 * - Snap-to-grid calculations
 * - Loop region set/clear
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useTimelineStore,
  snapToGrid,
  beatToPixel,
  pixelToBeat,
  beatsToBarBeat,
  beatsToSeconds,
  secondsToBeats,
} from "./store";
import {
  DEFAULT_ZOOM,
  DEFAULT_TEMPO,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_LANE_HEIGHT,
  LANE_COLORS,
} from "./types";

// Reset store before each test to ensure isolation
beforeEach(() => {
  useTimelineStore.setState({
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
    snap: { enabled: true, resolution: 1 },
    loopRegion: null,
    loopEnabled: false,
  });
});

// ---------------------------------------------------------------------------
// Default initialization
// ---------------------------------------------------------------------------

describe("store: default initialization", () => {
  it("initializes with correct default values", () => {
    const state = useTimelineStore.getState();

    expect(state.playheadBeat).toBe(0);
    expect(state.isPlaying).toBe(false);
    expect(state.tempo).toBe(DEFAULT_TEMPO);
    expect(state.zoom).toBe(DEFAULT_ZOOM);
    expect(state.visibleRange).toEqual({ startBeat: 0, endBeat: 32 });
    expect(state.scrollBeat).toBe(0);
    expect(state.timeDisplayMode).toBe("bars");
    expect(state.lanes).toEqual([]);
    expect(state.laneOrder).toEqual([]);
    expect(state.clips).toEqual([]);
    expect(state.selectedClipIds).toEqual([]);
    expect(state.selectedLaneIds).toEqual([]);
    expect(state.snap).toEqual({ enabled: true, resolution: 1 });
    expect(state.loopRegion).toBeNull();
    expect(state.loopEnabled).toBe(false);
  });

  it("has default tempo of 120 BPM", () => {
    expect(useTimelineStore.getState().tempo).toBe(120);
  });

  it("has snap enabled by default with quarter-note resolution", () => {
    const snap = useTimelineStore.getState().snap;
    expect(snap.enabled).toBe(true);
    expect(snap.resolution).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Playhead position
// ---------------------------------------------------------------------------

describe("store: playhead position", () => {
  it("updates playhead position", () => {
    useTimelineStore.getState().setPlayheadBeat(16);
    expect(useTimelineStore.getState().playheadBeat).toBe(16);
  });

  it("clamps playhead to zero when set to negative", () => {
    useTimelineStore.getState().setPlayheadBeat(-5);
    expect(useTimelineStore.getState().playheadBeat).toBe(0);
  });

  it("allows setting playhead to fractional beats", () => {
    useTimelineStore.getState().setPlayheadBeat(4.5);
    expect(useTimelineStore.getState().playheadBeat).toBe(4.5);
  });
});

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

describe("store: transport", () => {
  it("setIsPlaying toggles playback state", () => {
    useTimelineStore.getState().setIsPlaying(true);
    expect(useTimelineStore.getState().isPlaying).toBe(true);

    useTimelineStore.getState().setIsPlaying(false);
    expect(useTimelineStore.getState().isPlaying).toBe(false);
  });

  it("togglePlayback flips the isPlaying state", () => {
    expect(useTimelineStore.getState().isPlaying).toBe(false);

    useTimelineStore.getState().togglePlayback();
    expect(useTimelineStore.getState().isPlaying).toBe(true);

    useTimelineStore.getState().togglePlayback();
    expect(useTimelineStore.getState().isPlaying).toBe(false);
  });

  it("setTempo updates tempo within valid range", () => {
    useTimelineStore.getState().setTempo(140);
    expect(useTimelineStore.getState().tempo).toBe(140);
  });

  it("clamps tempo to minimum of 1", () => {
    useTimelineStore.getState().setTempo(0);
    expect(useTimelineStore.getState().tempo).toBe(1);
  });

  it("clamps tempo to maximum of 999", () => {
    useTimelineStore.getState().setTempo(1500);
    expect(useTimelineStore.getState().tempo).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// Zoom changes visible range
// ---------------------------------------------------------------------------

describe("store: zoom changes visible range", () => {
  it("setZoom updates the zoom level", () => {
    useTimelineStore.getState().setZoom(80);
    expect(useTimelineStore.getState().zoom).toBe(80);
  });

  it("clamps zoom to MIN_ZOOM", () => {
    useTimelineStore.getState().setZoom(0.5);
    expect(useTimelineStore.getState().zoom).toBe(MIN_ZOOM);
  });

  it("clamps zoom to MAX_ZOOM", () => {
    useTimelineStore.getState().setZoom(500);
    expect(useTimelineStore.getState().zoom).toBe(MAX_ZOOM);
  });

  it("zooming in decreases the visible beat range", () => {
    useTimelineStore.getState().setZoom(DEFAULT_ZOOM);
    const rangeBefore = useTimelineStore.getState().visibleRange;
    const widthBefore = rangeBefore.endBeat - rangeBefore.startBeat;

    useTimelineStore.getState().setZoom(DEFAULT_ZOOM * 2);
    const rangeAfter = useTimelineStore.getState().visibleRange;
    const widthAfter = rangeAfter.endBeat - rangeAfter.startBeat;

    expect(widthAfter).toBeLessThan(widthBefore);
  });

  it("zooming out increases the visible beat range", () => {
    useTimelineStore.getState().setZoom(DEFAULT_ZOOM);
    const rangeBefore = useTimelineStore.getState().visibleRange;
    const widthBefore = rangeBefore.endBeat - rangeBefore.startBeat;

    useTimelineStore.getState().setZoom(DEFAULT_ZOOM / 2);
    const rangeAfter = useTimelineStore.getState().visibleRange;
    const widthAfter = rangeAfter.endBeat - rangeAfter.startBeat;

    expect(widthAfter).toBeGreaterThan(widthBefore);
  });

  it("zoomIn increases the zoom level", () => {
    const before = useTimelineStore.getState().zoom;
    useTimelineStore.getState().zoomIn();
    expect(useTimelineStore.getState().zoom).toBeGreaterThan(before);
  });

  it("zoomOut decreases the zoom level", () => {
    const before = useTimelineStore.getState().zoom;
    useTimelineStore.getState().zoomOut();
    expect(useTimelineStore.getState().zoom).toBeLessThan(before);
  });

  it("setScrollBeat updates scroll and visible range", () => {
    useTimelineStore.getState().setScrollBeat(8);
    const state = useTimelineStore.getState();
    expect(state.scrollBeat).toBe(8);
    expect(state.visibleRange.startBeat).toBe(8);
    expect(state.visibleRange.endBeat).toBeGreaterThan(8);
  });

  it("clamps scroll to zero", () => {
    useTimelineStore.getState().setScrollBeat(-10);
    expect(useTimelineStore.getState().scrollBeat).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Lane management (add, remove, reorder)
// ---------------------------------------------------------------------------

describe("store: lane management", () => {
  it("addLane creates a lane with correct defaults", () => {
    const id = useTimelineStore.getState().addLane("Track 1");
    const state = useTimelineStore.getState();

    expect(state.lanes).toHaveLength(1);
    expect(state.lanes[0].id).toBe(id);
    expect(state.lanes[0].name).toBe("Track 1");
    expect(state.lanes[0].height).toBe(DEFAULT_LANE_HEIGHT);
    expect(state.lanes[0].muted).toBe(false);
    expect(state.lanes[0].solo).toBe(false);
    expect(state.lanes[0].armed).toBe(false);
    expect(state.lanes[0].color).toBe(LANE_COLORS[0]);
  });

  it("addLane with nodeId stores the reference", () => {
    const id = useTimelineStore.getState().addLane("Track 1", "node-123");
    const lane = useTimelineStore.getState().lanes.find((l) => l.id === id);
    expect(lane?.nodeId).toBe("node-123");
  });

  it("adding multiple lanes assigns different colors", () => {
    useTimelineStore.getState().addLane("Track 1");
    useTimelineStore.getState().addLane("Track 2");
    useTimelineStore.getState().addLane("Track 3");

    const state = useTimelineStore.getState();
    expect(state.lanes[0].color).toBe(LANE_COLORS[0]);
    expect(state.lanes[1].color).toBe(LANE_COLORS[1]);
    expect(state.lanes[2].color).toBe(LANE_COLORS[2]);
  });

  it("addLane updates laneOrder", () => {
    const id1 = useTimelineStore.getState().addLane("Track 1");
    const id2 = useTimelineStore.getState().addLane("Track 2");

    const state = useTimelineStore.getState();
    expect(state.laneOrder).toEqual([id1, id2]);
  });

  it("removeLane removes the lane and its clips", () => {
    const laneId = useTimelineStore.getState().addLane("Track 1");
    useTimelineStore.getState().addClip(laneId, 0, 4, "midi", "Clip 1");
    useTimelineStore.getState().addClip(laneId, 4, 4, "audio", "Clip 2");

    expect(useTimelineStore.getState().clips).toHaveLength(2);

    useTimelineStore.getState().removeLane(laneId);

    const state = useTimelineStore.getState();
    expect(state.lanes).toHaveLength(0);
    expect(state.laneOrder).toHaveLength(0);
    expect(state.clips).toHaveLength(0);
  });

  it("removeLane does not affect other lanes", () => {
    const id1 = useTimelineStore.getState().addLane("Track 1");
    const id2 = useTimelineStore.getState().addLane("Track 2");
    useTimelineStore.getState().addClip(id1, 0, 4, "midi");
    useTimelineStore.getState().addClip(id2, 0, 4, "audio");

    useTimelineStore.getState().removeLane(id1);

    const state = useTimelineStore.getState();
    expect(state.lanes).toHaveLength(1);
    expect(state.lanes[0].id).toBe(id2);
    expect(state.clips).toHaveLength(1);
    expect(state.clips[0].laneId).toBe(id2);
  });

  it("reorderLanes changes the order", () => {
    const id1 = useTimelineStore.getState().addLane("Track 1");
    const id2 = useTimelineStore.getState().addLane("Track 2");
    const id3 = useTimelineStore.getState().addLane("Track 3");

    useTimelineStore.getState().reorderLanes([id3, id1, id2]);

    expect(useTimelineStore.getState().laneOrder).toEqual([id3, id1, id2]);
  });

  it("reorderLanes handles invalid IDs gracefully", () => {
    const id1 = useTimelineStore.getState().addLane("Track 1");
    const id2 = useTimelineStore.getState().addLane("Track 2");

    // Include a non-existent ID — it should be filtered out, and missing real IDs appended
    useTimelineStore.getState().reorderLanes(["fake-id", id2]);

    const order = useTimelineStore.getState().laneOrder;
    expect(order).toContain(id2);
    expect(order).toContain(id1);
    expect(order).not.toContain("fake-id");
  });

  it("updateLane modifies lane properties", () => {
    const id = useTimelineStore.getState().addLane("Track 1");
    useTimelineStore.getState().updateLane(id, { name: "Renamed", height: 120 });

    const lane = useTimelineStore.getState().lanes.find((l) => l.id === id);
    expect(lane?.name).toBe("Renamed");
    expect(lane?.height).toBe(120);
  });

  it("setLaneMuted toggles mute state", () => {
    const id = useTimelineStore.getState().addLane("Track 1");

    useTimelineStore.getState().setLaneMuted(id, true);
    expect(useTimelineStore.getState().lanes[0].muted).toBe(true);

    useTimelineStore.getState().setLaneMuted(id, false);
    expect(useTimelineStore.getState().lanes[0].muted).toBe(false);
  });

  it("setLaneSolo toggles solo state", () => {
    const id = useTimelineStore.getState().addLane("Track 1");

    useTimelineStore.getState().setLaneSolo(id, true);
    expect(useTimelineStore.getState().lanes[0].solo).toBe(true);
  });

  it("setLaneArmed toggles armed state", () => {
    const id = useTimelineStore.getState().addLane("Track 1");

    useTimelineStore.getState().setLaneArmed(id, true);
    expect(useTimelineStore.getState().lanes[0].armed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Clip CRUD (add, move, resize, delete)
// ---------------------------------------------------------------------------

describe("store: clip CRUD", () => {
  let laneId: string;

  beforeEach(() => {
    laneId = useTimelineStore.getState().addLane("Track 1");
  });

  it("addClip creates a clip with correct properties", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 4, 8, "midi", "My Clip");
    const state = useTimelineStore.getState();

    expect(state.clips).toHaveLength(1);
    expect(state.clips[0].id).toBe(clipId);
    expect(state.clips[0].laneId).toBe(laneId);
    expect(state.clips[0].startBeat).toBe(4);
    expect(state.clips[0].durationBeats).toBe(8);
    expect(state.clips[0].kind).toBe("midi");
    expect(state.clips[0].name).toBe("My Clip");
    expect(state.clips[0].muted).toBe(false);
    expect(state.clips[0].color).toBeTruthy();
  });

  it("addClip with different kinds assigns appropriate colors", () => {
    const audioId = useTimelineStore.getState().addClip(laneId, 0, 4, "audio");
    const midiId = useTimelineStore.getState().addClip(laneId, 4, 4, "midi");
    const autoId = useTimelineStore.getState().addClip(laneId, 8, 4, "automation");
    const trigId = useTimelineStore.getState().addClip(laneId, 12, 4, "trigger");

    const clips = useTimelineStore.getState().clips;
    const audio = clips.find((c) => c.id === audioId);
    const midi = clips.find((c) => c.id === midiId);
    const auto = clips.find((c) => c.id === autoId);
    const trig = clips.find((c) => c.id === trigId);

    // Each kind should have a different color
    expect(audio?.color).toBe("#f97316");
    expect(midi?.color).toBe("#3b82f6");
    expect(auto?.color).toBe("#a855f7");
    expect(trig?.color).toBe("#22c55e");
  });

  it("addClip uses default name based on kind when no name is provided", () => {
    useTimelineStore.getState().addClip(laneId, 0, 4, "audio");
    expect(useTimelineStore.getState().clips[0].name).toBe("audio clip");
  });

  it("addClip snaps start position when snap is enabled", () => {
    useTimelineStore.getState().setSnapResolution(1);
    useTimelineStore.getState().addClip(laneId, 3.7, 4, "midi");
    expect(useTimelineStore.getState().clips[0].startBeat).toBe(4);
  });

  it("removeClip removes the clip", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 0, 4, "midi");
    expect(useTimelineStore.getState().clips).toHaveLength(1);

    useTimelineStore.getState().removeClip(clipId);
    expect(useTimelineStore.getState().clips).toHaveLength(0);
  });

  it("removeClip also clears clip from selection", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 0, 4, "midi");
    useTimelineStore.getState().selectClip(clipId);
    expect(useTimelineStore.getState().selectedClipIds).toContain(clipId);

    useTimelineStore.getState().removeClip(clipId);
    expect(useTimelineStore.getState().selectedClipIds).not.toContain(clipId);
  });

  it("moveClip changes lane and start position", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 4, 8, "midi");
    const lane2Id = useTimelineStore.getState().addLane("Track 2");

    useTimelineStore.getState().moveClip(clipId, lane2Id, 12);

    const clip = useTimelineStore.getState().clips.find((c) => c.id === clipId);
    expect(clip?.laneId).toBe(lane2Id);
    expect(clip?.startBeat).toBe(12);
  });

  it("moveClip snaps position to grid", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 0, 4, "midi");
    useTimelineStore.getState().setSnapResolution(1);

    useTimelineStore.getState().moveClip(clipId, laneId, 5.3);

    const clip = useTimelineStore.getState().clips.find((c) => c.id === clipId);
    expect(clip?.startBeat).toBe(5);
  });

  it("moveClip clamps start to zero", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 4, 4, "midi");
    useTimelineStore.getState().setSnapEnabled(false);

    useTimelineStore.getState().moveClip(clipId, laneId, -3);

    const clip = useTimelineStore.getState().clips.find((c) => c.id === clipId);
    expect(clip?.startBeat).toBe(0);
  });

  it("resizeClip changes duration", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 0, 4, "midi");

    useTimelineStore.getState().resizeClip(clipId, 16);

    const clip = useTimelineStore.getState().clips.find((c) => c.id === clipId);
    expect(clip?.durationBeats).toBe(16);
  });

  it("resizeClip enforces minimum duration based on snap resolution", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 0, 4, "midi");
    useTimelineStore.getState().setSnapResolution(0.5);

    useTimelineStore.getState().resizeClip(clipId, 0.1);

    const clip = useTimelineStore.getState().clips.find((c) => c.id === clipId);
    expect(clip!.durationBeats).toBeGreaterThanOrEqual(0.5);
  });

  it("updateClip modifies arbitrary clip properties", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 0, 4, "midi", "Original");

    useTimelineStore.getState().updateClip(clipId, { name: "Updated", color: "#ff0000" });

    const clip = useTimelineStore.getState().clips.find((c) => c.id === clipId);
    expect(clip?.name).toBe("Updated");
    expect(clip?.color).toBe("#ff0000");
  });

  it("setClipMuted toggles clip mute", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 0, 4, "midi");

    useTimelineStore.getState().setClipMuted(clipId, true);
    expect(useTimelineStore.getState().clips[0].muted).toBe(true);

    useTimelineStore.getState().setClipMuted(clipId, false);
    expect(useTimelineStore.getState().clips[0].muted).toBe(false);
  });

  it("adding multiple clips works correctly", () => {
    useTimelineStore.getState().addClip(laneId, 0, 4, "audio");
    useTimelineStore.getState().addClip(laneId, 4, 4, "midi");
    useTimelineStore.getState().addClip(laneId, 8, 2, "trigger");

    expect(useTimelineStore.getState().clips).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

describe("store: clip selection", () => {
  let laneId: string;

  beforeEach(() => {
    laneId = useTimelineStore.getState().addLane("Track 1");
  });

  it("selectClip adds clip to selection", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 0, 4, "midi");
    useTimelineStore.getState().selectClip(clipId);
    expect(useTimelineStore.getState().selectedClipIds).toEqual([clipId]);
  });

  it("selectClip does not duplicate selection", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 0, 4, "midi");
    useTimelineStore.getState().selectClip(clipId);
    useTimelineStore.getState().selectClip(clipId);
    expect(useTimelineStore.getState().selectedClipIds).toEqual([clipId]);
  });

  it("deselectClip removes clip from selection", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 0, 4, "midi");
    useTimelineStore.getState().selectClip(clipId);
    useTimelineStore.getState().deselectClip(clipId);
    expect(useTimelineStore.getState().selectedClipIds).toEqual([]);
  });

  it("selectClips replaces the entire selection", () => {
    const c1 = useTimelineStore.getState().addClip(laneId, 0, 4, "midi");
    useTimelineStore.getState().addClip(laneId, 4, 4, "audio");
    const c3 = useTimelineStore.getState().addClip(laneId, 8, 4, "midi");

    useTimelineStore.getState().selectClips([c1, c3]);
    expect(useTimelineStore.getState().selectedClipIds).toEqual([c1, c3]);
  });

  it("clearClipSelection empties selection", () => {
    const clipId = useTimelineStore.getState().addClip(laneId, 0, 4, "midi");
    useTimelineStore.getState().selectClip(clipId);
    useTimelineStore.getState().clearClipSelection();
    expect(useTimelineStore.getState().selectedClipIds).toEqual([]);
  });

  it("removeSelectedClips deletes all selected clips", () => {
    const c1 = useTimelineStore.getState().addClip(laneId, 0, 4, "midi");
    const c2 = useTimelineStore.getState().addClip(laneId, 4, 4, "audio");
    const c3 = useTimelineStore.getState().addClip(laneId, 8, 4, "midi");

    useTimelineStore.getState().selectClips([c1, c3]);
    useTimelineStore.getState().removeSelectedClips();

    const state = useTimelineStore.getState();
    expect(state.clips).toHaveLength(1);
    expect(state.clips[0].id).toBe(c2);
    expect(state.selectedClipIds).toEqual([]);
  });

  it("selectLane adds lane to selection", () => {
    useTimelineStore.getState().selectLane(laneId);
    expect(useTimelineStore.getState().selectedLaneIds).toContain(laneId);
  });

  it("clearLaneSelection empties lane selection", () => {
    useTimelineStore.getState().selectLane(laneId);
    useTimelineStore.getState().clearLaneSelection();
    expect(useTimelineStore.getState().selectedLaneIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Snap-to-grid calculations
// ---------------------------------------------------------------------------

describe("snapToGrid", () => {
  it("snaps beat to nearest quarter note (resolution=1)", () => {
    expect(snapToGrid(3.7, { enabled: true, resolution: 1 })).toBe(4);
    expect(snapToGrid(3.2, { enabled: true, resolution: 1 })).toBe(3);
    expect(snapToGrid(3.5, { enabled: true, resolution: 1 })).toBe(4);
  });

  it("snaps to eighth note (resolution=0.5)", () => {
    expect(snapToGrid(3.3, { enabled: true, resolution: 0.5 })).toBe(3.5);
    expect(snapToGrid(3.1, { enabled: true, resolution: 0.5 })).toBe(3);
  });

  it("snaps to sixteenth note (resolution=0.25)", () => {
    expect(snapToGrid(3.1, { enabled: true, resolution: 0.25 })).toBe(3);
    expect(snapToGrid(3.13, { enabled: true, resolution: 0.25 })).toBe(3.25);
  });

  it("snaps to bar (resolution=4)", () => {
    expect(snapToGrid(5, { enabled: true, resolution: 4 })).toBe(4);
    expect(snapToGrid(6, { enabled: true, resolution: 4 })).toBe(8);
    expect(snapToGrid(2, { enabled: true, resolution: 4 })).toBe(4);
  });

  it("returns exact value when snap is disabled", () => {
    expect(snapToGrid(3.7, { enabled: false, resolution: 1 })).toBe(3.7);
    expect(snapToGrid(5.123, { enabled: false, resolution: 4 })).toBe(5.123);
  });

  it("snaps zero correctly", () => {
    expect(snapToGrid(0, { enabled: true, resolution: 1 })).toBe(0);
  });

  it("handles half note resolution (resolution=2)", () => {
    expect(snapToGrid(3, { enabled: true, resolution: 2 })).toBe(4);
    expect(snapToGrid(1, { enabled: true, resolution: 2 })).toBe(2);
    expect(snapToGrid(0.5, { enabled: true, resolution: 2 })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Loop region set/clear
// ---------------------------------------------------------------------------

describe("store: loop region", () => {
  it("setLoopRegion creates a loop region and enables loop", () => {
    useTimelineStore.getState().setLoopRegion({ startBeat: 4, endBeat: 12 });

    const state = useTimelineStore.getState();
    expect(state.loopRegion).toEqual({ startBeat: 4, endBeat: 12 });
    expect(state.loopEnabled).toBe(true);
  });

  it("setLoopRegion normalizes start/end if start > end", () => {
    useTimelineStore.getState().setLoopRegion({ startBeat: 16, endBeat: 4 });

    const state = useTimelineStore.getState();
    expect(state.loopRegion?.startBeat).toBe(4);
    expect(state.loopRegion?.endBeat).toBe(16);
  });

  it("clearLoopRegion removes loop region and disables loop", () => {
    useTimelineStore.getState().setLoopRegion({ startBeat: 4, endBeat: 12 });
    useTimelineStore.getState().clearLoopRegion();

    const state = useTimelineStore.getState();
    expect(state.loopRegion).toBeNull();
    expect(state.loopEnabled).toBe(false);
  });

  it("setLoopEnabled can disable loop without clearing region", () => {
    useTimelineStore.getState().setLoopRegion({ startBeat: 4, endBeat: 12 });
    useTimelineStore.getState().setLoopEnabled(false);

    const state = useTimelineStore.getState();
    expect(state.loopRegion).toEqual({ startBeat: 4, endBeat: 12 });
    expect(state.loopEnabled).toBe(false);
  });

  it("setLoopEnabled can re-enable loop on existing region", () => {
    useTimelineStore.getState().setLoopRegion({ startBeat: 4, endBeat: 12 });
    useTimelineStore.getState().setLoopEnabled(false);
    useTimelineStore.getState().setLoopEnabled(true);

    expect(useTimelineStore.getState().loopEnabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Snap settings
// ---------------------------------------------------------------------------

describe("store: snap settings", () => {
  it("setSnapEnabled toggles snap", () => {
    useTimelineStore.getState().setSnapEnabled(false);
    expect(useTimelineStore.getState().snap.enabled).toBe(false);

    useTimelineStore.getState().setSnapEnabled(true);
    expect(useTimelineStore.getState().snap.enabled).toBe(true);
  });

  it("setSnapResolution changes the grid resolution", () => {
    useTimelineStore.getState().setSnapResolution(0.25);
    expect(useTimelineStore.getState().snap.resolution).toBe(0.25);

    useTimelineStore.getState().setSnapResolution(4);
    expect(useTimelineStore.getState().snap.resolution).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Time display mode
// ---------------------------------------------------------------------------

describe("store: time display mode", () => {
  it("defaults to bars", () => {
    expect(useTimelineStore.getState().timeDisplayMode).toBe("bars");
  });

  it("can switch to seconds", () => {
    useTimelineStore.getState().setTimeDisplayMode("seconds");
    expect(useTimelineStore.getState().timeDisplayMode).toBe("seconds");
  });
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

describe("beatToPixel / pixelToBeat", () => {
  it("converts beat to pixel position", () => {
    expect(beatToPixel(4, 40, 0)).toBe(160);
    expect(beatToPixel(0, 40, 0)).toBe(0);
  });

  it("accounts for scroll offset", () => {
    expect(beatToPixel(4, 40, 2)).toBe(80); // (4 - 2) * 40
  });

  it("converts pixel to beat position", () => {
    expect(pixelToBeat(160, 40, 0)).toBe(4);
  });

  it("pixelToBeat accounts for scroll offset", () => {
    expect(pixelToBeat(80, 40, 2)).toBe(4); // 80/40 + 2
  });

  it("beatToPixel and pixelToBeat are inverse functions", () => {
    const beat = 7.5;
    const zoom = 60;
    const scroll = 3;
    const px = beatToPixel(beat, zoom, scroll);
    const roundTrip = pixelToBeat(px, zoom, scroll);
    expect(roundTrip).toBeCloseTo(beat, 10);
  });
});

describe("beatsToBarBeat", () => {
  it("converts beat 0 to bar 1, beat 1", () => {
    const result = beatsToBarBeat(0);
    expect(result).toEqual({ bar: 1, beat: 1 });
  });

  it("converts beat 4 to bar 2, beat 1", () => {
    const result = beatsToBarBeat(4);
    expect(result).toEqual({ bar: 2, beat: 1 });
  });

  it("converts beat 7 to bar 2, beat 4", () => {
    const result = beatsToBarBeat(7);
    expect(result).toEqual({ bar: 2, beat: 4 });
  });

  it("handles custom beatsPerBar", () => {
    const result = beatsToBarBeat(6, 3); // 3/4 time
    expect(result).toEqual({ bar: 3, beat: 1 });
  });
});

describe("beatsToSeconds / secondsToBeats", () => {
  it("converts beats to seconds at 120 BPM", () => {
    expect(beatsToSeconds(4, 120)).toBe(2);
    expect(beatsToSeconds(2, 120)).toBe(1);
  });

  it("converts seconds to beats at 120 BPM", () => {
    expect(secondsToBeats(2, 120)).toBe(4);
    expect(secondsToBeats(1, 120)).toBe(2);
  });

  it("roundtrip: beatsToSeconds and secondsToBeats are inverses", () => {
    const beats = 7.5;
    const tempo = 135;
    const secs = beatsToSeconds(beats, tempo);
    const roundTrip = secondsToBeats(secs, tempo);
    expect(roundTrip).toBeCloseTo(beats, 10);
  });
});
