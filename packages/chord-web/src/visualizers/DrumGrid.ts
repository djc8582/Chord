import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface DrumGridOptions {
  theme?: string | VisualizerTheme;
  steps?: number;
  rows?: number;
  labels?: string[];
}

export function createDrumGrid(canvas: HTMLCanvasElement, options: DrumGridOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const steps = options.steps ?? 16;
  const rows = options.rows ?? 4;
  const labels = options.labels ?? ['KICK', 'SNARE', 'HAT', 'PERC'];
  let currentStep = 0;
  let frameCount = 0;

  // Grid state (randomly generated pattern for visualization)
  const grid: boolean[][] = Array.from({length: rows}, () =>
    Array.from({length: steps}, () => Math.random() > 0.65)
  );

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = theme.background;
      ctx.fillRect(0, 0, w, h);

      // Advance step on beat
      frameCount++;
      if (frame.isBeat || frameCount % 8 === 0) {
        currentStep = (currentStep + 1) % steps;
      }

      const labelW = 50;
      const cellW = (w - labelW) / steps;
      const cellH = h / rows;
      const gap = 2;

      for (let r = 0; r < rows; r++) {
        // Row label
        ctx.fillStyle = theme.secondary;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(labels[r] ?? `R${r}`, labelW - 6, r * cellH + cellH / 2 + 4);

        for (let s = 0; s < steps; s++) {
          const x = labelW + s * cellW + gap;
          const y = r * cellH + gap;
          const cw = cellW - gap * 2;
          const ch = cellH - gap * 2;
          const active = grid[r][s];
          const isCurrent = s === currentStep;

          if (isCurrent) {
            ctx.fillStyle = active ? theme.primary : theme.primary + '40';
            if (theme.glow && active) {
              ctx.shadowColor = theme.primary;
              ctx.shadowBlur = 8;
            }
          } else {
            ctx.fillStyle = active ? theme.palette[r % theme.palette.length] + '90' : theme.secondary + '15';
          }

          ctx.fillRect(x, y, cw, ch);
          ctx.shadowBlur = 0;
        }
      }

      // Beat indicator line
      const lineX = labelW + currentStep * cellW + cellW / 2;
      ctx.strokeStyle = theme.primary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lineX, 0);
      ctx.lineTo(lineX, h);
      ctx.stroke();
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
