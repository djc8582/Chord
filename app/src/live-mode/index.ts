/**
 * Live Mode — Public API
 *
 * Performance mode for live use: fullscreen view, setlist navigation,
 * panic button, tap tempo, and setlist editor.
 */

// Components
export { LiveMode } from "./LiveMode.js";
export { SetlistEditor } from "./SetlistEditor.js";
export { PanicButton } from "./PanicButton.js";
export { TapTempo } from "./TapTempo.js";

// Store
export { useLiveModeStore, calculateBpmFromTaps } from "./store.js";

// Types
export type { SetlistEntry } from "./types.js";
export { SETLIST_COLORS } from "./types.js";

export type { LiveModeStore } from "./store.js";
export type { LiveModeProps } from "./LiveMode.js";
export type { SetlistEditorProps } from "./SetlistEditor.js";
export type { PanicButtonProps } from "./PanicButton.js";
export type { TapTempoProps } from "./TapTempo.js";
