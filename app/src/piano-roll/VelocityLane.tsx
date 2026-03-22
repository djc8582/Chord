/**
 * VelocityLane Component
 *
 * Bottom strip of the piano roll showing note velocities as vertical bars.
 * Each bar corresponds to a note, positioned at its start time.
 * Bars are click/draggable to edit velocity.
 */

import React, { useCallback, useRef, useState } from "react";
import { usePianoRollStore } from "./store";
import { velocityToColor } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Height of the velocity lane in pixels. */
export const VELOCITY_LANE_HEIGHT = 80;
const MAX_VELOCITY = 127;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface VelocityLaneProps {
  /** Width of the velocity lane area. */
  width?: number;
}

export const VelocityLane: React.FC<VelocityLaneProps> = React.memo(
  ({ width = 800 }) => {
    const notes = usePianoRollStore((s) => s.notes);
    const selectedNoteIds = usePianoRollStore((s) => s.selectedNoteIds);
    const zoomX = usePianoRollStore((s) => s.zoomX);
    const scrollX = usePianoRollStore((s) => s.scrollX);
    const setNoteVelocity = usePianoRollStore((s) => s.setNoteVelocity);
    const selectNote = usePianoRollStore((s) => s.selectNote);

    const laneRef = useRef<HTMLDivElement>(null);
    const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);

    const beatToX = useCallback(
      (beat: number) => (beat - scrollX) * zoomX,
      [scrollX, zoomX],
    );

    const yToVelocity = useCallback(
      (y: number) => {
        const ratio = 1 - y / VELOCITY_LANE_HEIGHT;
        return Math.max(0, Math.min(MAX_VELOCITY, Math.round(ratio * MAX_VELOCITY)));
      },
      [],
    );

    const handleBarMouseDown = useCallback(
      (e: React.MouseEvent, noteId: string) => {
        e.stopPropagation();
        selectNote(noteId);
        setDraggingNoteId(noteId);
      },
      [selectNote],
    );

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (!draggingNoteId || !laneRef.current) return;
        const rect = laneRef.current.getBoundingClientRect();
        const localY = e.clientY - rect.top;
        const velocity = yToVelocity(localY);
        setNoteVelocity(draggingNoteId, velocity);
      },
      [draggingNoteId, yToVelocity, setNoteVelocity],
    );

    const handleMouseUp = useCallback(() => {
      setDraggingNoteId(null);
    }, []);

    const barWidth = Math.max(4, zoomX * 0.2);

    return (
      <div
        ref={laneRef}
        data-testid="velocity-lane"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          position: "relative",
          width,
          height: VELOCITY_LANE_HEIGHT,
          background: "#fffef0",
          borderTop: "3px solid #000",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {/* Velocity reference lines */}
        {[32, 64, 96, 127].map((v) => {
          const y = VELOCITY_LANE_HEIGHT * (1 - v / MAX_VELOCITY);
          return (
            <div
              key={`ref-${v}`}
              style={{
                position: "absolute",
                left: 0,
                top: y,
                width: "100%",
                height: 1,
                background: "rgba(0,0,0,0.08)",
                pointerEvents: "none",
              }}
            />
          );
        })}

        {/* Velocity bars */}
        {notes.map((note) => {
          const x = beatToX(note.start);
          const barHeight =
            (note.velocity / MAX_VELOCITY) * VELOCITY_LANE_HEIGHT;
          const isSelected = selectedNoteIds.has(note.id);
          const color = velocityToColor(note.velocity);

          return (
            <div
              key={note.id}
              data-testid={`velocity-bar-${note.id}`}
              onMouseDown={(e) => handleBarMouseDown(e, note.id)}
              style={{
                position: "absolute",
                left: x - barWidth / 2,
                bottom: 0,
                width: barWidth,
                height: barHeight,
                background: color,
                border: isSelected
                  ? "2px solid #000"
                  : "1px solid rgba(0,0,0,0.2)",
                borderBottom: "none",
                cursor: "ns-resize",
                boxSizing: "border-box",
                borderRadius: "2px 2px 0 0",
              }}
            />
          );
        })}
      </div>
    );
  },
);

VelocityLane.displayName = "VelocityLane";
