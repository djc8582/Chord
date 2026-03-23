import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Chord } from '@chord/web';
import { Particles } from './components/Particles';
import { Visualizer } from './components/Visualizer';
import { InteractionCards } from './components/InteractionCards';
import { MusicalTyping } from './components/MusicalTyping';
import { DebugPanel } from './components/DebugPanel';
import { VolumeControl } from './components/VolumeControl';

// Pentatonic scale frequencies for chord progressions
const PENTATONIC_NOTES = {
  C2: 65.41, D2: 73.42, Eb2: 77.78, G2: 98.0, Ab2: 103.83, Bb2: 116.54,
  C3: 130.81, D3: 146.83, Eb3: 155.56, G3: 196.0, Ab3: 207.65, Bb3: 233.08,
  C4: 261.63, Eb4: 311.13, G4: 392.0, Ab4: 415.30, Bb4: 466.16,
  C5: 523.25, Eb5: 622.25, G5: 783.99, Ab5: 830.61, Bb5: 932.33,
  C6: 1046.5, Eb6: 1244.5, G6: 1567.98,
};

const CHORD_PROGRESSIONS = [
  [PENTATONIC_NOTES.C4, PENTATONIC_NOTES.Eb4, PENTATONIC_NOTES.G4],
  [PENTATONIC_NOTES.Ab3, PENTATONIC_NOTES.C4, PENTATONIC_NOTES.Eb4],
  [PENTATONIC_NOTES.Bb3, PENTATONIC_NOTES.Eb4, PENTATONIC_NOTES.G4],
  [PENTATONIC_NOTES.G3, PENTATONIC_NOTES.Bb3, PENTATONIC_NOTES.Eb4],
  [PENTATONIC_NOTES.Ab3, PENTATONIC_NOTES.C4, PENTATONIC_NOTES.Eb5],
];

const BASS_NOTES = [
  PENTATONIC_NOTES.C2,
  PENTATONIC_NOTES.Ab2,
  PENTATONIC_NOTES.Bb2,
  PENTATONIC_NOTES.G2,
  PENTATONIC_NOTES.Ab2,
];

// Node IDs stored as refs so interactions can address them
interface PatchNodes {
  bass: string;
  pad1: string;
  pad2: string;
  pad3: string;
  filter: string;
  delay: string;
  reverb: string;
  lfo: string;
  noise: string;
  mixer: string;
  output: string;
  kick: string;
  snare: string;
  hat: string;
  drumMixer: string;
  drumGain: string;
}

