/**
 * NodeSearchPalette — Quick-add node search dialog
 *
 * Opens with N key or Cmd+K. Allows fuzzy searching through the node
 * type registry and spawning a node at the center of the viewport.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { NODE_TYPE_REGISTRY, useCanvasStore } from "./store";
import type { NodeTypeDefinition } from "./store";

interface NodeSearchPaletteProps {
  /** Viewport center position for spawning nodes. */
  spawnPosition: { x: number; y: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  generators: "Generators",
  effects: "Effects",
  modulators: "Modulators",
  utilities: "Utilities",
  io: "I/O",
};

export function NodeSearchPalette({ spawnPosition }: NodeSearchPaletteProps) {
  const searchOpen = useCanvasStore((s) => s.searchOpen);
  const searchQuery = useCanvasStore((s) => s.searchQuery);
  const setSearchQuery = useCanvasStore((s) => s.setSearchQuery);
  const closeSearch = useCanvasStore((s) => s.closeSearch);
  const addNode = useCanvasStore((s) => s.addNode);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allTypes = useMemo(
    () => Object.values(NODE_TYPE_REGISTRY),
    [],
  );

  const filteredTypes = useMemo(() => {
    if (!searchQuery.trim()) return allTypes;
    const q = searchQuery.toLowerCase();
    return allTypes.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [allTypes, searchQuery]);

  // Group by category
  const grouped = useMemo(() => {
    const groups = new Map<string, NodeTypeDefinition[]>();
    for (const t of filteredTypes) {
      const existing = groups.get(t.category) ?? [];
      existing.push(t);
      groups.set(t.category, existing);
    }
    return groups;
  }, [filteredTypes]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    const result: NodeTypeDefinition[] = [];
    for (const types of grouped.values()) {
      result.push(...types);
    }
    return result;
  }, [grouped]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [flatList.length]);

  // Focus input when opened
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [searchOpen]);

  const spawnNode = useCallback(
    (typeDef: NodeTypeDefinition) => {
      addNode(typeDef.type, spawnPosition, typeDef.label);
      closeSearch();
    },
    [addNode, closeSearch, spawnPosition],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSearch();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && flatList.length > 0) {
        e.preventDefault();
        spawnNode(flatList[selectedIndex]);
        return;
      }
    },
    [closeSearch, flatList, selectedIndex, spawnNode],
  );

  if (!searchOpen) return null;

  return (
    <div
      data-testid="node-search-palette"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 80,
        zIndex: 100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSearch();
      }}
    >
      <div
        style={{
          background: "#1a1a2e",
          border: "3px solid #000",
          borderRadius: 0,
          width: 400,
          maxHeight: 480,
          overflow: "hidden",
          boxShadow: "4px 4px 0px #000",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search input */}
        <div style={{ padding: "12px 16px", borderBottom: "3px solid #000" }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: "100%",
              background: "#0a0a0a",
              border: "3px solid #000",
              borderRadius: 0,
              padding: "10px 14px",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 700,
              fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
              outline: "none",
            }}
          />
        </div>

        {/* Results */}
        <div
          style={{
            overflowY: "auto",
            padding: "8px 0",
            maxHeight: 380,
          }}
        >
          {flatList.length === 0 && (
            <div
              style={{
                padding: "16px",
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              No matching nodes
            </div>
          )}

          {Array.from(grouped.entries()).map(([category, types]) => (
            <div key={category}>
              <div
                style={{
                  padding: "4px 16px",
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  color: "#00ff41",
                  fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
                }}
              >
                {CATEGORY_LABELS[category] ?? category}
              </div>
              {types.map((typeDef) => {
                const flatIndex = flatList.indexOf(typeDef);
                const isActive = flatIndex === selectedIndex;
                return (
                  <div
                    key={typeDef.type}
                    data-testid={`node-option-${typeDef.type}`}
                    onClick={() => spawnNode(typeDef)}
                    onMouseEnter={() => setSelectedIndex(flatIndex)}
                    style={{
                      padding: "8px 16px",
                      cursor: "pointer",
                      background: isActive ? "#16213e" : "transparent",
                      borderLeft: isActive ? "3px solid #00ff41" : "3px solid transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "background 0.1s",
                    }}
                  >
                    <span
                      style={{
                        color: isActive ? "#00ff41" : "#ffffff",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {typeDef.label}
                    </span>
                    <span
                      style={{
                        color: "#94a3b8",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {typeDef.inputs.length} in / {typeDef.outputs.length} out
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
