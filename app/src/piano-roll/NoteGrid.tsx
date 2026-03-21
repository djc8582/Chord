/**
 * NoteGrid Component
 *
 * The main grid area of the piano roll. Renders:
 * - Background grid lines (beat divisions + pitch rows)
 * - Note rectangles (colored by velocity, selectable, draggable, resizable)
 * - Handles draw/select/erase tool interactions
 */

import React, { useCallback, useRef, useState } from "react";
import { usePianoRollStore } from "./store";
import { velocityToColor, snapToGrid, snapToGridFloor, snapValueToBeats } from "./types";
import type { Note } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PITCH = 127;
const NOTE_RESIZE_HANDLE_WIDTH = 6;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface NoteGridProps {
  /** Total width of the visible grid in pixels. */
  width?: number;
  /** Total visible height in pixels. */
  height?: number;
}

export const NoteGrid: React.FC<NoteGridProps> = React.memo(
  ({ width = 800, height = 600 }) => {
    const notes = usePianoRollStore((s) => s.notes);
    const selectedNoteIds = usePianoRollStore((s) => s.selectedNoteIds);
    const zoomX = usePianoRollStore((s) => s.zoomX);
    const zoomY = usePianoRollStore((s) => s.zoomY);
    const scrollX = usePianoRollStore((s) => s.scrollX);
    const scrollY = usePianoRollStore((s) => s.scrollY);
    const tool = usePianoRollStore((s) => s.tool);
    const snapEnabled = usePianoRollStore((s) => s.snapEnabled);
    const snapValue = usePianoRollStore((s) => s.snapValue);

    const addNote = usePianoRollStore((s) => s.addNote);
    const removeNote = usePianoRollStore((s) => s.removeNote);
    const selectNote = usePianoRollStore((s) => s.selectNote);
    const clearSelection = usePianoRollStore((s) => s.clearSelection);
    const moveSelectedNotes = usePianoRollStore((s) => s.moveSelectedNotes);
    const setSelectionRect = usePianoRollStore((s) => s.setSelectionRect);
    const selectNotesInRect = usePianoRollStore((s) => s.selectNotesInRect);
    const toggleNoteSelection = usePianoRollStore((s) => s.toggleNoteSelection);

    const gridRef = useRef<HTMLDivElement>(null);
    const [dragState, setDragState] = useState<{
      type: "move" | "resize" | "rubberband" | "draw";
      startX: number;
      startY: number;
      noteId?: string;
      origStart?: number;
      origPitch?: number;
      origDuration?: number;
    } | null>(null);

    // --- Coordinate conversion ---

    const beatToX = useCallback(
      (beat: number) => (beat - scrollX) * zoomX,
      [scrollX, zoomX],
    );

    const xToBeat = useCallback(
      (x: number) => x / zoomX + scrollX,
      [scrollX, zoomX],
    );

    const pitchToY = useCallback(
      (pitch: number) => (scrollY - pitch) * zoomY,
      [scrollY, zoomY],
    );

    const yToPitch = useCallback(
      (y: number) => Math.round(scrollY - y / zoomY),
      [scrollY, zoomY],
    );

    // --- Grid background (beat lines + pitch rows) ---

    const renderGridLines = useCallback(() => {
      const lines: React.ReactNode[] = [];
      const totalBeats = width / zoomX + scrollX + 4;
      const gridSize = snapEnabled ? snapValueToBeats(snapValue) : 1;

      // Vertical beat lines
      const startBeat = Math.floor(scrollX / gridSize) * gridSize;
      for (let beat = startBeat; beat < totalBeats; beat += gridSize) {
        const x = beatToX(beat);
        if (x < -1 || x > width + 1) continue;
        const isBeatBoundary = Math.abs(beat - Math.round(beat)) < 0.001;
        const isBarBoundary = Math.abs(beat % 4) < 0.001;
        lines.push(
          <line
            key={`v-${beat}`}
            x1={x}
            y1={0}
            x2={x}
            y2={128 * zoomY}
            stroke={isBarBoundary ? "#555" : isBeatBoundary ? "#444" : "#333"}
            strokeWidth={isBarBoundary ? 1.5 : 0.5}
          />,
        );
      }

      // Horizontal pitch rows
      for (let pitch = 0; pitch <= 127; pitch++) {
        const y = pitchToY(pitch) + zoomY;
        const isC = pitch % 12 === 0;
        lines.push(
          <line
            key={`h-${pitch}`}
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke={isC ? "#555" : "#333"}
            strokeWidth={isC ? 1 : 0.5}
          />,
        );
      }

      return (
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 128 * zoomY,
            pointerEvents: "none",
          }}
        >
          {lines}
        </svg>
      );
    }, [width, zoomX, zoomY, scrollX, scrollY, beatToX, pitchToY, snapEnabled, snapValue]);

    // --- Note rendering ---

    const renderNote = useCallback(
      (note: Note) => {
        const x = beatToX(note.start);
        const y = pitchToY(note.pitch);
        const w = note.duration * zoomX;
        const isSelected = selectedNoteIds.has(note.id);
        const color = velocityToColor(note.velocity);

        return (
          <div
            key={note.id}
            data-testid={`note-${note.id}`}
            data-note-id={note.id}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: Math.max(w, 2),
              height: zoomY - 1,
              background: color,
              border: isSelected ? "2px solid #fff" : "1px solid rgba(0,0,0,0.3)",
              borderRadius: 2,
              cursor: tool === "erase" ? "crosshair" : "pointer",
              boxSizing: "border-box",
              opacity: 0.9,
              zIndex: isSelected ? 2 : 1,
            }}
            onMouseDown={(e) => {
              e.stopPropagation();

              if (tool === "erase") {
                removeNote(note.id);
                return;
              }

              if (tool === "select") {
                // Check if clicking near right edge (resize handle)
                const rect = e.currentTarget.getBoundingClientRect();
                const localX = e.clientX - rect.left;
                if (localX > rect.width - NOTE_RESIZE_HANDLE_WIDTH) {
                  // Resize mode
                  if (!isSelected) {
                    selectNote(note.id);
                  }
                  setDragState({
                    type: "resize",
                    startX: e.clientX,
                    startY: e.clientY,
                    noteId: note.id,
                    origDuration: note.duration,
                  });
                  return;
                }

                // Move mode
                if (e.shiftKey) {
                  toggleNoteSelection(note.id);
                } else if (!isSelected) {
                  selectNote(note.id);
                }
                setDragState({
                  type: "move",
                  startX: e.clientX,
                  startY: e.clientY,
                  noteId: note.id,
                  origStart: note.start,
                  origPitch: note.pitch,
                });
              }
            }}
          >
            {/* Resize handle on the right edge */}
            {tool === "select" && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  width: NOTE_RESIZE_HANDLE_WIDTH,
                  height: "100%",
                  cursor: "ew-resize",
                }}
              />
            )}
          </div>
        );
      },
      [
        beatToX,
        pitchToY,
        zoomX,
        zoomY,
        selectedNoteIds,
        tool,
        removeNote,
        selectNote,
        toggleNoteSelection,
      ],
    );

    // --- Mouse handlers for grid background ---

    const handleGridMouseDown = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!gridRef.current) return;
        const rect = gridRef.current.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const beat = xToBeat(localX);
        const pitch = yToPitch(localY);

        if (tool === "draw") {
          // Create a new note
          const snappedStart = snapEnabled
            ? snapToGridFloor(beat, snapValue)
            : beat;
          const duration = snapEnabled ? snapValueToBeats(snapValue) : 0.25;
          const clampedPitch = Math.max(0, Math.min(127, pitch));
          addNote({
            pitch: clampedPitch,
            start: Math.max(0, snappedStart),
            duration,
            velocity: 100,
          });
          return;
        }

        if (tool === "select") {
          // Start rubber-band selection
          clearSelection();
          setDragState({
            type: "rubberband",
            startX: e.clientX,
            startY: e.clientY,
          });
          setSelectionRect({
            startBeat: beat,
            endBeat: beat,
            startPitch: pitch,
            endPitch: pitch,
          });
        }
      },
      [
        tool,
        snapEnabled,
        snapValue,
        xToBeat,
        yToPitch,
        addNote,
        clearSelection,
        setSelectionRect,
      ],
    );

    const handleGridMouseMove = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!dragState || !gridRef.current) return;
        const rect = gridRef.current.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;

        if (dragState.type === "rubberband") {
          const beat = xToBeat(localX);
          const pitch = yToPitch(localY);
          const startBeat = xToBeat(dragState.startX - rect.left);
          const startPitch = yToPitch(dragState.startY - rect.top);
          setSelectionRect({
            startBeat,
            endBeat: beat,
            startPitch,
            endPitch: pitch,
          });
        }

        if (dragState.type === "move") {
          const dx = e.clientX - dragState.startX;
          const dy = e.clientY - dragState.startY;
          const deltaBeat = dx / zoomX;
          const deltaPitch = -Math.round(dy / zoomY);
          // We apply delta relative to original for smooth dragging
          // This is handled per-frame, so we use moveSelectedNotes
          // with incremental deltas
          const snappedDeltaBeat = snapEnabled
            ? snapToGrid(deltaBeat, snapValue)
            : deltaBeat;
          moveSelectedNotes(deltaPitch, snappedDeltaBeat);
          setDragState({
            ...dragState,
            startX: e.clientX,
            startY: e.clientY,
          });
        }

        if (dragState.type === "resize" && dragState.noteId && dragState.origDuration != null) {
          const dx = e.clientX - dragState.startX;
          const deltaDuration = dx / zoomX;
          const store = usePianoRollStore.getState();
          const note = store.notes.find((n) => n.id === dragState.noteId);
          if (note) {
            const newDuration = Math.max(0.0625, dragState.origDuration + deltaDuration);
            usePianoRollStore.getState().resizeNote(note.id, newDuration);
          }
        }
      },
      [dragState, xToBeat, yToPitch, zoomX, zoomY, snapEnabled, snapValue, moveSelectedNotes, setSelectionRect],
    );

    const handleGridMouseUp = useCallback(() => {
      if (dragState?.type === "rubberband") {
        const selRect = usePianoRollStore.getState().selectionRect;
        if (selRect) {
          selectNotesInRect(selRect);
        }
      }
      setDragState(null);
    }, [dragState, selectNotesInRect]);

    // --- Render ---

    const selectionRect = usePianoRollStore((s) => s.selectionRect);

    return (
      <div
        ref={gridRef}
        data-testid="note-grid"
        onMouseDown={handleGridMouseDown}
        onMouseMove={handleGridMouseMove}
        onMouseUp={handleGridMouseUp}
        onMouseLeave={handleGridMouseUp}
        style={{
          position: "relative",
          flex: 1,
          height: 128 * zoomY,
          background: "#1e1e1e",
          overflow: "hidden",
          cursor:
            tool === "draw"
              ? "crosshair"
              : tool === "erase"
                ? "crosshair"
                : "default",
        }}
      >
        {renderGridLines()}
        {notes.map(renderNote)}

        {/* Rubber-band selection rectangle */}
        {selectionRect && (
          <div
            data-testid="selection-rect"
            style={{
              position: "absolute",
              left: beatToX(Math.min(selectionRect.startBeat, selectionRect.endBeat)),
              top: pitchToY(Math.max(selectionRect.startPitch, selectionRect.endPitch)),
              width:
                Math.abs(selectionRect.endBeat - selectionRect.startBeat) * zoomX,
              height:
                (Math.abs(selectionRect.endPitch - selectionRect.startPitch) + 1) * zoomY,
              border: "1px dashed rgba(100, 150, 255, 0.8)",
              background: "rgba(100, 150, 255, 0.15)",
              pointerEvents: "none",
              zIndex: 10,
            }}
          />
        )}
      </div>
    );
  },
);

NoteGrid.displayName = "NoteGrid";
