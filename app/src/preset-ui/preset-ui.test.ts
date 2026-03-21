/**
 * Preset UI Module Tests
 *
 * Tests covering:
 * - Preset CRUD (create, load, save, delete, rename)
 * - Search/filter presets by name and category
 * - Snapshot create/restore/delete
 * - Dirty flag tracks unsaved changes
 * - Serialize/deserialize roundtrip through preset save/load
 * - Category filtering and grouping
 * - Favorite toggle
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createPatchDocument,
  addNode,
  connect,
  setParameter,
  serializePatch,
  deserializePatch,
  getPatchDocument,
} from "@chord/document-model";
import {
  usePresetStore,
  filterPresets,
  filterPresetsByCategory,
  groupPresetsByCategory,
} from "./store.js";
import { PRESET_CATEGORIES, PRESET_CATEGORY_MAP } from "./types.js";
import type { Preset, Snapshot } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  usePresetStore.setState({
    presets: [],
    currentPreset: null,
    dirty: false,
    searchQuery: "",
    selectedCategory: null,
    snapshots: [],
    activeSnapshotId: null,
  });
}

/** Create a sample document with a couple of nodes and a connection. */
function createSampleDoc() {
  const doc = createPatchDocument();
  const oscId = addNode(doc, "oscillator", { x: 0, y: 0 }, "Osc 1");
  setParameter(doc, oscId, "frequency", 440);
  setParameter(doc, oscId, "waveform", 1);
  const filterId = addNode(doc, "filter", { x: 200, y: 0 }, "Filter 1");
  setParameter(doc, filterId, "cutoff", 2000);
  connect(
    doc,
    { nodeId: oscId, port: "output" },
    { nodeId: filterId, port: "input" },
  );
  return doc;
}

/** Create a different sample document for comparison. */
function createAlternateDoc() {
  const doc = createPatchDocument();
  const noiseId = addNode(doc, "noise", { x: 100, y: 100 }, "Noise 1");
  setParameter(doc, noiseId, "type", 2);
  return doc;
}

// ---------------------------------------------------------------------------
// Preset Categories
// ---------------------------------------------------------------------------

describe("PRESET_CATEGORIES", () => {
  it("has expected categories", () => {
    const ids = PRESET_CATEGORIES.map((c) => c.id);
    expect(ids).toContain("bass");
    expect(ids).toContain("lead");
    expect(ids).toContain("pad");
    expect(ids).toContain("fx");
    expect(ids).toContain("user");
  });

  it("each category has id, label, and icon", () => {
    for (const cat of PRESET_CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.icon).toBeTruthy();
    }
  });

  it("PRESET_CATEGORY_MAP provides quick lookups", () => {
    for (const cat of PRESET_CATEGORIES) {
      expect(PRESET_CATEGORY_MAP[cat.id]).toBe(cat);
    }
  });
});

// ---------------------------------------------------------------------------
// Preset CRUD
// ---------------------------------------------------------------------------

