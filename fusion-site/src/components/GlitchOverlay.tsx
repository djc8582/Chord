/**
 * Visual glitch overlay — active during glitch sections.
 * Chromatic aberration, scan lines, displacement.
 */

import { motion } from 'framer-motion';
import { useAudio } from '../providers/AudioProvider.js';

export function GlitchOverlay() {
  const { state } = useAudio();

  if (!state.isGlitching) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Scan lines */}
      <div className="absolute inset-0 glitch-scanlines" />

      {/* Chromatic aberration — red/cyan channel split */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, rgba(255,0,0,0.03) 33%, transparent 33%, transparent 66%, rgba(0,255,255,0.03) 66%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Random displacement blocks */}
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute bg-white/5"
          style={{
            top: `${Math.random() * 100}%`,
            left: 0,
            right: 0,
            height: `${2 + Math.random() * 8}px`,
          }}
          animate={{
            x: [0, (Math.random() - 0.5) * 20, 0],
            opacity: [0, 0.3, 0],
          }}
          transition={{
            duration: 0.1,
            repeat: Infinity,
            repeatDelay: Math.random() * 0.3,
          }}
        />
      ))}
    </motion.div>
  );
}
