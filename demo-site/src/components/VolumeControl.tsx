import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Chord } from '@chord/web';

interface VolumeControlProps {
  chord: Chord | null;
}

export function VolumeControl({ chord }: VolumeControlProps) {
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.25);

  const toggleMute = () => {
    if (muted) {
      chord?.setMasterVolume(volume);
      setMuted(false);
    } else {
      chord?.setMasterVolume(0);
      setMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (!muted) {
      chord?.setMasterVolume(v);
    }
  };

  return (
    <motion.div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-4 py-2.5"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 1, duration: 0.5 }}
    >
      {/* Mute button */}
      <button
        onClick={toggleMute}
        className="text-white/60 hover:text-lime-400 transition-colors w-5 h-5 flex items-center justify-center"
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </button>

      {/* Volume slider */}
      <input
        type="range"
        min="0"
        max="0.5"
        step="0.01"
        value={muted ? 0 : volume}
        onChange={handleVolumeChange}
        className="w-20 h-1 appearance-none bg-white/20 rounded-full outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-lime-400 [&::-webkit-slider-thumb]:cursor-pointer"
      />
    </motion.div>
  );
}
