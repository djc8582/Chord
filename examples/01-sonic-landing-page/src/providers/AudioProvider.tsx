'use client';

import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Chord, bindAudioToCSS } from '@chord/web';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface AudioContextValue {
  engine: Chord | null;
  started: boolean;
  /** Play a short UI sound by name. */
  playUISound: (type: 'click' | 'hover' | 'success' | 'enter') => void;
}

const AudioCtx = createContext<AudioContextValue>({
  engine: null,
  started: false,
  playUISound: () => {},
});

export const useAudio = () => useContext(AudioCtx);

// ---------------------------------------------------------------------------
// Node IDs stored after graph construction
// ---------------------------------------------------------------------------

interface PatchIds {
  osc1: string;
  osc2: string;
  mixer: string;
  filter: string;
  lfo: string;
  reverb: string;
  output: string;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AudioProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<Chord | null>(null);
  const patchRef = useRef<PatchIds | null>(null);
  const cleanupCSSRef = useRef<(() => void) | null>(null);
  const [started, setStarted] = useState(false);

  // -----------------------------------------------------------------------
  // Build the warm pad patch (runs once)
  // -----------------------------------------------------------------------
  const buildPatch = useCallback(() => {
    const engine = new Chord();
    engineRef.current = engine;

    // Two detuned sawtooth oscillators for a warm pad
    const osc1 = engine.addNode('oscillator');
    engine.setParameter(osc1, 'frequency', 130.81); // C3
    engine.setParameter(osc1, 'waveform', 1);        // sawtooth
    engine.setParameter(osc1, 'detune', -8);
    engine.setParameter(osc1, 'gain', 0.18);

    const osc2 = engine.addNode('oscillator');
    engine.setParameter(osc2, 'frequency', 130.81);
    engine.setParameter(osc2, 'waveform', 1);        // sawtooth
    engine.setParameter(osc2, 'detune', 8);
    engine.setParameter(osc2, 'gain', 0.18);

    // Mixer to combine both oscillators
    const mixer = engine.addNode('mixer');

    // Lowpass filter -- the scroll position will sweep this
    const filter = engine.addNode('filter');
    engine.setParameter(filter, 'cutoff', 400);      // start dark
    engine.setParameter(filter, 'resonance', 2.5);
    engine.setParameter(filter, 'mode', 0);           // lowpass

    // LFO modulating the filter cutoff for movement
    const lfo = engine.addNode('lfo');
    engine.setParameter(lfo, 'rate', 0.15);           // slow sweep
    engine.setParameter(lfo, 'depth', 0.4);
    engine.setParameter(lfo, 'waveform', 0);          // sine

    // Reverb for space
    const reverb = engine.addNode('reverb');
    engine.setParameter(reverb, 'room_size', 0.65);
    engine.setParameter(reverb, 'damping', 0.4);
    engine.setParameter(reverb, 'mix', 0.25);

    // Output node
    const output = engine.addNode('output');

    // Wire: osc1 -> mixer.in1, osc2 -> mixer.in2
    engine.connect(osc1, 'out', mixer, 'in1');
    engine.connect(osc2, 'out', mixer, 'in2');

    // Wire: mixer -> filter -> reverb -> output
    engine.connect(mixer, 'out', filter, 'in');
    engine.connect(lfo, 'out', filter, 'cutoff_mod');
    engine.connect(filter, 'out', reverb, 'in');
    engine.connect(reverb, 'out', output, 'in');

    patchRef.current = { osc1, osc2, mixer, filter, lfo, reverb, output };
    return engine;
  }, []);

  // -----------------------------------------------------------------------
  // Start on first user click (browser autoplay policy)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const engine = buildPatch();

    const handleClick = async () => {
      if (engine.started) return;
      await engine.start();
      engine.setMasterVolume(0.35);

      // Bind audio analysis to CSS custom properties on <html>
      cleanupCSSRef.current = bindAudioToCSS(engine, document.documentElement);

      setStarted(true);
      window.removeEventListener('click', handleClick);
    };

    window.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('click', handleClick);
      cleanupCSSRef.current?.();
      engine.stop();
      engineRef.current = null;
      patchRef.current = null;
    };
  }, [buildPatch]);

  // -----------------------------------------------------------------------
  // UI sound helper
  // -----------------------------------------------------------------------
  const playUISound = useCallback(
    (type: 'click' | 'hover' | 'success' | 'enter') => {
      const engine = engineRef.current;
      if (!engine || !engine.started) return;

      switch (type) {
        case 'click':
          // Bright short note
          engine.playNote(880, 0.12, 0.15);
          break;
        case 'hover':
          // Very soft high note
          engine.playNote(1200, 0.06, 0.04);
          break;
        case 'success':
          // Two ascending notes
          engine.playScaleNote(0, 1, 0.25);
          setTimeout(() => engine.playScaleNote(2, 1, 0.35), 120);
          break;
        case 'enter':
          // Section-enter chime
          engine.playNote(660, 0.3, 0.1);
          break;
      }
    },
    [],
  );

  return (
    <AudioCtx.Provider
      value={{
        engine: engineRef.current,
        started,
        playUISound,
      }}
    >
      {children}
    </AudioCtx.Provider>
  );
}
