import { useState, useEffect } from 'react';
import type { Chord } from '@chord/web';

interface PatchNodes {
  bass: string;
  pad1: string;
  pad2: string;
  pad3: string;
  filter: string;
  delay: string;
  reverb: string;
  lfo: string;
  noise: string;
  mixer: string;
  output: string;
  kick: string;
  snare: string;
  hat: string;
  drumMixer: string;
  drumGain: string;
}

interface DebugPanelProps {
  chord: Chord | null;
  patchNodes: PatchNodes | null;
  visible: boolean;
}

export function DebugPanel({ chord, patchNodes, visible }: DebugPanelProps) {
  const [stats, setStats] = useState({
    rms: 0,
    peak: 0,
  });

  useEffect(() => {
    if (!visible || !chord || !chord.started) return;

    const interval = setInterval(() => {
      const waveform = chord.getWaveformData();
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
  }, [visible, chord]);

  if (!visible) return null;

  // Parameter display: show actual node parameters from the Chord graph
  const paramDisplay: Array<{ label: string; value: number }> = [];
  if (patchNodes && chord) {
    paramDisplay.push(
      { label: 'filter.cutoff', value: chord.getParameter(patchNodes.filter, 'cutoff') },
      { label: 'filter.resonance', value: chord.getParameter(patchNodes.filter, 'resonance') },
      { label: 'reverb.mix', value: chord.getParameter(patchNodes.reverb, 'mix') },
      { label: 'reverb.room_size', value: chord.getParameter(patchNodes.reverb, 'room_size') },
      { label: 'delay.time', value: chord.getParameter(patchNodes.delay, 'time') },
      { label: 'delay.feedback', value: chord.getParameter(patchNodes.delay, 'feedback') },
      { label: 'lfo.rate', value: chord.getParameter(patchNodes.lfo, 'rate') },
      { label: 'lfo.depth', value: chord.getParameter(patchNodes.lfo, 'depth') },
      { label: 'noise.gain', value: chord.getParameter(patchNodes.noise, 'gain') },
      { label: 'bass.frequency', value: chord.getParameter(patchNodes.bass, 'frequency') },
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 font-mono text-xs text-white/70 min-w-[280px]">
      <div className="text-lime-400 font-bold mb-2 text-sm">Debug Panel</div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
        <div>RMS</div>
        <div className="text-right">{stats.rms.toFixed(4)}</div>
        <div>Peak</div>
        <div className="text-right">{stats.peak.toFixed(4)}</div>
        <div>Engine</div>
        <div className="text-right">{chord?.started ? 'Running' : 'Stopped'}</div>
        <div>Nodes</div>
        <div className="text-right">{chord?.getNodeCount() ?? 0}</div>
        <div>Connections</div>
        <div className="text-right">{chord?.getConnectionCount() ?? 0}</div>
      </div>

      <div className="border-t border-white/10 pt-2 mt-2">
        <div className="text-white/50 mb-1">Node Parameters</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {paramDisplay.map((p) => (
            <div key={p.label} className="contents">
              <div className="text-white/40">{p.label}</div>
              <div className="text-right">
                {p.value.toFixed(3)}
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
