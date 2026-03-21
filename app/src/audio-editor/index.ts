/**
 * Audio Editor Module
 *
 * Destructive waveform editor with cut, splice, normalize, reverse,
 * fade, and spectral display. Opens when double-clicking audio clips.
 */

// Main component
export { AudioEditor } from "./AudioEditor.js";
export type { AudioEditorProps } from "./AudioEditor.js";

// Sub-components
export { WaveformEditor } from "./WaveformEditor.js";
export type { WaveformEditorProps } from "./WaveformEditor.js";
export { SpectralView } from "./SpectralView.js";
export type { SpectralViewProps } from "./SpectralView.js";

// Store
export { useAudioEditorStore } from "./store.js";
export type { AudioEditorStore } from "./store.js";

// Audio operations (pure functions)
export {
  cut,
  copy,
  paste,
  normalize,
  reverse,
  fadeIn,
  fadeOut,
  gain,
  silence,
  resample,
  cloneBuffer,
  bufferLength,
} from "./operations.js";

// Types
export type {
  AudioBuffer,
  SelectionRange,
  EditorTool,
  HistoryEntry,
} from "./types.js";
export {
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  MAX_UNDO_HISTORY,
} from "./types.js";
