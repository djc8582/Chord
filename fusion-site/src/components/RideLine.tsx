/**
 * Ride cymbal waveform as a 1px decorative line between sections.
 * Manually drives Chord's createWaveform visualizer via getAnalysisFrame.
 */

import { useEffect, useRef } from 'react';
import { createWaveform, getAnalysisFrame } from '@chord/web';
import { useAudio } from '../providers/AudioProvider.js';

export function RideLine({ className = '' }: { className?: string }) {
  const { engine, started } = useAudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !engine?.chord || !started) return;
    const viz = createWaveform(canvasRef.current, {
      color: 'rgba(212, 160, 83, 0.25)',
      lineWidth: 1,
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
    <div className={`w-full h-px relative overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        width={1200}
        height={2}
        className="w-full h-full"
      />
    </div>
  );
}
