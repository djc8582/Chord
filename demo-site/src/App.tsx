import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChordEngine } from './audio/ChordEngine';
import { Particles } from './components/Particles';
import { Visualizer } from './components/Visualizer';
import { InteractionCards } from './components/InteractionCards';
import { DebugPanel } from './components/DebugPanel';
import { VolumeControl } from './components/VolumeControl';

function App() {
  const [engine] = useState(() => new ChordEngine());
  const [started, setStarted] = useState(false);
  const [bloomed, setBloomed] = useState(false);
  const [debugVisible, setDebugVisible] = useState(false);
  const [rms, setRms] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [scrollDepth, setScrollDepth] = useState(0);

  // Start audio on first click
  const handleStart = useCallback(async () => {
    if (started) return;
    await engine.start();
    setStarted(true);
    setTimeout(() => setBloomed(true), 100);
  }, [engine, started]);

  // Mouse tracking -> audio parameters
  useEffect(() => {
    if (!started) return;
    const handleMouseMove = (e: MouseEvent) => {
      const nx = e.clientX / window.innerWidth;
      const ny = e.clientY / window.innerHeight;
      setMousePos({ x: nx, y: ny });
      engine.setParameter('filterCutoff', nx);
      engine.setParameter('reverbMix', ny);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [engine, started]);

  // Scroll depth -> chord progression
  useEffect(() => {
    const handleScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const depth = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      setScrollDepth(depth);
      if (started) {
        engine.setParameter('scrollDepth', depth);
        engine.setParameter('padChord', depth);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [engine, started]);

  // RMS polling for visuals
  useEffect(() => {
    if (!started) return;
    let raf: number;
    const poll = () => {
      setRms(engine.getRMS());
      raf = requestAnimationFrame(poll);
    };
    poll();
    return () => cancelAnimationFrame(raf);
  }, [engine, started]);

  // Tab visibility -> volume
  useEffect(() => {
    if (!started) return;
    const handleVisibility = () => {
      if (document.hidden) {
        engine.setParameter('masterVolume', 0.05);
      } else {
        engine.setParameter('masterVolume', 0.25);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [engine, started]);

  // Idle detection
  useEffect(() => {
    if (!started) return;
    let timer: number;
    const resetIdle = () => {
      clearTimeout(timer);
      engine.setParameter('idle', 0);
      timer = window.setTimeout(() => {
        engine.setParameter('idle', 1);
      }, 30000);
    };
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    window.addEventListener('scroll', resetIdle);
    resetIdle();
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      window.removeEventListener('scroll', resetIdle);
    };
  }, [engine, started]);

  // Debug panel toggle
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '`') setDebugVisible(v => !v);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Dynamic background color based on scroll
  const bgHue = 260 - scrollDepth * 40;
  const bgLightness = 3 + scrollDepth * 2;

  return (
    <div
      className="grain min-h-screen relative"
      style={{
        background: started
          ? `linear-gradient(180deg, hsl(${bgHue}, 15%, ${bgLightness}%) 0%, #0a0a0a 30%, hsl(${bgHue + 20}, 10%, ${bgLightness + 1}%) 70%, #0a0a0a 100%)`
          : '#0a0a0a',
        transition: 'background 2s ease',
      }}
    >
      {/* Cursor glow */}
      {started && (
        <div
          className="cursor-glow"
          style={{
            left: mousePos.x * (typeof window !== 'undefined' ? window.innerWidth : 0),
            top: mousePos.y * (typeof window !== 'undefined' ? window.innerHeight : 0) + (typeof window !== 'undefined' ? window.scrollY : 0),
          }}
        />
      )}

      {/* ============================================================ */}
      {/* SECTION 1: HERO                                              */}
      {/* ============================================================ */}
      <section
        className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden cursor-pointer"
        onClick={handleStart}
      >
        <Particles
          active={started}
          rms={rms}
          mouseX={mousePos.x}
          mouseY={mousePos.y}
          bloom={bloomed}
        />

        <motion.div
          className="relative z-10 text-center px-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        >
          {/* Subtitle */}
          <motion.p
            className="text-sm tracking-[0.4em] uppercase text-white/30 mb-6 font-light"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 1 }}
          >
            A Chord Experience
          </motion.p>

          {/* Main title */}
          <motion.h1
            className="text-7xl md:text-[120px] lg:text-[160px] font-bold tracking-tight leading-none"
            style={{ fontFamily: 'var(--font-display)' }}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 1.2, ease: 'easeOut' }}
          >
            <span className="bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">
              Atmos
            </span>
            <span className="bg-gradient-to-r from-lime-300 to-lime-500 bg-clip-text text-transparent">
              phere
            </span>
          </motion.h1>

          {/* CTA */}
          <AnimatePresence>
            {!started && (
              <motion.div
                className="mt-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: 1, duration: 0.8 }}
              >
                <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full border border-white/10 bg-white/[0.03] text-white/50 text-sm">
                  <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />
                  Click anywhere to begin
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scroll indicator */}
          <AnimatePresence>
            {started && (
              <motion.div
                className="mt-16"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                transition={{ delay: 2, duration: 1 }}
              >
                <motion.div
                  className="w-5 h-8 rounded-full border border-white/20 mx-auto flex justify-center pt-1.5"
                  animate={{ y: [0, 5, 0] }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                >
                  <div className="w-1 h-2 rounded-full bg-white/40" />
                </motion.div>
                <p className="text-xs text-white/30 mt-3">Scroll to explore</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Hero visualizer (behind everything) */}
        {started && (
          <div className="absolute bottom-0 left-0 right-0 opacity-30">
            <Visualizer engine={engine} mode="waveform" color="rgba(200, 255, 0, 0.3)" height={150} mirror />
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* SECTION 2: DRIFT                                             */}
      {/* ============================================================ */}
      <section className="relative min-h-screen flex items-center justify-center px-6 py-32">
        <div className="max-w-4xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 1 }}
          >
            <p className="text-sm tracking-[0.3em] uppercase text-lime-400/60 mb-4">
              01 / Drift
            </p>
            <h2
              className="text-4xl md:text-6xl font-bold text-white/90 mb-6 leading-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Sound that responds
              <br />
              <span className="text-white/40 italic">to you.</span>
            </h2>
            <p className="text-lg text-white/40 max-w-xl leading-relaxed mb-12">
              Move your mouse. The horizontal axis controls the filter brightness.
              The vertical axis controls the depth of reverb. Every gesture shapes the sound.
            </p>
          </motion.div>

          {/* Waveform visualization */}
          <motion.div
            className="relative rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] p-1"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <Visualizer
              engine={engine}
              mode="waveform"
              color="rgba(200, 255, 0, 0.5)"
              height={250}
              lineWidth={2}
              mirror
            />
            <div className="absolute bottom-4 left-4 flex items-center gap-2 text-xs text-white/30">
              <span className="w-1.5 h-1.5 rounded-full bg-lime-400" />
              Real-time audio waveform
            </div>
          </motion.div>

          {/* Parameter readout */}
          {started && (
            <motion.div
              className="mt-6 flex gap-8 text-xs text-white/30 font-mono"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              <span>Filter: {(engine.getParameter('filterCutoff') * 100).toFixed(0)}%</span>
              <span>Reverb: {(engine.getParameter('reverbMix') * 100).toFixed(0)}%</span>
              <span>RMS: {rms.toFixed(4)}</span>
            </motion.div>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION 3: TERRAIN                                           */}
      {/* ============================================================ */}
      <section className="relative min-h-screen flex items-center justify-center px-6 py-32">
        <div className="max-w-5xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 1 }}
            className="mb-12"
          >
            <p className="text-sm tracking-[0.3em] uppercase text-purple-400/60 mb-4">
              02 / Terrain
            </p>
            <h2
              className="text-4xl md:text-6xl font-bold text-white/90 mb-6 leading-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Landscapes shaped
              <br />
              <span className="text-white/40 italic">by frequency.</span>
            </h2>
            <p className="text-lg text-white/40 max-w-xl leading-relaxed">
              The terrain below is generated entirely from the audio signal.
              As you scroll, the chords progress and the landscape transforms.
            </p>
          </motion.div>

          {/* Terrain visualization */}
          <motion.div
            className="relative rounded-2xl overflow-hidden border border-white/5 bg-gradient-to-b from-purple-950/10 to-transparent"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <Visualizer
              engine={engine}
              mode="terrain"
              color="rgba(124, 58, 237, 0.6)"
              height={400}
              lineWidth={1.5}
            />
            <div className="absolute bottom-4 right-4 flex items-center gap-2 text-xs text-white/30">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              Audio-driven generative terrain
            </div>
          </motion.div>

          {/* Frequency bars */}
          <motion.div
            className="mt-8 rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <Visualizer
              engine={engine}
              mode="frequency"
              color="rgba(124, 58, 237, 0.5)"
              height={120}
            />
          </motion.div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION 4: INTERACTION PLAYGROUND                            */}
      {/* ============================================================ */}
      <section className="relative min-h-screen flex items-center justify-center px-6 py-32">
        <div className="max-w-4xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 1 }}
            className="mb-12"
          >
            <p className="text-sm tracking-[0.3em] uppercase text-cyan-400/60 mb-4">
              03 / Interact
            </p>
            <h2
              className="text-4xl md:text-6xl font-bold text-white/90 mb-6 leading-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Touch. Draw.
              <br />
              <span className="text-white/40 italic">Create.</span>
            </h2>
            <p className="text-lg text-white/40 max-w-xl leading-relaxed">
              Every element below is a sonic instrument. Hover the cards, draw on the pad,
              drag the orbs. Each interaction drives a different dimension of the sound.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <InteractionCards engine={started ? engine : null} />
          </motion.div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION 5: FOOTER                                            */}
      {/* ============================================================ */}
      <footer className="relative py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-lime-400/20 bg-lime-400/5 mb-8">
              <div className="w-2 h-2 rounded-full bg-lime-400" />
              <span className="text-sm text-lime-400/80 font-medium tracking-wide">
                Powered by Chord
              </span>
            </div>

            <p className="text-white/30 text-sm leading-relaxed max-w-md mx-auto mb-8">
              Every sound on this page was generated in real-time by the browser
              using the Web Audio API. No samples. No recordings. Just math.
            </p>

            <div className="flex items-center justify-center gap-6 text-xs text-white/20">
              <span>Web Audio API</span>
              <span className="w-1 h-1 rounded-full bg-white/10" />
              <span>React</span>
              <span className="w-1 h-1 rounded-full bg-white/10" />
              <span>Canvas 2D</span>
              <span className="w-1 h-1 rounded-full bg-white/10" />
              <span>Framer Motion</span>
            </div>

            <div className="mt-16 pt-8 border-t border-white/5">
              <p className="text-xs text-white/15">
                chord.dev
              </p>
            </div>
          </motion.div>
        </div>
      </footer>

      {/* ============================================================ */}
      {/* PERSISTENT UI                                                */}
      {/* ============================================================ */}
      {started && <VolumeControl engine={engine} />}
      <DebugPanel engine={engine} visible={debugVisible} />
    </div>
  );
}

export default App;
