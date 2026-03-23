import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface StereoFieldOptions { theme?: string | VisualizerTheme; persistence?: number; }

export function createStereoField(canvas: HTMLCanvasElement, options: StereoFieldOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const persistence = options.persistence ?? 0.85;

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width; const h = canvas.height;
      const cx = w / 2; const cy = h / 2;
      const r = Math.min(w, h) * 0.45;

      // Fade trail
      ctx.fillStyle = theme.background + Math.floor((1 - persistence) * 255).toString(16).padStart(2, '0');
      ctx.fillRect(0, 0, w, h);

      // Draw circle guide
      ctx.strokeStyle = theme.secondary + '20';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.stroke();
      // Cross
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();

      // Labels
      ctx.fillStyle = theme.secondary + '60'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('L', cx - r - 10, cy + 4); ctx.fillText('R', cx + r + 10, cy + 4);
      ctx.fillText('M', cx, cy - r - 6); ctx.fillText('S', cx, cy + r + 12);

      // Plot waveform as L+R vs L-R (Lissajous)
      const data = frame.waveform;
      if (!data || data.length < 2) return;
      ctx.fillStyle = theme.primary;
      if (theme.glow) { ctx.shadowColor = theme.primary; ctx.shadowBlur = 4; }

      for (let i = 0; i < data.length - 1; i += 2) {
        const l = data[i]; const rr = data[i + 1] ?? data[i];
        const mid = (l + rr) * 0.5; const side = (l - rr) * 0.5;
        const px = cx + side * r * 2; const py = cy - mid * r * 2;
        ctx.fillRect(px, py, 1.5, 1.5);
      }
      ctx.shadowBlur = 0;
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
