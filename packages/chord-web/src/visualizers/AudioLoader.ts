import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface AudioLoaderOptions {
  theme?: string | VisualizerTheme;
  type?: 'waveform' | 'pulse' | 'orbit';
  size?: number;
}

export function createAudioLoader(canvas: HTMLCanvasElement, options: AudioLoaderOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const size = options.size ?? 48;
  const type = options.type ?? 'orbit';
  let angle = 0;

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const r = size / 2;
      angle += 0.05 + frame.smoothRms * 0.1;

      if (type === 'orbit') {
        // Orbiting dots
        const dotCount = 6;
        for (let i = 0; i < dotCount; i++) {
          const a = angle + (i / dotCount) * Math.PI * 2;
          const dotR = r * (0.8 + frame.smoothRms * 0.4);
          const x = cx + Math.cos(a) * dotR;
          const y = cy + Math.sin(a) * dotR;
          const dotSize = 3 + (i === 0 ? frame.attackEnvelope * 4 : 0);

          ctx.fillStyle = theme.palette[i % theme.palette.length];
          if (theme.glow) { ctx.shadowColor = theme.palette[i % theme.palette.length]; ctx.shadowBlur = 6; }
          ctx.beginPath();
          ctx.arc(x, y, dotSize, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (type === 'pulse') {
        const pulseR = r * (0.5 + frame.attackEnvelope * 0.8);
        ctx.strokeStyle = theme.primary;
        ctx.lineWidth = 3;
        if (theme.glow) { ctx.shadowColor = theme.primary; ctx.shadowBlur = 10; }
        ctx.beginPath();
        ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