function App() {
  const [chord] = useState(() => new Chord());
  const [started, setStarted] = useState(false);
  const [bloomed, setBloomed] = useState(false);
  const [debugVisible, setDebugVisible] = useState(false);
  const [rms, setRms] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [scrollDepth, setScrollDepth] = useState(0);
  const nodesRef = useRef<PatchNodes | null>(null);

  // Start audio on first click — build the entire patch with Chord's API
  const handleStart = useCallback(async () => {
    if (started) return;

    // --- Build the patch: addNode + connect + setParameter ---

    // Bass drone
    const bass = chord.addNode('oscillator');
    chord.setParameter(bass, 'frequency', PENTATONIC_NOTES.C2);
    chord.setParameter(bass, 'waveform', 0); // sine
    chord.setParameter(bass, 'gain', 0.12);

    // Pad voices (3 detuned saws)
    const pad1 = chord.addNode('oscillator');
    chord.setParameter(pad1, 'frequency', PENTATONIC_NOTES.C4);
    chord.setParameter(pad1, 'waveform', 1); // sawtooth
    chord.setParameter(pad1, 'detune', -8);
    chord.setParameter(pad1, 'gain', 0.08);

    const pad2 = chord.addNode('oscillator');
    chord.setParameter(pad2, 'frequency', PENTATONIC_NOTES.Eb4);
    chord.setParameter(pad2, 'waveform', 1);
    chord.setParameter(pad2, 'detune', 0);
    chord.setParameter(pad2, 'gain', 0.08);

    const pad3 = chord.addNode('oscillator');
    chord.setParameter(pad3, 'frequency', PENTATONIC_NOTES.G4);
    chord.setParameter(pad3, 'waveform', 1);
    chord.setParameter(pad3, 'detune', 8);
    chord.setParameter(pad3, 'gain', 0.08);

    // Filter (pad -> filter -> mixer)
    const filter = chord.addNode('filter');
    chord.setParameter(filter, 'cutoff', 800);
    chord.setParameter(filter, 'resonance', 1.5);

    // LFO -> filter cutoff modulation (audio-rate!)
    const lfo = chord.addNode('lfo');
    chord.setParameter(lfo, 'rate', 0.2);
    chord.setParameter(lfo, 'depth', 0.5);
    chord.setParameter(lfo, 'waveform', 0); // sine

    // Noise (subtle texture — starts silent)
    const noise = chord.addNode('noise');
    chord.setParameter(noise, 'gain', 0.0);

    // Mixer: combine bass, filtered pads, noise
    const mixer = chord.addNode('mixer');

    // Delay
    const delay = chord.addNode('delay');
    chord.setParameter(delay, 'time', 0.375);
    chord.setParameter(delay, 'feedback', 0.3);
    chord.setParameter(delay, 'mix', 0.25);

    // Reverb
    const reverb = chord.addNode('reverb');
    chord.setParameter(reverb, 'room_size', 0.7);
    chord.setParameter(reverb, 'damping', 0.4);
    chord.setParameter(reverb, 'mix', 0.4);

    // Output (connects to master)
    const output = chord.addNode('output');

    // --- Drum nodes ---
    const kick = chord.addNode('kick_drum');
    const snare = chord.addNode('snare_drum');
    const hat = chord.addNode('hi_hat');

    const drumMixer = chord.addNode('mixer');
    const drumGain = chord.addNode('gain');
    chord.setParameter(drumGain, 'gain', 0.0); // starts silent

    // --- Wire the patch ---
    // Pads -> filter
    chord.connect(pad1, 'out', filter, 'in');
    chord.connect(pad2, 'out', filter, 'in');
    chord.connect(pad3, 'out', filter, 'in');

    // LFO -> filter cutoff (audio-rate modulation!)
    chord.connect(lfo, 'out', filter, 'cutoff_mod');

    // Bass -> mixer in1
    chord.connect(bass, 'out', mixer, 'in1');

    // Filtered pads -> mixer in2
    chord.connect(filter, 'out', mixer, 'in2');

    // Noise -> mixer in3
    chord.connect(noise, 'out', mixer, 'in3');

    // Drums -> drumMixer -> drumGain -> delay (into FX chain)
    chord.connect(kick, 'out', drumMixer, 'in1');
    chord.connect(snare, 'out', drumMixer, 'in2');
    chord.connect(hat, 'out', drumMixer, 'in3');
    chord.connect(drumMixer, 'out', drumGain, 'in');
    chord.connect(drumGain, 'out', delay, 'in');

    // Mixer -> delay -> reverb -> output
    chord.connect(mixer, 'out', delay, 'in');
    chord.connect(delay, 'out', reverb, 'in');
    chord.connect(reverb, 'out', output, 'in');

    // Store node IDs for interactive control
    nodesRef.current = {
      bass, pad1, pad2, pad3, filter, delay, reverb, lfo, noise, mixer, output,
      kick, snare, hat, drumMixer, drumGain,
    };

    // Start the engine
    await chord.start();

    // Apply time-of-day initial settings
    const hour = new Date().getHours();
    const brightness = Math.sin((hour / 24) * Math.PI);
    chord.setParameter(filter, 'cutoff', 400 + brightness * 4000);

    setStarted(true);
    setTimeout(() => setBloomed(true), 100);
  }, [chord, started]);

  // Mouse tracking -> audio parameters
  useEffect(() => {
    if (!started || !nodesRef.current) return;
    const nodes = nodesRef.current;
    const handleMouseMove = (e: MouseEvent) => {
      const nx = e.clientX / window.innerWidth;
      const ny = e.clientY / window.innerHeight;
      setMousePos({ x: nx, y: ny });
      // X -> filter cutoff (200Hz to 6200Hz)
      chord.setParameter(nodes.filter, 'cutoff', 200 + nx * 6000);
      // Y -> reverb mix
      chord.setParameter(nodes.reverb, 'mix', Math.min(ny * 0.8, 0.8));
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [chord, started]);

  // Drum trigger scheduling
  const drumIntervalRef = useRef<number | null>(null);
  const drumActiveRef = useRef(false);

  useEffect(() => {
    if (!started) return;
    let beatCount = 0;
    const scheduleDrums = () => {
      if (!nodesRef.current || !drumActiveRef.current) return;
      const nodes = nodesRef.current;
      // Simple pattern: kick on 1,3 — snare on 2,4 — hat on every beat
      const beatInBar = beatCount % 4;
      if (beatInBar === 0 || beatInBar === 2) {
        chord.triggerNode(nodes.kick);
      }
      if (beatInBar === 1 || beatInBar === 3) {
        chord.triggerNode(nodes.snare);
      }
      chord.triggerNode(nodes.hat);
      beatCount++;
    };
    // ~120 BPM = 500ms per beat
    drumIntervalRef.current = window.setInterval(scheduleDrums, 500);
    return () => {
      if (drumIntervalRef.current !== null) clearInterval(drumIntervalRef.current);
    };
  }, [chord, started]);

  // Scroll depth -> chord progression + section-based sound changes
  useEffect(() => {
    const handleScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const depth = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      setScrollDepth(depth);
      if (started && nodesRef.current) {
        const nodes = nodesRef.current;
        const idx = Math.floor(depth * (CHORD_PROGRESSIONS.length - 0.01));
        const safeIdx = Math.min(idx, CHORD_PROGRESSIONS.length - 1);
        const chordFreqs = CHORD_PROGRESSIONS[safeIdx];
        const bassNote = BASS_NOTES[safeIdx];

        // Chord progression follows scroll
        chord.setParameter(nodes.pad1, 'frequency', chordFreqs[0]);
        chord.setParameter(nodes.pad2, 'frequency', chordFreqs[1]);
        chord.setParameter(nodes.pad3, 'frequency', chordFreqs[2]);
        chord.setParameter(nodes.bass, 'frequency', bassNote);

        // Filter opens as you scroll
        const filterOpen = 400 + depth * 6000;
        chord.setParameter(nodes.filter, 'cutoff', filterOpen);

        // Section 1 (0-20%): Minimal — just bass drone + soft pad
        // Section 2 (20-40%): Pad opens up, LFO speed increases
        // Section 3 (40-60%): Drums fade in
        // Section 4 (60-80%): Full sound
        // Section 5 (80-100%): Thins out, more reverb

        // Pad volume ramps up then back down
        let padVol: number;
        if (depth < 0.2) {
          padVol = 0.04;
        } else if (depth < 0.8) {
          padVol = 0.04 + (depth - 0.2) * 0.2;
        } else {
          padVol = 0.16 - (depth - 0.8) * 0.5;
          padVol = Math.max(padVol, 0.04);
        }
        chord.setParameter(nodes.pad1, 'gain', padVol);
        chord.setParameter(nodes.pad2, 'gain', padVol);
        chord.setParameter(nodes.pad3, 'gain', padVol);

        // Bass quieter at start, louder in mid sections
        const bassVol = depth < 0.8 ? 0.08 + depth * 0.1 : 0.16 - (depth - 0.8) * 0.4;
        chord.setParameter(nodes.bass, 'gain', Math.max(bassVol, 0.04));

        // Drums come in at 40% depth
        if (depth > 0.4 && depth < 0.85) {
          const drumVol = Math.min((depth - 0.4) * 2, 0.5);
          chord.setParameter(nodes.drumGain, 'gain', drumVol);
          drumActiveRef.current = true;
        } else {
          chord.setParameter(nodes.drumGain, 'gain', 0.0);
          drumActiveRef.current = false;
        }

        // LFO speed increases with scroll
        chord.setParameter(nodes.lfo, 'rate', 0.1 + depth * 0.8);

        // Reverb increases at the end for a peaceful fade
        if (depth > 0.8) {
          chord.setParameter(nodes.reverb, 'mix', 0.4 + (depth - 0.8) * 3);
        } else {
          chord.setParameter(nodes.reverb, 'mix', 0.4);
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [chord, started]);

  // RMS polling for visuals
  useEffect(() => {
    if (!started) return;
    let raf: number;
    const poll = () => {
      setRms(chord.getRMS());
      raf = requestAnimationFrame(poll);
    };
    poll();
    return () => cancelAnimationFrame(raf);
  }, [chord, started]);

  // Tab visibility -> volume
  useEffect(() => {
    if (!started) return;
    const handleVisibility = () => {
      if (document.hidden) {
        chord.setMasterVolume(0.05);
      } else {
        chord.setMasterVolume(0.25);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [chord, started]);

  // Idle detection
  useEffect(() => {
    if (!started || !nodesRef.current) return;
    const nodes = nodesRef.current;
    let timer: number;
    const resetIdle = () => {
      clearTimeout(timer);
      // Active mode
      chord.setParameter(nodes.noise, 'gain', 0.0);
      chord.setParameter(nodes.reverb, 'mix', 0.4);
      chord.setParameter(nodes.lfo, 'depth', 0.5);
      timer = window.setTimeout(() => {
        // Idle mode: quieter, more reverb
        chord.setParameter(nodes.noise, 'gain', 0.0);
        chord.setParameter(nodes.reverb, 'mix', 0.7);
        chord.setParameter(nodes.lfo, 'depth', 0.3);
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
  }, [chord, started]);

  // Debug panel toggle
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '`') setDebugVisible(v => !v);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Compute derived filter cutoff normalized for display
  const filterCutoffNormalized = nodesRef.current
    ? (chord.getParameter(nodesRef.current.filter, 'cutoff') - 200) / 6000
    : 0;
  const reverbMixValue = nodesRef.current
    ? chord.getParameter(nodesRef.current.reverb, 'mix')
    : 0;

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
            Built with @chord/web
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
            <Visualizer chord={chord} mode="waveform" color="rgba(200, 255, 0, 0.3)" height={150} mirror />
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
              {chord.getNodeCount()} nodes. {chord.getConnectionCount()} connections. Zero Web Audio boilerplate. This entire soundscape is a Chord patch.
              Move your mouse — the horizontal axis controls the filter, the vertical axis controls reverb depth.
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
              chord={chord}
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
              <span>Filter: {(filterCutoffNormalized * 100).toFixed(0)}%</span>
              <span>Reverb: {(reverbMixValue * 100).toFixed(0)}%</span>
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
              As you scroll, drums fade in — just more Chord nodes joining the graph.
              The terrain below is generated entirely from the audio signal.
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
              chord={chord}
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
              chord={chord}
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
              Every hover, every keystroke, every drag — all triggering Chord nodes.
              Each interaction below drives a different dimension of the sound.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <InteractionCards chord={started ? chord : null} patchNodes={started ? nodesRef.current : null} />
          </motion.div>

          {started && (
            <motion.div
              className="mt-12"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              <MusicalTyping chord={chord} />
            </motion.div>
          )}
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
                Built with @chord/web
              </span>
            </div>

            <p className="text-white/30 text-sm leading-relaxed max-w-md mx-auto mb-8">
              Every sound on this page is a Chord patch running in your browser.
              {chord.getNodeCount()} nodes, {chord.getConnectionCount()} connections, zero Web Audio boilerplate.
            </p>

            <div className="flex items-center justify-center gap-6 text-xs text-white/20">
              <span>@chord/web SDK</span>
              <span className="w-1 h-1 rounded-full bg-white/10" />
              <span>Web Audio API</span>
              <span className="w-1 h-1 rounded-full bg-white/10" />
              <span>React</span>
              <span className="w-1 h-1 rounded-full bg-white/10" />
              <span>Canvas 2D</span>
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
      {started && <VolumeControl chord={chord} />}
      <DebugPanel chord={chord} patchNodes={nodesRef.current} visible={debugVisible} />
    </div>
  );
}

export default App;
