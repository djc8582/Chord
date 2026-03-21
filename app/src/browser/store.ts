/**
 * Browser Store
 *
 * Zustand store for the node library browser panel.
 * Manages search query, selected category filter, and expanded/collapsed
 * category sections.
 */

import { create } from "zustand";
import { CATEGORIES } from "./catalog.js";

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface BrowserStore {
  /** Current search query string. */
  searchQuery: string;

  /** Selected category filter (null = show all). */
  selectedCategory: string | null;

  /** Set of category IDs that are currently expanded (visible). */
  expandedCategories: Set<string>;

  // Actions
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  toggleCategory: (categoryId: string) => void;
  expandCategory: (categoryId: string) => void;
  collapseCategory: (categoryId: string) => void;
  expandAllCategories: () => void;
  collapseAllCategories: () => void;
  clearSearch: () => void;
}

// ---------------------------------------------------------------------------
// Default state: all categories expanded
// ---------------------------------------------------------------------------

function allCategoryIds(): Set<string> {
  return new Set(CATEGORIES.map((c) => c.id));
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useBrowserStore = create<BrowserStore>((set) => ({
  searchQuery: "",
  selectedCategory: null,
  expandedCategories: allCategoryIds(),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSelectedCategory: (category) => set({ selectedCategory: category }),

  toggleCategory: (categoryId) =>
    set((state) => {
      const next = new Set(state.expandedCategories);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return { expandedCategories: next };
    }),

  expandCategory: (categoryId) =>
    set((state) => {
      const next = new Set(state.expandedCategories);
      next.add(categoryId);
      return { expandedCategories: next };
    }),

  collapseCategory: (categoryId) =>
    set((state) => {
      const next = new Set(state.expandedCategories);
      next.delete(categoryId);
      return { expandedCategories: next };
    }),

  expandAllCategories: () => set({ expandedCategories: allCategoryIds() }),

  collapseAllCategories: () => set({ expandedCategories: new Set() }),

  clearSearch: () => set({ searchQuery: "", selectedCategory: null }),
}));
