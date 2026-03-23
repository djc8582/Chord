import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface SequencerGridOptions {
  theme?: string | VisualizerTheme;
  steps?: number;
  rows?: number;
  type?: 'step' | 'euclidean' | 'life';
}

export function createSequencerGrid(canvas: HTMLCanvasElement, options: SequencerGridOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const steps = options.steps ?? 16;
  const rows = options.rows ?? 8;
  const type = options.type ?? 'euclidean';
  let step = 0;
  let frameCount = 0;

  // Generate pattern
  const grid: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let s = 0; s < steps; s++) {
      if (type === 'euclidean') {
        // Euclidean-ish pattern
        const pulses = 3 + r;
        row.push(((s * pulses) % steps < pulses) ? 0.5 + Math.random() * 0.5 : 0);
      } else if (type === 'life') {
        row.push(Math.random() > 0.65 ? 1 : 0);
      } else {
        row.push(Math.random() > 0.7 ? 0.5 + Math.random() * 0.5 : 0);
      }
    }
    grid.push(row);
  }

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width; const h = canvas.height;
      ctx.fillStyle = theme.background; ctx.fillRect(0, 0, w, h);

      frameCount++;
      if (frame.isBeat || frameCount % 10 === 0) step = (step + 1) % steps;

      const cellW = w / steps;
      const cellH = h / rows;
      const gap = 1.5;

      for (let r = 0; r < rows; r++) {
        for (let s = 0; s < steps; s++) {
          const x = s * cellW + gap;
          const y = r * cellH + gap;
          const cw = cellW - gap * 2;
          const ch = cellH - gap * 2;
          const val = grid[r][s];
          const isCurrent = s === step;

          if (val > 0) {
            const colorIdx = r % theme.palette.length;
            const alpha = isCurrent ? 1 : val * 0.7;
            ctx.fillStyle = theme.palette[colorIdx] + Math.floor(alpha * 255).toString(16).padStart(2, '0');
            if (isCurrent && theme.glow) { ctx.shadowColor = theme.palette[colorIdx]; ctx.shadowBlur = 8; }
          } else {
            ctx.fillStyle = isCurrent ? theme.secondary + '25' : theme.secondary + '08';
          }

          ctx.fillRect(x, y, cw, ch);
          ctx.shadowBlur = 0;
        }
      }

      // Playhead
      const lineX = step * cellW + cellW / 2;
      ctx.strokeStyle = theme.primary + 'aa';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(lineX, 0); ctx.lineTo(lineX, h); ctx.stroke();
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
