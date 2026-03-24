# Chord Examples

Copy-paste examples for common audio tasks.

## Ambient Background for a Website

```typescript
import { Chord } from '@chord/web';

// Build a warm evolving ambient patch
const engine = new Chord();

// Pad layer — detuned saws through breathing filter
const pad1 = engine.addNode('oscillator');
const pad2 = engine.addNode('oscillator');
const padFilt = engine.addNode('filter');
const padLfo = engine.addNode('lfo');
const padChorus = engine.addNode('chorus');
const padRev = engine.addNode('reverb');

engine.setParameter(pad1, 'waveform', 1); // saw
engine.setParameter(pad1, 'frequency', 130.81); // C3
engine.setParameter(pad1, 'detune', -10);
engine.setParameter(pad1, 'gain', 0.25);
engine.setParameter(pad2, 'waveform', 1);
engine.setParameter(pad2, 'frequency', 130.81);
engine.setParameter(pad2, 'detune', 10);
engine.setParameter(pad2, 'gain', 0.25);

engine.setParameter(padFilt, 'cutoff', 1500);
engine.setParameter(padFilt, 'resonance', 0.2);
engine.setParameter(padLfo, 'rate', 0.08);
engine.setParameter(padLfo, 'depth', 1000);
engine.setParameter(padChorus, 'rate', 0.3);
engine.setParameter(padChorus, 'depth', 0.3);
engine.setParameter(padChorus, 'mix', 0.2);
engine.setParameter(padRev, 'decay', 5);
engine.setParameter(padRev, 'mix', 0.3);
engine.setParameter(padRev, 'damping', 0.7);

engine.connect(pad1, 'out', padFilt, 'in');
engine.connect(pad2, 'out', padFilt, 'in');
engine.connect(padLfo, 'out', padFilt, 'cutoff');
engine.connect(padFilt, 'out', padChorus, 'in');
engine.connect(padChorus, 'out', padRev, 'in');

// Subtle noise texture
const tex = engine.addNode('noise');
const texFilt = engine.addNode('filter');
engine.setParameter(tex, 'color', 1); // pink
engine.setParameter(tex, 'gain', 0.02);
engine.setParameter(texFilt, 'type', 2); // bandpass
engine.setParameter(texFilt, 'cutoff', 3000);
engine.setParameter(texFilt, 'resonance', 0.3);
engine.connect(tex, 'out', texFilt, 'in');
engine.connect(texFilt, 'out', padRev, 'in');

// Start on first user interaction
document.addEventListener('click', () => engine.start(), { once: true });

// Clean up
window.addEventListener('beforeunload', () => engine.stop());
```

## Lo-fi Beat with DSL

```typescript
import { patch, osc, filter, reverb, delay, noise, compressor, waveshaper,
         kickDrum, snareDrum, hiHat, stepSequencer, output, mixer } from '@chord/web';

export default patch('lofi-study', { tempo: 80, key: 'C', scale: 'pentatonic_minor' }, (p) => {
  // Drums
  const seq = stepSequencer({ steps: 16, tempo: 80, swing: 0.55 });
  const kick = kickDrum({ frequency: 50, body_decay: 0.35, drive: 0.2 });
  const snare = snareDrum({ body_freq: 180, noise_decay: 0.12, crack: 0.4 });
  const hat = hiHat({ decay: 0.02, tone: 0.3 });
  const drumBus = mixer();
  const drumComp = compressor({ threshold: -10, ratio: 3, attack: 0.01, release: 0.1 });
  const drumSat = waveshaper({ drive: 0.15, mode: 'tape', mix: 0.3 });

  seq.connect(kick);
  seq.connect(snare);
  seq.connect(hat);
  kick.connect(drumBus);
  snare.connect(drumBus);
  hat.connect(drumBus);
  drumBus.connect(drumComp).connect(drumSat).connect(output());

  // Keys
  const keys = osc({ waveform: 'triangle', freq: 261.63, detune: 5 });
  const keysFilt = filter({ cutoff: 3000, resonance: 0.15 });
  const keysDelay = delay({ time: 0.375, feedback: 0.2, mix: 0.12 });
  const keysRev = reverb({ decay: 2.5, mix: 0.3, damping: 0.7 });
  keys.connect(keysFilt).connect(keysDelay).connect(keysRev).connect(output());

  // Vinyl texture
  const vinyl = noise({ color: 'brown', gain: 0.02 });
  vinyl.connect(output());
});
```

