# Chord React Integration

Use Chord's audio engine in React applications with hooks, components, and audio-reactive UI primitives.

## Installation

```bash
npm install @chord/web
```

## Quick Start

```tsx
import { Chord } from '@chord/web';
import { useRef, useEffect, useState } from 'react';

function AmbientPlayer() {
  const engineRef = useRef<Chord | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const engine = new Chord();
    // Build a warm pad
    const osc1 = engine.addNode('oscillator');
    const osc2 = engine.addNode('oscillator');
    const filt = engine.addNode('filter');
    const rev = engine.addNode('reverb');
    const lfo = engine.addNode('lfo');

    engine.setParameter(osc1, 'waveform', 1); // saw
    engine.setParameter(osc1, 'frequency', 261.63);
    engine.setParameter(osc1, 'detune', -10);
    engine.setParameter(osc2, 'waveform', 1);
    engine.setParameter(osc2, 'frequency', 261.63);
    engine.setParameter(osc2, 'detune', 10);
    engine.setParameter(filt, 'cutoff', 2000);
    engine.setParameter(filt, 'resonance', 0.2);
    engine.setParameter(rev, 'decay', 3.5);
    engine.setParameter(rev, 'mix', 0.25);
    engine.setParameter(lfo, 'rate', 0.12);
    engine.setParameter(lfo, 'depth', 1200);

    engine.connect(osc1, 'out', filt, 'in');
    engine.connect(osc2, 'out', filt, 'in');
    engine.connect(lfo, 'out', filt, 'cutoff');
    engine.connect(filt, 'out', rev, 'in');

    engineRef.current = engine;

    return () => {
      engine.stop();
    };
  }, []);

  const toggle = async () => {
    if (!engineRef.current) return;
    if (playing) {
      engineRef.current.stop();
    } else {
      await engineRef.current.start();
    }
    setPlaying(!playing);
  };

  return <button onClick={toggle}>{playing ? 'Stop' : 'Play'}</button>;
}
```

## Audio-Reactive UI

### CSS Custom Properties

The simplest way to make any UI react to audio:

```tsx
import { Chord } from '@chord/web';
import { bindAudioToCSS } from '@chord/web';

function AudioReactiveApp() {
  const engineRef = useRef<Chord | null>(null);

  useEffect(() => {
    const engine = new Chord();
    // ... set up nodes ...
    engineRef.current = engine;

    // Bind audio analysis to CSS custom properties
    bindAudioToCSS(engine, document.documentElement);

    return () => engine.stop();
  }, []);

  return (
    <div style={{
      transform: `scale(calc(1 + var(--chord-rms) * 0.2))`,
      filter: `hue-rotate(calc(var(--chord-hue) * 1deg))`,
      opacity: `calc(0.6 + var(--chord-bass) * 0.4)`,
    }}>
      Audio-reactive content
    </div>
  );
}
```

**Available CSS properties:**
- `--chord-rms` — 0-1 overall loudness
- `--chord-bass` — 0-1 bass energy
- `--chord-mid` — 0-1 mid energy
- `--chord-treble` — 0-1 treble energy
- `--chord-beat` — 0 or 1 on detected beat
- `--chord-hue` — 0-360 hue from spectral centroid

### useAudioReactive Hook

For React-controlled animations:

```tsx
import { useAudioReactive } from '@chord/web';

function ReactiveSphere({ engine }: { engine: Chord }) {
  const audio = useAudioReactive(engine);

  return (
    <div
      style={{
        width: 100 + audio.rms * 50,
        height: 100 + audio.rms * 50,
        borderRadius: '50%',
        background: `hsl(${audio.treble * 360}, 70%, 50%)`,
        boxShadow: audio.beat
          ? '0 0 40px rgba(255,255,255,0.5)'
          : 'none',
        transition: 'box-shadow 0.1s',
      }}
    />
  );
}
```

## Visualizer Components

All visualizers attach to a `<canvas>` element:

```tsx
import { createWaveform, createSpectrum, createParticles } from '@chord/web';

function Visualizer({ engine }: { engine: Chord }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !engine.started) return;

    const viz = createWaveform(canvasRef.current, engine, {
      color: '#00ff88',
      lineWidth: 2,
    });
    viz.start();

    return () => viz.destroy();
  }, [engine.started]);

  return <canvas ref={canvasRef} width={800} height={200} />;
}
```

