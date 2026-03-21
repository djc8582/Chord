/**
 * NumberInput — Direct numeric text input control.
 *
 * Allows the user to type a numeric value directly. Validates against
 * min/max/step constraints. Calls onChange with the clamped value.
 */

import React, { useState, useCallback, useEffect } from "react";

export interface NumberInputProps {
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  "data-testid"?: string;
}

/** Clamp a value between min and max, then snap to step. */
function clampAndSnap(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  if (step > 0) {
    const snapped = Math.round((clamped - min) / step) * step + min;
    // Re-clamp after snapping to handle floating point drift
    return Math.min(max, Math.max(min, parseFloat(snapped.toFixed(10))));
  }
  return clamped;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  min,
  max,
  step,
  unit,
  onChange,
  "data-testid": testId,
}) => {
  const [localValue, setLocalValue] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  // Sync external value when not focused
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(String(value));
    }
  }, [value, isFocused]);

  const commit = useCallback(
    (raw: string) => {
      const parsed = parseFloat(raw);
      if (Number.isNaN(parsed)) {
        setLocalValue(String(value));
        return;
      }
      const final = clampAndSnap(parsed, min, max, step);
      setLocalValue(String(final));
      onChange(final);
    },
    [min, max, step, value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commit(localValue);
        (e.target as HTMLInputElement).blur();
      }
      if (e.key === "Escape") {
        setLocalValue(String(value));
        (e.target as HTMLInputElement).blur();
      }
    },
    [commit, localValue, value],
  );

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
      data-testid={testId}
    >
      <input
        type="text"
        inputMode="decimal"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          commit(localValue);
        }}
        onKeyDown={handleKeyDown}
        aria-label="numeric value"
        data-testid={testId ? `${testId}-input` : undefined}
        style={{
          width: 60,
          padding: "2px 4px",
          border: "1px solid #555",
          borderRadius: 3,
          background: "#1a1a1a",
          color: "#e0e0e0",
          fontSize: 12,
          textAlign: "right",
          outline: "none",
        }}
      />
      {unit ? (
        <span style={{ fontSize: 11, color: "#888" }}>{unit}</span>
      ) : null}
    </span>
  );
};
