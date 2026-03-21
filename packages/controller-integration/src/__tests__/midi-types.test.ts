import { describe, it, expect } from "vitest";
import {
  createMidiMessage,
  noteOn,
  noteOff,
  controlChange,
  pitchBend,
  isChannelVoice,
  isControlChange,
  isNoteOn,
  isNoteOff,
  getChannel,
  validateMidiData,
} from "../midi-types.js";
import type { MidiData } from "../midi-types.js";

describe("MidiMessage construction", () => {
  it("creates a MidiMessage with timestamp and data", () => {
    const data = noteOn(0, 60, 100);
    const msg = createMidiMessage(12345, data);
    expect(msg.timestamp).toBe(12345);
    expect(msg.data).toEqual({ type: "NoteOn", channel: 0, note: 60, velocity: 100 });
  });

  it("creates NoteOn data", () => {
    const data = noteOn(1, 64, 127);
    expect(data.type).toBe("NoteOn");
    expect(data.channel).toBe(1);
    expect(data.note).toBe(64);
    expect(data.velocity).toBe(127);
  });

  it("creates NoteOff data", () => {
    const data = noteOff(0, 60, 0);
    expect(data.type).toBe("NoteOff");
    expect(data.channel).toBe(0);
    expect(data.note).toBe(60);
    expect(data.velocity).toBe(0);
  });

  it("creates ControlChange data", () => {
    const data = controlChange(2, 74, 64);
    expect(data.type).toBe("ControlChange");
    expect(data.channel).toBe(2);
    expect(data.controller).toBe(74);
    expect(data.value).toBe(64);
  });

  it("creates PitchBend data", () => {
    const data = pitchBend(0, -8192);
    expect(data.type).toBe("PitchBend");
    expect(data.channel).toBe(0);
    expect(data.value).toBe(-8192);
  });
});

describe("type guards", () => {
  it("isChannelVoice returns true for voice messages", () => {
    expect(isChannelVoice(noteOn(0, 60, 100))).toBe(true);
    expect(isChannelVoice(noteOff(0, 60, 0))).toBe(true);
    expect(isChannelVoice(controlChange(0, 1, 64))).toBe(true);
    expect(isChannelVoice(pitchBend(0, 0))).toBe(true);
    expect(isChannelVoice({ type: "Aftertouch", channel: 0, pressure: 64 })).toBe(true);
    expect(isChannelVoice({ type: "PolyAftertouch", channel: 0, note: 60, pressure: 64 })).toBe(true);
    expect(isChannelVoice({ type: "ProgramChange", channel: 0, program: 10 })).toBe(true);
  });

  it("isChannelVoice returns false for system messages", () => {
    expect(isChannelVoice({ type: "TimingClock" })).toBe(false);
    expect(isChannelVoice({ type: "Start" })).toBe(false);
    expect(isChannelVoice({ type: "SystemReset" })).toBe(false);
    expect(isChannelVoice({ type: "SysEx", data: [0x01] })).toBe(false);
  });

  it("isControlChange narrows type correctly", () => {
    const cc = controlChange(0, 1, 64);
    expect(isControlChange(cc)).toBe(true);
    if (isControlChange(cc)) {
      expect(cc.controller).toBe(1);
    }
    expect(isControlChange(noteOn(0, 60, 100))).toBe(false);
  });

  it("isNoteOn and isNoteOff narrow correctly", () => {
    expect(isNoteOn(noteOn(0, 60, 100))).toBe(true);
    expect(isNoteOn(noteOff(0, 60, 0))).toBe(false);
    expect(isNoteOff(noteOff(0, 60, 0))).toBe(true);
    expect(isNoteOff(noteOn(0, 60, 100))).toBe(false);
  });
});

describe("getChannel", () => {
  it("returns channel for channel messages", () => {
    expect(getChannel(noteOn(5, 60, 100))).toBe(5);
    expect(getChannel(controlChange(15, 1, 0))).toBe(15);
    expect(getChannel(pitchBend(3, 0))).toBe(3);
  });

  it("returns undefined for system messages", () => {
    expect(getChannel({ type: "TimingClock" })).toBeUndefined();
    expect(getChannel({ type: "SystemReset" })).toBeUndefined();
    expect(getChannel({ type: "SysEx", data: [] })).toBeUndefined();
  });
});

describe("validateMidiData", () => {
  it("validates correct NoteOn", () => {
    expect(validateMidiData(noteOn(0, 60, 100))).toBeNull();
    expect(validateMidiData(noteOn(15, 127, 127))).toBeNull();
  });

  it("rejects out-of-range NoteOn", () => {
    expect(validateMidiData(noteOn(16, 60, 100))).toContain("channel");
    expect(validateMidiData(noteOn(0, 128, 100))).toContain("note");
    expect(validateMidiData(noteOn(0, 60, 128))).toContain("velocity");
    expect(validateMidiData(noteOn(-1, 60, 100))).toContain("channel");
  });

  it("validates correct ControlChange", () => {
    expect(validateMidiData(controlChange(0, 0, 0))).toBeNull();
    expect(validateMidiData(controlChange(15, 127, 127))).toBeNull();
  });

  it("rejects out-of-range ControlChange", () => {
    expect(validateMidiData(controlChange(16, 0, 0))).toContain("channel");
    expect(validateMidiData(controlChange(0, 128, 0))).toContain("controller");
    expect(validateMidiData(controlChange(0, 0, 128))).toContain("value");
  });

  it("validates PitchBend range", () => {
    expect(validateMidiData(pitchBend(0, -8192))).toBeNull();
    expect(validateMidiData(pitchBend(0, 8191))).toBeNull();
    expect(validateMidiData(pitchBend(0, 0))).toBeNull();
    expect(validateMidiData(pitchBend(0, -8193))).toContain("pitch bend");
    expect(validateMidiData(pitchBend(0, 8192))).toContain("pitch bend");
  });

  it("validates system messages (always valid)", () => {
    expect(validateMidiData({ type: "TimingClock" })).toBeNull();
    expect(validateMidiData({ type: "SystemReset" })).toBeNull();
    expect(validateMidiData({ type: "TuneRequest" })).toBeNull();
  });

  it("validates SongPositionPointer range", () => {
    expect(validateMidiData({ type: "SongPositionPointer", position: 0 } as MidiData)).toBeNull();
    expect(validateMidiData({ type: "SongPositionPointer", position: 16383 } as MidiData)).toBeNull();
    expect(validateMidiData({ type: "SongPositionPointer", position: 16384 } as MidiData)).toContain("song position");
    expect(validateMidiData({ type: "SongPositionPointer", position: -1 } as MidiData)).toContain("song position");
  });

  it("validates SongSelect range", () => {
    expect(validateMidiData({ type: "SongSelect", song: 0 } as MidiData)).toBeNull();
    expect(validateMidiData({ type: "SongSelect", song: 127 } as MidiData)).toBeNull();
    expect(validateMidiData({ type: "SongSelect", song: 128 } as MidiData)).toContain("song");
  });
});
