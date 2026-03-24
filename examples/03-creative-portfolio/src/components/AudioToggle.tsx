/**
 * AudioToggle — Floating button to start/stop the Chord audio engine.
 *
 * Demonstrates:
 * - Handling browser autoplay policy (audio context must start from user gesture)
 * - engine.start() / engine.stop() lifecycle
 * - Showing a small animated waveform icon when audio is playing
 * - Framer Motion for button entrance and interaction animations
 *
 * This button is the single entry point for audio. Nothing else calls
 * engine.start() — all other components assume audio may or may not be running.
 */

import { motion, AnimatePresence } from 'framer-motion';

interface AudioToggleProps {
  playing: boolean;
  onToggle: () => void;
}

export function AudioToggle({ playing, onToggle }: AudioToggleProps) {
  return (
    <motion.button
      style={styles.button}
      onClick={onToggle}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, type: 'spring', stiffness: 300 }}
      aria-label={playing ? 'Stop audio' : 'Start audio'}
    >
      <AnimatePresence mode="wait">
        {playing ? (
          // Animated waveform bars when playing
          <motion.div
            key="playing"
            style={styles.bars}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {[0, 1, 2, 3].map((i) => (
              <motion.span
                key={i}
                style={styles.bar}
                animate={{
                  height: [8, 16 + i * 3, 6, 14 - i * 2, 8],
                }}
                transition={{
                  duration: 0.8 + i * 0.1,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </motion.div>
        ) : (
          // Play icon when stopped
          <motion.span
            key="stopped"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={styles.label}
          >
            Sound
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  button: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 1000,
    width: 56,
    height: 56,
    borderRadius: '50%',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    background: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(12px)',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    fontFamily: 'inherit',
  },
  bars: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 3,
    height: 20,
  },
  bar: {
    display: 'block',
    width: 3,
    borderRadius: 2,
    background: '#ff6b35',
  },
  label: {
    display: 'block',
  },
};
