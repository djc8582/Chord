/**
 * Level meter — RMS + Peak display.
 */
import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface LevelMeterOptions {
  theme?: string | VisualizerTheme;
  orientation?: 'vertical' | 'horizontal';
  showPeak?: boolean;
  showRms?: boolean;
}

export function createLevelMeter(canvas: HTMLCanvasElement, options: LevelMeterOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const vertical = options.orientation !== 'horizontal';
  let peakHold = 0;

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = theme.background;
      ctx.fillRect(0, 0, w, h);

      const rms = Math.min(frame.smoothRms * 2.5, 1);
      const peak = Math.min(frame.peak * 2, 1);

      if (peak > peakHold) peakHold = peak;
      else peakHold *= 0.995;

      if (vertical) {
        // RMS bar
        const rmsH = rms * h;
        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, '#00ff88');
        grad.addColorStop(0.6, '#ffcc00');
        grad.addColorStop(0.85, '#ff4400');
        ctx.fillStyle = grad;
        ctx.fillRect(2, h - rmsH, w - 4, rmsH);

        // Peak line
        if (options.showPeak !== false) {
          const peakY = h - peakHold * h;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, peakY, w, 2);
        }

        // dB markers
        ctx.fillStyle = theme.secondary + '60';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        for (const db of [0, -6, -12, -24, -48]) {
          const y = h * (1 - Math.pow(10, db / 20));
          ctx.fillRect(0, y, w, 1);
          ctx.fillText(`${db}`, w - 2, y - 2);
        }
      } else {
        const rmsW = rms * w;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, '#00ff88');
        grad.addColorStop(0.6, '#ffcc00');
        grad.addColorStop(0.85, '#ff4400');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 2, rmsW, h - 4);

        if (options.showPeak !== false) {
          const peakX = peakHold * w;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(peakX, 0, 2, h);
        }
      }
    },

    resize(width: number, height: number) {
      canvas.width = width;
      canvas.height = height;
    },
  };
}
