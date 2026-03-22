/**
 * Piano Roll Module
 *
 * Public exports for the MIDI note editor.
 */

// Main component
export { PianoRoll } from "./PianoRoll";
export type { PianoRollProps } from "./PianoRoll";

// Shell-integrated panel wrapper
export { PianoRollPanel } from "./PianoRollPanel";

// Sub-components
export { PianoKeyboard } from "./PianoKeyboard";
export type { PianoKeyboardProps } from "./PianoKeyboard";
export { NoteGrid } from "./NoteGrid";
export type { NoteGridProps } from "./NoteGrid";
export { VelocityLane } from "./VelocityLane";
export type { VelocityLaneProps } from "./VelocityLane";

// Store
export { usePianoRollStore } from "./store";
export type { PianoRollStore } from "./store";

// Types
export type { Note, SnapValue, Tool, SelectionRect } from "./types";
export {
  midiPitchToName,
  isBlackKey,
  velocityToColor,
  snapValueToBeats,
  snapToGrid,
  snapToGridFloor,
} from "./types";
