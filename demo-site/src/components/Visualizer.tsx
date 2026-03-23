import { useRef, useEffect } from 'react';
import type { ChordEngine } from '../audio/ChordEngine';

interface VisualizerProps {
  engine: ChordEngine | null;
  mode?: 'waveform' | 'frequency' | 'terrain';
  color?: string;
  height?: number;
  className?: string;
  lineWidth?: number;
  mirror?: boolean;
}

export function Visualizer({
  engine,
  mode = 'waveform',
  color = 'rgba(200, 255, 0, 0.5)',
  height = 200,
  className = '',
  lineWidth = 2,
  mirror = false,
}: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf: number;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;

      // Match canvas size to display size
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      if (!engine || !engine.started) {
        raf = requestAnimationFrame(draw);
        return;
      }

      if (mode === 'waveform') {
        const waveform = engine.getWaveformData();

        // Main waveform
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();

        for (let i = 0; i < w; i++) {
          const idx = Math.floor(i * waveform.length / w);
          const val = waveform[idx] || 0;
          const y = (val * 0.5 + 0.5) * h;
          if (i === 0) ctx.moveTo(i, y);
          else ctx.lineTo(i, y);
        }
        ctx.stroke();

        // Mirror (dimmer)
        if (mirror) {
          ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.15)');
          ctx.lineWidth = lineWidth * 0.8;
          ctx.beginPath();
          for (let i = 0; i < w; i++) {
            const idx = Math.floor(i * waveform.length / w);
            const val = waveform[idx] || 0;
            const y = (-val * 0.5 + 0.5) * h;
            if (i === 0) ctx.moveTo(i, y);
            else ctx.lineTo(i, y);
          }
          ctx.stroke();
        }
      } else if (mode === 'frequency') {
        const freq = engine.getFrequencyData();
        const barCount = 64;
        const barWidth = w / barCount;

        for (let i = 0; i < barCount; i++) {
          const idx = Math.floor(i * freq.length / barCount);
          // freq data is in dB, typically -100 to 0
          const db = freq[idx] || -100;
          const normalized = Math.max(0, (db + 100) / 80);
          const barHeight = normalized * h * 0.9;

          const hue = 70 + (i / barCount) * 200; // lime to purple gradient
          ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.4 + normalized * 0.5})`;
          ctx.fillRect(
            i * barWidth + 1,
            h - barHeight,
            barWidth - 2,
            barHeight
          );
        }
      } else if (mode === 'terrain') {
        const waveform = engine.getWaveformData();
        const rms = engine.getRMS();

        // Draw multiple terrain lines stacked
        const layers = 5;
        for (let l = 0; l < layers; l++) {
          const opacity = 0.1 + (l / layers) * 0.5;
          const yOffset = h * 0.3 + (l / layers) * h * 0.5;
          const amplitude = 30 + rms * 300 + l * 15;

          ctx.strokeStyle = color.replace(/[\d.]+\)$/, `${opacity})`);
          ctx.lineWidth = 1.5;
          ctx.beginPath();

          for (let i = 0; i < w; i++) {
            const waveIdx = Math.floor(
              ((i + l * 50) % w) * waveform.length / w
            );
            const val = waveform[waveIdx] || 0;
            const noise = Math.sin(i * 0.02 + l * 2) * 10;
            const y = yOffset + val * amplitude + noise;
            if (i === 0) ctx.moveTo(i, y);
            else ctx.lineTo(i, y);
          }
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [engine, mode, color, lineWidth, mirror]);

  return (
    <canvas
      ref={canvasRef}
      style={{ height }}
      className={`w-full ${className}`}
    />
  );
}