## Euclidean Polyrhythm

```typescript
import { Chord } from '@chord/web';

const engine = new Chord();

// Three Euclidean layers with different step/pulse ratios
const e1 = engine.addNode('euclidean');
const e2 = engine.addNode('euclidean');
const e3 = engine.addNode('euclidean');

engine.setParameter(e1, 'steps', 16);
engine.setParameter(e1, 'pulses', 5);
engine.setParameter(e2, 'steps', 16);
engine.setParameter(e2, 'pulses', 7);
engine.setParameter(e2, 'rotation', 3);
engine.setParameter(e3, 'steps', 12);
engine.setParameter(e3, 'pulses', 5);

const kick = engine.addNode('kickDrum');
const snare = engine.addNode('snareDrum');
const hat = engine.addNode('hiHat');

engine.connect(e1, 'out', kick, 'in');
engine.connect(e2, 'out', snare, 'in');
engine.connect(e3, 'out', hat, 'in');

// Drum bus processing
const bus = engine.addNode('mixer');
const busComp = engine.addNode('compressor');
const busRev = engine.addNode('reverb');

engine.connect(kick, 'out', bus, 'in');
engine.connect(snare, 'out', bus, 'in');
engine.connect(hat, 'out', bus, 'in');
engine.connect(bus, 'out', busComp, 'in');
engine.connect(busComp, 'out', busRev, 'in');

engine.setParameter(busComp, 'threshold', -10);
engine.setParameter(busComp, 'ratio', 3);
engine.setParameter(busRev, 'decay', 0.8);
engine.setParameter(busRev, 'mix', 0.1);

document.getElementById('play')!.onclick = () => engine.start();
```

## Audio-Reactive Visualizer

```typescript
import { Chord } from '@chord/web';
import { createParticles, createSpectrum, bindAudioToCSS } from '@chord/web';

const engine = new Chord();
// ... build your patch ...

// Canvas visualizers
const particleCanvas = document.getElementById('particles') as HTMLCanvasElement;
const spectrumCanvas = document.getElementById('spectrum') as HTMLCanvasElement;

const particles = createParticles(particleCanvas, engine, {
  count: 400,
  reactTo: 'beat',
  color: '#00ff88',
});

const spectrum = createSpectrum(spectrumCanvas, engine, {
  mode: 'bars',
  barCount: 64,
  color: '#00ff88',
});

// CSS-driven reactivity (works on any element)
bindAudioToCSS(engine, document.documentElement);

// In your CSS:
// .hero { transform: scale(calc(1 + var(--chord-rms) * 0.15)); }
// .bg { filter: hue-rotate(calc(var(--chord-hue) * 1deg)); }

document.getElementById('start')!.onclick = async () => {
  await engine.start();
  particles.start();
  spectrum.start();
};
```

## Scroll-Reactive Audio

```typescript
import { Chord } from '@chord/web';

const engine = new Chord();
const osc1 = engine.addNode('oscillator');
const osc2 = engine.addNode('oscillator');
const filt = engine.addNode('filter');
const rev = engine.addNode('reverb');

engine.setParameter(osc1, 'waveform', 1);
engine.setParameter(osc1, 'frequency', 130.81);
engine.setParameter(osc1, 'detune', -8);
engine.setParameter(osc2, 'waveform', 1);
engine.setParameter(osc2, 'frequency', 130.81);
engine.setParameter(osc2, 'detune', 8);
engine.setParameter(filt, 'cutoff', 300);
engine.setParameter(filt, 'resonance', 0.2);
engine.setParameter(rev, 'decay', 4);
engine.setParameter(rev, 'mix', 0.25);

engine.connect(osc1, 'out', filt, 'in');
engine.connect(osc2, 'out', filt, 'in');
engine.connect(filt, 'out', rev, 'in');

// Filter opens as user scrolls deeper
window.addEventListener('scroll', () => {
  const progress = window.scrollY / (document.body.scrollHeight - window.innerHeight);
  // Cutoff sweeps from 300Hz to 4000Hz
  engine.setParameter(filt, 'cutoff', 300 + progress * 3700);
  // Reverb gets wetter
  engine.setParameter(rev, 'mix', 0.15 + progress * 0.2);
  // Volume fades in
  engine.setMasterVolume(0.1 + progress * 0.4);
});

document.getElementById('enable-audio')!.onclick = () => engine.start();
```

