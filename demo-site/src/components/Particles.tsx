import { useRef, useEffect, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  hue: number;
  life: number;
  maxLife: number;
}

interface ParticlesProps {
  active: boolean;
  rms?: number;
  mouseX?: number;
  mouseY?: number;
  bloom?: boolean;
}

export function Particles({ active, rms = 0, mouseX = 0.5, mouseY = 0.5, bloom = false }: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const bloomTriggeredRef = useRef(false);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  mouseRef.current = { x: mouseX, y: mouseY };

  const createParticle = useCallback((w: number, h: number, fromCenter = false): Particle => {
    const cx = fromCenter ? w * 0.5 : Math.random() * w;
    const cy = fromCenter ? h * 0.5 : Math.random() * h;
    const angle = Math.random() * Math.PI * 2;
    const speed = fromCenter ? (2 + Math.random() * 6) : (0.1 + Math.random() * 0.3);
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1 + Math.random() * 2.5,
      alpha: 0.2 + Math.random() * 0.5,
      hue: 65 + Math.random() * 30, // lime-ish
      life: 0,
      maxLife: fromCenter ? (60 + Math.random() * 120) : (200 + Math.random() * 400),
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf: number;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // Initialize particles
      if (particlesRef.current.length === 0) {
        for (let i = 0; i < 80; i++) {
          particlesRef.current.push(createParticle(w, h));
        }
      }

      // Bloom effect: burst of particles from center
      if (bloom && !bloomTriggeredRef.current) {
        bloomTriggeredRef.current = true;
        for (let i = 0; i < 60; i++) {
          particlesRef.current.push(createParticle(w, h, true));
        }
      }

      const mx = mouseRef.current.x * w;
      const my = mouseRef.current.y * h;

      // Update and draw particles
      const surviving: Particle[] = [];
      for (const p of particlesRef.current) {
        p.life++;
        if (p.life > p.maxLife) {
          // Respawn
          surviving.push(createParticle(w, h));
          continue;
        }

        // Mouse attraction (very subtle)
        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 10 && dist < 300) {
          p.vx += (dx / dist) * 0.02;
          p.vy += (dy / dist) * 0.02;
        }

        // Audio reactivity: jitter based on RMS
        if (active && rms > 0.01) {
          p.vx += (Math.random() - 0.5) * rms * 2;
          p.vy += (Math.random() - 0.5) * rms * 2;
        }

        // Damping
        p.vx *= 0.99;
        p.vy *= 0.99;

        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < 0) p.x += w;
        if (p.x > w) p.x -= w;
        if (p.y < 0) p.y += h;
        if (p.y > h) p.y -= h;

        // Fade based on life
        const lifeRatio = p.life / p.maxLife;
        const fadeAlpha = lifeRatio < 0.1
          ? lifeRatio * 10
          : lifeRatio > 0.8
            ? (1 - lifeRatio) * 5
            : 1;

        const drawAlpha = p.alpha * fadeAlpha;
        const drawSize = p.size * (1 + rms * 3);

        ctx.beginPath();
        ctx.arc(p.x, p.y, drawSize, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${drawAlpha})`;
        ctx.fill();

        // Draw connections to nearby particles
        if (active) {
          for (const other of particlesRef.current) {
            if (other === p) continue;
            const cdx = other.x - p.x;
            const cdy = other.y - p.y;
            const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
            if (cdist < 80) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(other.x, other.y);
              ctx.strokeStyle = `hsla(${p.hue}, 60%, 50%, ${(1 - cdist / 80) * 0.08})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }

        surviving.push(p);
      }
      particlesRef.current = surviving;

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [active, rms, bloom, createParticle]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none' }}
    />
  );
}
