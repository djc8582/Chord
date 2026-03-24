import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from 'react';
import { createFusionEngine, type FusionEngine, type EngineState } from '../audio/engine.js';

interface AudioCtx {
  engine: FusionEngine | null;
  started: boolean;
  state: EngineState;
  start: () => Promise<void>;
}

const defaultState: EngineState = {
  currentChord: 'Ebm9',
  tempo: 60,
  scrollPosition: 0,
  section: 'intro',
  isGlitching: false,
  isSilent: false,
  modulated: false,
  keysPlaying: [],
};

const Ctx = createContext<AudioCtx>({
  engine: null,
  started: false,
  state: defaultState,
  start: async () => {},
});

export const useAudio = () => useContext(Ctx);

export function AudioProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<FusionEngine | null>(null);
  const [started, setStarted] = useState(false);
  const [state, setState] = useState<EngineState>(defaultState);

  const start = useCallback(async () => {
    if (engineRef.current) return;
    const engine = createFusionEngine();
    engineRef.current = engine;
    await engine.start();
    setStarted(true);
  }, []);

  // Poll engine state for visualizers (60fps)
  useEffect(() => {
    if (!started) return;
    let raf: number;
    const tick = () => {
      if (engineRef.current) {
        setState(engineRef.current.getState());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  // Cleanup
  useEffect(() => () => engineRef.current?.destroy(), []);

  return (
    <Ctx.Provider value={{ engine: engineRef.current, started, state, start }}>
      {children}
    </Ctx.Provider>
  );
}
