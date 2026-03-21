/**
 * Browser Panel
 *
 * A searchable, categorized list of available node types that users can
 * browse and add to the canvas. Renders as the left panel of the app.
 *
 * Features:
 * - Search bar with fuzzy/substring filtering
 * - Category sections (collapsible)
 * - Each node type shows: name, icon, brief description, port summary
 * - Click a node type to add it to the canvas
 */

import React, { useCallback, useMemo } from "react";
import { useBrowserStore } from "./store.js";
import {
  filterCatalog,
  filterByCategory,
  groupByCategory,
  CATEGORIES,
} from "./catalog.js";
import type { CatalogEntry, CategoryInfo } from "./catalog.js";
import { useCanvasStore } from "../canvas/store.js";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface NodeEntryProps {
  entry: CatalogEntry;
  onAdd: (type: string) => void;
}

/** A single node type row in the browser list. */
function NodeEntry({ entry, onAdd }: NodeEntryProps) {
  const inputCount = entry.inputs.length;
  const outputCount = entry.outputs.length;

  return (
    <div
      data-testid={`browser-entry-${entry.type}`}
      role="button"
      tabIndex={0}
      onClick={() => onAdd(entry.type)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAdd(entry.type);
        }
      }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "6px 8px",
        cursor: "pointer",
        borderRadius: 4,
        userSelect: "none",
      }}
    >
      {/* Icon */}
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 14,
          width: 24,
          textAlign: "center",
          flexShrink: 0,
          lineHeight: "20px",
        }}
      >
        {entry.icon}
      </span>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            lineHeight: "20px",
          }}
        >
          {entry.label}
        </div>
        <div
          style={{
            fontSize: 11,
            opacity: 0.6,
            lineHeight: "16px",
          }}
        >
          {entry.description}
        </div>
        <div
          style={{
            fontSize: 10,
            opacity: 0.4,
            lineHeight: "14px",
            marginTop: 2,
          }}
        >
          {inputCount > 0 ? `${inputCount} in` : "no inputs"}
          {" / "}
          {outputCount > 0 ? `${outputCount} out` : "no outputs"}
        </div>
      </div>
    </div>
  );
}

interface CategorySectionProps {
  category: CategoryInfo;
  entries: CatalogEntry[];
  expanded: boolean;
  onToggle: () => void;
  onAddNode: (type: string) => void;
}

/** A collapsible category section with its node entries. */
function CategorySection({
  category,
  entries,
  expanded,
  onToggle,
  onAddNode,
}: CategorySectionProps) {
  return (
    <div data-testid={`browser-category-${category.id}`}>
      {/* Category header */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          cursor: "pointer",
          userSelect: "none",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          opacity: 0.7,
        }}
      >
        <span style={{ fontSize: 10 }}>{expanded ? "\u25BC" : "\u25B6"}</span>
        <span>
          {category.label} ({entries.length})
        </span>
      </div>

      {/* Entries */}
      {expanded && (
        <div style={{ paddingLeft: 4 }}>
          {entries.map((entry) => (
            <NodeEntry key={entry.type} entry={entry} onAdd={onAddNode} />
          ))}
        </div>
      )}
    </div>
  );
}

interface CategoryFilterBarProps {
  selectedCategory: string | null;
  onSelect: (category: string | null) => void;
}

/** Horizontal filter buttons for category quick-filtering. */
function CategoryFilterBar({ selectedCategory, onSelect }: CategoryFilterBarProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        padding: "4px 0",
      }}
    >
      <button
        data-testid="browser-filter-all"
        onClick={() => onSelect(null)}
        style={{
          fontSize: 10,
          padding: "2px 8px",
          borderRadius: 10,
          border: "1px solid",
          borderColor: selectedCategory === null ? "currentColor" : "transparent",
          background: selectedCategory === null ? "rgba(255,255,255,0.1)" : "transparent",
          color: "inherit",
          cursor: "pointer",
          fontWeight: selectedCategory === null ? 600 : 400,
        }}
      >
        All
      </button>
      {CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          data-testid={`browser-filter-${cat.id}`}
          onClick={() => onSelect(cat.id)}
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 10,
            border: "1px solid",
            borderColor: selectedCategory === cat.id ? "currentColor" : "transparent",
            background: selectedCategory === cat.id ? "rgba(255,255,255,0.1)" : "transparent",
            color: "inherit",
            cursor: "pointer",
            fontWeight: selectedCategory === cat.id ? 600 : 400,
          }}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Browser component
// ---------------------------------------------------------------------------

export function Browser() {
  const searchQuery = useBrowserStore((s) => s.searchQuery);
  const setSearchQuery = useBrowserStore((s) => s.setSearchQuery);
  const selectedCategory = useBrowserStore((s) => s.selectedCategory);
  const setSelectedCategory = useBrowserStore((s) => s.setSelectedCategory);
  const expandedCategories = useBrowserStore((s) => s.expandedCategories);
  const toggleCategory = useBrowserStore((s) => s.toggleCategory);

  const addNode = useCanvasStore((s) => s.addNode);

  // Compute filtered + grouped entries
  const groups = useMemo(() => {
    const searched = filterCatalog(searchQuery);
    const filtered = filterByCategory(searched, selectedCategory);
    return groupByCategory(filtered);
  }, [searchQuery, selectedCategory]);

  const totalCount = useMemo(
    () => groups.reduce((sum, g) => sum + g.entries.length, 0),
    [groups],
  );

  const handleAddNode = useCallback(
    (type: string) => {
      // Add node at a default canvas position (center-ish)
      addNode(type, { x: 200, y: 200 });
    },
    [addNode],
  );

  return (
    <div
      data-testid="browser-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontSize: 13,
      }}
    >
      {/* Search bar */}
      <div style={{ padding: "0 0 8px 0" }}>
        <input
          data-testid="browser-search"
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 8px",
            fontSize: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 4,
            background: "rgba(0,0,0,0.2)",
            color: "inherit",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Category filter bar */}
      <CategoryFilterBar
        selectedCategory={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {/* Results count */}
      <div
        style={{
          fontSize: 10,
          opacity: 0.4,
          padding: "4px 0",
        }}
      >
        {totalCount} node{totalCount !== 1 ? "s" : ""}
      </div>

      {/* Node list */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {groups.length === 0 && (
          <div
            style={{
              padding: 16,
              textAlign: "center",
              opacity: 0.4,
              fontSize: 12,
            }}
          >
            No nodes match your search.
          </div>
        )}

        {groups.map(({ category, entries }) => (
          <CategorySection
            key={category.id}
            category={category}
            entries={entries}
            expanded={expandedCategories.has(category.id)}
            onToggle={() => toggleCategory(category.id)}
            onAddNode={handleAddNode}
          />
        ))}
      </div>
    </div>
  );
}
