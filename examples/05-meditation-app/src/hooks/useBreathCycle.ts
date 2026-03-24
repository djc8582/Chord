/**
 * Breathing Cycle Hook
 *
 * Implements the 4-7-8 breathing technique:
 *   - Inhale for 4 counts
 *   - Hold for 7 counts
 *   - Exhale for 8 counts
 *
 * Returns a phase value (0-1) that smoothly tracks the breath cycle,
 * plus the current stage name for UI display.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type BreathStage = 'inhale' | 'hold' | 'exhale';

interface BreathState {
  /** 0 (fully exhaled) to 1 (fully inhaled) */
  phase: number;
  /** Current stage of the breath cycle */
  stage: BreathStage;
  /** Seconds elapsed in current cycle */
  elapsed: number;
  /** Total cycle duration in seconds */
  cycleDuration: number;
}

// 4-7-8 ratio, scaled to a reasonable total duration
const INHALE_BEATS = 4;
const HOLD_BEATS = 7;
const EXHALE_BEATS = 8;
const TOTAL_BEATS = INHALE_BEATS + HOLD_BEATS + EXHALE_BEATS;

export function useBreathCycle(
  active: boolean,
  /** Duration of one full beat in seconds (default 1s = 19s cycle) */
  beatDuration: number = 1.0,
): BreathState {
  const [state, setState] = useState<BreathState>({
    phase: 0,
    stage: 'inhale',
    elapsed: 0,
    cycleDuration: TOTAL_BEATS * beatDuration,
  });

  const startTime = useRef(0);
  const rafId = useRef(0);

  const tick = useCallback(() => {
    const now = performance.now() / 1000;
    const cycleDuration = TOTAL_BEATS * beatDuration;
    const elapsed = (now - startTime.current) % cycleDuration;

    const inhaleEnd = INHALE_BEATS * beatDuration;
    const holdEnd = (INHALE_BEATS + HOLD_BEATS) * beatDuration;

    let stage: BreathStage;
    let phase: number;

    if (elapsed < inhaleEnd) {
      stage = 'inhale';
      // Smooth ease-in-out rise from 0 to 1
      const t = elapsed / inhaleEnd;
      phase = t * t * (3 - 2 * t); // smoothstep
    } else if (elapsed < holdEnd) {
      stage = 'hold';
      phase = 1; // held at peak
    } else {
      stage = 'exhale';
      // Smooth ease-in-out fall from 1 to 0
      const t = (elapsed - holdEnd) / (cycleDuration - holdEnd);
      phase = 1 - t * t * (3 - 2 * t); // inverse smoothstep
    }

    setState({ phase, stage, elapsed, cycleDuration });
    rafId.current = requestAnimationFrame(tick);
  }, [beatDuration]);

  useEffect(() => {
    if (active) {
      startTime.current = performance.now() / 1000;
      rafId.current = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(rafId.current);
  }, [active, tick]);

  return state;
}
