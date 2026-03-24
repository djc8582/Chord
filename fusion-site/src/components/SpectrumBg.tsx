/**
 * Spectrum analyzer as a subtle background element behind text.
 * Manually drives Chord's createSpectrum visualizer via getAnalysisFrame.
 */

import { useEffect, useRef } from 'react';
import { createSpectrum, getAnalysisFrame } from '@chord/web';
import { useAudio } from '../providers/AudioProvider.js';

export function SpectrumBg({ className = '' }: { className?: string }) {
  const { engine, started } = useAudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !engine?.chord || !started) return;
    const viz = createSpectrum(canvasRef.current, {
      mode: 'filled',
      barCount: 128,
      theme: { primary: 'rgba(212, 160, 83, 0.06)', secondary: 'rgba(212, 160, 83, 0.03)', background: 'transparent', palette: [], glow: false, lineWidth: 1, opacity: 0.6 },
    });
    let raf: number;
    const tick = () => {
      const frame = getAnalysisFrame(engine.chord);
      viz.update(frame);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, started]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={300}
      className={`absolute inset-0 w-full h-full pointer-events-none opacity-60 ${className}`}
    />
  );
}
