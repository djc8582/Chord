import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface TerrainOptions { theme?: string | VisualizerTheme; rows?: number; }

export function createTerrain(canvas: HTMLCanvasElement, options: TerrainOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const maxRows = options.rows ?? 40;
  const history: Float32Array[] = [];

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width; const h = canvas.height;
      ctx.fillStyle = theme.background; ctx.fillRect(0, 0, w, h);

      // Add current spectrum to history
      const spec = frame.spectrum;
      if (spec && spec.length > 0) {
        const row = new Float32Array(64);
        for (let i = 0; i < 64; i++) {
          const binIdx = Math.floor(Math.pow(i / 64, 2) * spec.length);
          const val = spec[binIdx] ?? 0;
          row[i] = val < 0 ? Math.pow(10, val / 20) : val;
        }
        history.push(row);
        if (history.length > maxRows) history.shift();
      }

      // Draw terrain (back to front)
      const cols = 64;
      for (let r = 0; r < history.length; r++) {
        const row = history[r];
        const depth = r / maxRows;
        const baseY = h * 0.3 + depth * h * 0.6;
        const horizonScale = 0.3 + depth * 0.7;
        const alpha = 0.3 + depth * 0.7;

        ctx.beginPath();
        for (let c = 0; c <= cols; c++) {
          const x = (c / cols - 0.5) * w * horizonScale + w * 0.5;
          const heightVal = (row[Math.min(c, cols - 1)] ?? 0) * h * 0.3 * (1 - depth * 0.5);
          const y = baseY - heightVal;
          c === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }

        // Close bottom
        ctx.lineTo(w * 0.5 + w * horizonScale * 0.5, baseY + 2);
        ctx.lineTo(w * 0.5 - w * horizonScale * 0.5, baseY + 2);
        ctx.closePath();

        const colorIdx = Math.floor(depth * (theme.palette.length - 1));
        ctx.fillStyle = (theme.palette[colorIdx] ?? theme.primary) + Math.floor(alpha * 100).toString(16).padStart(2, '0');
        ctx.fill();
        ctx.strokeStyle = theme.primary + Math.floor(alpha * 180).toString(16).padStart(2, '0');
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
