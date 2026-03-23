import { useRef, useCallback, useState, useEffect } from 'react';
import type { Chord } from '@chord/web';

export function SculptPanel({ chord, active }: { chord: Chord; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const oscId = useRef('');
  const filtId = useRef('');

  useEffect(() => {
    if (!oscId.current) {
      oscId.current = chord.addNode('oscillator');
      filtId.current = chord.addNode('filter');
      const rev = chord.addNode('reverb');
      const g = chord.addNode('gain');
      const o = chord.addNode('output');
      chord.setParameter(oscId.current, 'gain', 0);
      chord.setParameter(filtId.current, 'cutoff', 4000);
      chord.setParameter(rev, 'room_size', 0.6);
      chord.setParameter(rev, 'mix', 0.3);
      chord.setParameter(g, 'gain', 0.4);
      chord.connect(oscId.current, 'out', filtId.current, 'in');
      chord.connect(filtId.current, 'out', rev, 'in');
      chord.connect(rev, 'out', g, 'in');
      chord.connect(g, 'out', o, 'in');
    }
  }, [chord]);

  const onDraw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !active) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    const freq = 100 + y * 1900;
    chord.setParameter(oscId.current, 'frequency', freq);
    chord.setParameter(oscId.current, 'gain', 0.3);
    chord.setParameter(filtId.current, 'cutoff', 500 + x * 7500);
    chord.playNote(freq, 0.08, 0.1);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath(); ctx.arc(e.clientX - rect.left, e.clientY - rect.top, 3, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${y * 270}, 70%, 60%)`; ctx.fill();
  }, [drawing, active, chord]);

  return (
    <div className="w-full max-w-4xl">
      <h2 className="text-3xl font-light mb-2">Time Sculptor</h2>
      <p className="text-white/40 text-sm mb-4 font-mono">Draw = play. Y → chord.setParameter(osc, 'frequency', f)</p>
      <canvas ref={canvasRef} width={800} height={400}
        className="w-full rounded-lg cursor-crosshair border border-white/10" style={{background:'#111118'}}
        onMouseDown={()=>setDrawing(true)}
        onMouseUp={()=>{setDrawing(false);chord.setParameter(oscId.current,'gain',0);}}
        onMouseLeave={()=>{setDrawing(false);chord.setParameter(oscId.current,'gain',0);}}
        onMouseMove={onDraw}/>
    </div>
  );
}
