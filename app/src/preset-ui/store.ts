/**
 * Preset Store
 *
 * Zustand store for preset management, snapshot capture/restore, and
 * search/filter state. Integrates with the document-model via
 * serializePatch/deserializePatch for save/load roundtrips.
 */

import { create } from "zustand";
import {
  generateId,
  serializePatch,
  deserializePatch,
  getPatchDocument,
} from "@chord/document-model";
import type { NodeData, ConnectionData } from "@chord/document-model";
import * as Y from "yjs";
import type { Preset, Snapshot, PresetCategory } from "./types.js";
import { PRESET_CATEGORIES } from "./types.js";

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface PresetStore {
  // -- Preset state ---------------------------------------------------------

  /** All available presets. */
  presets: Preset[];

  /** The currently loaded preset (null if no preset loaded). */
  currentPreset: Preset | null;

  /** Whether the document has unsaved changes since last save/load. */
  dirty: boolean;

  // -- Search / filter state ------------------------------------------------

  /** Current search query for filtering presets. */
  searchQuery: string;

  /** Selected category filter (null = show all). */
  selectedCategory: string | null;

  // -- Snapshot state -------------------------------------------------------

  /** In-memory snapshots for A/B comparison. */
  snapshots: Snapshot[];

  /** Which snapshot is currently active/restored (null if none). */
  activeSnapshotId: string | null;

  // -- Preset CRUD actions --------------------------------------------------

  /**
   * Save the current document state as a new preset.
   * @returns The newly created Preset.
   */
  savePreset: (
    doc: Y.Doc,
    name: string,
    options?: {
      description?: string;
      category?: string;
      tags?: string[];
      author?: string;
    },
  ) => Preset;

  /**
   * Overwrite the current preset with the document's current state.
   * No-op if no current preset is loaded.
   */
  saveCurrentPreset: (doc: Y.Doc) => void;

  /**
   * Save-As: create a new preset from the current document under a new name.
   * @returns The new Preset.
   */
  savePresetAs: (
    doc: Y.Doc,
    name: string,
    options?: {
      description?: string;
      category?: string;
      tags?: string[];
      author?: string;
    },
  ) => Preset;

  /**
   * Load a preset by ID: deserializes its data into the given Y.Doc.
   * Replaces the document contents entirely.
   */
  loadPreset: (presetId: string, targetDoc: Y.Doc) => void;

  /**
   * Rename the preset with the given ID.
   */
  renamePreset: (presetId: string, newName: string) => void;

  /**
   * Delete a preset by ID.
   */
  deletePreset: (presetId: string) => void;

  /**
   * Toggle the favorite flag on a preset.
   */
  toggleFavorite: (presetId: string) => void;

  /**
   * Mark the document as dirty (unsaved changes exist).
   */
  markDirty: () => void;

  /**
   * Clear the dirty flag.
   */
  clearDirty: () => void;

  // -- Search / filter actions ----------------------------------------------

  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  clearSearch: () => void;

  // -- Snapshot actions -----------------------------------------------------

  /**
   * Capture a snapshot of the current document state.
   * @returns The newly created Snapshot.
   */
  captureSnapshot: (doc: Y.Doc, name?: string) => Snapshot;

  /**
   * Restore a snapshot by ID into the given Y.Doc.
   */
  restoreSnapshot: (snapshotId: string, targetDoc: Y.Doc) => void;

  /**
   * Delete a snapshot by ID.
   */
  deleteSnapshot: (snapshotId: string) => void;

  /**
   * Rename a snapshot.
   */
  renameSnapshot: (snapshotId: string, newName: string) => void;

  /**
   * Clear all snapshots.
   */
  clearSnapshots: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply serialized patch data onto an existing Y.Doc, replacing all its
 * contents. We deserialize into a temporary doc, then transfer data over.
 */
function applySerializedData(data: string, targetDoc: Y.Doc): void {
  const sourceDoc = deserializePatch(data);
  const source = getPatchDocument(sourceDoc);
  const target = getPatchDocument(targetDoc);

  targetDoc.transact(() => {
    // Clear target
    target.nodes.forEach((_: NodeData, key: string) => {
      target.nodes.delete(key);
    });
    for (let i = target.connections.length - 1; i >= 0; i--) {
      target.connections.delete(i, 1);
    }
    target.timeline.forEach((_: unknown, key: string) => {
      target.timeline.delete(key);
    });
    target.metadata.forEach((_: unknown, key: string) => {
      target.metadata.delete(key);
    });
    target.settings.forEach((_: unknown, key: string) => {
      target.settings.delete(key);
    });

    // Copy from source
    source.nodes.forEach((value: NodeData, key: string) => {
      target.nodes.set(key, value);
    });
    const connArray: ConnectionData[] = source.connections.toArray();
    for (const conn of connArray) {
      target.connections.push([conn]);
    }
    source.timeline.forEach((value: unknown, key: string) => {
      target.timeline.set(key, value as any);
    });
    source.metadata.forEach((value: unknown, key: string) => {
      target.metadata.set(key, value as any);
    });
    source.settings.forEach((value: unknown, key: string) => {
      target.settings.set(key, value as any);
    });
  });
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const usePresetStore = create<PresetStore>((set, get) => ({
  presets: [],
  currentPreset: null,
  dirty: false,
  searchQuery: "",
  selectedCategory: null,
  snapshots: [],
  activeSnapshotId: null,

  // -- Preset CRUD ----------------------------------------------------------

  savePreset: (doc, name, options) => {
    const now = new Date().toISOString();
    const preset: Preset = {
      id: generateId(),
      name,
      description: options?.description ?? "",
      category: options?.category ?? "user",
      tags: options?.tags ?? [],
      author: options?.author ?? "",
      createdAt: now,
      updatedAt: now,
      data: serializePatch(doc),
      favorite: false,
    };

    set((state) => ({
      presets: [...state.presets, preset],
      currentPreset: preset,
      dirty: false,
    }));

    return preset;
  },

  saveCurrentPreset: (doc) => {
    const { currentPreset } = get();
    if (!currentPreset) return;

    const now = new Date().toISOString();
    const updated: Preset = {
      ...currentPreset,
      updatedAt: now,
      data: serializePatch(doc),
    };

    set((state) => ({
      presets: state.presets.map((p) => (p.id === updated.id ? updated : p)),
      currentPreset: updated,
      dirty: false,
    }));
  },

  savePresetAs: (doc, name, options) => {
    // Delegate to savePreset — it creates a new entry
    return get().savePreset(doc, name, options);
  },

  loadPreset: (presetId, targetDoc) => {
    const { presets } = get();
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) {
      throw new Error(`loadPreset: preset "${presetId}" not found`);
    }

    applySerializedData(preset.data, targetDoc);

    set({
      currentPreset: preset,
      dirty: false,
      activeSnapshotId: null,
    });
  },

  renamePreset: (presetId, newName) => {
    const now = new Date().toISOString();
    set((state) => {
      const presets = state.presets.map((p) =>
        p.id === presetId ? { ...p, name: newName, updatedAt: now } : p,
      );
      const currentPreset =
        state.currentPreset?.id === presetId
          ? { ...state.currentPreset, name: newName, updatedAt: now }
          : state.currentPreset;
      return { presets, currentPreset };
    });
  },

  deletePreset: (presetId) => {
    set((state) => ({
      presets: state.presets.filter((p) => p.id !== presetId),
      currentPreset:
        state.currentPreset?.id === presetId ? null : state.currentPreset,
    }));
  },

  toggleFavorite: (presetId) => {
    set((state) => {
      const presets = state.presets.map((p) =>
        p.id === presetId ? { ...p, favorite: !p.favorite } : p,
      );
      const currentPreset =
        state.currentPreset?.id === presetId
          ? { ...state.currentPreset, favorite: !state.currentPreset.favorite }
          : state.currentPreset;
      return { presets, currentPreset };
    });
  },

  markDirty: () => set({ dirty: true }),
  clearDirty: () => set({ dirty: false }),

  // -- Search / filter ------------------------------------------------------

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  clearSearch: () => set({ searchQuery: "", selectedCategory: null }),

  // -- Snapshot actions -----------------------------------------------------

  captureSnapshot: (doc, name) => {
    const snapshots = get().snapshots;
    const snapshot: Snapshot = {
      id: generateId(),
      name: name ?? `Snapshot ${snapshots.length + 1}`,
      timestamp: Date.now(),
      data: serializePatch(doc),
    };

    set((state) => ({
      snapshots: [...state.snapshots, snapshot],
    }));

    return snapshot;
  },

  restoreSnapshot: (snapshotId, targetDoc) => {
    const { snapshots } = get();
    const snapshot = snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) {
      throw new Error(`restoreSnapshot: snapshot "${snapshotId}" not found`);
    }

    applySerializedData(snapshot.data, targetDoc);

    set({
      activeSnapshotId: snapshotId,
      dirty: true,
    });
  },

  deleteSnapshot: (snapshotId) => {
    set((state) => ({
      snapshots: state.snapshots.filter((s) => s.id !== snapshotId),
      activeSnapshotId:
        state.activeSnapshotId === snapshotId
          ? null
          : state.activeSnapshotId,
    }));
  },

  renameSnapshot: (snapshotId, newName) => {
    set((state) => ({
      snapshots: state.snapshots.map((s) =>
        s.id === snapshotId ? { ...s, name: newName } : s,
      ),
    }));
  },

  clearSnapshots: () => set({ snapshots: [], activeSnapshotId: null }),
}));

