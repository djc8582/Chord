/**
 * Spectrum analyzer visualizer — frequency domain display.
 * Modes: bars, line, filled, mountain.
 */
import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface SpectrumOptions {
  mode?: 'bars' | 'line' | 'filled' | 'mountain';
  theme?: string | VisualizerTheme;
  barCount?: number;
  barGap?: number;
  gradient?: string[];
  smoothing?: number;
  scale?: 'log' | 'linear';
  peakHold?: boolean;
}

export function createSpectrum(canvas: HTMLCanvasElement, options: SpectrumOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const mode = options.mode ?? 'bars';
  const barCount = options.barCount ?? 64;
  const barGap = options.barGap ?? 2;
  const gradient = options.gradient ?? theme.palette;
  const smoothingFactor = options.smoothing ?? 0.7;

  let smoothedBands = new Float32Array(barCount);
  let peaks = new Float32Array(barCount);

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;
      const data = frame.spectrum;
      if (!data || data.length === 0) return;

      ctx.fillStyle = theme.background;
      ctx.fillRect(0, 0, w, h);

      // Resample spectrum to barCount bands (logarithmic)
      const bands = new Float32Array(barCount);
      for (let i = 0; i < barCount; i++) {
        // Log scale: more resolution in low frequencies
        const lowFrac = Math.pow(i / barCount, 2);
        const highFrac = Math.pow((i + 1) / barCount, 2);
        const lowBin = Math.floor(lowFrac * data.length);
        const highBin = Math.min(Math.ceil(highFrac * data.length), data.length - 1);

        let sum = 0, count = 0;
        for (let b = lowBin; b <= highBin; b++) {
          const val = data[b] < 0 ? Math.pow(10, data[b] / 20) : data[b];
          sum += val;
          count++;
        }
        bands[i] = count > 0 ? sum / count : 0;
      }

      // Apply smoothing
      for (let i = 0; i < barCount; i++) {
        smoothedBands[i] = smoothedBands[i] * smoothingFactor + bands[i] * (1 - smoothingFactor);
      }

      // Update peaks
      for (let i = 0; i < barCount; i++) {
        if (smoothedBands[i] > peaks[i]) {
          peaks[i] = smoothedBands[i];
        } else {
          peaks[i] *= 0.99; // slow decay
        }
      }

      const barWidth = (w - barGap * (barCount - 1)) / barCount;

      if (mode === 'bars') {
        for (let i = 0; i < barCount; i++) {
          const x = i * (barWidth + barGap);
          const barH = Math.min(smoothedBands[i] * h * 3, h);
          const colorIdx = Math.floor((i / barCount) * gradient.length);
          ctx.fillStyle = gradient[Math.min(colorIdx, gradient.length - 1)];

          if (theme.glow) {
            ctx.shadowColor = gradient[Math.min(colorIdx, gradient.length - 1)];
            ctx.shadowBlur = 6;
          }

          ctx.fillRect(x, h - barH, barWidth, barH);

          // Peak hold line
          if (options.peakHold) {
            const peakY = h - Math.min(peaks[i] * h * 3, h);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, peakY, barWidth, 2);
          }
        }
      } else if (mode === 'line' || mode === 'filled' || mode === 'mountain') {
        ctx.beginPath();
        ctx.moveTo(0, h);

        for (let i = 0; i < barCount; i++) {
          const x = (i / (barCount - 1)) * w;
          const y = h - Math.min(smoothedBands[i] * h * 3, h);

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        if (mode === 'filled' || mode === 'mountain') {
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();

          const grad = ctx.createLinearGradient(0, 0, 0, h);
          gradient.forEach((c, i) => grad.addColorStop(i / (gradient.length - 1), c + '80'));
          ctx.fillStyle = grad;
          ctx.fill();
        }

        ctx.strokeStyle = gradient[0];
        ctx.lineWidth = theme.lineWidth;
        if (theme.glow) {
          ctx.shadowColor = gradient[0];
          ctx.shadowBlur = 8;
        }
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
    },

    resize(width: number, height: number) {
      canvas.width = width;
      canvas.height = height;
      smoothedBands = new Float32Array(barCount);
      peaks = new Float32Array(barCount);
    },
  };
}
