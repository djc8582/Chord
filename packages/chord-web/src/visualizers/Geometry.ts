import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface GeometryOptions {
  theme?: string | VisualizerTheme;
  shape?: 'sphere' | 'ring' | 'star';
  detail?: number;
  rotationSpeed?: number;
}

export function createGeometry(canvas: HTMLCanvasElement, options: GeometryOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const detail = options.detail ?? 24;
  let angle = 0;

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = theme.background;
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.3;
      angle += 0.01 + frame.smoothRms * 0.03;

      // Draw audio-reactive wireframe sphere
      ctx.strokeStyle = theme.primary;
      ctx.lineWidth = 1;
      if (theme.glow) { ctx.shadowColor = theme.primary; ctx.shadowBlur = 10 + frame.attackEnvelope * 20; }

      const rings = detail;
      const segments = detail * 2;

      for (let i = 0; i <= rings; i++) {
        const phi = (i / rings) * Math.PI;
        ctx.beginPath();
        for (let j = 0; j <= segments; j++) {
          const theta = (j / segments) * Math.PI * 2 + angle;

          // Get spectrum displacement for this point
          const specIdx = Math.floor((j / segments) * (frame.spectrum?.length ?? 1));
          const specVal = frame.spectrum?.[specIdx] ?? 0;
          const displacement = specVal < 0 ? Math.pow(10, specVal / 20) * 2 : specVal * 2;
          const r = baseRadius * (1 + displacement * 0.5);

          // 3D to 2D projection
          const x3d = r * Math.sin(phi) * Math.cos(theta);
          const y3d = r * Math.cos(phi);
          const z3d = r * Math.sin(phi) * Math.sin(theta);

          // Simple perspective
          const perspective = 400 / (400 + z3d);
          const x2d = cx + x3d * perspective;
          const y2d = cy + y3d * perspective;

          j === 0 ? ctx.moveTo(x2d, y2d) : ctx.lineTo(x2d, y2d);
        }

        const alpha = 0.3 + (frame.smoothRms * 0.7);
        ctx.strokeStyle = theme.primary + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.stroke();
      }

      // Vertical lines
      for (let j = 0; j < segments / 2; j++) {
        const theta = (j / (segments / 2)) * Math.PI * 2 + angle;
        ctx.beginPath();
        for (let i = 0; i <= rings; i++) {
          const phi = (i / rings) * Math.PI;
          const specIdx = Math.floor((j / (segments / 2)) * (frame.spectrum?.length ?? 1));
          const specVal = frame.spectrum?.[specIdx] ?? 0;
          const displacement = specVal < 0 ? Math.pow(10, specVal / 20) * 2 : specVal * 2;
          const r = baseRadius * (1 + displacement * 0.5);

          const x3d = r * Math.sin(phi) * Math.cos(theta);
          const y3d = r * Math.cos(phi);
          const z3d = r * Math.sin(phi) * Math.sin(theta);
          const perspective = 400 / (400 + z3d);
          const x2d = cx + x3d * perspective;
          const y2d = cy + y3d * perspective;

          i === 0 ? ctx.moveTo(x2d, y2d) : ctx.lineTo(x2d, y2d);
        }
        ctx.strokeStyle = theme.secondary + '40';
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