describe("Preset CRUD", () => {
  beforeEach(resetStore);

  it("savePreset creates a new preset", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();

    const preset = store.savePreset(doc, "My Bass", {
      category: "bass",
      description: "A warm bass sound",
      tags: ["warm", "sub"],
      author: "TestUser",
    });

    expect(preset.id).toBeTruthy();
    expect(preset.name).toBe("My Bass");
    expect(preset.description).toBe("A warm bass sound");
    expect(preset.category).toBe("bass");
    expect(preset.tags).toEqual(["warm", "sub"]);
    expect(preset.author).toBe("TestUser");
    expect(preset.createdAt).toBeTruthy();
    expect(preset.updatedAt).toBeTruthy();
    expect(preset.data).toBeTruthy();
    expect(preset.favorite).toBe(false);

    // Store should have the preset
    const state = usePresetStore.getState();
    expect(state.presets).toHaveLength(1);
    expect(state.presets[0].id).toBe(preset.id);
    expect(state.currentPreset?.id).toBe(preset.id);
    expect(state.dirty).toBe(false);
  });

  it("savePreset with default options", () => {
    const doc = createSampleDoc();
    const preset = usePresetStore.getState().savePreset(doc, "Default Preset");

    expect(preset.category).toBe("user");
    expect(preset.description).toBe("");
    expect(preset.tags).toEqual([]);
    expect(preset.author).toBe("");
  });

  it("multiple presets can be saved", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();

    store.savePreset(doc, "Preset 1", { category: "bass" });
    store.savePreset(doc, "Preset 2", { category: "lead" });
    store.savePreset(doc, "Preset 3", { category: "pad" });

    const state = usePresetStore.getState();
    expect(state.presets).toHaveLength(3);
    expect(state.presets.map((p) => p.name)).toEqual([
      "Preset 1",
      "Preset 2",
      "Preset 3",
    ]);
  });

  it("loadPreset restores document state", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const preset = store.savePreset(doc, "To Load", { category: "bass" });

    // Create a different document and load the preset into it
    const targetDoc = createPatchDocument();
    expect(getPatchDocument(targetDoc).nodes.size).toBe(0);

    usePresetStore.getState().loadPreset(preset.id, targetDoc);

    // targetDoc should now have the same content
    const targetPatch = getPatchDocument(targetDoc);
    expect(targetPatch.nodes.size).toBe(2); // oscillator + filter
    expect(targetPatch.connections.length).toBe(1);

    const state = usePresetStore.getState();
    expect(state.currentPreset?.id).toBe(preset.id);
    expect(state.dirty).toBe(false);
  });

  it("loadPreset replaces existing document content", () => {
    const doc1 = createSampleDoc();
    const doc2 = createAlternateDoc();

    const store = usePresetStore.getState();
    const presetA = store.savePreset(doc1, "Preset A");
    store.savePreset(doc2, "Preset B");

    // doc2 currently has noise node
    const patchBefore = getPatchDocument(doc2);
    let hasNoise = false;
    patchBefore.nodes.forEach((n) => {
      if (n.type === "noise") hasNoise = true;
    });
    expect(hasNoise).toBe(true);

    // Load presetA into doc2
    usePresetStore.getState().loadPreset(presetA.id, doc2);

    // doc2 should now have oscillator + filter, not noise
    const patchAfter = getPatchDocument(doc2);
    let hasOsc = false;
    let hasNoiseAfter = false;
    patchAfter.nodes.forEach((n) => {
      if (n.type === "oscillator") hasOsc = true;
      if (n.type === "noise") hasNoiseAfter = true;
    });
    expect(hasOsc).toBe(true);
    expect(hasNoiseAfter).toBe(false);
  });

  it("loadPreset throws for unknown preset ID", () => {
    const doc = createPatchDocument();
    expect(() => {
      usePresetStore.getState().loadPreset("nonexistent", doc);
    }).toThrow('preset "nonexistent" not found');
  });

  it("saveCurrentPreset overwrites existing preset data", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const original = store.savePreset(doc, "Evolving");

    // Modify the document
    addNode(doc, "reverb", { x: 400, y: 0 }, "Reverb");
    usePresetStore.getState().markDirty();

    expect(usePresetStore.getState().dirty).toBe(true);

    // Save current preset (overwrite)
    usePresetStore.getState().saveCurrentPreset(doc);

    const state = usePresetStore.getState();
    expect(state.dirty).toBe(false);
    expect(state.presets).toHaveLength(1);
    expect(state.presets[0].id).toBe(original.id);

    // The data should now include the reverb node
    const presetData = JSON.parse(state.presets[0].data);
    const nodeTypes = Object.values(presetData.nodes).map(
      (n: any) => n.type,
    );
    expect(nodeTypes).toContain("reverb");
  });

  it("saveCurrentPreset is no-op when no current preset", () => {
    const doc = createSampleDoc();
    usePresetStore.getState().saveCurrentPreset(doc);

    const state = usePresetStore.getState();
    expect(state.presets).toHaveLength(0);
    expect(state.currentPreset).toBeNull();
  });

  it("savePresetAs creates a new preset (save-as)", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const original = store.savePreset(doc, "Original");

    // Save-As with new name
    const copy = usePresetStore.getState().savePresetAs(doc, "Copy of Original", {
      category: "lead",
    });

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe("Copy of Original");
    expect(copy.category).toBe("lead");

    const state = usePresetStore.getState();
    expect(state.presets).toHaveLength(2);
    // Current preset should now be the new one
    expect(state.currentPreset?.id).toBe(copy.id);
  });

  it("renamePreset changes the name", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const preset = store.savePreset(doc, "Old Name");

    usePresetStore.getState().renamePreset(preset.id, "New Name");

    const state = usePresetStore.getState();
    expect(state.presets[0].name).toBe("New Name");
    expect(state.currentPreset?.name).toBe("New Name");
    // updatedAt should be a valid ISO timestamp
    expect(state.presets[0].updatedAt).toBeTruthy();
    expect(new Date(state.presets[0].updatedAt).getTime()).toBeGreaterThanOrEqual(0);
  });

  it("renamePreset updates only the targeted preset", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const p1 = store.savePreset(doc, "First");
    store.savePreset(doc, "Second");

    usePresetStore.getState().renamePreset(p1.id, "First Renamed");

    const state = usePresetStore.getState();
    expect(state.presets.find((p) => p.id === p1.id)?.name).toBe(
      "First Renamed",
    );
    expect(state.presets[1].name).toBe("Second");
  });

  it("deletePreset removes the preset", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const preset = store.savePreset(doc, "To Delete");

    usePresetStore.getState().deletePreset(preset.id);

    const state = usePresetStore.getState();
    expect(state.presets).toHaveLength(0);
    expect(state.currentPreset).toBeNull();
  });

  it("deletePreset only removes the targeted preset", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const p1 = store.savePreset(doc, "Keep");
    const p2 = store.savePreset(doc, "Remove");

    usePresetStore.getState().deletePreset(p2.id);

    const state = usePresetStore.getState();
    expect(state.presets).toHaveLength(1);
    expect(state.presets[0].id).toBe(p1.id);
  });

  it("deletePreset clears currentPreset if it was the deleted one", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const p1 = store.savePreset(doc, "First");
    const p2 = store.savePreset(doc, "Second");

    // Current preset is p2 (the last one saved)
    expect(usePresetStore.getState().currentPreset?.id).toBe(p2.id);

    usePresetStore.getState().deletePreset(p2.id);
    expect(usePresetStore.getState().currentPreset).toBeNull();

    // But if we delete p1 while current is different, current stays
    usePresetStore.setState({ currentPreset: null });
    // Re-add and test
    const p3 = usePresetStore.getState().savePreset(doc, "Third");
    usePresetStore.getState().savePreset(doc, "Fourth");

    usePresetStore.getState().deletePreset(p3.id);
    // Current should still be Fourth (the last saved)
    const state = usePresetStore.getState();
    expect(state.currentPreset?.name).toBe("Fourth");
  });

  it("toggleFavorite toggles the favorite flag", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const preset = store.savePreset(doc, "Fav Test");

    expect(usePresetStore.getState().presets[0].favorite).toBe(false);

    usePresetStore.getState().toggleFavorite(preset.id);
    expect(usePresetStore.getState().presets[0].favorite).toBe(true);

    usePresetStore.getState().toggleFavorite(preset.id);
    expect(usePresetStore.getState().presets[0].favorite).toBe(false);
  });

  it("toggleFavorite updates currentPreset if it matches", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const preset = store.savePreset(doc, "Fav Current");

    usePresetStore.getState().toggleFavorite(preset.id);
    expect(usePresetStore.getState().currentPreset?.favorite).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Search and filter
// ---------------------------------------------------------------------------

describe("filterPresets", () => {
  const samplePresets: Preset[] = [
    {
      id: "1",
      name: "Warm Bass",
      description: "A deep warm bass",
      category: "bass",
      tags: ["warm", "sub", "analog"],
      author: "Alice",
      createdAt: "",
      updatedAt: "",
      data: "",
      favorite: false,
    },
    {
      id: "2",
      name: "Bright Lead",
      description: "Cutting through the mix",
      category: "lead",
      tags: ["bright", "saw"],
      author: "Bob",
      createdAt: "",
      updatedAt: "",
      data: "",
      favorite: true,
    },
    {
      id: "3",
      name: "Lush Pad",
      description: "Wide stereo pad",
      category: "pad",
      tags: ["lush", "stereo"],
      author: "Alice",
      createdAt: "",
      updatedAt: "",
      data: "",
      favorite: false,
    },
    {
      id: "4",
      name: "Glitch FX",
      description: "Stutter and glitch effects",
      category: "fx",
      tags: ["glitch", "stutter"],
      author: "Charlie",
      createdAt: "",
      updatedAt: "",
      data: "",
      favorite: false,
    },
  ];

  it("empty query returns all presets", () => {
    expect(filterPresets(samplePresets, "")).toHaveLength(4);
  });

  it("whitespace-only query returns all presets", () => {
    expect(filterPresets(samplePresets, "   ")).toHaveLength(4);
  });

  it("matches on name (case insensitive)", () => {
    const results = filterPresets(samplePresets, "warm");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Warm Bass");
  });

  it("matches on name uppercase", () => {
    const results = filterPresets(samplePresets, "BRIGHT");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Bright Lead");
  });

  it("matches on description", () => {
    const results = filterPresets(samplePresets, "stereo");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Lush Pad");
  });

  it("matches on category", () => {
    const results = filterPresets(samplePresets, "fx");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Glitch FX");
  });

  it("matches on author", () => {
    const results = filterPresets(samplePresets, "alice");
    expect(results).toHaveLength(2);
  });

  it("matches on tags", () => {
    const results = filterPresets(samplePresets, "analog");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Warm Bass");
  });

  it("partial match works", () => {
    const results = filterPresets(samplePresets, "gli");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Glitch FX");
  });

  it("no results for nonsense query", () => {
    expect(filterPresets(samplePresets, "zzzznothing")).toHaveLength(0);
  });
});

describe("filterPresetsByCategory", () => {
  const presets: Preset[] = [
    { id: "1", name: "A", description: "", category: "bass", tags: [], author: "", createdAt: "", updatedAt: "", data: "", favorite: false },
    { id: "2", name: "B", description: "", category: "lead", tags: [], author: "", createdAt: "", updatedAt: "", data: "", favorite: false },
    { id: "3", name: "C", description: "", category: "bass", tags: [], author: "", createdAt: "", updatedAt: "", data: "", favorite: false },
  ];

  it("null category returns all presets", () => {
    expect(filterPresetsByCategory(presets, null)).toHaveLength(3);
  });

  it("filters to bass only", () => {
    const results = filterPresetsByCategory(presets, "bass");
    expect(results).toHaveLength(2);
    expect(results.every((p) => p.category === "bass")).toBe(true);
  });

  it("filters to lead only", () => {
    const results = filterPresetsByCategory(presets, "lead");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("B");
  });

  it("unknown category returns empty", () => {
    expect(filterPresetsByCategory(presets, "nonexistent")).toHaveLength(0);
  });

  it("combined search + category filtering works", () => {
    // Search for "lead" matches only preset B (via category).
    const searched = filterPresets(presets, "lead");
    const filtered = filterPresetsByCategory(searched, "lead");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("B");

    // Same search, but filter by bass returns nothing
    const filteredBass = filterPresetsByCategory(searched, "bass");
    expect(filteredBass).toHaveLength(0);
  });
});

describe("groupPresetsByCategory", () => {
  const presets: Preset[] = [
    { id: "1", name: "Bass 1", description: "", category: "bass", tags: [], author: "", createdAt: "", updatedAt: "", data: "", favorite: false },
    { id: "2", name: "Lead 1", description: "", category: "lead", tags: [], author: "", createdAt: "", updatedAt: "", data: "", favorite: false },
    { id: "3", name: "Bass 2", description: "", category: "bass", tags: [], author: "", createdAt: "", updatedAt: "", data: "", favorite: false },
    { id: "4", name: "Pad 1", description: "", category: "pad", tags: [], author: "", createdAt: "", updatedAt: "", data: "", favorite: false },
  ];

  it("groups presets by category", () => {
    const groups = groupPresetsByCategory(presets);
    expect(groups.length).toBe(3); // bass, lead, pad

    const totalEntries = groups.reduce((sum, g) => sum + g.presets.length, 0);
    expect(totalEntries).toBe(4);
  });

  it("each group has correct category info", () => {
    const groups = groupPresetsByCategory(presets);
    for (const group of groups) {
      expect(group.category.id).toBeTruthy();
      expect(group.category.label).toBeTruthy();
      for (const preset of group.presets) {
        expect(preset.category).toBe(group.category.id);
      }
    }
  });

  it("groups are in PRESET_CATEGORIES display order", () => {
    const groups = groupPresetsByCategory(presets);
    const groupOrder = groups.map((g) => g.category.id);
    const categoryOrder = PRESET_CATEGORIES.map((c) => c.id).filter((id) =>
      groupOrder.includes(id),
    );
    expect(groupOrder).toEqual(categoryOrder);
  });

  it("empty input returns empty groups", () => {
    expect(groupPresetsByCategory([])).toHaveLength(0);
  });

  it("filtered input only includes matching categories", () => {
    const bassOnly = presets.filter((p) => p.category === "bass");
    const groups = groupPresetsByCategory(bassOnly);
    expect(groups).toHaveLength(1);
    expect(groups[0].category.id).toBe("bass");
    expect(groups[0].presets).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Store search/filter state
// ---------------------------------------------------------------------------

describe("PresetStore search/filter state", () => {
  beforeEach(resetStore);

  it("starts with empty search query", () => {
    expect(usePresetStore.getState().searchQuery).toBe("");
  });

  it("setSearchQuery updates the query", () => {
    usePresetStore.getState().setSearchQuery("bass");
    expect(usePresetStore.getState().searchQuery).toBe("bass");
  });

  it("starts with no category filter", () => {
    expect(usePresetStore.getState().selectedCategory).toBeNull();
  });

  it("setSelectedCategory updates the filter", () => {
    usePresetStore.getState().setSelectedCategory("lead");
    expect(usePresetStore.getState().selectedCategory).toBe("lead");
  });

  it("clearSearch resets both query and category", () => {
    usePresetStore.getState().setSearchQuery("pad");
    usePresetStore.getState().setSelectedCategory("pad");
    usePresetStore.getState().clearSearch();

    const state = usePresetStore.getState();
    expect(state.searchQuery).toBe("");
    expect(state.selectedCategory).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dirty flag
// ---------------------------------------------------------------------------

describe("Dirty flag", () => {
  beforeEach(resetStore);

  it("starts as false", () => {
    expect(usePresetStore.getState().dirty).toBe(false);
  });

  it("markDirty sets dirty to true", () => {
    usePresetStore.getState().markDirty();
    expect(usePresetStore.getState().dirty).toBe(true);
  });

  it("clearDirty sets dirty to false", () => {
    usePresetStore.getState().markDirty();
    usePresetStore.getState().clearDirty();
    expect(usePresetStore.getState().dirty).toBe(false);
  });

  it("savePreset clears dirty flag", () => {
    usePresetStore.getState().markDirty();
    expect(usePresetStore.getState().dirty).toBe(true);

    const doc = createSampleDoc();
    usePresetStore.getState().savePreset(doc, "Test");
    expect(usePresetStore.getState().dirty).toBe(false);
  });

  it("saveCurrentPreset clears dirty flag", () => {
    const doc = createSampleDoc();
    usePresetStore.getState().savePreset(doc, "Test");

    usePresetStore.getState().markDirty();
    expect(usePresetStore.getState().dirty).toBe(true);

    usePresetStore.getState().saveCurrentPreset(doc);
    expect(usePresetStore.getState().dirty).toBe(false);
  });

  it("loadPreset clears dirty flag", () => {
    const doc = createSampleDoc();
    const preset = usePresetStore.getState().savePreset(doc, "Test");

    usePresetStore.getState().markDirty();
    expect(usePresetStore.getState().dirty).toBe(true);

    const targetDoc = createPatchDocument();
    usePresetStore.getState().loadPreset(preset.id, targetDoc);
    expect(usePresetStore.getState().dirty).toBe(false);
  });

  it("restoring a snapshot sets dirty to true", () => {
    const doc = createSampleDoc();
    usePresetStore.getState().savePreset(doc, "Test");
    expect(usePresetStore.getState().dirty).toBe(false);

    const snapshot = usePresetStore.getState().captureSnapshot(doc);

    // Modify doc and save, clearing dirty
    addNode(doc, "delay", { x: 300, y: 0 });
    usePresetStore.getState().saveCurrentPreset(doc);
    expect(usePresetStore.getState().dirty).toBe(false);

    // Restore snapshot — doc now differs from saved preset
    usePresetStore.getState().restoreSnapshot(snapshot.id, doc);
    expect(usePresetStore.getState().dirty).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

describe("Snapshots", () => {
  beforeEach(resetStore);

  it("starts with no snapshots", () => {
    expect(usePresetStore.getState().snapshots).toHaveLength(0);
  });

  it("captureSnapshot creates a snapshot", () => {
    const doc = createSampleDoc();
    const snapshot = usePresetStore.getState().captureSnapshot(doc);

    expect(snapshot.id).toBeTruthy();
    expect(snapshot.name).toBe("Snapshot 1");
    expect(snapshot.timestamp).toBeGreaterThan(0);
    expect(snapshot.data).toBeTruthy();

    const state = usePresetStore.getState();
    expect(state.snapshots).toHaveLength(1);
    expect(state.snapshots[0].id).toBe(snapshot.id);
  });

  it("captureSnapshot with custom name", () => {
    const doc = createSampleDoc();
    const snapshot = usePresetStore.getState().captureSnapshot(doc, "A");
    expect(snapshot.name).toBe("A");
  });

  it("multiple snapshots are stored in order", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    store.captureSnapshot(doc, "A");
    store.captureSnapshot(doc, "B");
    store.captureSnapshot(doc, "C");

    const state = usePresetStore.getState();
    expect(state.snapshots).toHaveLength(3);
    expect(state.snapshots.map((s) => s.name)).toEqual(["A", "B", "C"]);
  });

  it("restoreSnapshot restores document state", () => {
    const doc = createSampleDoc();
    const snapshot = usePresetStore.getState().captureSnapshot(doc, "Before Change");

    // Verify the captured state has 2 nodes
    const capturedData = JSON.parse(snapshot.data);
    expect(Object.keys(capturedData.nodes)).toHaveLength(2);

    // Modify the document
    addNode(doc, "reverb", { x: 400, y: 0 }, "Reverb");
    expect(getPatchDocument(doc).nodes.size).toBe(3);

    // Restore snapshot
    usePresetStore.getState().restoreSnapshot(snapshot.id, doc);

    // Document should now have 2 nodes again
    expect(getPatchDocument(doc).nodes.size).toBe(2);

    const state = usePresetStore.getState();
    expect(state.activeSnapshotId).toBe(snapshot.id);
  });

  it("restoreSnapshot throws for unknown snapshot ID", () => {
    const doc = createPatchDocument();
    expect(() => {
      usePresetStore.getState().restoreSnapshot("nonexistent", doc);
    }).toThrow('snapshot "nonexistent" not found');
  });

  it("deleteSnapshot removes the snapshot", () => {
    const doc = createSampleDoc();
    const snapshot = usePresetStore.getState().captureSnapshot(doc, "To Delete");

    usePresetStore.getState().deleteSnapshot(snapshot.id);

    const state = usePresetStore.getState();
    expect(state.snapshots).toHaveLength(0);
  });

  it("deleteSnapshot only removes the targeted snapshot", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const s1 = store.captureSnapshot(doc, "Keep");
    const s2 = store.captureSnapshot(doc, "Remove");

    usePresetStore.getState().deleteSnapshot(s2.id);

    const state = usePresetStore.getState();
    expect(state.snapshots).toHaveLength(1);
    expect(state.snapshots[0].id).toBe(s1.id);
  });

  it("deleteSnapshot clears activeSnapshotId if it was the deleted one", () => {
    const doc = createSampleDoc();
    const snapshot = usePresetStore.getState().captureSnapshot(doc, "Active");

    usePresetStore.getState().restoreSnapshot(snapshot.id, doc);
    expect(usePresetStore.getState().activeSnapshotId).toBe(snapshot.id);

    usePresetStore.getState().deleteSnapshot(snapshot.id);
    expect(usePresetStore.getState().activeSnapshotId).toBeNull();
  });

  it("renameSnapshot changes the name", () => {
    const doc = createSampleDoc();
    const snapshot = usePresetStore.getState().captureSnapshot(doc, "Old");

    usePresetStore.getState().renameSnapshot(snapshot.id, "New");

    const state = usePresetStore.getState();
    expect(state.snapshots[0].name).toBe("New");
  });

  it("clearSnapshots removes all snapshots", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    store.captureSnapshot(doc, "A");
    store.captureSnapshot(doc, "B");

    usePresetStore.getState().clearSnapshots();

    const state = usePresetStore.getState();
    expect(state.snapshots).toHaveLength(0);
    expect(state.activeSnapshotId).toBeNull();
  });

  it("A/B comparison: capture A, modify, capture B, restore A, restore B", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();

    // Capture state A (oscillator + filter)
    const snapshotA = store.captureSnapshot(doc, "A");
    expect(getPatchDocument(doc).nodes.size).toBe(2);

    // Modify: add a reverb
    addNode(doc, "reverb", { x: 400, y: 0 }, "Reverb");
    expect(getPatchDocument(doc).nodes.size).toBe(3);

    // Capture state B (oscillator + filter + reverb)
    const snapshotB = usePresetStore.getState().captureSnapshot(doc, "B");

    // Restore A — should have 2 nodes
    usePresetStore.getState().restoreSnapshot(snapshotA.id, doc);
    expect(getPatchDocument(doc).nodes.size).toBe(2);
    expect(usePresetStore.getState().activeSnapshotId).toBe(snapshotA.id);

    // Restore B — should have 3 nodes
    usePresetStore.getState().restoreSnapshot(snapshotB.id, doc);
    expect(getPatchDocument(doc).nodes.size).toBe(3);
    expect(usePresetStore.getState().activeSnapshotId).toBe(snapshotB.id);
  });
});

// ---------------------------------------------------------------------------
// Serialize/deserialize roundtrip through preset save/load
// ---------------------------------------------------------------------------

describe("Serialize/deserialize roundtrip", () => {
  beforeEach(resetStore);

  it("preset save/load preserves all node data", () => {
    const doc = createSampleDoc();
    const originalSerialized = serializePatch(doc);

    // Save as preset
    const store = usePresetStore.getState();
    const preset = store.savePreset(doc, "Roundtrip Test");

    // Load into a fresh document
    const freshDoc = createPatchDocument();
    usePresetStore.getState().loadPreset(preset.id, freshDoc);

    // Compare serialized forms
    const restoredSerialized = serializePatch(freshDoc);
    const original = JSON.parse(originalSerialized);
    const restored = JSON.parse(restoredSerialized);

    expect(Object.keys(restored.nodes)).toEqual(Object.keys(original.nodes));
    expect(restored.connections).toEqual(original.connections);

    // Check individual node properties
    for (const key of Object.keys(original.nodes)) {
      expect(restored.nodes[key].type).toBe(original.nodes[key].type);
      expect(restored.nodes[key].name).toBe(original.nodes[key].name);
      expect(restored.nodes[key].position).toEqual(
        original.nodes[key].position,
      );
      expect(restored.nodes[key].parameters).toEqual(
        original.nodes[key].parameters,
      );
    }
  });

  it("preset save/load preserves connections", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const preset = store.savePreset(doc, "Connections Test");

    const freshDoc = createPatchDocument();
    usePresetStore.getState().loadPreset(preset.id, freshDoc);

    const original = getPatchDocument(doc);
    const restored = getPatchDocument(freshDoc);

    expect(restored.connections.length).toBe(original.connections.length);

    const origConn = original.connections.get(0);
    const restoredConn = restored.connections.get(0);
    expect(restoredConn.fromNode).toBe(origConn.fromNode);
    expect(restoredConn.fromPort).toBe(origConn.fromPort);
    expect(restoredConn.toNode).toBe(origConn.toNode);
    expect(restoredConn.toPort).toBe(origConn.toPort);
  });

  it("preset save/load preserves parameter values", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();
    const preset = store.savePreset(doc, "Params Test");

    const freshDoc = createPatchDocument();
    usePresetStore.getState().loadPreset(preset.id, freshDoc);

    const restoredPatch = getPatchDocument(freshDoc);
    let foundOsc = false;
    let foundFilter = false;

    restoredPatch.nodes.forEach((node) => {
      if (node.type === "oscillator") {
        expect(node.parameters.frequency).toBe(440);
        expect(node.parameters.waveform).toBe(1);
        foundOsc = true;
      }
      if (node.type === "filter") {
        expect(node.parameters.cutoff).toBe(2000);
        foundFilter = true;
      }
    });

    expect(foundOsc).toBe(true);
    expect(foundFilter).toBe(true);
  });

  it("snapshot save/restore preserves document state", () => {
    const doc = createSampleDoc();
    const snapshot = usePresetStore.getState().captureSnapshot(doc, "Roundtrip Snap");

    // Completely replace doc content
    const freshDoc = createPatchDocument();
    addNode(freshDoc, "delay", { x: 0, y: 0 });
    expect(getPatchDocument(freshDoc).nodes.size).toBe(1);

    // Restore snapshot
    usePresetStore.getState().restoreSnapshot(snapshot.id, freshDoc);

    const patch = getPatchDocument(freshDoc);
    expect(patch.nodes.size).toBe(2); // oscillator + filter
    expect(patch.connections.length).toBe(1);

    let hasOsc = false;
    let hasFilter = false;
    patch.nodes.forEach((node) => {
      if (node.type === "oscillator") hasOsc = true;
      if (node.type === "filter") hasFilter = true;
    });
    expect(hasOsc).toBe(true);
    expect(hasFilter).toBe(true);
  });

  it("multiple save/load cycles preserve data integrity", () => {
    const doc = createSampleDoc();
    const store = usePresetStore.getState();

    // Save → load → save → load
    const p1 = store.savePreset(doc, "Cycle 1");

    const doc2 = createPatchDocument();
    usePresetStore.getState().loadPreset(p1.id, doc2);

    // Add a node in the loaded doc
    addNode(doc2, "gain", { x: 300, y: 0 }, "Gain");
    const p2 = usePresetStore.getState().savePresetAs(doc2, "Cycle 2");

    const doc3 = createPatchDocument();
    usePresetStore.getState().loadPreset(p2.id, doc3);

    const finalPatch = getPatchDocument(doc3);
    expect(finalPatch.nodes.size).toBe(3); // osc + filter + gain
    expect(finalPatch.connections.length).toBe(1);
  });
});
