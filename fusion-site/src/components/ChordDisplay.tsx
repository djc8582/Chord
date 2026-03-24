/**
 * Live chord name display — updates as the progression advances.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useAudio } from '../providers/AudioProvider.js';

export function ChordDisplay() {
  const { state, started } = useAudio();

  if (!started) return null;

  return (
    <div className="fixed top-6 right-6 z-40 font-mono text-xs">
      <AnimatePresence mode="wait">
        <motion.div
          key={state.currentChord}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 0.4, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          transition={{ duration: 0.2 }}
          className="text-gold"
        >
          {state.currentChord}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
