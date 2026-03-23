import { useState, useEffect, useCallback } from 'react';
import { Chord } from '@chord/web';
import { CollisionPanel } from './panels/Collision';
import { DrumPanel } from './panels/Drums';
import { SculptPanel } from './panels/Sculpt';
import { SwarmPanel } from './panels/Swarm';

function App() {
  const [chord] = useState(() => new Chord());
  const [started, setStarted] = useState(false);
  const [activePanel, setActivePanel] = useState(0);

  const handleStart = useCallback(async () => {
    await chord.start();
    setStarted(true);
    chord.playNote(65, 4, 0.4);
    chord.playNote(44, 5, 0.25);
  }, [chord]);

  useEffect(() => {
    const onScroll = () => setActivePanel(Math.round(window.scrollY / window.innerHeight));
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!started) {
    return (
      <div className="w-screen h-screen bg-[#0a0a0f] flex items-center justify-center cursor-pointer" onClick={handleStart}>
        <div className="text-center">
          <h1 className="text-6xl font-light text-white/80 tracking-[0.2em]">GENESIS</h1>
          <p className="text-white/30 mt-4 text-sm tracking-widest uppercase">Click to begin</p>
          <p className="text-white/15 mt-8 text-xs font-mono">Every sound powered by @chord/web</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0f] text-white">
      <section className="min-h-screen flex flex-col items-center justify-center p-8">
        <CollisionPanel chord={chord} active={activePanel === 0} />
      </section>
      <section className="min-h-screen flex flex-col items-center justify-center p-8">
        <DrumPanel chord={chord} active={activePanel === 1} />
      </section>
      <section className="min-h-screen flex flex-col items-center justify-center p-8">
        <SculptPanel chord={chord} active={activePanel === 2} />
      </section>
      <section className="min-h-screen flex flex-col items-center justify-center p-8">
        <SwarmPanel chord={chord} active={activePanel === 3} />
      </section>
      <footer className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
        <p className="text-white/40 max-w-xl text-sm leading-relaxed">
          4 panels. 0 audio files. Every sound synthesized in real-time by Chord.
        </p>
        <p className="text-[#c8ff00] mt-6 font-mono text-xs">npm install @chord/web</p>
      </footer>
    </div>
  );
}

export default App;
