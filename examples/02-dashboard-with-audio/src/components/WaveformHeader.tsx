import React, { useRef, useEffect } from 'react';
import { createWaveform, getAnalysisFrame } from '@chord/web';
import type { Chord } from '@chord/web';

interface WaveformHeaderProps {
  engine: Chord;
  isPlaying: boolean;
}

/**
 * Renders a decorative waveform (oscilloscope) in the header area.
 * Uses createWaveform to draw on a canvas, fed by getAnalysisFrame each frame.
 */
export function WaveformHeader({ engine, isPlaying }: WaveformHeaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;

    // Size canvas to container
    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resizeCanvas();

    const viz = createWaveform(canvas, {
      color: '#7c3aed',
      lineWidth: 2,
      mode: 'mirror',
      glow: true,
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
    <div className="waveform-header-container">
      <canvas ref={canvasRef} className="waveform-canvas" />
    </div>
  );
}
