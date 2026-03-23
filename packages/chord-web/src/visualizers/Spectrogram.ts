import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface SpectrogramOptions {
  theme?: string | VisualizerTheme;
  colorMap?: 'magma' | 'viridis' | 'thermal' | 'grayscale';
  scrollDirection?: 'left' | 'up';
}

export function createSpectrogram(canvas: HTMLCanvasElement, options: SpectrogramOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const direction = options.scrollDirection ?? 'left';
  const colorMap = options.colorMap ?? 'magma';

  // Color maps
  const maps: Record<string, [number, number, number][]> = {
    magma: [[0, 0, 4], [40, 10, 80], [120, 30, 120], [200, 50, 80], [250, 150, 30], [255, 255, 150]],
    viridis: [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]],
    thermal: [[0, 0, 0], [80, 0, 120], [200, 0, 50], [255, 100, 0], [255, 255, 100], [255, 255, 255]],
    grayscale: [[0, 0, 0], [128, 128, 128], [255, 255, 255]],
  };

  let imageData: ImageData | null = null;

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;
      const spec = frame.spectrum;
      if (!spec || spec.length === 0) return;

      if (!imageData || imageData.width !== w || imageData.height !== h) {
        ctx.fillStyle = theme.background;
        ctx.fillRect(0, 0, w, h);
        imageData = ctx.getImageData(0, 0, w, h);
      }

      if (direction === 'left') {
        // Shift image left by 1 pixel
        const data = imageData.data;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w - 1; x++) {
            const dst = (y * w + x) * 4;
            const src = (y * w + x + 1) * 4;
            data[dst] = data[src]; data[dst + 1] = data[src + 1]; data[dst + 2] = data[src + 2]; data[dst + 3] = data[src + 3];
          }
        }
        // Draw new column on the right
        const bins = spec.length;
        const colors = maps[colorMap] ?? maps.magma;
        for (let y = 0; y < h; y++) {
          const binIdx = Math.floor(Math.pow(1 - y / h, 2) * bins); // log-ish
          const val = spec[binIdx] ?? 0;
          const norm = val < 0 ? Math.pow(10, val / 20) * 3 : Math.min(val * 3, 1);
          const t = Math.max(0, Math.min(1, norm));
          const idx = t * (colors.length - 1);
          const lo = Math.floor(idx);
          const hi = Math.min(lo + 1, colors.length - 1);
          const frac = idx - lo;
          const pixel = (y * w + w - 1) * 4;
          data[pixel] = Math.round(colors[lo][0] * (1 - frac) + colors[hi][0] * frac);
          data[pixel + 1] = Math.round(colors[lo][1] * (1 - frac) + colors[hi][1] * frac);
          data[pixel + 2] = Math.round(colors[lo][2] * (1 - frac) + colors[hi][2] * frac);
          data[pixel + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
      }
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; imageData = null; },
  };
}
