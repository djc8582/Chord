import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface NodeGraphOptions { theme?: string | VisualizerTheme; }

interface GraphNode { id: string; type: string; x: number; y: number; }
interface GraphEdge { from: string; to: string; }

export function createNodeGraph(canvas: HTMLCanvasElement, options: NodeGraphOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));

  let graphNodes: GraphNode[] = [];
  let graphEdges: GraphEdge[] = [];
  let pulsePhase = 0;

  return {
    /** Set the graph data (call when patch changes) */
    setGraph(nodes: GraphNode[], edges: GraphEdge[]) {
      graphNodes = nodes;
      graphEdges = edges;
    },

    update(frame: AudioAnalysisFrame) {
      const w = canvas.width; const h = canvas.height;
      ctx.fillStyle = theme.background; ctx.fillRect(0, 0, w, h);
      pulsePhase += 0.02 + frame.smoothRms * 0.05;

      if (graphNodes.length === 0) {
        ctx.fillStyle = theme.secondary + '40'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
        ctx.fillText('No graph data', w / 2, h / 2);
        return;
      }

      // Scale positions to canvas
      const margin = 40;
      const scaleX = (w - margin * 2); const scaleY = (h - margin * 2);

      // Draw edges with signal flow animation
      for (const edge of graphEdges) {
        const from = graphNodes.find(n => n.id === edge.from);
        const to = graphNodes.find(n => n.id === edge.to);
        if (!from || !to) continue;

        const x1 = margin + from.x * scaleX; const y1 = margin + from.y * scaleY;
        const x2 = margin + to.x * scaleX; const y2 = margin + to.y * scaleY;

        // Wire
        ctx.strokeStyle = theme.secondary + '60';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

        // Animated pulse along wire
        const pulseT = (pulsePhase * 0.5) % 1;
        const px = x1 + (x2 - x1) * pulseT;
        const py = y1 + (y2 - y1) * pulseT;
        ctx.fillStyle = theme.primary;
        if (theme.glow) { ctx.shadowColor = theme.primary; ctx.shadowBlur = 6; }
        ctx.beginPath(); ctx.arc(px, py, 3 + frame.smoothRms * 3, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw nodes
      const typeColors: Record<string, string> = {
        oscillator: theme.palette[0] ?? theme.primary,
        filter: theme.palette[1] ?? theme.secondary,
        reverb: theme.palette[2] ?? theme.primary,
        delay: theme.palette[2] ?? theme.primary,
        gain: theme.palette[3] ?? theme.secondary,
        output: '#fff',
      };

      for (const node of graphNodes) {
        const x = margin + node.x * scaleX;
        const y = margin + node.y * scaleY;
        const nodeColor = typeColors[node.type] ?? theme.secondary;
        const size = 18 + frame.smoothRms * 5;

        // Node body
        ctx.fillStyle = theme.background;
        ctx.strokeStyle = nodeColor;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        // Label
        ctx.fillStyle = nodeColor;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const shortType = node.type.slice(0, 5).toUpperCase();
        ctx.fillText(shortType, x, y);
      }
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
