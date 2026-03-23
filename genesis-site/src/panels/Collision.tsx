import { useRef, useEffect, useCallback, useState } from 'react';
import type { Chord } from '@chord/web';

interface Ball { x: number; y: number; vx: number; vy: number; radius: number; hue: number; mass: number; }
const SCALE = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];

export function CollisionPanel({ chord, active }: { chord: Chord; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballsRef = useRef<Ball[]>([]);
  const [count, setCount] = useState(0);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const radius = 15 + Math.random() * 25;
    ballsRef.current.push({ x, y, vx: (Math.random()-.5)*8, vy: (Math.random()-.5)*8, radius, hue: Math.random()*360, mass: radius/20 });
    setCount(ballsRef.current.length);
    const note = SCALE[Math.floor((y / rect.height) * SCALE.length)] ?? 440;
    chord.playNote(note, 0.3, 0.15);
  }, [chord]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf: number;
    const animate = () => {
      const w = canvas.width = canvas.clientWidth, h = canvas.height = canvas.clientHeight;
      ctx.fillStyle = 'rgba(10,10,15,0.15)'; ctx.fillRect(0,0,w,h);
      const balls = ballsRef.current;
      for (const b of balls) {
        b.vy += 0.15; b.x += b.vx; b.y += b.vy;
        if (b.x-b.radius<0){b.x=b.radius;b.vx=Math.abs(b.vx)*0.9; hit(b);}
        if (b.x+b.radius>w){b.x=w-b.radius;b.vx=-Math.abs(b.vx)*0.9; hit(b);}
        if (b.y+b.radius>h){b.y=h-b.radius;b.vy=-Math.abs(b.vy)*0.85; hit(b);}
        if (b.y-b.radius<0){b.y=b.radius;b.vy=Math.abs(b.vy)*0.9;}
      }
      for (let i=0;i<balls.length;i++) for (let j=i+1;j<balls.length;j++) {
        const dx=balls[j].x-balls[i].x, dy=balls[j].y-balls[i].y;
        const dist=Math.sqrt(dx*dx+dy*dy), min=balls[i].radius+balls[j].radius;
        if (dist<min&&dist>0) {
          const nx=dx/dist, ny=dy/dist, dvn=(balls[i].vx-balls[j].vx)*nx+(balls[i].vy-balls[j].vy)*ny;
          if (dvn>0) {
            const imp=2*dvn/(balls[i].mass+balls[j].mass);
            balls[i].vx-=imp*balls[j].mass*nx; balls[i].vy-=imp*balls[j].mass*ny;
            balls[j].vx+=imp*balls[i].mass*nx; balls[j].vy+=imp*balls[i].mass*ny;
            const ol=min-dist; balls[i].x-=ol*nx*.5; balls[i].y-=ol*ny*.5; balls[j].x+=ol*nx*.5; balls[j].y+=ol*ny*.5;
            if (active && Math.abs(dvn)>0.5) {
              const avgY=(balls[i].y+balls[j].y)/2;
              const freq=SCALE[Math.floor((avgY/h)*SCALE.length)]??440;
              chord.playNote(freq, 0.4, Math.min(Math.abs(dvn)*0.05, 0.3));
            }
          }
        }
      }
      for (const b of balls) {
        ctx.beginPath(); ctx.arc(b.x,b.y,b.radius,0,Math.PI*2);
        ctx.fillStyle=`hsla(${b.hue},70%,60%,0.8)`; ctx.fill();
        ctx.strokeStyle=`hsla(${b.hue},70%,80%,0.3)`; ctx.lineWidth=2; ctx.stroke();
      }
      raf=requestAnimationFrame(animate);
    };
    function hit(b:Ball){if(!active)return;const s=Math.sqrt(b.vx*b.vx+b.vy*b.vy);if(s<1)return;chord.playNote(100+(1-b.mass/3)*400,0.15,Math.min(s*0.02,0.15));}
    raf=requestAnimationFrame(animate);
    return()=>cancelAnimationFrame(raf);
  }, [chord, active]);

  return (
    <div className="w-full max-w-4xl">
      <h2 className="text-3xl font-light mb-2">Collision Orchestra</h2>
      <p className="text-white/40 text-sm mb-4 font-mono">Click to throw. Every collision → chord.playNote()</p>
      <canvas ref={canvasRef} onClick={handleClick} className="w-full rounded-lg cursor-crosshair border border-white/10" style={{height:500,background:'#111118'}}/>
      <p className="text-white/20 text-xs mt-2 font-mono">{count} balls active</p>
    </div>
  );
}
