import { useRef, useState, useCallback, useEffect } from 'react';
import { Chord } from '@chord/web';

interface ChordEngineState {
  engine: Chord;
  isPlaying: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Creates and manages a Chord engine with a generative ambient patch.
 *
 * Patch topology:
 *   oscillator -> filter -> reverb -> output
 *   lfo -> filter (cutoff_mod)
 */
export function useChordEngine(): ChordEngineState {
  const engineRef = useRef<Chord | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Lazily create the engine (once)
  if (!engineRef.current) {
    engineRef.current = new Chord();
  }
  const engine = engineRef.current;

  const start = useCallback(async () => {
    if (engine.started) return;

    // Build the ambient patch before starting
    const osc = engine.addNode('oscillator');
    const filter = engine.addNode('filter');
    const lfo = engine.addNode('lfo');
    const reverb = engine.addNode('reverb');
    const out = engine.addNode('output');

    // Configure oscillator — triangle wave, low fundamental
    engine.setParameter(osc, 'frequency', 110);
    engine.setParameter(osc, 'waveform', 3); // triangle
    engine.setParameter(osc, 'gain', 0.35);

    // Configure filter — lowpass with moderate resonance
    engine.setParameter(filter, 'cutoff', 800);
    engine.setParameter(filter, 'resonance', 4);
    engine.setParameter(filter, 'mode', 0); // lowpass

    // Configure LFO — slow sine wave to sweep the filter
    engine.setParameter(lfo, 'rate', 0.15);
    engine.setParameter(lfo, 'depth', 0.7);
    engine.setParameter(lfo, 'waveform', 0); // sine

    // Configure reverb — spacious room
    engine.setParameter(reverb, 'room_size', 0.7);
    engine.setParameter(reverb, 'damping', 0.4);
    engine.setParameter(reverb, 'mix', 0.4);

    // Connect: osc -> filter -> reverb -> output
    engine.connect(osc, 'out', filter, 'in');
    engine.connect(filter, 'out', reverb, 'in');
    engine.connect(reverb, 'out', out, 'in');

    // Connect LFO to filter cutoff modulation
    engine.connect(lfo, 'out', filter, 'cutoff_mod');

    await engine.start();
    setIsPlaying(true);
  }, [engine]);

  const stop = useCallback(() => {
    engine.stop();
    setIsPlaying(false);
  }, [engine]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (engine.started) {
        engine.stop();
      }
    };
  }, [engine]);

  return { engine, isPlaying, start, stop };
}
