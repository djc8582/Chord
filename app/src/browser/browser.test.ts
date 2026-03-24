/**
 * Browser Module Tests
 *
 * Tests covering:
 * - Node catalog contains all expected node types
 * - Search filtering (substring match, case insensitive)
 * - Category filtering
 * - Adding a node from browser creates it in the canvas store / document model
 * - Empty search shows all nodes
 * - Browser store state management (query, category filter, expanded/collapsed)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPatchDocument, getPatchDocument } from "@chord/document-model";
import { useCanvasStore, NODE_TYPE_REGISTRY } from "../canvas/store.js";
import { useBrowserStore } from "./store.js";
import {
  NODE_CATALOG,
  CATEGORIES,
  CATEGORY_MAP,
  filterCatalog,
  filterByCategory,
  groupByCategory,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStores() {
  // Reset canvas store
  const doc = createPatchDocument();
  useCanvasStore.getState().initDocument(doc);

  // Reset browser store
  useBrowserStore.setState({
    searchQuery: "",
    selectedCategory: null,
    expandedCategories: new Set(CATEGORIES.map((c) => c.id)),
  });
}

// ---------------------------------------------------------------------------
// Node Catalog
// ---------------------------------------------------------------------------

describe("NODE_CATALOG", () => {
  it("contains an entry for every node in NODE_TYPE_REGISTRY", () => {
    const registryTypes = Object.keys(NODE_TYPE_REGISTRY);
    const catalogTypes = NODE_CATALOG.map((e) => e.type);

    for (const type of registryTypes) {
      expect(catalogTypes).toContain(type);
    }
  });

  it("contains all expected node types", () => {
    const types = NODE_CATALOG.map((e) => e.type);
    expect(types).toContain("oscillator");
    expect(types).toContain("noise");
    expect(types).toContain("lfo");
    expect(types).toContain("filter");
    expect(types).toContain("gain");
    expect(types).toContain("delay");
    expect(types).toContain("reverb");
    expect(types).toContain("envelope");
    expect(types).toContain("mixer");
    expect(types).toContain("output");
    expect(types).toContain("input");
    expect(types).toContain("midi_in");
  });

  it("each entry has required fields", () => {
    for (const entry of NODE_CATALOG) {
      expect(entry.type).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.category).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.icon).toBeTruthy();
      expect(Array.isArray(entry.inputs)).toBe(true);
      expect(Array.isArray(entry.outputs)).toBe(true);
    }
  });

  it("entry labels match NODE_TYPE_REGISTRY labels", () => {
    for (const entry of NODE_CATALOG) {
      const regEntry = NODE_TYPE_REGISTRY[entry.type];
      expect(regEntry).toBeDefined();
      expect(entry.label).toBe(regEntry.label);
    }
  });

  it("entry categories match NODE_TYPE_REGISTRY categories", () => {
    for (const entry of NODE_CATALOG) {
      const regEntry = NODE_TYPE_REGISTRY[entry.type];
      expect(entry.category).toBe(regEntry.category);
    }
  });

  it("entry ports match NODE_TYPE_REGISTRY ports", () => {
    for (const entry of NODE_CATALOG) {
      const regEntry = NODE_TYPE_REGISTRY[entry.type];
      expect(entry.inputs).toEqual(regEntry.inputs);
      expect(entry.outputs).toEqual(regEntry.outputs);
    }
  });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

describe("CATEGORIES", () => {
  it("has entries for all category groups used by the catalog", () => {
    const usedCategories = new Set(NODE_CATALOG.map((e) => e.category));
    const definedCategories = new Set(CATEGORIES.map((c) => c.id));

    for (const cat of usedCategories) {
      expect(definedCategories.has(cat)).toBe(true);
    }
  });

  it("each category has id, label, and icon", () => {
    for (const cat of CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.icon).toBeTruthy();
    }
  });

  it("CATEGORY_MAP provides quick lookups", () => {
    for (const cat of CATEGORIES) {
      expect(CATEGORY_MAP[cat.id]).toBe(cat);
    }
  });
});

// ---------------------------------------------------------------------------
// Search filtering
// ---------------------------------------------------------------------------

describe("filterCatalog", () => {
  it("empty search returns all nodes", () => {
    const results = filterCatalog("");
    expect(results).toHaveLength(NODE_CATALOG.length);
  });

  it("whitespace-only search returns all nodes", () => {
    const results = filterCatalog("   ");
    expect(results).toHaveLength(NODE_CATALOG.length);
  });

  it("substring match on label (case insensitive)", () => {
    const results = filterCatalog("osc");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((e) => e.type === "oscillator")).toBe(true);
  });

  it("case insensitive: uppercase query matches lowercase label", () => {
    const results = filterCatalog("OSCILLATOR");
    expect(results.some((e) => e.type === "oscillator")).toBe(true);
  });

  it("case insensitive: mixed case query", () => {
    const results = filterCatalog("FiLtEr");
    expect(results.some((e) => e.type === "filter")).toBe(true);
  });

  it("matches on description", () => {
    // "periodic" appears in oscillator description
    const results = filterCatalog("periodic");
    expect(results.some((e) => e.type === "oscillator")).toBe(true);
  });

  it("matches on type id", () => {
    const results = filterCatalog("midi_in");
    expect(results.some((e) => e.type === "midi_in")).toBe(true);
  });

  it("matches on category name", () => {
    // "generators" is a category
    const results = filterCatalog("generators");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((e) => e.category === "generators")).toBe(true);
  });

  it("no results for nonsense query", () => {
    const results = filterCatalog("zzzzxxyynonsense");
    expect(results).toHaveLength(0);
  });

  it("partial match works", () => {
    // "del" should match "Delay"
    const results = filterCatalog("del");
    expect(results.some((e) => e.type === "delay")).toBe(true);
  });

  it("search for 'noise' finds noise generator", () => {
    const results = filterCatalog("noise");
    expect(results.some((e) => e.type === "noise")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Category filtering
// ---------------------------------------------------------------------------

describe("filterByCategory", () => {
  it("null category returns all entries", () => {
    const results = filterByCategory(NODE_CATALOG, null);
    expect(results).toHaveLength(NODE_CATALOG.length);
  });

  it("filters to generators only", () => {
    const results = filterByCategory(NODE_CATALOG, "generators");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((e) => e.category === "generators")).toBe(true);
    expect(results.some((e) => e.type === "oscillator")).toBe(true);
    expect(results.some((e) => e.type === "noise")).toBe(true);
  });

  it("filters to effects only", () => {
    const results = filterByCategory(NODE_CATALOG, "effects");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((e) => e.category === "effects")).toBe(true);
    expect(results.some((e) => e.type === "filter")).toBe(true);
    expect(results.some((e) => e.type === "delay")).toBe(true);
    expect(results.some((e) => e.type === "reverb")).toBe(true);
  });

  it("filters to io only", () => {
    const results = filterByCategory(NODE_CATALOG, "io");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((e) => e.category === "io")).toBe(true);
    expect(results.some((e) => e.type === "output")).toBe(true);
    expect(results.some((e) => e.type === "input")).toBe(true);
    expect(results.some((e) => e.type === "midi_in")).toBe(true);
  });

  it("filters to utilities only", () => {
    const results = filterByCategory(NODE_CATALOG, "utilities");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((e) => e.category === "utilities")).toBe(true);
  });

  it("filters to modulators only", () => {
    const results = filterByCategory(NODE_CATALOG, "modulators");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((e) => e.category === "modulators")).toBe(true);
    expect(results.some((e) => e.type === "envelope")).toBe(true);
    expect(results.some((e) => e.type === "lfo")).toBe(true);
  });

  it("unknown category returns empty list", () => {
    const results = filterByCategory(NODE_CATALOG, "nonexistent");
    expect(results).toHaveLength(0);
  });

  it("combined search + category filtering works", () => {
    const searched = filterCatalog("osc");
    const filtered = filterByCategory(searched, "generators");
    expect(filtered.some((e) => e.type === "oscillator")).toBe(true);
    // oscillator is a generator, so it should still be there
    expect(filtered.every((e) => e.category === "generators")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// groupByCategory
// ---------------------------------------------------------------------------

describe("groupByCategory", () => {
  it("groups all catalog entries by category", () => {
    const groups = groupByCategory(NODE_CATALOG);

    // Should have groups for all used categories
    const usedCategories = new Set(NODE_CATALOG.map((e) => e.category));
    expect(groups.length).toBe(usedCategories.size);

    // Total entries across all groups should equal catalog size
    const totalEntries = groups.reduce((sum, g) => sum + g.entries.length, 0);
    expect(totalEntries).toBe(NODE_CATALOG.length);
  });

  it("each group has correct category info", () => {
    const groups = groupByCategory(NODE_CATALOG);

    for (const group of groups) {
      expect(group.category.id).toBeTruthy();
      expect(group.category.label).toBeTruthy();
      // All entries in group belong to the group's category
      for (const entry of group.entries) {
        expect(entry.category).toBe(group.category.id);
      }
    }
  });

  it("groups are in CATEGORIES display order", () => {
    const groups = groupByCategory(NODE_CATALOG);
    const groupOrder = groups.map((g) => g.category.id);
    const categoryOrder = CATEGORIES.map((c) => c.id).filter((id) =>
      groupOrder.includes(id),
    );

    expect(groupOrder).toEqual(categoryOrder);
  });

  it("empty input returns empty groups", () => {
    const groups = groupByCategory([]);
    expect(groups).toHaveLength(0);
  });

  it("filtered input only includes matching categories", () => {
    const generators = filterByCategory(NODE_CATALOG, "generators");
    const groups = groupByCategory(generators);

    expect(groups).toHaveLength(1);
    expect(groups[0].category.id).toBe("generators");
  });
});

// ---------------------------------------------------------------------------
// Adding a node from browser creates it in the canvas store
// ---------------------------------------------------------------------------

describe("adding node from browser to canvas", () => {
  beforeEach(resetStores);

  it("addNode creates a node in the canvas store", () => {
    const canvasStore = useCanvasStore.getState();
    const id = canvasStore.addNode("oscillator", { x: 200, y: 200 });

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].id).toBe(id);
    expect(state.nodes[0].data.nodeType).toBe("oscillator");
  });

  it("addNode creates the node in the Yjs document", () => {
    const canvasStore = useCanvasStore.getState();
    const id = canvasStore.addNode("filter", { x: 100, y: 150 });

    const patch = getPatchDocument(canvasStore.ydoc);
    const yjsNode = patch.nodes.get(id);
    expect(yjsNode).toBeDefined();
    expect(yjsNode!.type).toBe("filter");
    expect(yjsNode!.position).toEqual({ x: 100, y: 150 });
  });

  it("every catalog node type can be added to canvas", () => {
    for (const entry of NODE_CATALOG) {
      // Reset for each node type
      const doc = createPatchDocument();
      useCanvasStore.getState().initDocument(doc);

      const canvasStore = useCanvasStore.getState();
      canvasStore.addNode(entry.type, { x: 0, y: 0 }, entry.label);

      const state = useCanvasStore.getState();
      expect(state.nodes).toHaveLength(1);
      expect(state.nodes[0].data.nodeType).toBe(entry.type);
    }
  });

  it("adding different node types from browser populates the canvas", () => {
    const store = useCanvasStore.getState();
    store.addNode("oscillator", { x: 0, y: 0 });
    store.addNode("filter", { x: 200, y: 0 });
    store.addNode("output", { x: 400, y: 0 });

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(3);

    const types = state.nodes.map((n) => n.data.nodeType);
    expect(types).toContain("oscillator");
    expect(types).toContain("filter");
    expect(types).toContain("output");
  });
});

// ---------------------------------------------------------------------------
// Browser Store
// ---------------------------------------------------------------------------

describe("BrowserStore", () => {
  beforeEach(resetStores);

  describe("search query", () => {
    it("starts with empty query", () => {
      expect(useBrowserStore.getState().searchQuery).toBe("");
    });

    it("setSearchQuery updates the query", () => {
      useBrowserStore.getState().setSearchQuery("osc");
      expect(useBrowserStore.getState().searchQuery).toBe("osc");
    });

    it("setSearchQuery to empty resets search", () => {
      useBrowserStore.getState().setSearchQuery("filter");
      useBrowserStore.getState().setSearchQuery("");
      expect(useBrowserStore.getState().searchQuery).toBe("");
    });

    it("clearSearch resets both query and category", () => {
      useBrowserStore.getState().setSearchQuery("delay");
      useBrowserStore.getState().setSelectedCategory("effects");
      useBrowserStore.getState().clearSearch();

      const state = useBrowserStore.getState();
      expect(state.searchQuery).toBe("");
      expect(state.selectedCategory).toBeNull();
    });
  });

  describe("category filter", () => {
    it("starts with no category filter (null)", () => {
      expect(useBrowserStore.getState().selectedCategory).toBeNull();
    });

    it("setSelectedCategory updates the filter", () => {
      useBrowserStore.getState().setSelectedCategory("generators");
      expect(useBrowserStore.getState().selectedCategory).toBe("generators");
    });

    it("setSelectedCategory to null clears the filter", () => {
      useBrowserStore.getState().setSelectedCategory("effects");
      useBrowserStore.getState().setSelectedCategory(null);
      expect(useBrowserStore.getState().selectedCategory).toBeNull();
    });
  });

  describe("expanded categories", () => {
    it("all categories are expanded by default", () => {
      const expanded = useBrowserStore.getState().expandedCategories;
      for (const cat of CATEGORIES) {
        expect(expanded.has(cat.id)).toBe(true);
      }
    });

    it("toggleCategory collapses an expanded category", () => {
      useBrowserStore.getState().toggleCategory("generators");
      expect(useBrowserStore.getState().expandedCategories.has("generators")).toBe(false);
    });

    it("toggleCategory expands a collapsed category", () => {
      useBrowserStore.getState().collapseCategory("generators");
      useBrowserStore.getState().toggleCategory("generators");
      expect(useBrowserStore.getState().expandedCategories.has("generators")).toBe(true);
    });

    it("collapseCategory makes a category collapsed", () => {
      useBrowserStore.getState().collapseCategory("effects");
      expect(useBrowserStore.getState().expandedCategories.has("effects")).toBe(false);
    });

    it("expandCategory makes a category expanded", () => {
      useBrowserStore.getState().collapseCategory("effects");
      useBrowserStore.getState().expandCategory("effects");
      expect(useBrowserStore.getState().expandedCategories.has("effects")).toBe(true);
    });

    it("collapseAllCategories collapses everything", () => {
      useBrowserStore.getState().collapseAllCategories();
      const expanded = useBrowserStore.getState().expandedCategories;
      expect(expanded.size).toBe(0);
    });

    it("expandAllCategories expands everything", () => {
      useBrowserStore.getState().collapseAllCategories();
      useBrowserStore.getState().expandAllCategories();
      const expanded = useBrowserStore.getState().expandedCategories;
      for (const cat of CATEGORIES) {
        expect(expanded.has(cat.id)).toBe(true);
      }
    });
  });
});
