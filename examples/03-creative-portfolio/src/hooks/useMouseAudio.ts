/**
 * useMouseAudio — Maps mouse position to Chord engine parameters.
 *
 * Demonstrates:
 * - Reading DSL-exposed parameters (brightness, space) by node ID
 * - Mapping continuous input (mouse position) to audio parameters
 * - Using engine.setParameter() for real-time control
 * - Smooth parameter updates via requestAnimationFrame
 *
 * mouseX -> brightness (filter cutoff): left = dark, right = bright
 * mouseY -> space (reverb mix): top = dry, bottom = wet
 */

import { useEffect, useRef } from 'react';
import type { Chord } from '@chord/web';

/** Minimal shape of a compiled patch's exposed parameters. */
interface ExposedParam {
  name: string;
  nodeId: string;
  param: string;
  options: { min?: number; max?: number };
}

interface UseMouseAudioOptions {
  /** The running Chord engine instance. */
  engine: Chord | null;
  /** The compiled patch definition — used to look up exposed parameter node IDs. */
  patchDef: { exposedParams: ExposedParam[] };
}

export function useMouseAudio({ engine, patchDef }: UseMouseAudioOptions) {
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!engine || !engine.started) return;

    // Look up the exposed parameter definitions from the patch.
    // These were registered via p.expose('brightness', ...) and p.expose('space', ...)
    // in the DSL patch definition.
    const brightnessParam = patchDef.exposedParams.find((p) => p.name === 'brightness');
    const spaceParam = patchDef.exposedParams.find((p) => p.name === 'space');

    if (!brightnessParam || !spaceParam) return;

    // Track mouse position (normalized 0-1)
    function onMouseMove(e: MouseEvent) {
      mouseRef.current.x = e.clientX / window.innerWidth;
      mouseRef.current.y = e.clientY / window.innerHeight;
    }

    // Update audio parameters each frame for smooth transitions
    function update() {
      const { x, y } = mouseRef.current;

      // Map mouseX to filter cutoff (brightness)
      // Exponential mapping feels more natural for frequency parameters
      const minCutoff = brightnessParam!.options.min ?? 200;
      const maxCutoff = brightnessParam!.options.max ?? 6000;
      const cutoff = minCutoff * Math.pow(maxCutoff / minCutoff, x);
      engine!.setParameter(brightnessParam!.nodeId, 'cutoff', cutoff);

      // Map mouseY to reverb mix (space)
      // Linear mapping: top of screen = dry, bottom = wet
      const minMix = spaceParam!.options.min ?? 0.1;
      const maxMix = spaceParam!.options.max ?? 0.5;
      const mix = minMix + y * (maxMix - minMix);
      engine!.setParameter(spaceParam!.nodeId, 'mix', mix);

      rafRef.current = requestAnimationFrame(update);
    }

    window.addEventListener('mousemove', onMouseMove);
    rafRef.current = requestAnimationFrame(update);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [engine, engine?.started, patchDef]);
}
