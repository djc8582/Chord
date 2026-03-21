/**
 * PianoKeyboard Component
 *
 * Vertical piano keyboard rendered on the left edge of the piano roll.
 * Shows note names, highlights black/white keys, and supports click-to-preview.
 */

import React, { useCallback } from "react";
import { midiPitchToName, isBlackKey } from "./types";
import { usePianoRollStore } from "./store";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Width of the piano keyboard in pixels. */
export const KEYBOARD_WIDTH = 64;

/** Total MIDI pitch range: 0 (C-1) to 127 (G9). */
const MIN_PITCH = 0;
const MAX_PITCH = 127;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface PianoKeyboardProps {
  /** Optional callback when a key is clicked (for preview/auditioning). */
  onKeyClick?: (pitch: number) => void;
}

export const PianoKeyboard: React.FC<PianoKeyboardProps> = React.memo(
  ({ onKeyClick }) => {
    const zoomY = usePianoRollStore((s) => s.zoomY);
    const scrollY = usePianoRollStore((s) => s.scrollY);

    const handleKeyClick = useCallback(
      (pitch: number) => {
        onKeyClick?.(pitch);
      },
      [onKeyClick],
    );

    // Build the list of visible keys. We render top-to-bottom (high pitch first).
    const keys: React.ReactNode[] = [];
    for (let pitch = MAX_PITCH; pitch >= MIN_PITCH; pitch--) {
      const row = MAX_PITCH - pitch;
      const y = (row - (MAX_PITCH - scrollY)) * zoomY;
      const black = isBlackKey(pitch);
      const isC = pitch % 12 === 0;
      const name = midiPitchToName(pitch);

      keys.push(
        <div
          key={pitch}
          data-testid={`piano-key-${pitch}`}
          data-pitch={pitch}
          onClick={() => handleKeyClick(pitch)}
          style={{
            position: "absolute",
            top: y,
            left: 0,
            width: KEYBOARD_WIDTH,
            height: zoomY,
            boxSizing: "border-box",
            background: black ? "#2a2a2a" : "#f0f0f0",
            color: black ? "#bbb" : "#333",
            borderBottom: isC ? "2px solid #666" : "1px solid #ccc",
            fontSize: 10,
            lineHeight: `${zoomY}px`,
            paddingLeft: 4,
            cursor: "pointer",
            userSelect: "none",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {(isC || pitch === MAX_PITCH) && (
            <span style={{ fontSize: 9, fontFamily: "monospace" }}>
              {name}
            </span>
          )}
        </div>,
      );
    }

    return (
      <div
        data-testid="piano-keyboard"
        style={{
          position: "relative",
          width: KEYBOARD_WIDTH,
          height: 128 * zoomY,
          overflow: "hidden",
          flexShrink: 0,
          borderRight: "2px solid #555",
          background: "#e8e8e8",
        }}
      >
        {keys}
      </div>
    );
  },
);

PianoKeyboard.displayName = "PianoKeyboard";
