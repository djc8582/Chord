/**
 * @chord/preset-ui
 *
 * Preset browser, save/load, and snapshot system for Chord.
 *
 * @example
 * ```tsx
 * import { PresetUI, usePresetStore } from "../preset-ui";
 *
 * <PresetUI doc={myYjsDoc} />
 * ```
 */

// Re-export types
export type { Preset, Snapshot, PresetCategory } from "./types.js";
export { PRESET_CATEGORIES, PRESET_CATEGORY_MAP } from "./types.js";

// Re-export store
export { usePresetStore, filterPresets, filterPresetsByCategory, groupPresetsByCategory } from "./store.js";
export type { PresetStore } from "./store.js";

// Re-export components
export { PresetBrowser } from "./PresetBrowser.js";
export type { PresetBrowserProps } from "./PresetBrowser.js";

export { PresetManager } from "./PresetManager.js";
export type { PresetManagerProps } from "./PresetManager.js";

export { SnapshotPanel } from "./SnapshotPanel.js";
export type { SnapshotPanelProps } from "./SnapshotPanel.js";

export { PresetUI } from "./PresetUI.js";
export type { PresetUIProps } from "./PresetUI.js";
