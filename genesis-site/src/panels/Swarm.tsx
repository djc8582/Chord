import { useRef, useEffect, useCallback, useState } from 'react';
import type { Chord } from '@chord/web';

interface Agent { x:number; y:number; vx:number; vy:number; freq:number; oscId:string; }
const PENTA = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0];

export function SwarmPanel({ chord, active }: { chord: Chord; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agents = useRef<Agent[]>([]);
  const mouse = useRef({ x: 0.5, y: 0.5 });
  const [count, setCount] = useState(20);
  const revId = useRef('');

  useEffect(() => {
    if (!revId.current) {
      const rev = chord.addNode('reverb');
      const g = chord.addNode('gain');
      const o = chord.addNode('output');
      chord.setParameter(rev, 'room_size', 0.7);
      chord.setParameter(rev, 'mix', 0.35);
      chord.setParameter(g, 'gain', 0.25);
      chord.connect(rev, 'out', g, 'in');
      chord.connect(g, 'out', o, 'in');
      revId.current = rev;
    }
    const existing = agents.current.length;
    for (let i = existing; i < count; i++) {
      const oscId = chord.addNode('oscillator');
      const freq = PENTA[Math.floor(Math.random() * PENTA.length)];
      chord.setParameter(oscId, 'frequency', freq);
      chord.setParameter(oscId, 'waveform', 0);
      chord.setParameter(oscId, 'gain', active ? 0.015 : 0);
      chord.connect(oscId, 'out', revId.current, 'in');
      agents.current.push({ x: Math.random(), y: Math.random(), vx: (Math.random()-.5)*.005, vy: (Math.random()-.5)*.005, freq, oscId });
    }
    setCount(agents.current.length);
  }, [chord, count, active]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf: number;
    const animate = () => {
      const w = canvas.width = canvas.clientWidth, h = canvas.height = canvas.clientHeight;
      ctx.fillStyle = 'rgba(10,10,15,0.2)'; ctx.fillRect(0,0,w,h);
      const m = mouse.current, aa = agents.current;
      for (const a of aa) {
        const dx=m.x-a.x, dy=m.y-a.y, d=Math.sqrt(dx*dx+dy*dy)+.001;
        a.vx += (dx/d)*.0003; a.vy += (dy/d)*.0003;
        for (const o of aa) { if (o===a) continue;
          const ox=a.x-o.x, oy=a.y-o.y, od=Math.sqrt(ox*ox+oy*oy);
          if (od<.05&&od>0){a.vx+=(ox/od)*.0002;a.vy+=(oy/od)*.0002;}
        }
        a.vx*=.98; a.vy*=.98;
        a.x=Math.max(.02,Math.min(.98,a.x+a.vx));
        a.y=Math.max(.02,Math.min(.98,a.y+a.vy));
        const ni=Math.floor(a.y*PENTA.length);
        const nf=PENTA[Math.min(ni,PENTA.length-1)];
        if(Math.abs(nf-a.freq)>1){a.freq=nf;chord.setParameter(a.oscId,'frequency',nf);}
        const hue=a.y*270;
        ctx.beginPath();ctx.arc(a.x*w,a.y*h,3,0,Math.PI*2);
        ctx.fillStyle=`hsla(${hue},70%,60%,.8)`;ctx.fill();
      }
      ctx.beginPath();ctx.arc(m.x*w,m.y*h,8,0,Math.PI*2);
      ctx.strokeStyle='#c8ff0040';ctx.lineWidth=2;ctx.stroke();
      raf=requestAnimationFrame(animate);
    };
    raf=requestAnimationFrame(animate);
    return()=>cancelAnimationFrame(raf);
  }, [chord, active]);

  const onMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    mouse.current = { x: (e.clientX-r.left)/r.width, y: (e.clientY-r.top)/r.height };
  }, []);

  return (
    <div className="w-full max-w-4xl">
      <h2 className="text-3xl font-light mb-2">Swarm Intelligence</h2>
      <p className="text-white/40 text-sm mb-4 font-mono">{agents.current.length} agents × chord.addNode('oscillator'). Move mouse to attract.</p>
      <canvas ref={canvasRef} onMouseMove={onMove} className="w-full rounded-lg cursor-crosshair border border-white/10" style={{height:500,background:'#0a0a0f'}}/>
    </div>
  );
}
