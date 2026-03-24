/**
 * Game UI Example — Adaptive audio responds to gameplay state.
 *
 * Click enemies to defeat them. Score increases danger level.
 * Audio crossfades between peaceful and combat layers.
 * Health drops on misclicks. Low health = dark, distorted audio.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { bindAudioToCSS } from '@chord/web';
import { createGameAudio, type GameAudioControls } from './audio/game-engine.js';

interface Enemy {
  id: number;
  x: number;
  y: number;
  size: number;
  hp: number;
}

export function App() {
  const audioRef = useRef<GameAudioControls | null>(null);
  const [started, setStarted] = useState(false);
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(1);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const nextId = useRef(0);

  // Initialize audio
  const start = useCallback(async () => {
    if (audioRef.current) return;
    const audio = createGameAudio();
    audioRef.current = audio;
    await audio.engine.start();
    bindAudioToCSS(audio.engine, document.documentElement);
    setStarted(true);
  }, []);

  // Cleanup
  useEffect(() => () => audioRef.current?.engine.stop(), []);

  // Spawn enemies periodically
  useEffect(() => {
    if (!started) return;
    const interval = setInterval(() => {
      setEnemies((prev) => {
        if (prev.length >= 8) return prev;
        return [
          ...prev,
          {
            id: nextId.current++,
            x: 10 + Math.random() * 80,
            y: 10 + Math.random() * 70,
            size: 30 + Math.random() * 30,
            hp: 1,
          },
        ];
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [started]);

  // Update danger based on enemy count
  useEffect(() => {
    const danger = Math.min(enemies.length / 6, 1);
    audioRef.current?.setDanger(danger);
  }, [enemies.length]);

  // Update health audio
  useEffect(() => {
    audioRef.current?.setHealth(health);
  }, [health]);

  // Hit an enemy
  const hitEnemy = useCallback((id: number) => {
    setEnemies((prev) => prev.filter((e) => e.id !== id));
    const newScore = score + 1;
    setScore(newScore);

    audioRef.current?.triggerHit();

    // Achievement sounds at milestones
    if (newScore % 5 === 0) {
      const tier = Math.floor(newScore / 5);
      audioRef.current?.triggerAchievement(tier);
    }
  }, [score]);

  // Miss click — lose health
  const miss = useCallback(() => {
    setHealth((h) => Math.max(0, h - 0.1));
    audioRef.current?.triggerGlitch();
  }, []);

  if (!started) {
    return (
      <div style={styles.startScreen}>
        <h1 style={styles.title}>Chord Game Audio Demo</h1>
        <p style={styles.subtitle}>Adaptive music responds to gameplay</p>
        <motion.button
          style={styles.startButton}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={start}
        >
          Start Game
        </motion.button>
      </div>
    );
  }

  return (
    <div style={styles.gameScreen} onClick={miss}>
      {/* HUD — audio-reactive via CSS custom properties */}
      <div style={styles.hud}>
        <div style={styles.hudItem}>
          Score: <span style={styles.hudValue}>{score}</span>
        </div>
        <div style={styles.healthBar}>
          <motion.div
            style={{
              ...styles.healthFill,
              background: health > 0.3 ? '#10b981' : '#ef4444',
            }}
            animate={{ width: `${health * 100}%` }}
          />
        </div>
        <div
          style={{
            ...styles.hudItem,
            // Audio-reactive glow via CSS custom properties
            textShadow: 'var(--chord-beat, 0) === 1 ? 0 0 10px #fff : none',
          }}
        >
          Enemies: {enemies.length}
        </div>
      </div>

      {/* Game world */}
      <div style={styles.world}>
        <AnimatePresence>
          {enemies.map((enemy) => (
            <motion.div
              key={enemy.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0, transition: { duration: 0.15 } }}
              style={{
                ...styles.enemy,
                left: `${enemy.x}%`,
                top: `${enemy.y}%`,
                width: enemy.size,
                height: enemy.size,
              }}
              onClick={(e) => {
                e.stopPropagation();
                hitEnemy(enemy.id);
              }}
              whileHover={{ scale: 1.1, borderColor: '#ef4444' }}
              whileTap={{ scale: 0.8 }}
            />
          ))}
        </AnimatePresence>

        {enemies.length === 0 && (
          <p style={styles.peaceful}>Peaceful... for now</p>
        )}
      </div>

      {/* Audio-reactive border glow */}
      <div
        style={{
          ...styles.borderGlow,
          boxShadow: `inset 0 0 calc(var(--chord-bass, 0) * 30px + 5px) rgba(124, 92, 255, calc(var(--chord-rms, 0) * 0.5))`,
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  startScreen: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#0a0a1a',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
  },
  title: { fontSize: 48, fontWeight: 700, marginBottom: 8 },
  subtitle: { fontSize: 18, color: '#888', marginBottom: 40 },
  startButton: {
    padding: '16px 48px',
    fontSize: 20,
    background: '#7c5cff',
    color: 'white',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
  },
  gameScreen: {
    position: 'relative',
    height: '100vh',
    background: '#0a0a1a',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
    overflow: 'hidden',
    cursor: 'crosshair',
  },
  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    padding: '16px 24px',
    background: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  hudItem: { fontSize: 16, color: '#aaa' },
  hudValue: { color: '#fff', fontWeight: 700, fontSize: 20 },
  healthBar: {
    flex: 1,
    height: 8,
    background: '#1a1a2e',
    borderRadius: 4,
    overflow: 'hidden',
  },
  healthFill: { height: '100%', borderRadius: 4 },
  world: {
    position: 'absolute',
    inset: '60px 0 0 0',
  },
  enemy: {
    position: 'absolute',
    borderRadius: '50%',
    background: 'radial-gradient(circle, #ff3366 0%, #cc0033 100%)',
    border: '2px solid #ff6699',
    cursor: 'pointer',
    transform: 'translate(-50%, -50%)',
  },
  peaceful: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: 24,
    color: '#334',
  },
  borderGlow: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 20,
  },
};