// ---------------------------------------------------------------------------
// Query helpers (pure functions, not part of the store)
// ---------------------------------------------------------------------------

/**
 * Filter presets by a search query. Case-insensitive substring match
 * against name, description, tags, author, and category.
 */
export function filterPresets(presets: Preset[], query: string): Preset[] {
  if (!query.trim()) return presets;

  const q = query.toLowerCase().trim();

  return presets.filter((p) => {
    return (
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
    );
  });
}

/**
 * Filter presets by category ID.
 */
export function filterPresetsByCategory(
  presets: Preset[],
  categoryId: string | null,
): Preset[] {
  if (!categoryId) return presets;
  return presets.filter((p) => p.category === categoryId);
}

/**
 * Group presets by category, preserving PRESET_CATEGORIES display order.
 */
export function groupPresetsByCategory(
  presets: Preset[],
): Array<{ category: PresetCategory; presets: Preset[] }> {
  const grouped = new Map<string, Preset[]>();

  for (const preset of presets) {
    const list = grouped.get(preset.category) ?? [];
    list.push(preset);
    grouped.set(preset.category, list);
  }

  return PRESET_CATEGORIES.filter((cat) => grouped.has(cat.id)).map((cat) => ({
    category: cat,
    presets: grouped.get(cat.id)!,
  }));
}
