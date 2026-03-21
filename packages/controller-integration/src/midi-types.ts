/**
 * TypeScript MIDI message types mirroring the Rust midi-engine crate.
 *
 * These are the types that come over the Tauri bridge from the Rust backend.
 * They match the structure of `MidiMessage` and `MidiData` from
 * `crates/midi-engine/src/message.rs`.
 */

// ---------------------------------------------------------------------------
// MidiData — discriminated union mirroring the Rust enum
// ---------------------------------------------------------------------------

export interface NoteOn {
  type: "NoteOn";
  channel: number; // 0-15
  note: number; // 0-127
  velocity: number; // 0-127
}

export interface NoteOff {
  type: "NoteOff";
  channel: number;
  note: number;
  velocity: number;
}

export interface ControlChange {
  type: "ControlChange";
  channel: number; // 0-15
  controller: number; // 0-127
  value: number; // 0-127
}

export interface PitchBend {
  type: "PitchBend";
  channel: number;
  value: number; // -8192..8191
}

export interface Aftertouch {
  type: "Aftertouch";
  channel: number;
  pressure: number; // 0-127
}

export interface PolyAftertouch {
  type: "PolyAftertouch";
  channel: number;
  note: number;
  pressure: number;
}

export interface ProgramChange {
  type: "ProgramChange";
  channel: number;
  program: number; // 0-127
}

export interface SysEx {
  type: "SysEx";
  data: number[];
}

export interface TimeCodeQuarterFrame {
  type: "TimeCodeQuarterFrame";
  messageType: number;
  value: number;
}

export interface SongPositionPointer {
  type: "SongPositionPointer";
  position: number;
}

export interface SongSelect {
  type: "SongSelect";
  song: number;
}

export interface TuneRequest {
  type: "TuneRequest";
}

export interface TimingClock {
  type: "TimingClock";
}

export interface MidiStart {
  type: "Start";
}

export interface MidiContinue {
  type: "Continue";
}

export interface MidiStop {
  type: "Stop";
}

export interface ActiveSensing {
  type: "ActiveSensing";
}

export interface SystemReset {
  type: "SystemReset";
}

/** Discriminated union of all MIDI 1.0 message data types. */
export type MidiData =
  | NoteOn
  | NoteOff
  | ControlChange
  | PitchBend
  | Aftertouch
  | PolyAftertouch
  | ProgramChange
  | SysEx
  | TimeCodeQuarterFrame
  | SongPositionPointer
  | SongSelect
  | TuneRequest
  | TimingClock
  | MidiStart
  | MidiContinue
  | MidiStop
  | ActiveSensing
  | SystemReset;

// ---------------------------------------------------------------------------
// MidiMessage — timestamped wrapper
// ---------------------------------------------------------------------------

/** A timestamped MIDI message (mirrors Rust `MidiMessage`). */
export interface MidiMessage {
  /** Microsecond timestamp from an arbitrary epoch. */
  timestamp: number;
  /** The MIDI message payload. */
  data: MidiData;
}

// ---------------------------------------------------------------------------
// Helper constructors
// ---------------------------------------------------------------------------

export function createMidiMessage(timestamp: number, data: MidiData): MidiMessage {
  return { timestamp, data };
}

export function noteOn(channel: number, note: number, velocity: number): NoteOn {
  return { type: "NoteOn", channel, note, velocity };
}

export function noteOff(channel: number, note: number, velocity: number): NoteOff {
  return { type: "NoteOff", channel, note, velocity };
}

export function controlChange(channel: number, controller: number, value: number): ControlChange {
  return { type: "ControlChange", channel, controller, value };
}

export function pitchBend(channel: number, value: number): PitchBend {
  return { type: "PitchBend", channel, value };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isChannelVoice(data: MidiData): boolean {
  return (
    data.type === "NoteOn" ||
    data.type === "NoteOff" ||
    data.type === "ControlChange" ||
    data.type === "PitchBend" ||
    data.type === "Aftertouch" ||
    data.type === "PolyAftertouch" ||
    data.type === "ProgramChange"
  );
}

export function isControlChange(data: MidiData): data is ControlChange {
  return data.type === "ControlChange";
}

export function isNoteOn(data: MidiData): data is NoteOn {
  return data.type === "NoteOn";
}

export function isNoteOff(data: MidiData): data is NoteOff {
  return data.type === "NoteOff";
}

/** Returns the MIDI channel (0-15) if this is a channel message, or undefined. */
export function getChannel(data: MidiData): number | undefined {
  switch (data.type) {
    case "NoteOn":
    case "NoteOff":
    case "ControlChange":
    case "PitchBend":
    case "Aftertouch":
    case "PolyAftertouch":
    case "ProgramChange":
      return data.channel;
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function inRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** Validates that a MidiData object has values within MIDI spec ranges. */
export function validateMidiData(data: MidiData): string | null {
  switch (data.type) {
    case "NoteOn":
    case "NoteOff":
      if (!inRange(data.channel, 0, 15)) return "channel must be 0-15";
      if (!inRange(data.note, 0, 127)) return "note must be 0-127";
      if (!inRange(data.velocity, 0, 127)) return "velocity must be 0-127";
      return null;
    case "ControlChange":
      if (!inRange(data.channel, 0, 15)) return "channel must be 0-15";
      if (!inRange(data.controller, 0, 127)) return "controller must be 0-127";
      if (!inRange(data.value, 0, 127)) return "value must be 0-127";
      return null;
    case "PitchBend":
      if (!inRange(data.channel, 0, 15)) return "channel must be 0-15";
      if (!Number.isInteger(data.value) || data.value < -8192 || data.value > 8191)
        return "pitch bend value must be -8192..8191";
      return null;
    case "Aftertouch":
      if (!inRange(data.channel, 0, 15)) return "channel must be 0-15";
      if (!inRange(data.pressure, 0, 127)) return "pressure must be 0-127";
      return null;
    case "PolyAftertouch":
      if (!inRange(data.channel, 0, 15)) return "channel must be 0-15";
      if (!inRange(data.note, 0, 127)) return "note must be 0-127";
      if (!inRange(data.pressure, 0, 127)) return "pressure must be 0-127";
      return null;
    case "ProgramChange":
      if (!inRange(data.channel, 0, 15)) return "channel must be 0-15";
      if (!inRange(data.program, 0, 127)) return "program must be 0-127";
      return null;
    case "SongPositionPointer":
      if (!Number.isInteger(data.position) || data.position < 0 || data.position > 16383)
        return "song position must be 0-16383";
      return null;
    case "SongSelect":
      if (!inRange(data.song, 0, 127)) return "song must be 0-127";
      return null;
    default:
      return null;
  }
}
