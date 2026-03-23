import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface KaleidoscopeOptions {
  theme?: string | VisualizerTheme;
  segments?: number;
}

export function createKaleidoscope(canvas: HTMLCanvasElement, options: KaleidoscopeOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const segments = options.segments ?? 8;
  let rotation = 0;

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.45;

      // Slow fade for trails
      ctx.fillStyle = theme.background + '15';
      ctx.fillRect(0, 0, w, h);

      rotation += 0.005 + frame.smoothRms * 0.02;
      const segAngle = (Math.PI * 2) / segments;

      // Draw in each segment with mirror symmetry
      for (let s = 0; s < segments; s++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(segAngle * s + rotation);

        // Draw audio-reactive shapes in this segment
        const points = 8;
        ctx.beginPath();
        for (let i = 0; i < points; i++) {
          const t = i / points;
          const specIdx = Math.floor(t * (frame.spectrum?.length ?? 64));
          const specVal = frame.spectrum?.[specIdx] ?? 0;
          const mag = specVal < 0 ? Math.pow(10, specVal / 20) : specVal;

          const r = radius * 0.2 + mag * radius * 1.5;
          const a = t * segAngle * 0.8;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;

          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();

        const colorIdx = s % theme.palette.length;
        ctx.strokeStyle = theme.palette[colorIdx] + '80';
        ctx.lineWidth = 1.5;
        if (theme.glow) { ctx.shadowColor = theme.palette[colorIdx]; ctx.shadowBlur = 5; }
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.restore();
      }
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
