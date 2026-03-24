'use client';

import { useEffect, useRef } from 'react';
import type { Chord } from '@chord/web';

// ---------------------------------------------------------------------------
// useScrollAudio
//
// Maps the current scroll position to Chord engine parameters:
//   - Filter cutoff:  200 Hz (top) -> 4000 Hz (bottom)
//   - Reverb mix:     0.15 (top)   -> 0.35 (bottom)
//
// This makes the ambient pad grow brighter and more spacious as the user
// scrolls deeper into the page.
// ---------------------------------------------------------------------------

interface ScrollAudioOptions {
  /** The Chord filter node ID to control. */
  filterId: string;
  /** The Chord reverb node ID to control. */
  reverbId: string;
}

export function useScrollAudio(
  engine: Chord | null,
  options: ScrollAudioOptions | null,
) {
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!engine || !engine.started || !options) return;

    const { filterId, reverbId } = options;

    function onFrame() {
      // Normalize scroll: 0 at top, 1 at bottom
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const t = maxScroll > 0 ? Math.min(window.scrollY / maxScroll, 1) : 0;

      // Filter cutoff: 200 Hz -> 4000 Hz (exponential feels more natural)
      const cutoff = 200 * Math.pow(4000 / 200, t); // 200 -> 4000
      engine!.setParameter(filterId, 'cutoff', cutoff);

      // Reverb mix: 0.15 -> 0.35
      const reverbMix = 0.15 + t * 0.2;
      engine!.setParameter(reverbId, 'mix', reverbMix);

      rafRef.current = requestAnimationFrame(onFrame);
    }

    rafRef.current = requestAnimationFrame(onFrame);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [engine, options]);
}
