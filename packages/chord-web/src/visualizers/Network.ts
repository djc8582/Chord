import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface NetworkOptions { theme?: string | VisualizerTheme; nodeCount?: number; }

export function createNetwork(canvas: HTMLCanvasElement, options: NetworkOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const count = options.nodeCount ?? 30;

  // Initialize nodes at random positions
  const nodes = Array.from({ length: count }, (_, i) => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random() - 0.5) * 0.001, vy: (Math.random() - 0.5) * 0.001,
    band: i % 7, // which frequency band this node represents
  }));

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width; const h = canvas.height;
      ctx.fillStyle = theme.background + 'e0';
      ctx.fillRect(0, 0, w, h);

      const bands = [frame.sub, frame.bass, frame.lowMid, frame.mid, frame.highMid, frame.presence, frame.brilliance];

      // Update positions
      for (const node of nodes) {
        node.x += node.vx + (Math.random() - 0.5) * 0.0005;
        node.y += node.vy + (Math.random() - 0.5) * 0.0005;

        // Beat impulse
        if (frame.isBeat) {
          node.vx += (Math.random() - 0.5) * 0.005;
          node.vy += (Math.random() - 0.5) * 0.005;
        }

        // Damping + bounds
        node.vx *= 0.98; node.vy *= 0.98;
        if (node.x < 0.05 || node.x > 0.95) node.vx *= -1;
        if (node.y < 0.05 || node.y > 0.95) node.vy *= -1;
        node.x = Math.max(0.02, Math.min(0.98, node.x));
        node.y = Math.max(0.02, Math.min(0.98, node.y));
      }

      // Draw connections between nearby nodes in active bands
      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.25) {
            const energy = Math.max(bands[nodes[i].band] ?? 0, bands[nodes[j].band] ?? 0);
            if (energy > 0.05) {
              const alpha = (1 - dist / 0.25) * energy;
              ctx.strokeStyle = theme.palette[nodes[i].band % theme.palette.length] + Math.floor(alpha * 200).toString(16).padStart(2, '0');
              ctx.beginPath();
              ctx.moveTo(nodes[i].x * w, nodes[i].y * h);
              ctx.lineTo(nodes[j].x * w, nodes[j].y * h);
              ctx.stroke();
            }
          }
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const energy = bands[node.band] ?? 0;
        const size = 2 + energy * 6;
        const alpha = 0.3 + energy * 0.7;
        ctx.fillStyle = theme.palette[node.band % theme.palette.length] + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        if (theme.glow && energy > 0.2) { ctx.shadowColor = theme.palette[node.band % theme.palette.length]; ctx.shadowBlur = 8; }
        ctx.beginPath(); ctx.arc(node.x * w, node.y * h, size, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
