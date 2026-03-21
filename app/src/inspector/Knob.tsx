/**
 * Knob — CSS-based rotary knob control.
 *
 * Uses pointer events for drag-based rotation. The visual indicator is a
 * CSS-rendered arc that rotates from ~7-o'clock (min) to ~5-o'clock (max),
 * spanning 270 degrees.
 */

import React, { useCallback, useRef } from "react";
import { NumberInput } from "./NumberInput.js";

export interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  size?: number;
  onChange: (value: number) => void;
  "data-testid"?: string;
}

const ARC_DEGREES = 270;
const START_ANGLE = 135; // 7-o'clock position in CSS degrees

function valueToDeg(value: number, min: number, max: number): number {
  const ratio = (value - min) / (max - min || 1);
  return START_ANGLE + ratio * ARC_DEGREES;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min,
  max,
  step,
  unit,
  size = 48,
  onChange,
  "data-testid": testId,
}) => {
  const dragStartY = useRef<number | null>(null);
  const dragStartValue = useRef(value);

  const sensitivity = (max - min) / 200; // full range over 200px drag

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragStartY.current = e.clientY;
      dragStartValue.current = value;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [value],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragStartY.current === null) return;
      const dy = dragStartY.current - e.clientY; // up = positive
      let newValue = dragStartValue.current + dy * sensitivity;
      // Snap to step
      if (step > 0) {
        newValue = Math.round((newValue - min) / step) * step + min;
      }
      newValue = clamp(newValue, min, max);
      onChange(parseFloat(newValue.toFixed(10)));
    },
    [min, max, step, sensitivity, onChange],
  );

  const handlePointerUp = useCallback(() => {
    dragStartY.current = null;
  }, []);

  const rotation = valueToDeg(value, min, max);

  return (
    <div
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "4px 0",
        userSelect: "none",
      }}
    >
      <span style={{ fontSize: 11, color: "#aaa" }}>{label}</span>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        data-testid={testId ? `${testId}-dial` : undefined}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "conic-gradient(from 135deg, #3b82f6 0deg, #3b82f6 " +
            ((rotation - START_ANGLE) + "deg") +
            ", #333 " + ((rotation - START_ANGLE) + "deg") +
            ", #333 270deg, transparent 270deg)",
          position: "relative",
          cursor: "grab",
          border: "2px solid #555",
          boxSizing: "border-box",
        }}
      >
        {/* Indicator dot */}
        <div
          style={{
            position: "absolute",
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "#fff",
            top: "50%",
            left: "50%",
            transform: `rotate(${rotation}deg) translate(0, -${size / 2 - 6}px) translate(-50%, -50%)`,
            transformOrigin: "0 0",
          }}
        />
      </div>
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
  );
};
