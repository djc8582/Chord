import { useState, useEffect, useCallback, Component, type ReactNode } from 'react';
import { Chord } from '@chord/web';
import { CollisionPanel } from './panels/Collision';
import { DrumPanel } from './panels/Drums';
import { SculptPanel } from './panels/Sculpt';
import { SwarmPanel } from './panels/Swarm';

class ErrorBoundary extends Component<{children: ReactNode; name: string}, {error: string | null}> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() {
    if (this.state.error) return <div style={{color:'#ff4444',padding:20,fontFamily:'monospace',fontSize:12}}>Panel "{this.props.name}" error: {this.state.error}</div>;
    return this.props.children;
  }
}

function App() {
  const [chord] = useState(() => new Chord());
  const [started, setStarted] = useState(false);
  const [_activePanel, setActivePanel] = useState(0);

  const handleStart = useCallback(async () => {
    try {
      await chord.start();
      chord.setMasterVolume(0.5);
      setStarted(true);
      chord.playNote(65, 4, 0.4);
      chord.playNote(44, 5, 0.25);
    } catch (e) {
      console.error('Chord start failed:', e);
      setStarted(true); // show panels anyway
    }
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
    <div style={{ background: '#0a0a0f', color: 'white', minHeight: '100vh', padding: 32 }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 48, fontWeight: 300, letterSpacing: '0.2em', opacity: 0.8 }}>GENESIS</h1>
        <p style={{ color: '#c8ff00', fontSize: 12, fontFamily: 'monospace', marginTop: 8 }}>
          Every sound powered by @chord/web — scroll down for 4 panels
        </p>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 40, marginBottom: 60 }}>
          <ErrorBoundary name="Collision">
            <CollisionPanel chord={chord} active={true} />
          </ErrorBoundary>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 40, marginBottom: 60 }}>
          <ErrorBoundary name="Drums">
            <DrumPanel chord={chord} active={true} />
          </ErrorBoundary>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 40, marginBottom: 60 }}>
          <ErrorBoundary name="Sculpt">
            <SculptPanel chord={chord} active={true} />
          </ErrorBoundary>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 40, marginBottom: 60 }}>
          <ErrorBoundary name="Swarm">
            <SwarmPanel chord={chord} active={true} />
          </ErrorBoundary>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.4, fontSize: 14 }}>
        4 panels. 0 audio files. Every sound synthesized by Chord.
      </div>
    </div>
  );
}

export default App;
