/**
 * Preset UI — Type definitions
 *
 * Types for presets, snapshots, and categories used throughout the
 * preset browser, save/load, and snapshot systems.
 */

// ---------------------------------------------------------------------------
// Preset categories
// ---------------------------------------------------------------------------

/** Category metadata for grouping presets in the browser. */
export interface PresetCategory {
  id: string;
  label: string;
  icon: string;
}

/** Built-in preset categories. */
export const PRESET_CATEGORIES: PresetCategory[] = [
  { id: "init", label: "Init", icon: "0" },
  { id: "bass", label: "Bass", icon: "B" },
  { id: "lead", label: "Lead", icon: "L" },
  { id: "pad", label: "Pad", icon: "P" },
  { id: "fx", label: "FX", icon: "~" },
  { id: "keys", label: "Keys", icon: "K" },
  { id: "drum", label: "Drum", icon: "D" },
  { id: "pluck", label: "Pluck", icon: "/" },
  { id: "user", label: "User", icon: "U" },
];

/** Map category id to display info for quick lookups. */
export const PRESET_CATEGORY_MAP: Record<string, PresetCategory> =
  Object.fromEntries(PRESET_CATEGORIES.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------
// Preset
// ---------------------------------------------------------------------------

/** A saved preset containing serialized patch data. */
export interface Preset {
  /** Unique identifier for this preset. */
  id: string;
  /** Human-readable name shown in the browser. */
  name: string;
  /** Optional description of the preset's sound or purpose. */
  description: string;
  /** Category slug for grouping (e.g. "bass", "lead"). */
  category: string;
  /** Freeform tags for search. */
  tags: string[];
  /** Author name. */
  author: string;
  /** ISO 8601 timestamp when the preset was first created. */
  createdAt: string;
  /** ISO 8601 timestamp when the preset was last modified. */
  updatedAt: string;
  /** Serialized patch JSON (output of serializePatch). */
  data: string;
  /** Whether the user has starred/favorited this preset. */
  favorite: boolean;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/** A lightweight in-memory snapshot for quick A/B comparison. */
export interface Snapshot {
  /** Unique identifier for this snapshot. */
  id: string;
  /** Human-readable name (e.g. "A", "B", "Before reverb"). */
  name: string;
  /** Timestamp (epoch ms) when the snapshot was captured. */
  timestamp: number;
  /** Serialized patch JSON (output of serializePatch). */
  data: string;
}
