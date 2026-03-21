/**
 * @chord/controller-integration
 *
 * Hardware controller integration for Chord: MIDI types, controller mapping,
 * MIDI learn, value scaling, and auto-mapping.
 */

// MIDI types (TS equivalents of Rust midi-engine types)
export type {
  MidiMessage,
  MidiData,
  NoteOn,
  NoteOff,
  ControlChange,
  PitchBend,
  Aftertouch,
  PolyAftertouch,
  ProgramChange,
  SysEx,
  TimeCodeQuarterFrame,
  SongPositionPointer,
  SongSelect,
  TuneRequest,
  TimingClock,
  MidiStart,
  MidiContinue,
  MidiStop,
  ActiveSensing,
  SystemReset,
} from "./midi-types.js";

export {
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
} from "./midi-types.js";

// Controller mapping
export type { ControllerMapping, ScalingCurve } from "./controller-mapping.js";

export {
  scaleValue,
  applyMapping,
  validateMapping,
  createMapping,
  generateMappingId,
  resetMappingIdCounter,
} from "./controller-mapping.js";

// Mapping store
export { MappingStore } from "./mapping-store.js";

// MIDI learn
export type { LearnTarget, LearnState, MidiLearnOptions } from "./midi-learn.js";
export { MidiLearnSession } from "./midi-learn.js";

// Auto-mapping
export type { AutoMapOptions } from "./auto-mapping.js";
export { autoMap, autoMapMultiple } from "./auto-mapping.js";
