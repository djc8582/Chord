import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface MelodyContourOptions {
  theme?: string | VisualizerTheme;
  historySeconds?: number;
}

export function createMelodyContour(canvas: HTMLCanvasElement, options: MelodyContourOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const historyLen = Math.floor((options.historySeconds ?? 8) * 60);
  const pitchHistory: number[] = [];
  const rmsHistory: number[] = [];

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = theme.background;
      ctx.fillRect(0, 0, w, h);

      // Track pitch
      const freq = frame.rms > 0.02 ? frame.spectralCentroid : 0;
      const midi = freq > 20 ? 69 + 12 * Math.log2(freq / 440) : 0;
      pitchHistory.push(midi);
      rmsHistory.push(frame.smoothRms);
      if (pitchHistory.length > historyLen) { pitchHistory.shift(); rmsHistory.shift(); }

      if (pitchHistory.length < 2) return;

      // Find pitch range
      const pitched = pitchHistory.filter(p => p > 0);
      if (pitched.length === 0) return;
      const minP = Math.min(...pitched) - 2;
      const maxP = Math.max(...pitched) + 2;
      const range = Math.max(maxP - minP, 12);

      // Draw contour
      ctx.lineWidth = theme.lineWidth + 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let drawing = false;
      ctx.beginPath();
      for (let i = 0; i < pitchHistory.length; i++) {
        const x = (i / pitchHistory.length) * w;
        const p = pitchHistory[i];
        if (p <= 0) { drawing = false; continue; }
        const y = h - ((p - minP) / range) * h;

        if (!drawing) { ctx.moveTo(x, y); drawing = true; }
        else ctx.lineTo(x, y);
      }

      // Gradient stroke based on position
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      theme.palette.forEach((c, i) => grad.addColorStop(i / (theme.palette.length - 1), c));
      ctx.strokeStyle = grad;

      if (theme.glow) { ctx.shadowColor = theme.primary; ctx.shadowBlur = 6; }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // RMS as opacity fill below the line
      ctx.globalAlpha = 0.15;
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = theme.primary;
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
