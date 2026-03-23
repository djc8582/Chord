/**
 * Waveform visualizer — oscilloscope display.
 * Modes: line, filled, mirror, circular.
 */
import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface WaveformOptions {
  mode?: 'line' | 'filled' | 'mirror';
  theme?: string | VisualizerTheme;
  color?: string;
  lineWidth?: number;
  glow?: boolean;
  fade?: number; // 0-1, trail persistence
}

export function createWaveform(canvas: HTMLCanvasElement, options: WaveformOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const color = options.color ?? theme.primary;
  const lineWidth = options.lineWidth ?? theme.lineWidth;
  const mode = options.mode ?? 'line';
  const glow = options.glow ?? theme.glow;
  const fade = options.fade ?? 0;

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;
      const data = frame.waveform;
      if (!data || data.length === 0) return;

      // Fade trail or clear
      if (fade > 0) {
        ctx.fillStyle = `rgba(${hexToRgb(theme.background)}, ${1 - fade})`;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = theme.background;
        ctx.fillRect(0, 0, w, h);
      }

      // Glow effect
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8 + frame.rms * 20;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const sliceWidth = w / data.length;
      const mid = h / 2;
      const amp = h * 0.4;

      if (mode === 'mirror') {
        // Draw top half
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const x = i * sliceWidth;
          const y = mid - Math.abs(data[i]) * amp;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Draw bottom half (mirrored)
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const x = i * sliceWidth;
          const y = mid + Math.abs(data[i]) * amp;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const x = i * sliceWidth;
          const y = mid + data[i] * amp;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }

        if (mode === 'filled') {
          ctx.lineTo(w, mid);
          ctx.lineTo(0, mid);
          ctx.closePath();
          ctx.fillStyle = color + '30';
          ctx.fill();
        }
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
    },

    resize(width: number, height: number) {
      canvas.width = width;
      canvas.height = height;
    },
  };
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `${r},${g},${b}`;
}
