/**
 * WaveformEditor Component
 *
 * Canvas-based waveform display with:
 * - Zoomable waveform rendering
 * - Selection highlighting (click+drag to select range)
 * - Playhead indicator
 * - Time ruler
 * - Toolbar with operation buttons
 *
 * Follows the pattern set by visualizer/Waveform.tsx — uses a canvas ref
 * and imperative drawing.
 */

import React, { useRef, useEffect, useCallback, useState } from "react";
import { useAudioEditorStore } from "./store.js";
import type { AudioBuffer, SelectionRange } from "./types.js";
import { bufferLength } from "./operations.js";
import * as ops from "./operations.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WaveformEditorProps {
  /** Canvas width in CSS pixels. */
  width?: number;
  /** Canvas height in CSS pixels. */
  height?: number;
}

// ---------------------------------------------------------------------------
// Drawing constants
// ---------------------------------------------------------------------------

const RULER_HEIGHT = 24;
const WAVEFORM_BG = "#1a1a2e";
const WAVEFORM_COLOR = "#22d3ee";
const SELECTION_COLOR = "rgba(59, 130, 246, 0.3)";
const SELECTION_BORDER = "rgba(59, 130, 246, 0.7)";
const PLAYHEAD_COLOR = "#ef4444";
const RULER_BG = "#16213e";
const RULER_TEXT = "#94a3b8";
const RULER_LINE = "#334155";
const CENTER_LINE = "#334155";

// ---------------------------------------------------------------------------
// Drawing utilities (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Draw the time ruler at the top of the canvas.
 */
export function drawRuler(
  ctx: CanvasRenderingContext2D,
  width: number,
  scrollSample: number,
  samplesPerPixel: number,
  sampleRate: number,
): void {
  ctx.fillStyle = RULER_BG;
  ctx.fillRect(0, 0, width, RULER_HEIGHT);

  ctx.strokeStyle = RULER_LINE;
  ctx.lineWidth = 1;
  ctx.fillStyle = RULER_TEXT;
  ctx.font = "10px monospace";

  // Determine a good tick interval in seconds
  const secondsPerPixel = samplesPerPixel / sampleRate;
  const minTickPx = 80; // minimum pixels between ticks
  const minTickSeconds = secondsPerPixel * minTickPx;

  // Snap to nice intervals
  const niceIntervals = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60];
  let tickInterval = niceIntervals[niceIntervals.length - 1];
  for (const interval of niceIntervals) {
    if (interval >= minTickSeconds) {
      tickInterval = interval;
      break;
    }
  }

  const startSeconds = scrollSample / sampleRate;
  const endSeconds = startSeconds + (width * samplesPerPixel) / sampleRate;
  const firstTick = Math.ceil(startSeconds / tickInterval) * tickInterval;

  for (let t = firstTick; t <= endSeconds; t += tickInterval) {
    const px = (t * sampleRate - scrollSample) / samplesPerPixel;
    if (px < 0 || px > width) continue;

    ctx.beginPath();
    ctx.moveTo(px, RULER_HEIGHT - 6);
    ctx.lineTo(px, RULER_HEIGHT);
    ctx.stroke();

    // Format time label
    const label = t >= 1 ? `${t.toFixed(1)}s` : `${(t * 1000).toFixed(0)}ms`;
    ctx.fillText(label, px + 3, RULER_HEIGHT - 8);
  }

  // Bottom border
  ctx.beginPath();
  ctx.moveTo(0, RULER_HEIGHT);
  ctx.lineTo(width, RULER_HEIGHT);
  ctx.stroke();
}

/**
 * Draw the waveform data for the visible region.
 */
