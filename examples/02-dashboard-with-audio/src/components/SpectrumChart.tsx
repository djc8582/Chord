import React, { useRef, useEffect } from 'react';
import { createSpectrum, getAnalysisFrame } from '@chord/web';
import type { Chord } from '@chord/web';

interface SpectrumChartProps {
  engine: Chord;
  isPlaying: boolean;
}

/**
 * Renders a spectrum analyzer behind the chart area as a subtle background.
 * Uses createSpectrum in 'mountain' mode with low opacity for a soft look.
 */
export function SpectrumChart({ engine, isPlaying }: SpectrumChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;

    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resizeCanvas();

    const viz = createSpectrum(canvas, {
      mode: 'mountain',
      barCount: 48,
      gradient: ['#7c3aed', '#a78bfa', '#c4b5fd', '#ede9fe'],
      smoothing: 0.85,
    });

    let rafId: number;
    function animate() {
      const frame = getAnalysisFrame(engine);
      viz.update(frame);
      rafId = requestAnimationFrame(animate);
    }
    rafId = requestAnimationFrame(animate);

    window.addEventListener('resize', resizeCanvas);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [engine, isPlaying]);

  return (
    <div className="spectrum-chart-container">
      <canvas ref={canvasRef} className="spectrum-canvas" />
      <div className="chart-overlay">
        <div className="chart-title">System Performance</div>
        <div className="chart-subtitle">Audio-reactive background reflects live signal</div>
      </div>
    </div>
  );
}
