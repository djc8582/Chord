'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useAudio } from '@/providers/AudioProvider';

// ---------------------------------------------------------------------------
// SonicButton
//
// A button that plays audio feedback on hover and click using the real
// Chord engine. Hover produces a very quiet high note; click produces
// a bright short note via playNote().
//
// Uses framer-motion whileHover / whileTap for visual feedback.
// ---------------------------------------------------------------------------

interface SonicButtonProps {
  children: ReactNode;
  /** Optional click handler (in addition to the sound). */
  onClick?: () => void;
  /** Optional className. */
  className?: string;
  /** Variant changes the visual style. */
  variant?: 'primary' | 'secondary';
}

export function SonicButton({
  children,
  onClick,
  className = '',
  variant = 'primary',
}: SonicButtonProps) {
  const { engine, started, playUISound } = useAudio();

  const handleClick = () => {
    playUISound('click');
    onClick?.();
  };

  const handleHover = () => {
    // Only play hover sound if engine is running
    if (engine && started) {
      playUISound('hover');
    }
  };

  const baseStyles: React.CSSProperties = {
    padding: '14px 32px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    color: variant === 'primary' ? '#0a0a0a' : '#e0e0e0',
    background:
      variant === 'primary'
        ? 'linear-gradient(135deg, #60a5fa, #a78bfa)'
        : 'rgba(255,255,255,0.08)',
    backdropFilter: variant === 'secondary' ? 'blur(8px)' : undefined,
    letterSpacing: '-0.01em',
  };

  return (
    <motion.button
      style={{ ...baseStyles }}
      className={className}
      onClick={handleClick}
      onHoverStart={handleHover}
      whileHover={{ scale: 1.04, boxShadow: '0 4px 24px rgba(96,165,250,0.25)' }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      {children}
    </motion.button>
  );
}
