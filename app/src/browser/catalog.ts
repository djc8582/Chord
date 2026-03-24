/**
 * Node Catalog
 *
 * Defines all available node types with metadata for the browser panel.
 * This complements the NODE_TYPE_REGISTRY from the canvas store by adding
 * display metadata (description, icon) used in the browser UI.
 *
 * The catalog re-exports the full NodeTypeDefinition from the canvas store
 * and augments it with browser-specific fields.
 */

import type { PortDefinition } from "../canvas/store.js";
import { NODE_TYPE_REGISTRY } from "../canvas/store.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A node catalog entry extends the registry definition with browser metadata. */
export interface CatalogEntry {
  /** Matches the NodeTypeDefinition.type and NODE_TYPE_REGISTRY key. */
  type: string;
  /** Human-readable display name. */
  label: string;
  /** Category slug for grouping (e.g. "generators", "effects"). */
  category: string;
  /** Short description shown in the browser panel. */
  description: string;
  /** Emoji or icon identifier for the node. */
  icon: string;
  /** Input port definitions (from NODE_TYPE_REGISTRY). */
  inputs: PortDefinition[];
  /** Output port definitions (from NODE_TYPE_REGISTRY). */
  outputs: PortDefinition[];
}

/** Category metadata for display. */
export interface CategoryInfo {
  id: string;
  label: string;
  icon: string;
}

// ---------------------------------------------------------------------------
// Category definitions
// ---------------------------------------------------------------------------

export const CATEGORIES: CategoryInfo[] = [
  { id: "generators", label: "Generators", icon: "~" },
  { id: "effects", label: "Effects", icon: "fx" },
  { id: "modulators", label: "Modulators", icon: "^" },
  { id: "utilities", label: "Utility", icon: "#" },
  { id: "io", label: "I/O", icon: "<>" },
];

/** Map category id to display info for quick lookups. */
export const CATEGORY_MAP: Record<string, CategoryInfo> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

// ---------------------------------------------------------------------------
// Catalog entry metadata (descriptions + icons)
// ---------------------------------------------------------------------------

const CATALOG_META: Record<string, { description: string; icon: string }> = {
  oscillator: {
    description: "Generates a periodic waveform (sine, saw, square, triangle)",
    icon: "~",
  },
  noise: {
    description: "Generates white, pink, or brown noise",
    icon: "%%",
  },
  lfo: {
    description: "Low-frequency oscillator for modulation",
    icon: "^~",
  },
  filter: {
    description: "Frequency filter (lowpass, highpass, bandpass, notch)",
    icon: "/\\",
  },
  gain: {
    description: "Amplifies or attenuates a signal",
    icon: "+",
  },
  delay: {
    description: "Delays the signal by a configurable time",
    icon: ">>",
  },
  reverb: {
    description: "Adds spatial reverb to the signal",
    icon: "))",
  },
  envelope: {
    description: "ADSR envelope generator for shaping dynamics",
    icon: "/\\",
  },
  mixer: {
    description: "Mixes up to 4 audio inputs into one output",
    icon: "=",
  },
  output: {
    description: "Audio output to speakers or DAW",
    icon: ">|",
  },
  input: {
    description: "Audio input from microphone or external source",
    icon: "|>",
  },
  midi_in: {
    description: "Receives MIDI note, velocity, and gate signals",
    icon: "M",
  },
};

// ---------------------------------------------------------------------------
// Build the catalog from NODE_TYPE_REGISTRY + metadata
// ---------------------------------------------------------------------------

function buildCatalog(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];

  for (const [key, def] of Object.entries(NODE_TYPE_REGISTRY)) {
    const meta = CATALOG_META[key] ?? {
      description: `${def.label} node`,
      icon: "?",
    };

    entries.push({
      type: def.type,
      label: def.label,
      category: def.category,
      description: meta.description,
      icon: meta.icon,
      inputs: def.inputs,
      outputs: def.outputs,
    });
  }

  return entries;
}

/** The complete node catalog. Computed once at module load. */
export const NODE_CATALOG: CatalogEntry[] = buildCatalog();

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Filter catalog entries by a search query (case-insensitive substring match
 * against label, description, type, and category).
 */
export function filterCatalog(query: string): CatalogEntry[] {
  if (!query.trim()) return NODE_CATALOG;

  const q = query.toLowerCase().trim();

  return NODE_CATALOG.filter((entry) => {
    return (
      entry.label.toLowerCase().includes(q) ||
      entry.type.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.category.toLowerCase().includes(q)
    );
  });
}

/**
 * Filter catalog entries by category id.
 */
export function filterByCategory(
  entries: CatalogEntry[],
  categoryId: string | null,
): CatalogEntry[] {
  if (!categoryId) return entries;
  return entries.filter((e) => e.category === categoryId);
}

/**
 * Group catalog entries by category, preserving the CATEGORIES display order.
 */
export function groupByCategory(
  entries: CatalogEntry[],
): Array<{ category: CategoryInfo; entries: CatalogEntry[] }> {
  const grouped = new Map<string, CatalogEntry[]>();

  for (const entry of entries) {
    const list = grouped.get(entry.category) ?? [];
    list.push(entry);
    grouped.set(entry.category, list);
  }

  // Return in CATEGORIES order, skipping empty groups
  return CATEGORIES.filter((cat) => grouped.has(cat.id)).map((cat) => ({
    category: cat,
    entries: grouped.get(cat.id)!,
  }));
}