## Interactive Musical Grid (React)

```tsx
import { Chord } from '@chord/web';
import { useRef, useEffect, useState } from 'react';

function MusicalGrid() {
  const engineRef = useRef<Chord | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const engine = new Chord();
    // Set up reverb for all notes
    const rev = engine.addNode('reverb');
    engine.setParameter(rev, 'decay', 3);
    engine.setParameter(rev, 'mix', 0.3);
    engineRef.current = engine;
    return () => engine.stop();
  }, []);

  const start = async () => {
    await engineRef.current?.start();
    setStarted(true);
  };

  // Pentatonic scale notes across 2 octaves
  const notes = [
    261.63, 311.13, 349.23, 392.00, 466.16, // C4 pentatonic
    523.25, 622.25, 698.46, 783.99, 932.33, // C5 pentatonic
  ];

  return (
    <div>
      {!started && <button onClick={start}>Start</button>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 60px)', gap: 4 }}>
        {notes.map((freq, i) => (
          <button
            key={i}
            onMouseEnter={() => engineRef.current?.playNote(freq, 0.4, 0.2)}
            style={{
              height: 60,
              background: `hsl(${(i / notes.length) * 360}, 60%, 40%)`,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

## Game Audio — Adaptive Music

```typescript
import { Chord } from '@chord/web';

const engine = new Chord();

// Base layer — always playing
const pad = engine.addNode('oscillator');
const padFilt = engine.addNode('filter');
const padRev = engine.addNode('reverb');
engine.setParameter(pad, 'waveform', 1);
engine.setParameter(pad, 'frequency', 65.41);
engine.setParameter(pad, 'gain', 0.3);
engine.setParameter(padFilt, 'cutoff', 800);
engine.setParameter(padRev, 'decay', 4);
engine.setParameter(padRev, 'mix', 0.3);
engine.connect(pad, 'out', padFilt, 'in');
engine.connect(padFilt, 'out', padRev, 'in');

// Combat layer — intensity-controlled
const combatOsc = engine.addNode('oscillator');
const combatFilt = engine.addNode('filter');
engine.setParameter(combatOsc, 'waveform', 2); // square
engine.setParameter(combatOsc, 'frequency', 130.81);
engine.setParameter(combatOsc, 'gain', 0); // starts silent
engine.setParameter(combatFilt, 'cutoff', 1500);
engine.connect(combatOsc, 'out', combatFilt, 'in');
engine.connect(combatFilt, 'out', padRev, 'in');

// In your game loop:
function updateAudio(gameState: { danger: number; exploring: boolean }) {
  // danger: 0=peaceful, 1=combat
  engine.setParameter(combatOsc, 'gain', gameState.danger * 0.3);
  engine.setParameter(padFilt, 'cutoff', 800 + gameState.danger * 3000);

  if (gameState.exploring) {
    engine.setParameter(padRev, 'mix', 0.4); // more reverb = bigger space
  } else {
    engine.setParameter(padRev, 'mix', 0.2);
  }
}
```

## Meditation Timer with Singing Bowls

```typescript
import { Chord } from '@chord/web';

const engine = new Chord();

// Continuous drone
const drone = engine.addNode('oscillator');
const droneFilt = engine.addNode('filter');
const droneRev = engine.addNode('reverb');
engine.setParameter(drone, 'waveform', 0); // sine
engine.setParameter(drone, 'frequency', 130.81); // C3
engine.setParameter(drone, 'gain', 0.15);
engine.setParameter(droneFilt, 'cutoff', 500);
engine.setParameter(droneRev, 'decay', 6);
engine.setParameter(droneRev, 'mix', 0.35);
engine.connect(drone, 'out', droneFilt, 'in');
engine.connect(droneFilt, 'out', droneRev, 'in');

// Play periodic singing bowl strikes
function bowlStrike() {
  const bowlFreqs = [261.63, 329.63, 392.00, 523.25]; // C major
  const freq = bowlFreqs[Math.floor(Math.random() * bowlFreqs.length)];
  engine.playNote(freq, 3.0, 0.15); // long sustain, quiet
}

// Strike every 15-30 seconds
function scheduleBowl() {
  bowlStrike();
  const next = 15000 + Math.random() * 15000;
  setTimeout(scheduleBowl, next);
}

document.getElementById('begin')!.onclick = async () => {
  await engine.start();
  scheduleBowl();
};
```