export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  buffer: AudioBuffer,
  width: number,
  height: number,
  scrollSample: number,
  samplesPerPixel: number,
): void {
  const waveHeight = height - RULER_HEIGHT;
  const centerY = RULER_HEIGHT + waveHeight / 2;
  const halfH = waveHeight / 2 * 0.9;
  const len = bufferLength(buffer);

  // Background
  ctx.fillStyle = WAVEFORM_BG;
  ctx.fillRect(0, RULER_HEIGHT, width, waveHeight);

  // Center line
  ctx.strokeStyle = CENTER_LINE;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (len === 0) return;

  // Draw first channel (or average of all channels)
  ctx.strokeStyle = WAVEFORM_COLOR;
  ctx.lineWidth = 1;

  // For each pixel, find min/max sample in that pixel's range
  const numChannels = buffer.channels.length;
  ctx.beginPath();

  for (let px = 0; px < width; px++) {
    const sampleStart = Math.floor(scrollSample + px * samplesPerPixel);
    const sampleEnd = Math.floor(scrollSample + (px + 1) * samplesPerPixel);

    if (sampleStart >= len) break;

    let min = Infinity;
    let max = -Infinity;

    const end = Math.min(sampleEnd, len);
    for (let s = sampleStart; s < end; s++) {
      if (s < 0) continue;
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += buffer.channels[ch][s];
      }
      const avg = sum / numChannels;
      if (avg < min) min = avg;
      if (avg > max) max = avg;
    }

    if (min === Infinity) continue;

    const yMin = centerY - max * halfH;
    const yMax = centerY - min * halfH;

    ctx.moveTo(px, yMin);
    ctx.lineTo(px, yMax);
  }

  ctx.stroke();
}

/**
 * Draw the selection highlight overlay.
 */
export function drawSelection(
  ctx: CanvasRenderingContext2D,
  selection: SelectionRange,
  height: number,
  scrollSample: number,
  samplesPerPixel: number,
): void {
  const startPx = (selection.start - scrollSample) / samplesPerPixel;
  const endPx = (selection.end - scrollSample) / samplesPerPixel;
  const waveTop = RULER_HEIGHT;
  const waveHeight = height - RULER_HEIGHT;

  ctx.fillStyle = SELECTION_COLOR;
  ctx.fillRect(startPx, waveTop, endPx - startPx, waveHeight);

  ctx.strokeStyle = SELECTION_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(startPx, waveTop, endPx - startPx, waveHeight);
}

/**
 * Draw the playhead indicator.
 */
export function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  playheadSample: number,
  height: number,
  scrollSample: number,
  samplesPerPixel: number,
): void {
  const px = (playheadSample - scrollSample) / samplesPerPixel;
  if (px < 0) return;

  ctx.strokeStyle = PLAYHEAD_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, height);
  ctx.stroke();

  // Playhead triangle at top
  ctx.fillStyle = PLAYHEAD_COLOR;
  ctx.beginPath();
  ctx.moveTo(px - 5, 0);
  ctx.lineTo(px + 5, 0);
  ctx.lineTo(px, 8);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Toolbar Component
// ---------------------------------------------------------------------------

