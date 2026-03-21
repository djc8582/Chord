/**
 * SetlistEditor
 *
 * Component for building and editing setlists before a performance.
 * Supports drag-to-reorder, add/remove entries, per-entry notes, and
 * color coding.
 */

import React, { useCallback, useRef, useState } from "react";
import { useLiveModeStore } from "./store.js";
import { SETLIST_COLORS } from "./types.js";
import type { SetlistEntry } from "./types.js";

export interface SetlistEditorProps {
  /** Available presets to add from. */
  presets?: Array<{ id: string; name: string }>;
  /** Optional CSS class name. */
  className?: string;
}

export const SetlistEditor: React.FC<SetlistEditorProps> = ({
  presets = [],
  className,
}) => {
  const setlist = useLiveModeStore((s) => s.setlist);
  const addEntry = useLiveModeStore((s) => s.addEntry);
  const removeEntry = useLiveModeStore((s) => s.removeEntry);
  const reorderEntry = useLiveModeStore((s) => s.reorderEntry);
  const updateEntry = useLiveModeStore((s) => s.updateEntry);
  const currentIndex = useLiveModeStore((s) => s.currentIndex);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);

  // -- Add entry from preset ------------------------------------------------

  const handleAddPreset = useCallback(
    (preset: { id: string; name: string }) => {
      const color = SETLIST_COLORS[setlist.length % SETLIST_COLORS.length];
      const entry: SetlistEntry = {
        id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        presetId: preset.id,
        name: preset.name,
        color,
        notes: "",
      };
      addEntry(entry);
    },
    [addEntry, setlist.length],
  );

  // -- Drag to reorder ------------------------------------------------------

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      e.preventDefault();
      dragOverIndex.current = index;
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (dragIndex !== null && dragOverIndex.current !== null && dragIndex !== dragOverIndex.current) {
        reorderEntry(dragIndex, dragOverIndex.current);
      }
      setDragIndex(null);
      dragOverIndex.current = null;
    },
    [dragIndex, reorderEntry],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    dragOverIndex.current = null;
  }, []);

  // -- Render ---------------------------------------------------------------

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        backgroundColor: "#0f172a",
        color: "#e2e8f0",
        padding: 16,
        borderRadius: 8,
        minWidth: 320,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Setlist Editor</h2>

      {/* Entry list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {setlist.map((entry, index) => (
          <div
            key={entry.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              backgroundColor:
                index === currentIndex ? "#1e3a5f" : "#1e293b",
              borderRadius: 6,
              borderLeft: `4px solid ${entry.color}`,
              opacity: dragIndex === index ? 0.5 : 1,
              cursor: "grab",
            }}
          >
            {/* Index */}
            <span
              style={{
                fontSize: 14,
                color: "#64748b",
                minWidth: 24,
                textAlign: "center",
              }}
            >
              {index + 1}
            </span>

            {/* Name + Notes */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                type="text"
                value={entry.name}
                onChange={(e) =>
                  updateEntry(entry.id, { name: e.target.value })
                }
                aria-label={`Entry ${index + 1} name`}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  color: "#e2e8f0",
                  fontSize: 16,
                  fontWeight: 600,
                  padding: 0,
                  outline: "none",
                }}
              />
              <input
                type="text"
                value={entry.notes}
                placeholder="Notes..."
                onChange={(e) =>
                  updateEntry(entry.id, { notes: e.target.value })
                }
                aria-label={`Entry ${index + 1} notes`}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: 12,
                  padding: 0,
                  outline: "none",
                  marginTop: 2,
                }}
              />
            </div>

            {/* Color picker */}
            <div style={{ display: "flex", gap: 2 }}>
              {SETLIST_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => updateEntry(entry.id, { color })}
                  aria-label={`Set color ${color}`}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    backgroundColor: color,
                    border:
                      color === entry.color
                        ? "2px solid #fff"
                        : "2px solid transparent",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              ))}
            </div>

            {/* Remove button */}
            <button
              onClick={() => removeEntry(entry.id)}
              aria-label={`Remove entry ${entry.name}`}
              style={{
                padding: "4px 8px",
                fontSize: 14,
                color: "#ef4444",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              X
            </button>
          </div>
        ))}
      </div>

      {/* Add from presets */}
      {presets.length > 0 && (
        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "#94a3b8" }}>
            Add from presets
          </h3>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleAddPreset(preset)}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  color: "#e2e8f0",
                  backgroundColor: "#334155",
                  border: "1px solid #475569",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                + {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {setlist.length === 0 && (
        <div
          style={{
            textAlign: "center",
            color: "#64748b",
            padding: 24,
            fontSize: 14,
          }}
        >
          No entries yet. Add presets to build your setlist.
        </div>
      )}
    </div>
  );
};
