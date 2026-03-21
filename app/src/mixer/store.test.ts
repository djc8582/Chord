/**
 * Mixer Store Tests
 *
 * Tests covering:
 * - Mixer store derives channels from document model nodes
 * - Solo/mute state toggles correctly
 * - Solo logic: soloing one channel mutes all others
 * - Volume fader range and dB conversion
 * - Level meter maps signal stats to visual height
 * - Master channel operations
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPatchDocument } from "@chord/document-model";
import { useCanvasStore } from "../canvas/store.js";
import {
  useMixerStore,
  faderToDb,
  dbToFader,
  dbToGain,
  gainToDb,
  levelToMeterHeight,
  meterColor,
  hasSoloActive,
  isChannelAudible,
  nodeHasAudioOutput,
  FADER_MIN_DB,
  MAX_DB,
} from "./store.js";
import type { MixerChannel } from "./store.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  const doc = createPatchDocument();
  useCanvasStore.getState().initDocument(doc);
  useMixerStore.setState({
    channels: [],
    master: {
      nodeId: "__master__",
      name: "Master",
      type: "master",
      volumeDb: 0,
      pan: 0,
      muted: false,
      soloed: false,
      peakDb: -Infinity,
      rmsDb: -Infinity,
      clipping: false,
    },
  });
});

// ---------------------------------------------------------------------------
// dB / fader conversion utilities
// ---------------------------------------------------------------------------

describe("faderToDb / dbToFader", () => {
  it("fader=0 maps to -Infinity dB", () => {
    expect(faderToDb(0)).toBe(-Infinity);
  });

  it("fader=1 maps to MAX_DB (+12)", () => {
    expect(faderToDb(1)).toBe(MAX_DB);
  });

  it("round-trips correctly for mid-range values", () => {
    const faderPos = 0.5;
    const db = faderToDb(faderPos);
    const back = dbToFader(db);
    expect(back).toBeCloseTo(faderPos, 5);
  });

  it("dbToFader(-Infinity) returns 0", () => {
    expect(dbToFader(-Infinity)).toBe(0);
  });

  it("dbToFader(MAX_DB) returns 1", () => {
    expect(dbToFader(MAX_DB)).toBe(1);
  });

  it("dbToFader(0) returns the expected position (unity gain ~0.889)", () => {
    const pos = dbToFader(0);
    // 0 dB should be at (0 - FADER_MIN_DB) / (MAX_DB - FADER_MIN_DB)
    const expected = (0 - FADER_MIN_DB) / (MAX_DB - FADER_MIN_DB);
    expect(pos).toBeCloseTo(expected, 5);
  });

  it("values below FADER_MIN_DB map to fader=0", () => {
    expect(dbToFader(-200)).toBe(0);
  });

  it("values above MAX_DB are clamped to fader=1", () => {
    expect(dbToFader(100)).toBe(1);
  });
});

describe("dbToGain / gainToDb", () => {
  it("0 dB = gain 1.0", () => {
    expect(dbToGain(0)).toBeCloseTo(1.0, 5);
  });

  it("-6 dB ~ gain 0.5", () => {
    expect(dbToGain(-6)).toBeCloseTo(0.5012, 3);
  });

  it("+6 dB ~ gain 2.0", () => {
    expect(dbToGain(6)).toBeCloseTo(1.9953, 3);
  });

  it("-Infinity dB = gain 0", () => {
    expect(dbToGain(-Infinity)).toBe(0);
  });

  it("gainToDb(1) = 0 dB", () => {
    expect(gainToDb(1)).toBeCloseTo(0, 5);
  });

  it("gainToDb(0) = -Infinity", () => {
    expect(gainToDb(0)).toBe(-Infinity);
  });

  it("round-trips correctly", () => {
    const db = -12;
    expect(gainToDb(dbToGain(db))).toBeCloseTo(db, 5);
  });
});

// ---------------------------------------------------------------------------
// levelToMeterHeight
// ---------------------------------------------------------------------------

describe("levelToMeterHeight", () => {
  it("maps -Infinity to 0", () => {
    expect(levelToMeterHeight(-Infinity)).toBe(0);
  });

  it("maps MAX_DB to 1", () => {
    expect(levelToMeterHeight(MAX_DB)).toBe(1);
  });

  it("maps 0 dB to expected height", () => {
    const expected = (0 - FADER_MIN_DB) / (MAX_DB - FADER_MIN_DB);
    expect(levelToMeterHeight(0)).toBeCloseTo(expected, 5);
  });

  it("maps values below FADER_MIN_DB to 0", () => {
    expect(levelToMeterHeight(-200)).toBe(0);
  });

  it("maps values above MAX_DB to 1", () => {
    expect(levelToMeterHeight(100)).toBe(1);
  });

  it("produces a value between 0 and 1 for a mid-range dB", () => {
    const h = levelToMeterHeight(-20);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// meterColor
// ---------------------------------------------------------------------------

describe("meterColor", () => {
  it("returns green for values below -6 dB", () => {
    expect(meterColor(-12)).toBe("green");
    expect(meterColor(-40)).toBe("green");
  });

  it("returns yellow for values between -6 and 0 dB", () => {
    expect(meterColor(-3)).toBe("yellow");
    expect(meterColor(-5.9)).toBe("yellow");
  });

  it("returns red for values above 0 dB", () => {
    expect(meterColor(1)).toBe("red");
    expect(meterColor(12)).toBe("red");
  });

  it("returns green for exactly -6 dB", () => {
    expect(meterColor(-6)).toBe("green");
  });

  it("returns yellow for exactly 0 dB", () => {
    expect(meterColor(0)).toBe("yellow");
  });
});

// ---------------------------------------------------------------------------
// nodeHasAudioOutput
// ---------------------------------------------------------------------------

describe("nodeHasAudioOutput", () => {
  it("returns true for oscillator (has audio output)", () => {
    expect(nodeHasAudioOutput("oscillator")).toBe(true);
  });

  it("returns true for filter (has audio output)", () => {
    expect(nodeHasAudioOutput("filter")).toBe(true);
  });

  it("returns true for gain (has audio output)", () => {
    expect(nodeHasAudioOutput("gain")).toBe(true);
  });

  it("returns false for output (no audio outputs, only inputs)", () => {
    expect(nodeHasAudioOutput("output")).toBe(false);
  });

  it("returns false for envelope (control output, not audio)", () => {
    expect(nodeHasAudioOutput("envelope")).toBe(false);
  });

  it("returns false for unknown types", () => {
    expect(nodeHasAudioOutput("nonexistent")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Store: syncFromDocument derives channels
// ---------------------------------------------------------------------------

describe("store: syncFromDocument derives channels", () => {
  it("starts with empty channels", () => {
    expect(useMixerStore.getState().channels).toEqual([]);
  });

  it("derives channels from nodes with audio outputs", () => {
    const canvas = useCanvasStore.getState();
    canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc 1");
    canvas.addNode("filter", { x: 100, y: 0 }, "Filter 1");

    useMixerStore.getState().syncFromDocument();

    const channels = useMixerStore.getState().channels;
    expect(channels).toHaveLength(2);
    expect(channels.map((c) => c.name)).toContain("Osc 1");
    expect(channels.map((c) => c.name)).toContain("Filter 1");
  });

  it("excludes nodes without audio outputs (like output, envelope)", () => {
    const canvas = useCanvasStore.getState();
    canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc");
    canvas.addNode("output", { x: 200, y: 0 }, "Out");
    canvas.addNode("envelope", { x: 100, y: 100 }, "Env");

    useMixerStore.getState().syncFromDocument();

    const channels = useMixerStore.getState().channels;
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe("Osc");
  });

  it("preserves solo/mute state across syncs", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc");

    useMixerStore.getState().syncFromDocument();
    useMixerStore.getState().toggleMute(id);
    useMixerStore.getState().toggleSolo(id);

    // Re-sync
    useMixerStore.getState().syncFromDocument();

    const channels = useMixerStore.getState().channels;
    const ch = channels.find((c) => c.nodeId === id);
    expect(ch?.muted).toBe(true);
    expect(ch?.soloed).toBe(true);
  });

  it("removes channels when nodes are removed from document", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc");
    canvas.addNode("filter", { x: 100, y: 0 }, "Filt");

    useMixerStore.getState().syncFromDocument();
    expect(useMixerStore.getState().channels).toHaveLength(2);

    canvas.removeNode(id);
    useMixerStore.getState().syncFromDocument();
    expect(useMixerStore.getState().channels).toHaveLength(1);
    expect(useMixerStore.getState().channels[0].name).toBe("Filt");
  });
});

// ---------------------------------------------------------------------------
// Store: solo / mute toggles
// ---------------------------------------------------------------------------

describe("store: solo/mute toggles", () => {
  it("toggleMute toggles the muted state", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc");
    useMixerStore.getState().syncFromDocument();

    expect(useMixerStore.getState().channels[0].muted).toBe(false);

    useMixerStore.getState().toggleMute(id);
    expect(useMixerStore.getState().channels[0].muted).toBe(true);

    useMixerStore.getState().toggleMute(id);
    expect(useMixerStore.getState().channels[0].muted).toBe(false);
  });

  it("toggleSolo toggles the soloed state", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc");
    useMixerStore.getState().syncFromDocument();

    expect(useMixerStore.getState().channels[0].soloed).toBe(false);

    useMixerStore.getState().toggleSolo(id);
    expect(useMixerStore.getState().channels[0].soloed).toBe(true);

    useMixerStore.getState().toggleSolo(id);
    expect(useMixerStore.getState().channels[0].soloed).toBe(false);
  });

  it("clearSolos removes all solos", () => {
    const canvas = useCanvasStore.getState();
    const id1 = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc 1");
    const id2 = canvas.addNode("filter", { x: 100, y: 0 }, "Filter 1");
    useMixerStore.getState().syncFromDocument();

    useMixerStore.getState().toggleSolo(id1);
    useMixerStore.getState().toggleSolo(id2);

    const channels = useMixerStore.getState().channels;
    expect(channels.every((c) => c.soloed)).toBe(true);

    useMixerStore.getState().clearSolos();
    const after = useMixerStore.getState().channels;
    expect(after.every((c) => !c.soloed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Solo logic: soloing one channel mutes all others
// ---------------------------------------------------------------------------

describe("solo logic", () => {
  it("hasSoloActive returns false when no channels are soloed", () => {
    const channels: MixerChannel[] = [
      { nodeId: "a", name: "A", type: "osc", volumeDb: 0, pan: 0, muted: false, soloed: false, peakDb: -Infinity, rmsDb: -Infinity, clipping: false },
      { nodeId: "b", name: "B", type: "osc", volumeDb: 0, pan: 0, muted: false, soloed: false, peakDb: -Infinity, rmsDb: -Infinity, clipping: false },
    ];
    expect(hasSoloActive(channels)).toBe(false);
  });

  it("hasSoloActive returns true when at least one channel is soloed", () => {
    const channels: MixerChannel[] = [
      { nodeId: "a", name: "A", type: "osc", volumeDb: 0, pan: 0, muted: false, soloed: true, peakDb: -Infinity, rmsDb: -Infinity, clipping: false },
      { nodeId: "b", name: "B", type: "osc", volumeDb: 0, pan: 0, muted: false, soloed: false, peakDb: -Infinity, rmsDb: -Infinity, clipping: false },
    ];
    expect(hasSoloActive(channels)).toBe(true);
  });

  it("isChannelAudible: non-muted channel with no solos is audible", () => {
    const ch: MixerChannel = {
      nodeId: "a", name: "A", type: "osc", volumeDb: 0, pan: 0,
      muted: false, soloed: false, peakDb: -Infinity, rmsDb: -Infinity, clipping: false,
    };
    expect(isChannelAudible(ch, false)).toBe(true);
  });

  it("isChannelAudible: muted channel is not audible", () => {
    const ch: MixerChannel = {
      nodeId: "a", name: "A", type: "osc", volumeDb: 0, pan: 0,
      muted: true, soloed: false, peakDb: -Infinity, rmsDb: -Infinity, clipping: false,
    };
    expect(isChannelAudible(ch, false)).toBe(false);
  });

  it("isChannelAudible: non-soloed channel when solo is active is not audible", () => {
    const ch: MixerChannel = {
      nodeId: "a", name: "A", type: "osc", volumeDb: 0, pan: 0,
      muted: false, soloed: false, peakDb: -Infinity, rmsDb: -Infinity, clipping: false,
    };
    expect(isChannelAudible(ch, true)).toBe(false);
  });

  it("isChannelAudible: soloed channel when solo is active is audible", () => {
    const ch: MixerChannel = {
      nodeId: "a", name: "A", type: "osc", volumeDb: 0, pan: 0,
      muted: false, soloed: true, peakDb: -Infinity, rmsDb: -Infinity, clipping: false,
    };
    expect(isChannelAudible(ch, true)).toBe(true);
  });

  it("isChannelAudible: muted + soloed channel is NOT audible (mute overrides solo)", () => {
    const ch: MixerChannel = {
      nodeId: "a", name: "A", type: "osc", volumeDb: 0, pan: 0,
      muted: true, soloed: true, peakDb: -Infinity, rmsDb: -Infinity, clipping: false,
    };
    expect(isChannelAudible(ch, true)).toBe(false);
  });

  it("soloing one channel effectively mutes all others via isChannelAudible", () => {
    const canvas = useCanvasStore.getState();
    const id1 = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc 1");
    const id2 = canvas.addNode("filter", { x: 100, y: 0 }, "Filter 1");
    const id3 = canvas.addNode("gain", { x: 200, y: 0 }, "Gain 1");
    useMixerStore.getState().syncFromDocument();

    // Solo only channel 1
    useMixerStore.getState().toggleSolo(id1);

    const channels = useMixerStore.getState().channels;
    const anySoloed = hasSoloActive(channels);
    expect(anySoloed).toBe(true);

    const ch1 = channels.find((c) => c.nodeId === id1)!;
    const ch2 = channels.find((c) => c.nodeId === id2)!;
    const ch3 = channels.find((c) => c.nodeId === id3)!;

    expect(isChannelAudible(ch1, anySoloed)).toBe(true);
    expect(isChannelAudible(ch2, anySoloed)).toBe(false);
    expect(isChannelAudible(ch3, anySoloed)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Store: volume / pan
// ---------------------------------------------------------------------------

describe("store: volume and pan", () => {
  it("setVolume updates channel volume", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc");
    useMixerStore.getState().syncFromDocument();

    useMixerStore.getState().setVolume(id, -6);
    const ch = useMixerStore.getState().channels[0];
    expect(ch.volumeDb).toBe(-6);
  });

  it("setVolume clamps to MAX_DB", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc");
    useMixerStore.getState().syncFromDocument();

    useMixerStore.getState().setVolume(id, 100);
    const ch = useMixerStore.getState().channels[0];
    expect(ch.volumeDb).toBe(MAX_DB);
  });

  it("setPan updates channel pan", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc");
    useMixerStore.getState().syncFromDocument();

    useMixerStore.getState().setPan(id, -0.5);
    const ch = useMixerStore.getState().channels[0];
    expect(ch.pan).toBe(-0.5);
  });

  it("setPan clamps to [-1, 1]", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc");
    useMixerStore.getState().syncFromDocument();

    useMixerStore.getState().setPan(id, -5);
    expect(useMixerStore.getState().channels[0].pan).toBe(-1);

    useMixerStore.getState().setPan(id, 5);
    expect(useMixerStore.getState().channels[0].pan).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Store: meter updates
// ---------------------------------------------------------------------------

describe("store: meter updates", () => {
  it("updateMeter sets peak/rms/clipping on a channel", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc");
    useMixerStore.getState().syncFromDocument();

    useMixerStore.getState().updateMeter(id, { peak: 0.8, rms: 0.5, clipping: false });

    const ch = useMixerStore.getState().channels[0];
    expect(ch.peakDb).toBeCloseTo(gainToDb(0.8), 3);
    expect(ch.rmsDb).toBeCloseTo(gainToDb(0.5), 3);
    expect(ch.clipping).toBe(false);
  });

  it("updateMeter with clipping sets clipping flag", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc");
    useMixerStore.getState().syncFromDocument();

    useMixerStore.getState().updateMeter(id, { peak: 1.5, rms: 1.0, clipping: true });

    const ch = useMixerStore.getState().channels[0];
    expect(ch.clipping).toBe(true);
  });

  it("updateMeter on master updates master channel", () => {
    useMixerStore.getState().updateMeter("__master__", { peak: 0.9, rms: 0.6, clipping: false });

    const master = useMixerStore.getState().master;
    expect(master.peakDb).toBeCloseTo(gainToDb(0.9), 3);
    expect(master.rmsDb).toBeCloseTo(gainToDb(0.6), 3);
  });
});

// ---------------------------------------------------------------------------
// Store: master channel
// ---------------------------------------------------------------------------

describe("store: master channel", () => {
  it("has a default master channel", () => {
    const master = useMixerStore.getState().master;
    expect(master.nodeId).toBe("__master__");
    expect(master.name).toBe("Master");
    expect(master.volumeDb).toBe(0);
  });

  it("setMasterVolume updates master volume", () => {
    useMixerStore.getState().setMasterVolume(-3);
    expect(useMixerStore.getState().master.volumeDb).toBe(-3);
  });

  it("setMasterPan updates master pan", () => {
    useMixerStore.getState().setMasterPan(0.5);
    expect(useMixerStore.getState().master.pan).toBe(0.5);
  });

  it("toggleMasterMute toggles master mute", () => {
    expect(useMixerStore.getState().master.muted).toBe(false);
    useMixerStore.getState().toggleMasterMute();
    expect(useMixerStore.getState().master.muted).toBe(true);
    useMixerStore.getState().toggleMasterMute();
    expect(useMixerStore.getState().master.muted).toBe(false);
  });
});