const Toolbar: React.FC = () => {
  const {
    buffer,
    selection,
    clipboard,
    tool,
    setTool,
    setClipboard,
    applyOperation,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useAudioEditorStore();

  const handleCut = useCallback(() => {
    if (!buffer || !selection) return;
    const copied = ops.copy(buffer, selection.start, selection.end);
    setClipboard(copied);
    const result = ops.cut(buffer, selection.start, selection.end);
    applyOperation("Cut", result, null);
  }, [buffer, selection, setClipboard, applyOperation]);

  const handleCopy = useCallback(() => {
    if (!buffer || !selection) return;
    const copied = ops.copy(buffer, selection.start, selection.end);
    setClipboard(copied);
  }, [buffer, selection, setClipboard]);

  const handlePaste = useCallback(() => {
    if (!buffer || !clipboard) return;
    const pos = selection ? selection.start : 0;
    const result = ops.paste(buffer, pos, clipboard);
    const pasteLen = ops.bufferLength(clipboard);
    applyOperation("Paste", result, { start: pos, end: pos + pasteLen });
  }, [buffer, clipboard, selection, applyOperation]);

  const handleNormalize = useCallback(() => {
    if (!buffer) return;
    const result = ops.normalize(buffer, 1.0);
    applyOperation("Normalize", result);
  }, [buffer, applyOperation]);

  const handleReverse = useCallback(() => {
    if (!buffer || !selection) return;
    const result = ops.reverse(buffer, selection.start, selection.end);
    applyOperation("Reverse", result);
  }, [buffer, selection, applyOperation]);

  const handleFadeIn = useCallback(() => {
    if (!buffer || !selection) return;
    const len = selection.end - selection.start;
    const result = ops.fadeIn(buffer, selection.start, len);
    applyOperation("Fade In", result);
  }, [buffer, selection, applyOperation]);

  const handleFadeOut = useCallback(() => {
    if (!buffer || !selection) return;
    const len = selection.end - selection.start;
    const result = ops.fadeOut(buffer, selection.start, len);
    applyOperation("Fade Out", result);
  }, [buffer, selection, applyOperation]);

  const handleSilence = useCallback(() => {
    if (!buffer || !selection) return;
    const result = ops.silence(buffer, selection.start, selection.end);
    applyOperation("Silence", result);
  }, [buffer, selection, applyOperation]);

  const handleGain = useCallback((gainValue: number) => {
    if (!buffer || !selection) return;
    const result = ops.gain(buffer, selection.start, selection.end, gainValue);
    applyOperation(`Gain ${gainValue}x`, result);
  }, [buffer, selection, applyOperation]);

  const hasSelection = !!selection;
  const hasBuffer = !!buffer;
  const hasClipboard = !!clipboard;

  const buttonStyle: React.CSSProperties = {
    padding: "4px 8px",
    fontSize: 12,
    fontFamily: "monospace",
    background: "#1e293b",
    color: "#e2e8f0",
    border: "1px solid #334155",
    borderRadius: 4,
    cursor: "pointer",
  };

  const disabledStyle: React.CSSProperties = {
    ...buttonStyle,
    opacity: 0.4,
    cursor: "default",
  };

  const activeToolStyle: React.CSSProperties = {
    ...buttonStyle,
    background: "#3b82f6",
    borderColor: "#60a5fa",
  };

  return (
    <div style={{ display: "flex", gap: 4, padding: "4px 0", flexWrap: "wrap" }}>
      {/* Tools */}
      <button style={tool === "select" ? activeToolStyle : buttonStyle} onClick={() => setTool("select")}>Select</button>
      <button style={tool === "cut" ? activeToolStyle : buttonStyle} onClick={() => setTool("cut")}>Cut Tool</button>
      <button style={tool === "draw" ? activeToolStyle : buttonStyle} onClick={() => setTool("draw")}>Draw</button>

      <span style={{ width: 1, background: "#334155", margin: "0 4px" }} />

      {/* Edit operations */}
      <button style={hasSelection ? buttonStyle : disabledStyle} onClick={handleCut} disabled={!hasSelection}>Cut</button>
      <button style={hasSelection ? buttonStyle : disabledStyle} onClick={handleCopy} disabled={!hasSelection}>Copy</button>
      <button style={hasClipboard ? buttonStyle : disabledStyle} onClick={handlePaste} disabled={!hasClipboard}>Paste</button>

      <span style={{ width: 1, background: "#334155", margin: "0 4px" }} />

      {/* Process operations */}
      <button style={hasBuffer ? buttonStyle : disabledStyle} onClick={handleNormalize} disabled={!hasBuffer}>Normalize</button>
      <button style={hasSelection ? buttonStyle : disabledStyle} onClick={handleReverse} disabled={!hasSelection}>Reverse</button>
      <button style={hasSelection ? buttonStyle : disabledStyle} onClick={handleFadeIn} disabled={!hasSelection}>Fade In</button>
      <button style={hasSelection ? buttonStyle : disabledStyle} onClick={handleFadeOut} disabled={!hasSelection}>Fade Out</button>
      <button style={hasSelection ? buttonStyle : disabledStyle} onClick={handleSilence} disabled={!hasSelection}>Silence</button>
      <button style={hasSelection ? buttonStyle : disabledStyle} onClick={() => handleGain(0.5)} disabled={!hasSelection}>-6dB</button>
      <button style={hasSelection ? buttonStyle : disabledStyle} onClick={() => handleGain(2.0)} disabled={!hasSelection}>+6dB</button>

      <span style={{ width: 1, background: "#334155", margin: "0 4px" }} />

      {/* Undo/Redo */}
      <button style={canUndo() ? buttonStyle : disabledStyle} onClick={undo} disabled={!canUndo()}>Undo</button>
      <button style={canRedo() ? buttonStyle : disabledStyle} onClick={redo} disabled={!canRedo()}>Redo</button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// WaveformEditor Component
// ---------------------------------------------------------------------------

export const WaveformEditor: React.FC<WaveformEditorProps> = ({
  width = 800,
  height = 300,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);

  const {
    buffer,
    selection,
    samplesPerPixel,
    scrollSample,
    playheadSample,
    setSelection,
    setPlayheadSample,
    setScrollSample,
    setSamplesPerPixel,
  } = useAudioEditorStore();

  // Convert pixel X to sample position
  const pxToSample = useCallback(
    (px: number) => Math.round(scrollSample + px * samplesPerPixel),
    [scrollSample, samplesPerPixel],
  );

  // Main draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = WAVEFORM_BG;
    ctx.fillRect(0, 0, width, height);

    const sr = buffer?.sampleRate ?? 44100;

    // Ruler
    drawRuler(ctx, width, scrollSample, samplesPerPixel, sr);

    // Waveform
    if (buffer) {
      drawWaveform(ctx, buffer, width, height, scrollSample, samplesPerPixel);
    }

    // Selection
    if (selection) {
      drawSelection(ctx, selection, height, scrollSample, samplesPerPixel);
    }

    // Playhead
    drawPlayhead(ctx, playheadSample, height, scrollSample, samplesPerPixel);
  }, [buffer, selection, samplesPerPixel, scrollSample, playheadSample, width, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse handlers for selection
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || !buffer) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (y < RULER_HEIGHT) return; // click on ruler, ignore
      const sample = pxToSample(x);
      setIsDragging(true);
      setDragStart(sample);
      setPlayheadSample(sample);
      setSelection(null);
    },
    [buffer, pxToSample, setPlayheadSample, setSelection],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging || dragStart === null || !buffer) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const sample = pxToSample(x);
      setSelection({ start: Math.min(dragStart, sample), end: Math.max(dragStart, sample) });
    },
    [isDragging, dragStart, buffer, pxToSample, setSelection],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Scroll with wheel
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        const newSpp = Math.round(samplesPerPixel * factor);
        setSamplesPerPixel(newSpp);
      } else {
        // Scroll
        const delta = Math.round(e.deltaX * samplesPerPixel + e.deltaY * samplesPerPixel);
        setScrollSample(scrollSample + delta);
      }
    },
    [samplesPerPixel, scrollSample, setSamplesPerPixel, setScrollSample],
  );

  // Info bar
  const len = buffer ? bufferLength(buffer) : 0;
  const sr = buffer?.sampleRate ?? 44100;
  const channels = buffer?.channels.length ?? 0;
  const durationSec = len / sr;
  const selInfo = selection
    ? `Sel: ${((selection.end - selection.start) / sr * 1000).toFixed(1)}ms (${selection.end - selection.start} samples)`
    : "No selection";

  return (
    <div style={{ fontFamily: "monospace", color: "#e2e8f0" }}>
      <Toolbar />
      <canvas
        ref={canvasRef}
        style={{ width, height, display: "block", borderRadius: 4, cursor: "crosshair" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      <div style={{ fontSize: 11, color: "#94a3b8", padding: "4px 0", display: "flex", gap: 16 }}>
        <span>{channels > 0 ? (channels === 1 ? "Mono" : "Stereo") : "No audio"}</span>
        <span>{sr} Hz</span>
        <span>{durationSec.toFixed(3)}s ({len} samples)</span>
        <span>{selInfo}</span>
        <span>Zoom: {samplesPerPixel} spp</span>
      </div>
    </div>
  );
};
