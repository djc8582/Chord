/**
 * ParticleHero — Full-viewport hero section with audio-reactive particles.
 *
 * Demonstrates:
 * - createParticles() to instantiate a canvas-based particle system
 * - getAnalysisFrame() to extract audio analysis data each frame
 * - Layering a <canvas> behind hero text for a generative background
 * - Responsive canvas sizing via ResizeObserver
 * - The "sunset" theme from Chord's built-in visualizer themes
 *
 * Particles react to RMS volume and beat detection. When the ambient pad
 * swells, more particles emit; on beat events, a burst fires from center.
 */

import { useEffect, useRef } from 'react';
import { createParticles, getAnalysisFrame } from '@chord/web';
import type { Chord } from '@chord/web';

interface ParticleHeroProps {
  engine: Chord | null;
}

export function ParticleHero({ engine }: ParticleHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<ReturnType<typeof createParticles> | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize the particle system with the sunset theme.
    // createParticles returns an object with update() and resize() methods.
    const particles = createParticles(canvas, {
      theme: 'sunset',
      count: 300,
      reactTo: 'rms',       // Particles respond to overall volume
      trails: 0.3,          // 30% trail persistence for a ghostly effect
      gravity: 0.02,        // Gentle downward drift
    });
    particlesRef.current = particles;

    // Size the canvas to fill its container
    function resize() {
      const rect = canvas!.parentElement!.getBoundingClientRect();
      particles.resize(rect.width, rect.height);
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement!);

    // Animation loop: extract audio analysis and feed it to the particles
    function animate() {
      if (engine && engine.started) {
        // getAnalysisFrame extracts RMS, beat detection, spectral bands, etc.
        const frame = getAnalysisFrame(engine);
        particles.update(frame);
      } else {
        // When audio is off, provide a silent frame so particles still render
        particles.update({
          waveform: new Float32Array(0),
          spectrum: new Float32Array(0),
          rms: 0, peak: 0, rmsDB: -96,
          sub: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, presence: 0, brilliance: 0,
          spectralCentroid: 1000, isBeat: false, beatStrength: 0,
          smoothRms: 0, attackEnvelope: 0,
        });
      }
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [engine, engine?.started]);

  return (
    <section style={styles.hero}>
      {/* Canvas fills the entire hero section, sits behind the text */}
      <canvas ref={canvasRef} style={styles.canvas} />

      {/* Hero text overlaid on top of the particle canvas */}
      <div style={styles.content}>
        <h1 style={styles.title}>
          Creative Developer
        </h1>
        <p style={styles.subtitle}>
          Building experiences at the intersection of sound, code, and design.
        </p>
        <p style={styles.hint}>
          Move your mouse to shape the sound.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Styles — inline to keep the example self-contained
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  hero: {
    position: 'relative',
    width: '100%',
    height: '100vh',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  content: {
    position: 'relative',
    zIndex: 1,
    textAlign: 'center',
    color: '#fff',
    padding: '0 24px',
  },
  title: {
    fontSize: 'clamp(2.5rem, 6vw, 5rem)',
    fontWeight: 700,
    margin: 0,
    letterSpacing: '-0.02em',
    // Audio-reactive: title gently pulses with --chord-smooth-rms
    // (set by bindAudioToCSS in App.tsx)
    textShadow: '0 0 40px rgba(255,107,53,0.4)',
    transform: 'scale(calc(1 + var(--chord-smooth-rms, 0) * 0.08))',
    transition: 'transform 0.1s ease-out',
  },
  subtitle: {
    fontSize: 'clamp(1rem, 2vw, 1.5rem)',
    fontWeight: 300,
    marginTop: 16,
    opacity: 0.8,
    maxWidth: 600,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  hint: {
    fontSize: '0.875rem',
    fontWeight: 400,
    marginTop: 32,
    opacity: 0.5,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  },
};
