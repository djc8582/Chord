import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface AudioBackgroundOptions {
  theme?: string | VisualizerTheme;
  type?: 'gradient' | 'mesh' | 'noise';
  intensity?: number;
}

export function createAudioBackground(canvas: HTMLCanvasElement, options: AudioBackgroundOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const intensity = options.intensity ?? 0.5;
  let time = 0;

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;
      time += 0.01;

      // Base gradient that shifts with audio
      const hue1 = 220 + frame.spectralCentroid / 8000 * 120 * intensity;
      const hue2 = hue1 + 60 + frame.bass * 40 * intensity;
      const lightness = 8 + frame.smoothRms * 20 * intensity;

      const grad = ctx.createRadialGradient(
        w * 0.3 + Math.sin(time) * w * 0.1 * intensity,
        h * 0.3 + Math.cos(time * 0.7) * h * 0.1 * intensity,
        0,
        w * 0.5, h * 0.5, Math.max(w, h) * 0.8
      );

      grad.addColorStop(0, `hsl(${hue1}, 60%, ${lightness + 5}%)`);
      grad.addColorStop(0.5, `hsl(${hue2}, 50%, ${lightness}%)`);
      grad.addColorStop(1, `hsl(${hue1 + 120}, 40%, ${lightness - 3}%)`);

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Soft blobs on beat
      if (frame.isBeat) {
        const blobX = w * (0.3 + Math.random() * 0.4);
        const blobY = h * (0.3 + Math.random() * 0.4);
        const blobR = Math.min(w, h) * 0.15 * frame.beatStrength;
        const blobGrad = ctx.createRadialGradient(blobX, blobY, 0, blobX, blobY, blobR);
        blobGrad.addColorStop(0, theme.primary + '15');
        blobGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = blobGrad;
        ctx.fillRect(0, 0, w, h);
      }
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
