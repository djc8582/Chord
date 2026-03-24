/**
 * SpectralView Component
 *
 * Canvas-based spectrogram display: time on X axis, frequency on Y axis,
 * magnitude as color intensity. Uses a sliding-window FFT approach.
 *
 * For MVP this is display-only. Spectral editing will come in Phase 2.
 */

import React, { useRef, useEffect, useCallback } from "react";
import { useAudioEditorStore } from "./store.js";
import type { AudioBuffer } from "./types.js";
import { bufferLength } from "./operations.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SpectralViewProps {
  /** Canvas width in CSS pixels. */
  width?: number;
  /** Canvas height in CSS pixels. */
  height?: number;
  /** FFT window size (must be power of 2). */
  fftSize?: number;
  /** Hop size between FFT windows in samples. */
  hopSize?: number;
}

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

const SPECTRAL_BG = "#0f0f1a";

/**
 * Map a magnitude value (0..1) to an RGB color string.
 * Uses a heat-map palette: black -> blue -> cyan -> yellow -> white.
 */
export function magnitudeToColor(mag: number): string {
  const v = Math.max(0, Math.min(1, mag));

  let r: number, g: number, b: number;

  if (v < 0.25) {
    // Black to blue
    const t = v / 0.25;
    r = 0;
    g = 0;
    b = Math.round(t * 180);
  } else if (v < 0.5) {
    // Blue to cyan
    const t = (v - 0.25) / 0.25;
    r = 0;
    g = Math.round(t * 220);
    b = 180;
  } else if (v < 0.75) {
    // Cyan to yellow
    const t = (v - 0.5) / 0.25;
    r = Math.round(t * 255);
    g = 220;
    b = Math.round(180 * (1 - t));
  } else {
    // Yellow to white
    const t = (v - 0.75) / 0.25;
    r = 255;
    g = Math.round(220 + t * 35);
    b = Math.round(t * 255);
  }

  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Minimal inline FFT (no dependency on visualizer/dsp to stay self-contained)
// ---------------------------------------------------------------------------

/**
 * Compute magnitude spectrum for a real-valued window using a simple DFT.
 * Returns magnitudes for bins 0..N/2 (inclusive).
 * This is not the fastest but it is correct and adequate for display.
 */
export function computeMagnitudeSpectrum(samples: Float32Array): Float32Array {
  const N = samples.length;
  const halfN = Math.floor(N / 2);
  const result = new Float32Array(halfN);

  for (let k = 0; k < halfN; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      re += samples[n] * Math.cos(angle);
      im -= samples[n] * Math.sin(angle);
    }
    result[k] = Math.sqrt(re * re + im * im) / N;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * Draw the spectrogram onto a canvas context.
 */
export function drawSpectrogram(
  ctx: CanvasRenderingContext2D,
  buffer: AudioBuffer,
  width: number,
  height: number,
  scrollSample: number,
  samplesPerPixel: number,
  fftSize: number,
  _hopSize: number,
): void {
  ctx.fillStyle = SPECTRAL_BG;
  ctx.fillRect(0, 0, width, height);

  const len = bufferLength(buffer);
  if (len === 0) return;

  const numChannels = buffer.channels.length;
  const halfFft = Math.floor(fftSize / 2);

  // Number of spectral columns to draw = width
  for (let px = 0; px < width; px++) {
    const centerSample = Math.floor(scrollSample + px * samplesPerPixel);
    const windowStart = centerSample - Math.floor(fftSize / 2);

    // Extract window
    const window = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      const idx = windowStart + i;
      if (idx >= 0 && idx < len) {
        let sum = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          sum += buffer.channels[ch][idx];
        }
        window[i] = sum / numChannels;
      }
      // Apply Hann window
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
      window[i] *= w;
    }

    // Compute spectrum
    const spectrum = computeMagnitudeSpectrum(window);

    // Draw column (frequency bins mapped to vertical pixels)
    for (let y = 0; y < height; y++) {
      // Y=0 is top (high frequency), Y=height is bottom (low frequency)
      const freqBin = Math.floor(((height - 1 - y) / (height - 1)) * (halfFft - 1));
      const mag = spectrum[freqBin] ?? 0;

      // Scale magnitude logarithmically for better visual range
      const dbMag = mag > 0 ? Math.max(0, 1 + Math.log10(mag + 1e-10) / 3) : 0;

      ctx.fillStyle = magnitudeToColor(dbMag);
      ctx.fillRect(px, y, 1, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// React Component
// ---------------------------------------------------------------------------

export const SpectralView: React.FC<SpectralViewProps> = ({
  width = 800,
  height = 200,
  fftSize = 256,
  hopSize = 128,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { buffer, scrollSample, samplesPerPixel } = useAudioEditorStore();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = SPECTRAL_BG;
    ctx.fillRect(0, 0, width, height);

    if (buffer) {
      drawSpectrogram(ctx, buffer, width, height, scrollSample, samplesPerPixel, fftSize, hopSize);
    } else {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px monospace";
      ctx.fillText("No audio loaded", width / 2 - 50, height / 2);
    }
  }, [buffer, scrollSample, samplesPerPixel, width, height, fftSize, hopSize]);

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
