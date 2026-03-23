import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface ChordDisplayOptions {
  theme?: string | VisualizerTheme;
  fontSize?: number;
  showKeyboard?: boolean;
}

export function createChordDisplay(canvas: HTMLCanvasElement, options: ChordDisplayOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const fontSize = options.fontSize ?? 48;
  let displayChord = '—';
  let displayAlpha = 0;

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = theme.background;
      ctx.fillRect(0, 0, w, h);

      // Detect pitch and show as note name
      if (frame.rms > 0.03) {
        const freq = frame.spectralCentroid;
        const midi = Math.round(69 + 12 * Math.log2(Math.max(freq, 20) / 440));
        const noteNames = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
        const octave = Math.floor(midi / 12) - 1;
        displayChord = `${noteNames[midi % 12]}${octave}`;
        displayAlpha = Math.min(displayAlpha + 0.15, 1);
      } else {
        displayAlpha *= 0.95;
      }

      // Draw chord name
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${fontSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle = theme.primary + Math.floor(displayAlpha * 255).toString(16).padStart(2, '0');

      if (theme.glow) {
        ctx.shadowColor = theme.primary;
        ctx.shadowBlur = 15 + frame.smoothRms * 30;
      }
      ctx.fillText(displayChord, w / 2, h / 2);
      ctx.shadowBlur = 0;

      // RMS bar at bottom
      const barH = 4;
      ctx.fillStyle = theme.palette[2] ?? theme.secondary;
      ctx.fillRect(0, h - barH, w * frame.smoothRms * 2, barH);
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
