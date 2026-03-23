import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface PianoRollOptions {
  theme?: string | VisualizerTheme;
  noteRange?: [number, number]; // MIDI range, default [36, 96]
  historyBeats?: number;
  showLabels?: boolean;
}

export function createPianoRoll(canvas: HTMLCanvasElement, options: PianoRollOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const [minNote, maxNote] = options.noteRange ?? [36, 96];
  const noteCount = maxNote - minNote;
  const isBlack = (n: number) => [1,3,6,8,10].includes(n % 12);

  // Note history: array of {note, startTime, velocity, active}
  const history: Array<{note: number; start: number; end: number; vel: number}> = [];
  let time = 0;
  let lastPitch = 0;

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;
      time += 1/60;

      ctx.fillStyle = theme.background;
      ctx.fillRect(0, 0, w, h);

      const keyWidth = 40;
      const rollWidth = w - keyWidth;
      const noteHeight = h / noteCount;
      const pixelsPerSecond = rollWidth / 4; // 4 seconds visible

      // Draw piano keys on left
      for (let i = 0; i < noteCount; i++) {
        const note = maxNote - i;
        const y = i * noteHeight;
        const black = isBlack(note);
        ctx.fillStyle = black ? '#333' : '#ddd';
        ctx.fillRect(0, y, keyWidth - 1, noteHeight - 1);

        if (note % 12 === 0 && options.showLabels !== false) {
          ctx.fillStyle = '#888';
          ctx.font = '9px monospace';
          ctx.fillText(`C${Math.floor(note/12)-1}`, 2, y + noteHeight - 2);
        }
      }

      // Draw grid lines
      ctx.strokeStyle = theme.secondary + '20';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < noteCount; i++) {
        const y = i * noteHeight;
        if ((maxNote - i) % 12 === 0) {
          ctx.strokeStyle = theme.secondary + '40';
          ctx.beginPath(); ctx.moveTo(keyWidth, y); ctx.lineTo(w, y); ctx.stroke();
          ctx.strokeStyle = theme.secondary + '20';
        }
      }

      // Detect current pitch from analysis
      if (frame.rms > 0.02 && frame.spectralCentroid > 50) {
        // Very rough pitch-to-MIDI: this is approximate
        const freq = frame.spectralCentroid;
        const midi = Math.round(69 + 12 * Math.log2(freq / 440));
        if (midi >= minNote && midi <= maxNote && midi !== lastPitch) {
          // End previous note
          const prev = history.find(n => n.end === 0 && n.note === lastPitch);
          if (prev) prev.end = time;
          // Start new note
          history.push({ note: midi, start: time, end: 0, vel: frame.rms });
          lastPitch = midi;
        }
      } else if (lastPitch > 0) {
        const prev = history.find(n => n.end === 0 && n.note === lastPitch);
        if (prev) prev.end = time;
        lastPitch = 0;
      }

      // End notes that have been going too long
      for (const n of history) {
        if (n.end === 0 && time - n.start > 2) n.end = time;
      }

      // Remove old notes
      while (history.length > 200) history.shift();

      // Draw notes
      for (const n of history) {
        if (n.note < minNote || n.note > maxNote) continue;
        const noteY = (maxNote - n.note) * noteHeight;
        const startX = keyWidth + (n.start - (time - 4)) * pixelsPerSecond;
        const endX = keyWidth + ((n.end || time) - (time - 4)) * pixelsPerSecond;
        if (endX < keyWidth || startX > w) continue;

        const noteW = Math.max(endX - startX, 3);
        const alpha = n.end === 0 ? 1 : Math.max(0, 1 - (time - n.end) * 2);
        ctx.fillStyle = n.end === 0 ? theme.primary : theme.primary + Math.floor(alpha * 200).toString(16).padStart(2,'0');
        ctx.fillRect(Math.max(startX, keyWidth), noteY + 1, noteW, noteHeight - 2);

        if (theme.glow && n.end === 0) {
          ctx.shadowColor = theme.primary;
          ctx.shadowBlur = 6;
          ctx.fillRect(Math.max(startX, keyWidth), noteY + 1, noteW, noteHeight - 2);
          ctx.shadowBlur = 0;
        }
      }

      // Playhead line
      ctx.strokeStyle = theme.palette[1] ?? theme.secondary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w - 2, 0);
      ctx.lineTo(w - 2, h);
      ctx.stroke();
    },
    resize(width: number, height: number) { canvas.width = width; canvas.height = height; },
  };
}