### Available Visualizers

| Function | Description |
|----------|------------|
| `createWaveform` | Oscilloscope display |
| `createSpectrum` | Frequency analyzer bars/line |
| `createLevelMeter` | RMS/peak meter |
| `createParticles` | Audio-reactive particle system |
| `createPianoRoll` | Live note display |
| `createDrumGrid` | Step sequencer grid |
| `createSpectrogram` | Time-frequency heatmap |
| `createTerrain` | 3D landscape from spectrum |
| `createGeometry` | Audio-reactive wireframe shapes |
| `createKaleidoscope` | Kaleidoscopic mirror effect |
| `createAudioBackground` | Gradient/noise background |
| `createNetwork` | Constellation graph |

## DSL Patches in React

Load a DSL-defined patch:

```tsx
import { patch, osc, filter, reverb, output, lfo, euclidean } from '@chord/web';
import { compile } from '@chord/web';

// Define the patch
const myPatch = patch('chill-vibes', { tempo: 85, key: 'C', scale: 'minor' }, (p) => {
  const synth = osc({ waveform: 'saw', detune: 12 });
  const filt = filter({ cutoff: 2000, resonance: 0.2 });
  const mod = lfo({ rate: 0.12, depth: 1200 });
  const space = reverb({ decay: 3, mix: 0.25 });

  mod.connect(filt, 'cutoff');
  synth.connect(filt).connect(space).connect(output());

  p.expose('brightness', filt, 'cutoff', { min: 200, max: 8000 });
});

// Use in a component
function PatchPlayer() {
  const engineRef = useRef<Chord | null>(null);

  useEffect(() => {
    const engine = new Chord();
    const compiled = compile(myPatch);
    // Load compiled patch into engine...
    engineRef.current = engine;
    return () => engine.stop();
  }, []);

  return <button onClick={() => engineRef.current?.start()}>Play</button>;
}
```

## Patterns

### Scroll-reactive audio

```tsx
function ScrollAudio() {
  const engineRef = useRef<Chord | null>(null);

  useEffect(() => {
    const engine = new Chord();
    // ... build patch with a filter node ...
    engineRef.current = engine;

    const onScroll = () => {
      const progress = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      engine.setParameter(filterId, 'cutoff', 200 + progress * 6000);
      engine.setParameter(revId, 'mix', 0.1 + progress * 0.25);
    };
    window.addEventListener('scroll', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      engine.stop();
    };
  }, []);

  return <button onClick={() => engineRef.current?.start()}>Enable Audio</button>;
}
```

### Beat-synced animations with Framer Motion

```tsx
import { motion } from 'framer-motion';
import { useAudioReactive } from '@chord/web';

function BeatDot({ engine }: { engine: Chord }) {
  const { beat, rms } = useAudioReactive(engine);

  return (
    <motion.div
      animate={{
        scale: beat ? 1.3 : 1,
        opacity: 0.5 + rms,
      }}
      transition={{ duration: 0.1 }}
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: '#00ff88',
      }}
    />
  );
}
```

### Interactive musical notes

```tsx
function MusicalButtons({ engine }: { engine: Chord }) {
  const notes = ['C', 'Eb', 'F', 'G', 'Bb'];

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {notes.map((note, i) => (
        <button
          key={note}
          onMouseDown={() => engine.playScaleNote(i)}
          style={{ padding: '12px 20px' }}
        >
          {note}
        </button>
      ))}
    </div>
  );
}
```

## Common Mistakes

```tsx
// ❌ Starting audio outside user gesture
useEffect(() => {
  engine.start(); // FAILS — browser autoplay policy
}, []);

// ✅ Start on user interaction
<button onClick={() => engine.start()}>Start</button>

// ❌ Forgetting cleanup
useEffect(() => {
  const engine = new Chord();
  engine.start();
  // MISSING return cleanup!
}, []);

// ✅ Always clean up
useEffect(() => {
  const engine = new Chord();
  return () => engine.stop();
}, []);

// ❌ Creating engine inside render
function Bad() {
  const engine = new Chord(); // Creates new engine every render!
  return <div />;
}

// ✅ Use ref
function Good() {
  const engineRef = useRef(new Chord());
  return <div />;
}
```
