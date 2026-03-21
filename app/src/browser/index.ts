/**
 * @chord/app — Browser Module
 *
 * Node library browser panel. Provides a searchable, categorized view of
 * all available node types. Users can click to add nodes to the canvas.
 */

// Main component
export { Browser } from "./Browser.js";

// Store
export { useBrowserStore } from "./store.js";
export type { BrowserStore } from "./store.js";

// Catalog data + helpers
export {
  NODE_CATALOG,
  CATEGORIES,
  CATEGORY_MAP,
  filterCatalog,
  filterByCategory,
  groupByCategory,
} from "./catalog.js";
export type { CatalogEntry, CategoryInfo } from "./catalog.js";
