/**
 * Slider — Horizontal slider with numeric display.
 *
 * A standard range input paired with a NumberInput for direct editing.
 * Supports min/max/step constraints.
 */

import React, { useCallback } from "react";
import { NumberInput } from "./NumberInput.js";

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  "data-testid"?: string;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  "data-testid": testId,
}) => {
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value));
    },
    [onChange],
  );

  return (
    <div
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "4px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <label style={{ fontSize: 12, color: "#ffffff", fontWeight: 700, fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace' }}>{label}</label>
        <NumberInput
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          onChange={onChange}
          data-testid={testId ? `${testId}-number` : undefined}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleSliderChange}
        aria-label={label}
        data-testid={testId ? `${testId}-range` : undefined}
        style={{ width: "100%", cursor: "pointer", accentColor: "#00ff41" }}
      />
    </div>
  );
};
