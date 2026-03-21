/**
 * PianoRoll Component
 *
 * The main MIDI note editor. Composes:
 * - PianoKeyboard (left edge)
 * - NoteGrid (center)
 * - VelocityLane (bottom strip)
 * - Toolbar (top: tool selection, snap, zoom controls)
 */

import React, { useCallback } from "react";
import { usePianoRollStore } from "./store";
import { PianoKeyboard, KEYBOARD_WIDTH } from "./PianoKeyboard";
import { NoteGrid } from "./NoteGrid";
import { VelocityLane, VELOCITY_LANE_HEIGHT } from "./VelocityLane";
import type { SnapValue, Tool } from "./types";

// ---------------------------------------------------------------------------
// Snap options
// ---------------------------------------------------------------------------

const SNAP_OPTIONS: { label: string; value: SnapValue }[] = [
  { label: "1/4", value: "1/4" },
  { label: "1/8", value: "1/8" },
  { label: "1/16", value: "1/16" },
  { label: "1/32", value: "1/32" },
  { label: "1/4T", value: "1/4T" },
  { label: "1/8T", value: "1/8T" },
  { label: "1/16T", value: "1/16T" },
  { label: "1/32T", value: "1/32T" },
];

const TOOL_OPTIONS: { label: string; value: Tool }[] = [
  { label: "Select", value: "select" },
  { label: "Draw", value: "draw" },
  { label: "Erase", value: "erase" },
];

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

const Toolbar: React.FC = () => {
  const tool = usePianoRollStore((s) => s.tool);
  const setTool = usePianoRollStore((s) => s.setTool);
  const snapEnabled = usePianoRollStore((s) => s.snapEnabled);
  const setSnapEnabled = usePianoRollStore((s) => s.setSnapEnabled);
  const snapValue = usePianoRollStore((s) => s.snapValue);
  const setSnapValue = usePianoRollStore((s) => s.setSnapValue);
  const zoomX = usePianoRollStore((s) => s.zoomX);
  const setZoomX = usePianoRollStore((s) => s.setZoomX);
  const zoomY = usePianoRollStore((s) => s.zoomY);
  const setZoomY = usePianoRollStore((s) => s.setZoomY);
  const velocityEditMode = usePianoRollStore((s) => s.velocityEditMode);
  const setVelocityEditMode = usePianoRollStore((s) => s.setVelocityEditMode);
  const quantizeSelectedNotes = usePianoRollStore((s) => s.quantizeSelectedNotes);
  const selectedNoteIds = usePianoRollStore((s) => s.selectedNoteIds);

  const handleSnapChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSnapValue(e.target.value as SnapValue);
    },
    [setSnapValue],
  );

  return (
    <div
      data-testid="piano-roll-toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "4px 8px",
        background: "#2a2a2a",
        borderBottom: "1px solid #444",
        fontSize: 12,
        color: "#ccc",
        flexShrink: 0,
        height: 32,
      }}
    >
      {/* Tool selector */}
      <div style={{ display: "flex", gap: 2 }}>
        {TOOL_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            data-testid={`tool-${opt.value}`}
            onClick={() => setTool(opt.value)}
            style={{
              padding: "2px 8px",
              background: tool === opt.value ? "#5a5aff" : "#444",
              color: "#fff",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Snap toggle + value */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            type="checkbox"
            data-testid="snap-toggle"
            checked={snapEnabled}
            onChange={(e) => setSnapEnabled(e.target.checked)}
          />
          Snap
        </label>
        <select
          data-testid="snap-value"
          value={snapValue}
          onChange={handleSnapChange}
          style={{
            background: "#333",
            color: "#ccc",
            border: "1px solid #555",
            borderRadius: 3,
            fontSize: 11,
            padding: "1px 4px",
          }}
        >
          {SNAP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Quantize */}
      <button
        data-testid="quantize-btn"
        onClick={quantizeSelectedNotes}
        disabled={selectedNoteIds.size === 0}
        style={{
          padding: "2px 8px",
          background: selectedNoteIds.size > 0 ? "#444" : "#333",
          color: selectedNoteIds.size > 0 ? "#fff" : "#666",
          border: "none",
          borderRadius: 3,
          cursor: selectedNoteIds.size > 0 ? "pointer" : "default",
          fontSize: 11,
        }}
      >
        Quantize
      </button>

      {/* Velocity edit mode */}
      <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
        <input
          type="checkbox"
          data-testid="velocity-mode-toggle"
          checked={velocityEditMode}
          onChange={(e) => setVelocityEditMode(e.target.checked)}
        />
        Velocity
      </label>

      {/* Zoom controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
        <span>Zoom X:</span>
        <input
          type="range"
          data-testid="zoom-x"
          min={10}
          max={500}
          value={zoomX}
          onChange={(e) => setZoomX(Number(e.target.value))}
          style={{ width: 80 }}
        />
        <span>Y:</span>
        <input
          type="range"
          data-testid="zoom-y"
          min={4}
          max={40}
          value={zoomY}
          onChange={(e) => setZoomY(Number(e.target.value))}
          style={{ width: 80 }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main PianoRoll
// ---------------------------------------------------------------------------

export interface PianoRollProps {
  /** Width of the entire piano roll. */
  width?: number;
  /** Height of the entire piano roll. */
  height?: number;
  /** Callback when a piano key is clicked for audition/preview. */
  onKeyClick?: (pitch: number) => void;
}

export const PianoRoll: React.FC<PianoRollProps> = ({
  width = 900,
  height = 700,
  onKeyClick,
}) => {
  const velocityEditMode = usePianoRollStore((s) => s.velocityEditMode);
  const toolbarHeight = 32;
  const velocityHeight = velocityEditMode ? VELOCITY_LANE_HEIGHT : 0;
  const gridWidth = width - KEYBOARD_WIDTH;
  const gridHeight = height - toolbarHeight - velocityHeight;

  return (
    <div
      data-testid="piano-roll"
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        background: "#1a1a1a",
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Toolbar */}
      <Toolbar />

      {/* Main area: keyboard + grid */}
      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {/* Piano keyboard */}
        <div style={{ overflow: "hidden", height: gridHeight }}>
          <PianoKeyboard onKeyClick={onKeyClick} />
        </div>

        {/* Note grid */}
        <div style={{ flex: 1, overflow: "auto", height: gridHeight }}>
          <NoteGrid width={gridWidth} height={gridHeight} />
        </div>
      </div>

      {/* Velocity lane (shown when velocity edit mode is on) */}
      {velocityEditMode && (
        <div style={{ display: "flex" }}>
          {/* Spacer to align with keyboard */}
          <div style={{ width: KEYBOARD_WIDTH, flexShrink: 0, background: "#222" }} />
          <VelocityLane width={gridWidth} />
        </div>
      )}
    </div>
  );
};

PianoRoll.displayName = "PianoRoll";
