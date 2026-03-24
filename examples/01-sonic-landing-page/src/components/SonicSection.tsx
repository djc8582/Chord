'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useAudio } from '@/providers/AudioProvider';

// ---------------------------------------------------------------------------
// SonicSection
//
// Wraps a page section. When the section scrolls into view (via
// IntersectionObserver), it plays a note from the pentatonic scale
// using Chord's playScaleNote(). The `index` prop determines the
// scale degree, so adjacent sections play different notes.
//
// Children are wrapped in a framer-motion fade-in animation.
// ---------------------------------------------------------------------------

interface SonicSectionProps {
  /** Scale degree (0-4 for pentatonic). Each section gets a different note. */
  index: number;
  /** Optional octave offset. Default 0. */
  octave?: number;
  /** Content to render inside the section. */
  children: ReactNode;
  /** Optional className for the outer wrapper. */
  className?: string;
  /** Optional inline styles for the outer wrapper. */
  style?: React.CSSProperties;
}

export function SonicSection({
  index,
  octave = 0,
  children,
  className = '',
  style,
}: SonicSectionProps) {
  const { engine, started } = useAudio();
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  // Track whether we already played the sound so it only fires once per scroll-in
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);

          // Play the note only once per visibility cycle
          if (!hasPlayedRef.current && engine && started) {
            engine.playScaleNote(index, octave, 0.5);
            hasPlayedRef.current = true;
          }
        } else {
          // Reset so the note plays again if the user scrolls back
          setIsVisible(false);
          hasPlayedRef.current = false;
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [engine, started, index, octave]);

  return (
    <div ref={sectionRef} className={className} style={style}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </div>
  );
}
