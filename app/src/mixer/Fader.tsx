/**
 * Fader Component
 *
 * A vertical slider control for volume faders. Maps a linear slider
 * position (0..1) to/from dB values for display.
 */

import React, { useCallback } from "react";
import { faderToDb, dbToFader, FADER_MIN_DB, MAX_DB } from "./store.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FaderProps {
  /** Current volume in dB. */
  valueDb: number;
  /** Called when the user changes the fader position, with the new dB value. */
  onChange: (db: number) => void;
  /** Test ID prefix for testing. */
  "data-testid"?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Fader: React.FC<FaderProps> = React.memo(function Fader({
  valueDb,
  onChange,
  "data-testid": testId = "fader",
}) {
  const faderPosition = dbToFader(valueDb);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const linear = parseFloat(e.target.value);
      onChange(faderToDb(linear));
    },
    [onChange],
  );

  // Format dB display
  const dbDisplay = !isFinite(valueDb)
    ? "-inf"
    : valueDb >= 0
      ? `+${valueDb.toFixed(1)}`
      : valueDb.toFixed(1);

  return (
    <div
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      {/* orient is a non-standard Firefox attribute for vertical sliders;
          writingMode + direction handles WebKit/Blink browsers */}
      <input
        data-testid={`${testId}-input`}
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={faderPosition}
        onChange={handleChange}
        aria-label="Volume fader"
        aria-valuemin={FADER_MIN_DB}
        aria-valuemax={MAX_DB}
        aria-valuenow={isFinite(valueDb) ? valueDb : FADER_MIN_DB}
        aria-orientation="vertical"
        style={{
          writingMode: "vertical-lr",
          direction: "rtl",
          width: 24,
          height: 120,
        } as React.CSSProperties}
      />
      <span
        data-testid={`${testId}-display`}
        style={{ fontSize: 10, fontFamily: "monospace", userSelect: "none" }}
      >
        {dbDisplay} dB
      </span>
    </div>
  );
});
