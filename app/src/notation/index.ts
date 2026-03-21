/**
 * Notation Module
 *
 * Public exports for the score/notation view, music theory utilities,
 * and MusicXML exporter.
 */

// Main component
export { NotationView } from "./NotationView";
export type { NotationViewProps } from "./NotationView";

// Staff component
export { Staff } from "./Staff";
export type { StaffProps } from "./Staff";

// Store
export { useNotationStore } from "./store";
export type { NotationStore } from "./store";

// Music theory utilities
export {
  midiToNoteName,
  durationToNoteType,
  pitchToStaffPosition,
  needsAccidental,
  beatsToMeasures,
  midiPitchToMusicXML,
} from "./music-theory";

// MusicXML export
export { exportToMusicXML, downloadMusicXML } from "./musicxml";

// Types
export type {
  Clef,
  KeySignature,
  TimeSignature,
  NoteType,
  NoteDuration,
  Accidental,
  StaffPosition,
  Measure,
  MeasureNote,
  MusicXMLExportOptions,
} from "./types";

export { KEY_SIGNATURES } from "./types";
