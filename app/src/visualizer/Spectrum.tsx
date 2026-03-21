/**
 * Spectrum Component
 *
 * Canvas-based frequency spectrum display. Renders FFT magnitude data as
 * either a bar chart or continuous line, with optional logarithmic frequency
 * scale, dB magnitude scale, and peak hold.
 */

import React, { useRef, useEffect, useCallback } from "react";
import type { SpectrumStyle, ColorScheme, FftSize } from "./store.js";
import { DEFAULT_COLOR_SCHEME } from "./store.js";
import { linearToLogPositions, magnitudeToDb } from "./dsp.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SpectrumProps {
  /** Spectrum magnitude data (first N/2 bins, linear magnitude). */
  data: Float64Array;

  /** Optional peak-hold data (same shape as data). */
  peakData?: Float64Array;

  /** Canvas width in CSS pixels. */
  width?: number;

  /** Canvas height in CSS pixels. */
  height?: number;

  /** Drawing style: "bars" or "line". */
  style?: SpectrumStyle;

  /** Color scheme override. */
  colorScheme?: Partial<ColorScheme>;

  /** Use logarithmic frequency scale. */
  logScale?: boolean;

  /** Use dB scale for magnitude. */
  dbScale?: boolean;

  /** FFT size (used to determine bin count). */
  fftSize?: FftSize;

  /** Sample rate in Hz (for frequency axis labels). */
  sampleRate?: number;

  /** Min dB for dB scale (default: -100). */
  minDb?: number;

  /** Max dB for dB scale (default: 0). */
  maxDb?: number;

  /** Device pixel ratio for sharp rendering (default: 1). */
  pixelRatio?: number;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * Draw the frequency spectrum onto a 2D canvas context.
 * Exported for testability.
 */
export function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  data: Float64Array,
  peakData: Float64Array | null,
  width: number,
  height: number,
  spectrumStyle: SpectrumStyle,
  colors: ColorScheme,
  logScale: boolean,
  dbScale: boolean,
  sampleRate: number,
  minDb: number,
  maxDb: number,
): void {
  // Clear
  ctx.fillStyle = colors.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (data.length === 0) return;

  const binCount = data.length;

  // Compute positions for each bin on the x-axis
  let xPositions: Float64Array;
  if (logScale) {
    xPositions = linearToLogPositions(binCount, sampleRate);
  } else {
    xPositions = new Float64Array(binCount);
    for (let i = 0; i < binCount; i++) {
      xPositions[i] = i / binCount;
    }
  }

  // Compute y values (normalized 0..1 from bottom)
  let yValues: Float64Array;
  if (dbScale) {
    const dbData = magnitudeToDb(data, minDb);
    yValues = new Float64Array(binCount);
    const dbRange = maxDb - minDb;
    for (let i = 0; i < binCount; i++) {
      yValues[i] = Math.max(0, Math.min(1, (dbData[i] - minDb) / dbRange));
    }
  } else {
    // Linear scale: normalize by max value
    let maxVal = 0;
    for (let i = 0; i < binCount; i++) {
      if (data[i] > maxVal) maxVal = data[i];
    }
    yValues = new Float64Array(binCount);
    if (maxVal > 0) {
      for (let i = 0; i < binCount; i++) {
        yValues[i] = data[i] / maxVal;
      }
    }
  }

  // Draw grid lines
  drawGrid(ctx, width, height, colors.gridColor, dbScale, minDb, maxDb);

  if (spectrumStyle === "bars") {
    drawBars(ctx, xPositions, yValues, width, height, colors.spectrumColor);
  } else {
    drawLine(ctx, xPositions, yValues, width, height, colors.spectrumColor);
  }

  // Draw peak hold
  if (peakData && peakData.length > 0) {
    let peakY: Float64Array;
    if (dbScale) {
      const dbPeak = magnitudeToDb(peakData, minDb);
      peakY = new Float64Array(peakData.length);
      const dbRange = maxDb - minDb;
      for (let i = 0; i < peakData.length; i++) {
        peakY[i] = Math.max(0, Math.min(1, (dbPeak[i] - minDb) / dbRange));
      }
    } else {
      let maxVal = 0;
      for (let i = 0; i < peakData.length; i++) {
        if (peakData[i] > maxVal) maxVal = peakData[i];
      }
      peakY = new Float64Array(peakData.length);
      if (maxVal > 0) {
        for (let i = 0; i < peakData.length; i++) {
          peakY[i] = peakData[i] / maxVal;
        }
      }
    }
    drawPeakLine(ctx, xPositions, peakY, width, height, colors.peakColor);
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  dbScale: boolean,
  minDb: number,
  maxDb: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 4]);

  if (dbScale) {
    // Draw horizontal lines at -12, -24, -48, -96 dB
    const dbRange = maxDb - minDb;
    const dbLines = [-12, -24, -48, -96];
    for (const db of dbLines) {
      if (db < minDb || db > maxDb) continue;
      const y = height - ((db - minDb) / dbRange) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else {
    // Draw horizontal lines at 25%, 50%, 75%
    for (const frac of [0.25, 0.5, 0.75]) {
      const y = height * (1 - frac);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  ctx.setLineDash([]);
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  xPositions: Float64Array,
  yValues: Float64Array,
  width: number,
  height: number,
  color: string,
): void {
  const binCount = xPositions.length;
  ctx.fillStyle = color;

  for (let i = 0; i < binCount; i++) {
    const x = xPositions[i] * width;
    const nextX = i < binCount - 1 ? xPositions[i + 1] * width : width;
    const barWidth = Math.max(1, (nextX - x) - 1);
    const barHeight = yValues[i] * height;

    ctx.fillRect(x, height - barHeight, barWidth, barHeight);
  }
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  xPositions: Float64Array,
  yValues: Float64Array,
  width: number,
  height: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.beginPath();

  let started = false;
  for (let i = 0; i < xPositions.length; i++) {
    const x = xPositions[i] * width;
    const y = height - yValues[i] * height;

    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

function drawPeakLine(
  ctx: CanvasRenderingContext2D,
  xPositions: Float64Array,
  peakY: Float64Array,
  width: number,
  height: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();

  let started = false;
  for (let i = 0; i < xPositions.length; i++) {
    const x = xPositions[i] * width;
    const y = height - peakY[i] * height;

    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.setLineDash([]);
}

// ---------------------------------------------------------------------------
// React Component
// ---------------------------------------------------------------------------

export const Spectrum: React.FC<SpectrumProps> = ({
  data,
  peakData,
  width = 512,
  height = 200,
  style = "bars",
  colorScheme,
  logScale = true,
  dbScale = true,
  sampleRate = 44100,
  minDb = -100,
  maxDb = 0,
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

    drawSpectrum(
      ctx,
      data,
      peakData ?? null,
      width,
      height,
      style,
      colors,
      logScale,
      dbScale,
      sampleRate,
      minDb,
      maxDb,
    );
  }, [data, peakData, width, height, style, colors, logScale, dbScale, sampleRate, minDb, maxDb, pixelRatio]);

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
        borderRadius: 4,
      }}
    />
  );
};
