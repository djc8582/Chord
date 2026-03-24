/**
 * Meditation App — Generative audio synced to breathing.
 *
 * The ambient drone follows the breath cycle:
 *   Inhale → filter opens, volume rises, brighter texture
 *   Hold → sustain at peak
 *   Exhale → filter closes, volume drops, darker texture
 *
 * Singing bowls strike at random intervals (15-30s).
 * Audio-reactive CSS drives the breathing circle visualization.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { bindAudioToCSS } from '@chord/web';
import { createMeditationPatch, type MeditationControls } from './audio/meditation-patch.js';
import { useBreathCycle, type BreathStage } from './hooks/useBreathCycle.js';

const STAGE_LABELS: Record<BreathStage, string> = {
  inhale: 'Breathe In',
  hold: 'Hold',
  exhale: 'Breathe Out',
};

const STAGE_COLORS: Record<BreathStage, string> = {
  inhale: '#6ee7b7',
  hold: '#93c5fd',
  exhale: '#c4b5fd',
};

export function App() {
  const audioRef = useRef<MeditationControls | null>(null);
  const bowlTimer = useRef<ReturnType<typeof setTimeout>>();
  const [started, setStarted] = useState(false);
  const [duration, setDuration] = useState(5); // minutes
  const [timeLeft, setTimeLeft] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);

  const breath = useBreathCycle(sessionActive);

  // Sync breath phase to audio
  useEffect(() => {
    audioRef.current?.setBreathPhase(breath.phase);
  }, [breath.phase]);

  // Schedule singing bowl strikes at random intervals
  const scheduleBowl = useCallback(() => {
    const delay = 15000 + Math.random() * 15000; // 15-30 seconds
    bowlTimer.current = setTimeout(() => {
      audioRef.current?.bowlStrike();
      if (sessionActive) scheduleBowl();
    }, delay);
  }, [sessionActive]);

  // Session timer
  useEffect(() => {
    if (!sessionActive) return;
    const totalSeconds = duration * 60;
    setTimeLeft(totalSeconds);

    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setSessionActive(false);
          audioRef.current?.engine.stop();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionActive, duration]);

  const startSession = useCallback(async () => {
    const audio = createMeditationPatch();
    audioRef.current = audio;
    await audio.engine.start();
    bindAudioToCSS(audio.engine, document.documentElement);
    setStarted(true);
    setSessionActive(true);
    scheduleBowl();
  }, [scheduleBowl]);

  // Cleanup
  useEffect(
    () => () => {
      audioRef.current?.engine.stop();
      clearTimeout(bowlTimer.current);
    },
    [],
  );

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ─── Start Screen ───
  if (!started) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>Breathe</h1>
        <p style={styles.subtitle}>Generative meditation with Chord</p>

        <div style={styles.durationPicker}>
          {[3, 5, 10, 15].map((d) => (
            <motion.button
              key={d}
              style={{
                ...styles.durationButton,
                background: d === duration ? '#6ee7b7' : '#1a1a2e',
                color: d === duration ? '#0a0a1a' : '#888',
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setDuration(d)}
            >
              {d} min
            </motion.button>
          ))}
        </div>

        <motion.button
          style={styles.startButton}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={startSession}
        >
          Begin
        </motion.button>
      </div>
    );
  }

  // ─── Active Session ───
  return (
    <div style={styles.container}>
      {/* Breathing circle — size follows breath phase */}
      <div style={styles.circleContainer}>
        <motion.div
          style={{
            ...styles.circle,
            borderColor: STAGE_COLORS[breath.stage],
            boxShadow: `0 0 ${30 + breath.phase * 40}px ${STAGE_COLORS[breath.stage]}40`,
          }}
          animate={{
            scale: 0.6 + breath.phase * 0.4,
            opacity: 0.4 + breath.phase * 0.6,
          }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />

        {/* Inner audio-reactive ring via CSS custom properties */}
        <div
          style={{
            ...styles.innerRing,
            transform: `scale(calc(0.3 + var(--chord-rms, 0) * 0.3))`,
            opacity: `calc(0.2 + var(--chord-bass, 0) * 0.4)`,
          }}
        />
      </div>

      {/* Breath instruction */}
      <motion.p
        key={breath.stage}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ ...styles.instruction, color: STAGE_COLORS[breath.stage] }}
      >
        {STAGE_LABELS[breath.stage]}
      </motion.p>

      {/* Timer */}
      <p style={styles.timer}>{formatTime(timeLeft)}</p>

      {/* Stop button */}
      <motion.button
        style={styles.stopButton}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          setSessionActive(false);
          audioRef.current?.engine.stop();
          setStarted(false);
        }}
      >
        End Session
      </motion.button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#0a0a1a',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
  },
  title: { fontSize: 56, fontWeight: 300, letterSpacing: '0.1em', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#555', marginBottom: 48 },
  durationPicker: { display: 'flex', gap: 12, marginBottom: 40 },
  durationButton: {
    padding: '10px 20px',
    fontSize: 16,
    border: '1px solid #333',
    borderRadius: 8,
    cursor: 'pointer',
  },
  startButton: {
    padding: '16px 64px',
    fontSize: 20,
    background: '#6ee7b7',
    color: '#0a0a1a',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    fontWeight: 600,
  },
  circleContainer: {
    position: 'relative',
    width: 300,
    height: 300,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  circle: {
    width: 280,
    height: 280,
    borderRadius: '50%',
    border: '2px solid',
    background: 'transparent',
  },
  innerRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.1)',
    transition: 'transform 0.1s, opacity 0.1s',
  },
  instruction: {
    fontSize: 24,
    fontWeight: 300,
    letterSpacing: '0.15em',
    marginBottom: 16,
  },
  timer: {
    fontSize: 48,
    fontWeight: 200,
    color: '#444',
    fontVariantNumeric: 'tabular-nums',
    marginBottom: 40,
  },
  stopButton: {
    padding: '10px 32px',
    fontSize: 14,
    background: 'transparent',
    color: '#555',
    border: '1px solid #333',
    borderRadius: 8,
    cursor: 'pointer',
  },
};
