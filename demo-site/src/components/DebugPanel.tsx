import { useState, useEffect } from 'react';
import type { ChordEngine } from '../audio/ChordEngine';

interface DebugPanelProps {
  engine: ChordEngine | null;
  visible: boolean;
}

export function DebugPanel({ engine, visible }: DebugPanelProps) {
  const [stats, setStats] = useState({
    rms: 0,
    peak: 0,
  });

  useEffect(() => {
    if (!visible || !engine || !engine.started) return;

    const interval = setInterval(() => {
      const waveform = engine.getWaveformData();
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < waveform.length; i++) {
        const abs = Math.abs(waveform[i]);
        sum += waveform[i] * waveform[i];
        if (abs > peak) peak = abs;
      }
      setStats({
        rms: Math.sqrt(sum / waveform.length),
        peak,
      });
    }, 100);

    return () => clearInterval(interval);
  }, [visible, engine]);

  if (!visible) return null;

  const params = [
    'filterCutoff', 'reverbMix', 'masterVolume', 'shimmerRate',
    'rhythmDensity', 'distortion', 'padChord', 'scrollDepth',
    'idle', 'timeOfDay',
  ];

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 font-mono text-xs text-white/70 min-w-[280px]">
      <div className="text-lime-400 font-bold mb-2 text-sm">Debug Panel</div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
        <div>RMS</div>
        <div className="text-right">{stats.rms.toFixed(4)}</div>
        <div>Peak</div>
        <div className="text-right">{stats.peak.toFixed(4)}</div>
        <div>Engine</div>
        <div className="text-right">{engine?.started ? 'Running' : 'Stopped'}</div>
      </div>

      <div className="border-t border-white/10 pt-2 mt-2">
        <div className="text-white/50 mb-1">Parameters</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {params.map((p) => (
            <div key={p} className="contents">
              <div className="text-white/40">{p}</div>
              <div className="text-right">
                {(engine?.getParameter(p) ?? 0).toFixed(3)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 text-white/30 text-[10px]">
        Press ` to toggle
      </div>
    </div>
  );
}
