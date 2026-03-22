/**
 * Waveform Component
 *
 * Canvas-based time-domain waveform display. Renders audio samples as a
 * continuous waveform line or filled shape.
 *
 * Accepts data as a prop so it works with both live engine data and
 * mock/demo data.
 */

import React, { useRef, useEffect, useCallback } from "react";
import type { WaveformStyle, ColorScheme } from "./store.js";
import { DEFAULT_COLOR_SCHEME } from "./store.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WaveformProps {
  /** Time-domain sample data to render. */
  data: Float64Array;

  /** Canvas width in CSS pixels. */
  width?: number;

  /** Canvas height in CSS pixels. */
  height?: number;

  /** Drawing style: "line" or "filled". */
  style?: WaveformStyle;

  /** Color scheme override. */
  colorScheme?: Partial<ColorScheme>;

  /** Auto-scale to fit the peak value, or use fixed [-1, 1] range. */
  autoScale?: boolean;

  /** Whether the display is frozen (shows static indicator). */
  frozen?: boolean;

  /** Device pixel ratio for sharp rendering (default: 1). */
  pixelRatio?: number;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * Draw the waveform onto a 2D canvas context.
 * Exported for testability (logic can be verified without a real canvas).
 */
export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  data: Float64Array,
  width: number,
  height: number,
  waveformStyle: WaveformStyle,
  colors: ColorScheme,
  autoScale: boolean,
): void {
  // Clear
  ctx.fillStyle = colors.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (data.length === 0) {
    // Draw center line only
    drawCenterLine(ctx, width, height, colors.gridColor);
    return;
  }

  // Determine vertical scale
  let scale = 1.0;
  if (autoScale) {
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
    if (peak > 0) {
      scale = 1.0 / peak;
    }
  }

  const centerY = height / 2;

  // Draw grid center line
  drawCenterLine(ctx, width, height, colors.gridColor);

  // Compute step: how many samples per pixel
  const step = data.length / width;

  if (waveformStyle === "filled") {
    drawFilledWaveform(ctx, data, width, height, centerY, scale, step, colors.waveformColor);
  } else {
    drawLineWaveform(ctx, data, width, height, centerY, scale, step, colors.waveformColor);
  }
}

function drawCenterLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawLineWaveform(
  ctx: CanvasRenderingContext2D,
  data: Float64Array,
  width: number,
  height: number,
  centerY: number,
  scale: number,
  step: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.beginPath();

  for (let x = 0; x < width; x++) {
    const sampleIdx = Math.floor(x * step);
    const clampedIdx = Math.min(sampleIdx, data.length - 1);
    const sample = data[clampedIdx] * scale;
    const y = centerY - sample * (height / 2) * 0.9; // 90% of half-height

    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

function drawFilledWaveform(
  ctx: CanvasRenderingContext2D,
  data: Float64Array,
  width: number,
  _height: number,
  centerY: number,
  scale: number,
  step: number,
  color: string,
): void {
  const halfH = centerY * 0.9;

  ctx.fillStyle = color + "40"; // 25% opacity
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(0, centerY);

  for (let x = 0; x < width; x++) {
    const sampleIdx = Math.floor(x * step);
    const clampedIdx = Math.min(sampleIdx, data.length - 1);
    const sample = data[clampedIdx] * scale;
    const y = centerY - sample * halfH;
    ctx.lineTo(x, y);
  }

  // Close the path back to center line
  ctx.lineTo(width, centerY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// React Component
// ---------------------------------------------------------------------------

export const Waveform: React.FC<WaveformProps> = ({
  data,
  width = 512,
  height = 200,
  style = "line",
  colorScheme,
  autoScale = true,
  frozen = false,
  pixelRatio = 1,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors: ColorScheme = { ...DEFAULT_COLOR_SCHEME, ...colorScheme };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = width * pixelRatio;
    const h = height * pixelRatio;
    canvas.width = w;
    canvas.height = h;
    ctx.scale(pixelRatio, pixelRatio);

    drawWaveform(ctx, data, width, height, style, colors, autoScale);

    // Frozen indicator
    if (frozen) {
      ctx.fillStyle = "#ef4444";
      ctx.font = "11px monospace";
      ctx.fillText("FROZEN", 8, 16);
    }
  }, [data, width, height, style, colors, autoScale, frozen, pixelRatio]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        display: "block",
        borderRadius: 0,
        border: "3px solid #000",
      }}
    />
  );
};
