/**
 * Audio-reactive particle system.
 */
import type { AudioAnalysisFrame, VisualizerTheme } from './types.js';
import { getTheme } from './types.js';

export interface ParticlesOptions {
  theme?: string | VisualizerTheme;
  count?: number;
  reactTo?: 'rms' | 'beat' | 'bass' | 'mid' | 'presence';
  color?: 'solid' | 'spectrum' | 'gradient';
  trails?: number;
  gravity?: number;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  life: number; maxLife: number;
  hue: number;
}

export function createParticles(canvas: HTMLCanvasElement, options: ParticlesOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const theme = typeof options.theme === 'string' ? getTheme(options.theme) : (options.theme ?? getTheme('chord'));
  const maxCount = options.count ?? 300;
  const reactTo = options.reactTo ?? 'rms';
  const trails = options.trails ?? 0.3;
  const gravity = options.gravity ?? 0.02;

  const particles: Particle[] = [];

  function emit(x: number, y: number, energy: number) {
    if (particles.length >= maxCount) return;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + energy * 4;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      size: 1 + energy * 4,
      life: 1,
      maxLife: 30 + energy * 90,
      hue: Math.random() * 360,
    });
  }

  return {
    update(frame: AudioAnalysisFrame) {
      const w = canvas.width;
      const h = canvas.height;

      // Trail fade
      ctx.fillStyle = `rgba(${hexToRgb(theme.background)}, ${1 - trails})`;
      ctx.fillRect(0, 0, w, h);

      // Get reactivity value
      let energy = 0;
      switch (reactTo) {
        case 'rms': energy = frame.smoothRms; break;
        case 'beat': energy = frame.isBeat ? 1 : 0; break;
        case 'bass': energy = frame.bass; break;
        case 'mid': energy = frame.mid; break;
        case 'presence': energy = frame.presence; break;
      }

      // Emit particles
      const emitCount = Math.floor(energy * 5);
      for (let i = 0; i < emitCount; i++) {
        emit(w * 0.5 + (Math.random() - 0.5) * w * 0.3, h * 0.6, energy);
      }

      // Beat burst
      if (frame.isBeat) {
        for (let i = 0; i < 10; i++) {
          emit(w * 0.5, h * 0.5, 0.8);
        }
      }

      // Update and draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += gravity;
        p.life -= 1 / p.maxLife;

        if (p.life <= 0 || p.x < -20 || p.x > w + 20 || p.y > h + 20) {
          particles.splice(i, 1);
          continue;
        }

        const alpha = p.life;
        const size = p.size * (0.5 + p.life * 0.5);

        if (options.color === 'spectrum') {
          const hue = (frame.spectralCentroid / 8000) * 300;
          ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${alpha})`;
        } else {
          ctx.fillStyle = `${theme.primary}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`;
        }

        if (theme.glow) {
          ctx.shadowColor = theme.primary;
          ctx.shadowBlur = size * 2;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
    },

    resize(width: number, height: number) {
      canvas.width = width;
      canvas.height = height;
    },
  };
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `${r},${g},${b}`;
}
