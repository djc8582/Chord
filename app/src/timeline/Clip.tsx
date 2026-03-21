/**
 * Clip Component
 *
 * Represents a single audio/MIDI/automation/trigger clip placed on a lane.
 * Supports click-to-select. Dragging and resizing are handled by the
 * parent Lane/Timeline through pointer events.
 */

import React, { useCallback } from "react";
import { useTimelineStore } from "./store.js";
import type { Clip as ClipData } from "./types.js";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  clip: {
    position: "absolute" as const,
    top: 4,
    borderRadius: 4,
    overflow: "hidden",
    cursor: "grab",
    userSelect: "none" as const,
    display: "flex",
    alignItems: "flex-start",
    fontSize: 10,
    fontFamily: "system-ui, sans-serif",
    color: "#fff",
    boxSizing: "border-box" as const,
    border: "1px solid transparent",
    transition: "border-color 0.1s",
  },
  clipSelected: {
    border: "1px solid #f8fafc",
    boxShadow: "0 0 0 1px rgba(248, 250, 252, 0.3)",
  },
  clipMuted: {
    opacity: 0.4,
  },
  label: {
    padding: "2px 6px",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    pointerEvents: "none" as const,
  },
  resizeHandle: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    width: 6,
    height: "100%",
    cursor: "ew-resize",
    backgroundColor: "transparent",
  },
  kindIndicator: {
    position: "absolute" as const,
    bottom: 2,
    left: 4,
    fontSize: 8,
    opacity: 0.6,
    pointerEvents: "none" as const,
  },
};

// ---------------------------------------------------------------------------
// Kind labels
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<string, string> = {
  audio: "AUD",
  midi: "MIDI",
  automation: "AUTO",
  trigger: "TRIG",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ClipProps {
  clip: ClipData;
  /** X position in pixels (calculated by parent). */
  x: number;
  /** Width in pixels (calculated by parent). */
  widthPx: number;
  /** Height in pixels (from lane height minus padding). */
  heightPx: number;
  /** Whether this clip is selected. */
  selected: boolean;
  /** Callback when resize handle is dragged. */
  onResizeStart?: (clipId: string, e: React.PointerEvent) => void;
  /** Callback when the clip body is drag-started. */
  onDragStart?: (clipId: string, e: React.PointerEvent) => void;
}

export const ClipComponent: React.FC<ClipProps> = ({
  clip,
  x,
  widthPx,
  heightPx,
  selected,
  onResizeStart,
  onDragStart,
}) => {
  const selectClip = useTimelineStore((s) => s.selectClip);
  const clearClipSelection = useTimelineStore((s) => s.clearClipSelection);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!e.shiftKey && !e.metaKey) {
        clearClipSelection();
      }
      selectClip(clip.id);
    },
    [clip.id, selectClip, clearClipSelection],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      onDragStart?.(clip.id, e);
    },
    [clip.id, onDragStart],
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      onResizeStart?.(clip.id, e);
    },
    [clip.id, onResizeStart],
  );

  const bgColor = clip.color + "cc"; // add some transparency

  return (
    <div
      data-testid={`clip-${clip.id}`}
      data-clip-id={clip.id}
      style={{
        ...styles.clip,
        ...(selected ? styles.clipSelected : {}),
        ...(clip.muted ? styles.clipMuted : {}),
        left: x,
        width: Math.max(widthPx, 4),
        height: heightPx - 8,
        backgroundColor: bgColor,
      }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
    >
      <span style={styles.label}>{clip.name}</span>
      <span style={styles.kindIndicator}>{KIND_LABELS[clip.kind] ?? clip.kind}</span>
      <div
        style={styles.resizeHandle}
        onPointerDown={handleResizePointerDown}
        data-testid={`clip-resize-${clip.id}`}
      />
    </div>
  );
};
