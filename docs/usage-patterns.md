# Chord Usage Patterns

Real-world integration patterns for `@chord/web`. Every example is self-contained,
copy-paste ready TypeScript/TSX using the actual Chord API.

---

## Table of Contents

1. [Page Transitions and Navigation Audio](#1-page-transitions-and-navigation-audio)
2. [UI Sound Design](#2-ui-sound-design)
3. [Generative Background Audio](#3-generative-background-audio)
4. [Visualizer Integration](#4-visualizer-integration)
5. [Glitch and Creative Effects](#5-glitch-and-creative-effects)
6. [Data Sonification](#6-data-sonification)
7. [Mobile Patterns](#7-mobile-patterns)
8. [Framework Integration](#8-framework-integration)

---

## 1. Page Transitions and Navigation Audio

### Framer Motion Page Transitions with Audio Cues

Play ascending scale notes when pages enter, descending when they exit.

```tsx
import { Chord } from '@chord/web';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useEffect } from 'react';

const engine = new Chord();

// Set up a reverb so transition sounds have a tail
const rev = engine.addNode('reverb');
engine.setParameter(rev, 'room_size', 0.6);
engine.setParameter(rev, 'mix', 0.35);

function PageTransition({ children, pageKey }: { children: React.ReactNode; pageKey: string }) {
  const prevKey = useRef(pageKey);

  useEffect(() => {
    if (prevKey.current !== pageKey) {
      // Ascending arpeggio on page enter (C minor pentatonic)
      engine.playScaleNote(0, 0, 0.3);
      setTimeout(() => engine.playScaleNote(1, 0, 0.3), 80);
      setTimeout(() => engine.playScaleNote(2, 0, 0.4), 160);
      prevKey.current = pageKey;
    }
  }, [pageKey]);

  return (
    <AnimatePresence mode="wait"
      onExitComplete={() => {
        // Descending note on exit
        engine.playScaleNote(4, -1, 0.5);
      }}
    >
      <motion.div
        key={pageKey}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.35 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

### Scroll-Driven Audio (Filter Sweep + Reverb)

Map `scrollY` to filter cutoff and reverb mix. The page sounds brighter and more spacious
as the user scrolls deeper.

```tsx
import { Chord } from '@chord/web';
import { useEffect, useRef } from 'react';

function useScrollAudio() {
  const engineRef = useRef<Chord | null>(null);
  const filterId = useRef('');
  const reverbId = useRef('');

  useEffect(() => {
    const engine = new Chord();
    engineRef.current = engine;

    // Detuned saw pads
    const pad1 = engine.addNode('oscillator');
    const pad2 = engine.addNode('oscillator');
    engine.setParameter(pad1, 'waveform', 1); // saw
    engine.setParameter(pad1, 'frequency', 130.81);
    engine.setParameter(pad1, 'detune', -8);
    engine.setParameter(pad1, 'gain', 0.2);
    engine.setParameter(pad2, 'waveform', 1);
    engine.setParameter(pad2, 'frequency', 130.81);
    engine.setParameter(pad2, 'detune', 8);
    engine.setParameter(pad2, 'gain', 0.2);

    const filt = engine.addNode('filter');
    engine.setParameter(filt, 'cutoff', 300);
    engine.setParameter(filt, 'resonance', 0.3);
    filterId.current = filt;

    const rev = engine.addNode('reverb');
    engine.setParameter(rev, 'room_size', 0.5);
    engine.setParameter(rev, 'mix', 0.15);
    reverbId.current = rev;

    engine.connect(pad1, 'out', filt, 'in');
    engine.connect(pad2, 'out', filt, 'in');
    engine.connect(filt, 'out', rev, 'in');

    const onScroll = () => {
      const progress = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      engine.setParameter(filterId.current, 'cutoff', 300 + progress * 3700);
      engine.setParameter(reverbId.current, 'mix', 0.15 + progress * 0.35);
      engine.setMasterVolume(0.1 + progress * 0.4);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      engine.stop();
    };
  }, []);

  return engineRef;
}
```

### Framer Motion `scrollYProgress` Mapped to Parameters

Use Framer Motion's `useScroll` directly, polling in `useMotionValueEvent`.

```tsx
import { Chord } from '@chord/web';
import { useScroll, useMotionValueEvent } from 'framer-motion';
import { useRef, useEffect } from 'react';

function ScrollSynth() {
  const engineRef = useRef<Chord | null>(null);
  const oscId = useRef('');
  const filtId = useRef('');
  const { scrollYProgress } = useScroll();

  useEffect(() => {
    const engine = new Chord();
    engineRef.current = engine;
    const osc = engine.addNode('oscillator');
    engine.setParameter(osc, 'waveform', 3); // triangle
    engine.setParameter(osc, 'frequency', 220);
    engine.setParameter(osc, 'gain', 0.25);
    oscId.current = osc;

    const filt = engine.addNode('filter');
    engine.setParameter(filt, 'cutoff', 500);
    engine.setParameter(filt, 'resonance', 0.4);
    filtId.current = filt;

    const rev = engine.addNode('reverb');
    engine.setParameter(rev, 'room_size', 0.7);
    engine.setParameter(rev, 'mix', 0.3);

    engine.connect(osc, 'out', filt, 'in');
    engine.connect(filt, 'out', rev, 'in');

    return () => engine.stop();
  }, []);

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const engine = engineRef.current;
    if (!engine) return;
    // Pitch rises from 110Hz to 440Hz
    engine.setParameter(oscId.current, 'frequency', 110 + v * 330);
    // Filter opens from 500Hz to 6000Hz
    engine.setParameter(filtId.current, 'cutoff', 500 + v * 5500);
  });

  return <div style={{ height: '400vh' }}>Scroll to play</div>;
}
```

### Intersection Observer Section Reveals

Play a unique scale note when each section enters the viewport.

```tsx
import { Chord } from '@chord/web';
import { useEffect, useRef } from 'react';

function SoundSection({ index, children }: { index: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const hasPlayed = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasPlayed.current) {
          hasPlayed.current = true;
          // Each section plays a different scale degree
          engine.playScaleNote(index % 5, Math.floor(index / 5), 0.6);
        }
        if (!entry.isIntersecting) {
          hasPlayed.current = false; // allow replay on re-enter
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [index]);

  return <div ref={ref}>{children}</div>;
}

// Global engine instance — start once on user gesture
const engine = new Chord();
const rev = engine.addNode('reverb');
engine.setParameter(rev, 'room_size', 0.6);
engine.setParameter(rev, 'mix', 0.3);

function App() {
  return (
    <div>
      <button onClick={() => engine.start()}>Enable Audio</button>
      {['Intro', 'Features', 'Pricing', 'About', 'Contact'].map((name, i) => (
        <SoundSection key={name} index={i}>
          <section style={{ height: '100vh', padding: 40 }}>
            <h2>{name}</h2>
          </section>
        </SoundSection>
      ))}
    </div>
  );
}
```

---

## 2. UI Sound Design

### Comprehensive UI Sound System

A centralized sound map for every common interaction.

```tsx
import { Chord } from '@chord/web';

const engine = new Chord();

// Pre-build a reverb for all UI sounds
const uiRev = engine.addNode('reverb');
engine.setParameter(uiRev, 'room_size', 0.3);
engine.setParameter(uiRev, 'mix', 0.2);

const UISounds = {
  hover:      () => engine.playNote(880, 0.08, 0.05),
  click:      () => engine.playNote(660, 0.12, 0.12),
  success:    () => {
    engine.playNote(523.25, 0.15, 0.15);
    setTimeout(() => engine.playNote(659.25, 0.15, 0.15), 100);
    setTimeout(() => engine.playNote(783.99, 0.2, 0.15), 200);
  },
  error:      () => {
    engine.playNote(220, 0.3, 0.15);
    setTimeout(() => engine.playNote(196, 0.4, 0.15), 120);
  },
  warning:    () => {
    engine.playNote(440, 0.15, 0.1);
    setTimeout(() => engine.playNote(440, 0.15, 0.1), 200);
  },
  toggle:     (on: boolean) => engine.playNote(on ? 784 : 523, 0.1, 0.1),
  tabSwitch:  (index: number) => engine.playScaleNote(index, 0, 0.15),
  modalOpen:  () => engine.playScaleNote(2, 1, 0.3),
  modalClose: () => engine.playScaleNote(2, 0, 0.3),
  delete:     () => engine.playNote(196, 0.5, 0.1),
  copy:       () => {
    engine.playNote(1047, 0.06, 0.06);
    setTimeout(() => engine.playNote(1319, 0.06, 0.06), 50);
  },
  send:       () => {
    engine.playNote(392, 0.1, 0.1);
    setTimeout(() => engine.playNote(523, 0.1, 0.1), 60);
    setTimeout(() => engine.playNote(784, 0.15, 0.1), 120);
  },
};

export { engine, UISounds };
```

### Sound-Enabled Button Component

```tsx
import { UISounds, engine } from './ui-sounds';
import { useState } from 'react';

interface SoundButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  sound?: 'click' | 'success' | 'error' | 'send';
}

function SoundButton({ sound = 'click', onClick, children, ...props }: SoundButtonProps) {
  return (
    <button
      onMouseEnter={() => UISounds.hover()}
      onClick={(e) => {
        UISounds[sound]();
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function SoundToggle({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        UISounds.toggle(next);
      }}
      style={{
        background: on ? '#4ade80' : '#666',
        padding: '8px 16px',
        borderRadius: 20,
        border: 'none',
        color: '#fff',
        cursor: 'pointer',
      }}
    >
      {label}: {on ? 'On' : 'Off'}
    </button>
  );
}
```

### Sound-Enabled Slider

Plays a tone whose pitch corresponds to the slider value.

```tsx
import { Chord } from '@chord/web';
import { useRef, useCallback } from 'react';

function SoundSlider({
  min = 0, max = 100, value, onChange,
}: {
  min?: number; max?: number; value: number;
  onChange: (v: number) => void;
}) {
  const engineRef = useRef<Chord | null>(null);
  const lastSoundTime = useRef(0);

  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new Chord();
      const rev = engineRef.current.addNode('reverb');
      engineRef.current.setParameter(rev, 'room_size', 0.2);
      engineRef.current.setParameter(rev, 'mix', 0.15);
      engineRef.current.start();
    }
    return engineRef.current;
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    onChange(v);

    const now = Date.now();
    if (now - lastSoundTime.current > 60) {
      lastSoundTime.current = now;
      const normalized = (v - min) / (max - min);
      // Map 0-1 to 220Hz-880Hz
      const freq = 220 + normalized * 660;
      getEngine().playNote(freq, 0.08, 0.06);
    }
  };

  return (
    <input type="range" min={min} max={max} value={value} onInput={handleInput} />
  );
}
```

### Drag-and-Drop Audio Feedback

Distinct sounds for grab, drag-over, and drop.

```tsx
import { Chord } from '@chord/web';
import { useState, useRef } from 'react';

const engine = new Chord();
const rev = engine.addNode('reverb');
engine.setParameter(rev, 'room_size', 0.3);
engine.setParameter(rev, 'mix', 0.2);

function DraggableCard({ id, label }: { id: string; label: string }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', id);
        // Low "pick up" tone
        engine.playNote(330, 0.15, 0.1);
      }}
      onDragEnd={() => {
        // Soft "release" tone
        engine.playNote(262, 0.15, 0.08);
      }}
      style={{ padding: 16, background: '#2a2a2a', borderRadius: 8, cursor: 'grab', color: '#fff' }}
    >
      {label}
    </div>
  );
}

function DropZone({ onDrop }: { onDrop: (id: string) => void }) {
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!over) {
          setOver(true);
          // Quick chirp on drag-over
          engine.playNote(587, 0.06, 0.06);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData('text/plain');
        onDrop(id);
        // Success arpeggio on drop
        engine.playNote(523, 0.12, 0.12);
        setTimeout(() => engine.playNote(659, 0.12, 0.12), 80);
        setTimeout(() => engine.playNote(784, 0.15, 0.12), 160);
      }}
      style={{
        padding: 32,
        border: `2px dashed ${over ? '#4ade80' : '#555'}`,
        borderRadius: 12,
        textAlign: 'center',
        color: '#999',
        transition: 'border-color 0.2s',
      }}
    >
      Drop here
    </div>
  );
}
```

### Text Input Keystroke Audio

Gentle typing sounds scoped to an input field.

```tsx
import { Chord } from '@chord/web';
import { useRef } from 'react';

function SoundInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const engineRef = useRef<Chord | null>(null);

  const getEngine = () => {
    if (!engineRef.current) {
      engineRef.current = new Chord();
      const rev = engineRef.current.addNode('reverb');
      engineRef.current.setParameter(rev, 'room_size', 0.15);
      engineRef.current.setParameter(rev, 'mix', 0.1);
      engineRef.current.start();
    }
    return engineRef.current;
  };

  return (
    <input
      {...props}
      onKeyDown={(e) => {
        props.onKeyDown?.(e);
        if (e.key === 'Backspace') {
          getEngine().playNote(350, 0.04, 0.03);
        } else if (e.key === 'Enter') {
          getEngine().playNote(784, 0.12, 0.08);
          setTimeout(() => getEngine().playNote(1047, 0.1, 0.06), 60);
        } else if (e.key.length === 1) {
          // Random slight pitch variation per keystroke
          const freq = 600 + Math.random() * 200;
          getEngine().playNote(freq, 0.03, 0.02);
        }
      }}
    />
  );
}
```

---

## 3. Generative Background Audio

### Ambient Website Soundtrack with Mouse Interaction

Oscillators, filter, LFO, reverb. Mouse position drives the filter cutoff and LFO rate.

```tsx
import { Chord } from '@chord/web';

const engine = new Chord();

// Detuned pad
const pad1 = engine.addNode('oscillator');
const pad2 = engine.addNode('oscillator');
engine.setParameter(pad1, 'waveform', 1); // saw
engine.setParameter(pad1, 'frequency', 130.81); // C3
engine.setParameter(pad1, 'detune', -10);
engine.setParameter(pad1, 'gain', 0.2);
engine.setParameter(pad2, 'waveform', 1);
engine.setParameter(pad2, 'frequency', 196.0); // G3
engine.setParameter(pad2, 'detune', 8);
engine.setParameter(pad2, 'gain', 0.15);

// Breathing LFO on filter
const lfo1 = engine.addNode('lfo');
engine.setParameter(lfo1, 'rate', 0.1);
engine.setParameter(lfo1, 'depth', 0.6);

// Filter
const filt = engine.addNode('filter');
engine.setParameter(filt, 'cutoff', 800);
engine.setParameter(filt, 'resonance', 0.25);

// Noise texture
const tex = engine.addNode('noise');
engine.setParameter(tex, 'gain', 0.02);
const texFilt = engine.addNode('filter');
engine.setParameter(texFilt, 'cutoff', 3000);
engine.setParameter(texFilt, 'mode', 2); // bandpass

// Reverb
const rev = engine.addNode('reverb');
engine.setParameter(rev, 'room_size', 0.7);
engine.setParameter(rev, 'mix', 0.35);
engine.setParameter(rev, 'damping', 0.6);

// Connections
engine.connect(pad1, 'out', filt, 'in');
engine.connect(pad2, 'out', filt, 'in');
engine.connect(lfo1, 'out', filt, 'cutoff_mod');
engine.connect(filt, 'out', rev, 'in');
engine.connect(tex, 'out', texFilt, 'in');
engine.connect(texFilt, 'out', rev, 'in');

// Mouse drives parameters
document.addEventListener('mousemove', (e) => {
  const x = e.clientX / window.innerWidth;   // 0-1
  const y = e.clientY / window.innerHeight;  // 0-1
  engine.setParameter(filt, 'cutoff', 400 + x * 3600);
  engine.setParameter(lfo1, 'rate', 0.05 + y * 0.3);
  engine.setParameter(rev, 'mix', 0.2 + y * 0.3);
});

document.addEventListener('click', () => engine.start(), { once: true });
window.addEventListener('beforeunload', () => engine.stop());
```

### Adaptive Music (Map App State to Audio)

Adjust oscillator gain, filter brightness, and reverb based on application context.

```typescript
import { Chord } from '@chord/web';

type AppMode = 'browsing' | 'editing' | 'presenting' | 'idle';

class AdaptiveMusic {
  private engine = new Chord();
  private padOsc: string;
  private padFilt: string;
  private accentOsc: string;
  private accentGain: string;
  private rev: string;

  constructor() {
    this.padOsc = this.engine.addNode('oscillator');
    this.engine.setParameter(this.padOsc, 'waveform', 1);
    this.engine.setParameter(this.padOsc, 'frequency', 130.81);
    this.engine.setParameter(this.padOsc, 'gain', 0.2);

    this.padFilt = this.engine.addNode('filter');
    this.engine.setParameter(this.padFilt, 'cutoff', 600);
    this.engine.setParameter(this.padFilt, 'resonance', 0.2);

    this.accentOsc = this.engine.addNode('oscillator');
    this.engine.setParameter(this.accentOsc, 'waveform', 0); // sine
    this.engine.setParameter(this.accentOsc, 'frequency', 261.63);
    this.accentGain = this.engine.addNode('gain');
    this.engine.setParameter(this.accentGain, 'gain', 0);

    this.rev = this.engine.addNode('reverb');
    this.engine.setParameter(this.rev, 'room_size', 0.6);
    this.engine.setParameter(this.rev, 'mix', 0.3);

    this.engine.connect(this.padOsc, 'out', this.padFilt, 'in');
    this.engine.connect(this.padFilt, 'out', this.rev, 'in');
    this.engine.connect(this.accentOsc, 'out', this.accentGain, 'in');
    this.engine.connect(this.accentGain, 'out', this.rev, 'in');
  }

  async start() { await this.engine.start(); }
  stop() { this.engine.stop(); }

  setMode(mode: AppMode) {
    switch (mode) {
      case 'browsing':
        this.engine.setParameter(this.padFilt, 'cutoff', 1200);
        this.engine.setParameter(this.accentGain, 'gain', 0);
        this.engine.setMasterVolume(0.3);
        break;
      case 'editing':
        this.engine.setParameter(this.padFilt, 'cutoff', 600);
        this.engine.setParameter(this.accentGain, 'gain', 0.1);
        this.engine.setMasterVolume(0.15);
        break;
      case 'presenting':
        this.engine.setParameter(this.padFilt, 'cutoff', 2500);
        this.engine.setParameter(this.accentGain, 'gain', 0.2);
        this.engine.setMasterVolume(0.4);
        break;
      case 'idle':
        this.engine.setParameter(this.padFilt, 'cutoff', 400);
        this.engine.setParameter(this.accentGain, 'gain', 0);
        this.engine.setMasterVolume(0.08);
        break;
    }
  }
}
```

### Time-of-Day Responsive Audio

The soundtrack shifts timbre across morning, afternoon, evening, and night.

```typescript
import { Chord } from '@chord/web';

function getTimeProfile() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) {
    return { cutoff: 3000, rate: 0.15, volume: 0.25, roomSize: 0.4, freq: 261.63, label: 'morning' };
  } else if (hour >= 12 && hour < 17) {
    return { cutoff: 4000, rate: 0.2, volume: 0.35, roomSize: 0.3, freq: 329.63, label: 'afternoon' };
  } else if (hour >= 17 && hour < 21) {
    return { cutoff: 1500, rate: 0.08, volume: 0.25, roomSize: 0.6, freq: 196.0, label: 'evening' };
  } else {
    return { cutoff: 600, rate: 0.04, volume: 0.12, roomSize: 0.8, freq: 130.81, label: 'night' };
  }
}

const engine = new Chord();
const osc = engine.addNode('oscillator');
const lfo1 = engine.addNode('lfo');
const filt = engine.addNode('filter');
const rev = engine.addNode('reverb');

engine.setParameter(osc, 'waveform', 3); // triangle
engine.setParameter(osc, 'gain', 0.2);
engine.setParameter(filt, 'resonance', 0.2);

engine.connect(osc, 'out', filt, 'in');
engine.connect(lfo1, 'out', filt, 'cutoff_mod');
engine.connect(filt, 'out', rev, 'in');

function applyTimeProfile() {
  const p = getTimeProfile();
  engine.setParameter(osc, 'frequency', p.freq);
  engine.setParameter(filt, 'cutoff', p.cutoff);
  engine.setParameter(lfo1, 'rate', p.rate);
  engine.setParameter(rev, 'room_size', p.roomSize);
  engine.setMasterVolume(p.volume);
}

applyTimeProfile();
// Recheck every 10 minutes
setInterval(applyTimeProfile, 600_000);

document.addEventListener('click', () => engine.start(), { once: true });
```

### DSL: Ambient Generative Patch

The same kind of patch expressed with the Chord DSL.

```typescript
import { patch, osc, filter, noise, lfo, reverb, delay, mixer, gain, output } from '@chord/web';

export default patch('midnight-ambient', {
  tempo: 60,
  key: 'Eb',
  scale: 'dorian',
}, (p) => {
  const vibrato = lfo({ rate: 0.08, depth: 0.3, shape: 'sine' });

  const pad1 = osc({ waveform: 'saw', freq: p.scaleNote(3, 0), detune: -8 });
  const pad2 = osc({ waveform: 'saw', freq: p.scaleNote(3, 2), detune: 7 });
  const padFilt = filter({ cutoff: 800, resonance: 0.2 });

  pad1.modulate('frequency', vibrato);
  pad1.connect(padFilt);
  pad2.connect(padFilt);

  const rain = noise({ color: 'pink' });
  const rainVol = gain({ level: -20 });
  rain.connect(rainVol);

  const mix = mixer();
  padFilt.connect(mix, 'out', 'in1');
  rainVol.connect(mix, 'out', 'in2');

  const verb = reverb({ decay: 4, mix: 0.4, damping: 0.6 });
  const del = delay({ time: p.tempoSync('1/4'), feedback: 0.2, mix: 0.12 });
  mix.connect(del).connect(verb).connect(output());

  p.expose('brightness', padFilt, 'cutoff', { min: 200, max: 5000 });
  p.expose('wetness', verb, 'mix', { min: 0, max: 1 });
});
```

---

## 4. Visualizer Integration

### Audio-Reactive CSS Backgrounds via `bindAudioToCSS`

Bind audio analysis to CSS custom properties, then use them from pure CSS.

```tsx
import { Chord, bindAudioToCSS } from '@chord/web';
import { useEffect, useRef } from 'react';

function AudioReactiveBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const engine = new Chord();
    const osc = engine.addNode('oscillator');
    engine.setParameter(osc, 'waveform', 1);
    engine.setParameter(osc, 'frequency', 110);
    engine.setParameter(osc, 'gain', 0.3);

    const filt = engine.addNode('filter');
    engine.setParameter(filt, 'cutoff', 2000);
    engine.connect(osc, 'out', filt, 'in');

    engine.start();

    // Bind audio data to the container element
    const cleanup = bindAudioToCSS(engine, containerRef.current!);

    return () => {
      cleanup();
      engine.stop();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        // CSS custom properties are set by bindAudioToCSS at 60fps:
        //   --chord-rms, --chord-bass, --chord-treble, --chord-beat,
        //   --chord-hue, --chord-smooth-rms, --chord-attack, --chord-sub
        background: `radial-gradient(
          circle at 50% 50%,
          hsl(calc(var(--chord-hue, 200) * 1), 70%, calc(20% + var(--chord-bass, 0) * 30%)),
          hsl(calc(var(--chord-hue, 200) * 1 + 60), 50%, 10%)
        )`,
        transition: 'background 0.1s ease',
      }}
    />
  );
}
```

### CSS Custom Property Reference

These properties are injected by `bindAudioToCSS` onto the target element:

```css
/* All values are 0-1 floats unless noted */
.audio-reactive {
  /* Overall loudness */
  transform: scale(calc(1 + var(--chord-rms) * 0.2));

  /* Band energy */
  box-shadow: 0 0 calc(var(--chord-bass) * 40px) rgba(255, 0, 100, var(--chord-bass));

  /* Beat detection: 0 or 1 */
  animation-play-state: var(--chord-beat, 0) == 1 ? running : paused;

  /* Spectral centroid mapped to 0-300 hue */
  filter: hue-rotate(calc(var(--chord-hue) * 1deg));

  /* Smoothed RMS (less jittery) */
  opacity: calc(0.5 + var(--chord-smooth-rms) * 0.5);

  /* Fast attack / slow release envelope */
  border-width: calc(1px + var(--chord-attack) * 8px);

  /* Sub-bass (20-60Hz) */
  letter-spacing: calc(var(--chord-sub) * 10px);

  /* Presence (4-6kHz) */
  backdrop-filter: blur(calc(var(--chord-presence) * 10px));
}
```

### Canvas Waveform Visualizer as a Design Element

```tsx
import { Chord, createWaveform, getAnalysisFrame } from '@chord/web';
import { useEffect, useRef } from 'react';

function WaveformHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const engine = new Chord();
    const osc = engine.addNode('oscillator');
    engine.setParameter(osc, 'waveform', 1);
    engine.setParameter(osc, 'frequency', 130.81);
    engine.setParameter(osc, 'gain', 0.3);
    const rev = engine.addNode('reverb');
    engine.setParameter(rev, 'room_size', 0.6);
    engine.setParameter(rev, 'mix', 0.3);
    engine.connect(osc, 'out', rev, 'in');

    const canvas = canvasRef.current!;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;

    const viz = createWaveform(canvas, {
      mode: 'mirror',
      theme: 'neon',
      glow: true,
      lineWidth: 2,
      fade: 0.15,
    });

    engine.start();

    let rafId: number;
    function loop() {
      const frame = getAnalysisFrame(engine);
      viz.update(frame);
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      engine.stop();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: 200, borderRadius: 12 }}
    />
  );
}
```

### Spectrum Analyzer + Particles Combo

```tsx
import { Chord, createSpectrum, createParticles, getAnalysisFrame } from '@chord/web';
import { useEffect, useRef } from 'react';

function DualVisualizer() {
  const specRef = useRef<HTMLCanvasElement>(null);
  const partRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const engine = new Chord();
    const pad = engine.addNode('oscillator');
    engine.setParameter(pad, 'waveform', 1);
    engine.setParameter(pad, 'frequency', 65.41);
    engine.setParameter(pad, 'gain', 0.25);
    const noise = engine.addNode('noise');
    engine.setParameter(noise, 'gain', 0.05);
    const filt = engine.addNode('filter');
    engine.setParameter(filt, 'cutoff', 1500);
    engine.connect(pad, 'out', filt, 'in');
    engine.connect(noise, 'out', filt, 'in');

    const specCanvas = specRef.current!;
    const partCanvas = partRef.current!;
    [specCanvas, partCanvas].forEach((c) => {
      c.width = c.offsetWidth * 2;
      c.height = c.offsetHeight * 2;
    });

    const spectrum = createSpectrum(specCanvas, {
      mode: 'mountain',
      theme: 'sunset',
      barCount: 48,
      smoothing: 0.75,
      peakHold: true,
    });

    const particles = createParticles(partCanvas, {
      theme: 'neon',
      count: 400,
      reactTo: 'bass',
      color: 'spectrum',
      trails: 0.4,
      gravity: 0.01,
    });

    engine.start();

    let rafId: number;
    function loop() {
      const frame = getAnalysisFrame(engine);
      spectrum.update(frame);
      particles.update(frame);
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      engine.stop();
    };
  }, []);

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <canvas ref={specRef} style={{ width: '50%', height: 300, borderRadius: 12 }} />
      <canvas ref={partRef} style={{ width: '50%', height: 300, borderRadius: 12 }} />
    </div>
  );
}
```

### Framer Motion Driven by `useAudioReactive`

Use `getAnalysisFrame` in a rAF loop to drive Framer Motion spring values.

```tsx
import { Chord, getAnalysisFrame } from '@chord/web';
import { motion, useSpring, useMotionValue } from 'framer-motion';
import { useEffect, useRef } from 'react';

function PulsingOrb() {
  const scale = useMotionValue(1);
  const smoothScale = useSpring(scale, { stiffness: 300, damping: 20 });
  const hue = useMotionValue(200);
  const smoothHue = useSpring(hue, { stiffness: 100, damping: 30 });

  useEffect(() => {
    const engine = new Chord();
    const osc = engine.addNode('oscillator');
    engine.setParameter(osc, 'waveform', 1);
    engine.setParameter(osc, 'frequency', 110);
    engine.setParameter(osc, 'gain', 0.3);
    const lfo1 = engine.addNode('lfo');
    engine.setParameter(lfo1, 'rate', 0.3);
    engine.setParameter(lfo1, 'depth', 500);
    const filt = engine.addNode('filter');
    engine.setParameter(filt, 'cutoff', 1000);
    engine.connect(osc, 'out', filt, 'in');
    engine.connect(lfo1, 'out', filt, 'cutoff_mod');

    engine.start();

    let rafId: number;
    function loop() {
      const frame = getAnalysisFrame(engine);
      scale.set(1 + frame.smoothRms * 0.4);
      hue.set((frame.spectralCentroid / 8000) * 300);
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      engine.stop();
    };
  }, [scale, hue]);

  return (
    <motion.div
      style={{
        width: 200,
        height: 200,
        borderRadius: '50%',
        scale: smoothScale,
        background: smoothHue.get()
          ? `radial-gradient(circle, hsl(${smoothHue.get()}, 80%, 60%), hsl(${smoothHue.get()}, 60%, 20%))`
          : undefined,
        boxShadow: '0 0 40px rgba(100, 200, 255, 0.3)',
        margin: '100px auto',
      }}
    />
  );
}
```

### Audio-Reactive Grid with `getAnalysisFrame`

Each grid cell reacts to a different frequency band.

```tsx
import { Chord, getAnalysisFrame, type AudioAnalysisFrame } from '@chord/web';
import { useEffect, useRef, useState } from 'react';

function AudioGrid() {
  const [frame, setFrame] = useState<AudioAnalysisFrame | null>(null);

  useEffect(() => {
    const engine = new Chord();
    const osc = engine.addNode('oscillator');
    engine.setParameter(osc, 'waveform', 1);
    engine.setParameter(osc, 'frequency', 65.41);
    engine.setParameter(osc, 'gain', 0.3);
    const noise = engine.addNode('noise');
    engine.setParameter(noise, 'gain', 0.04);

    engine.start();

    let rafId: number;
    function loop() {
      setFrame(getAnalysisFrame(engine));
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      engine.stop();
    };
  }, []);

  if (!frame) return null;

  const bands = [
    { label: 'Sub', value: frame.sub, color: '#ff0055' },
    { label: 'Bass', value: frame.bass, color: '#ff4400' },
    { label: 'Low Mid', value: frame.lowMid, color: '#ff8800' },
    { label: 'Mid', value: frame.mid, color: '#ffcc00' },
    { label: 'High Mid', value: frame.highMid, color: '#88ff00' },
    { label: 'Presence', value: frame.presence, color: '#00ccff' },
    { label: 'Brilliance', value: frame.brilliance, color: '#7c3aed' },
    { label: 'RMS', value: frame.smoothRms, color: '#fff' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 16 }}>
      {bands.map((b) => (
        <div
          key={b.label}
          style={{
            height: 80,
            borderRadius: 8,
            background: b.color,
            opacity: 0.3 + b.value * 0.7,
            transform: `scale(${1 + b.value * 0.15})`,
            transition: 'transform 0.05s, opacity 0.05s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {b.label}
        </div>
      ))}
    </div>
  );
}
```

---

## 5. Glitch and Creative Effects

### Glitch Transition (Rapid Parameter Changes + Visual Sync)

Rapidly randomize parameters for 300ms, creating a "glitch" during page transitions.

```tsx
import { Chord } from '@chord/web';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';

function GlitchTransition({ children, active }: { children: React.ReactNode; active: boolean }) {
  const engineRef = useRef<Chord | null>(null);
  const [glitching, setGlitching] = useState(false);

  useEffect(() => {
    const engine = new Chord();
    const osc = engine.addNode('oscillator');
    engine.setParameter(osc, 'waveform', 2); // square
    engine.setParameter(osc, 'frequency', 100);
    engine.setParameter(osc, 'gain', 0);

    const filt = engine.addNode('filter');
    engine.setParameter(filt, 'cutoff', 2000);
    engine.setParameter(filt, 'resonance', 0.8);

    const noise = engine.addNode('noise');
    engine.setParameter(noise, 'gain', 0);

    engine.connect(osc, 'out', filt, 'in');
    engine.connect(noise, 'out', filt, 'in');

    engine.start();
    engineRef.current = engine;

    return () => engine.stop();
  }, []);

  const triggerGlitch = () => {
    const engine = engineRef.current;
    if (!engine) return;
    setGlitching(true);

    // Rapid parameter randomization over 300ms
    const oscId = engine.getNodeIds()[0]; // oscillator
    const filtId = engine.getNodeIds()[2]; // filter
    const noiseId = engine.getNodeIds()[1]; // noise

    engine.setParameter(oscId, 'gain', 0.2);
    engine.setParameter(noiseId, 'gain', 0.1);

    let count = 0;
    const interval = setInterval(() => {
      engine.setParameter(oscId, 'frequency', 50 + Math.random() * 2000);
      engine.setParameter(filtId, 'cutoff', 200 + Math.random() * 8000);
      engine.setParameter(filtId, 'resonance', Math.random() * 15);
      count++;
      if (count > 15) {
        clearInterval(interval);
        engine.setParameter(oscId, 'gain', 0);
        engine.setParameter(noiseId, 'gain', 0);
        setGlitching(false);
      }
    }, 20);
  };

  return (
    <div onClick={triggerGlitch} style={{ cursor: 'pointer' }}>
      <motion.div
        animate={glitching ? {
          x: [0, -3, 5, -2, 4, 0],
          filter: ['hue-rotate(0deg)', 'hue-rotate(90deg)', 'hue-rotate(180deg)', 'hue-rotate(0deg)'],
        } : { x: 0, filter: 'hue-rotate(0deg)' }}
        transition={{ duration: 0.3 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
```

### Tension Building: Rising Filter + Pitch Automation

Automate parameters over several seconds to build tension before a reveal.

```typescript
import { Chord } from '@chord/web';

async function buildTension(engine: Chord, durationMs: number = 4000): Promise<void> {
  const osc = engine.addNode('oscillator');
  engine.setParameter(osc, 'waveform', 1); // saw
  engine.setParameter(osc, 'frequency', 65);
  engine.setParameter(osc, 'gain', 0.05);

  const noise = engine.addNode('noise');
  engine.setParameter(noise, 'gain', 0);

  const filt = engine.addNode('filter');
  engine.setParameter(filt, 'cutoff', 200);
  engine.setParameter(filt, 'resonance', 0.5);

  engine.connect(osc, 'out', filt, 'in');
  engine.connect(noise, 'out', filt, 'in');

  const steps = 60;
  const stepMs = durationMs / steps;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 to 1
    const curve = t * t; // exponential feel

    engine.setParameter(osc, 'frequency', 65 + curve * 400);
    engine.setParameter(osc, 'gain', 0.05 + curve * 0.2);
    engine.setParameter(filt, 'cutoff', 200 + curve * 6000);
    engine.setParameter(filt, 'resonance', 0.5 + curve * 10);
    engine.setParameter(noise, 'gain', curve * 0.08);

    await new Promise((r) => setTimeout(r, stepMs));
  }

  // Climax: burst note + silence
  engine.playNote(523.25, 0.8, 0.3);
  engine.playNote(783.99, 0.8, 0.3);
  engine.setParameter(osc, 'gain', 0);
  engine.setParameter(noise, 'gain', 0);

  // Clean up nodes after tail dies
  setTimeout(() => {
    engine.removeNode(osc);
    engine.removeNode(noise);
    engine.removeNode(filt);
  }, 1500);
}

// Usage:
// const engine = new Chord();
// await engine.start();
// await buildTension(engine, 3000);
```

### Stutter/Retrigger Effect

Rapidly gate audio on and off to produce a stutter effect.

```typescript
import { Chord } from '@chord/web';

function stutterEffect(engine: Chord, nodeId: string, durationMs: number = 500, rate: number = 16) {
  const intervalMs = durationMs / rate;
  let step = 0;

  const interval = setInterval(() => {
    const on = step % 2 === 0;
    engine.setParameter(nodeId, 'gain', on ? 0.3 : 0);
    step++;
    if (step >= rate * 2) {
      clearInterval(interval);
      engine.setParameter(nodeId, 'gain', 0.3); // restore
    }
  }, intervalMs);
}

// Usage:
// stutterEffect(engine, oscId, 400, 12);
```

---

## 6. Data Sonification

### Map Dashboard Metrics to Audio Parameters

Sonify real-time data (CPU usage, revenue, etc.) by mapping values to audio parameters.

```tsx
import { Chord } from '@chord/web';
import { useEffect, useRef } from 'react';

interface DashboardMetrics {
  cpu: number;        // 0-100
  memory: number;     // 0-100
  requests: number;   // per second
  errorRate: number;  // 0-1
}

function useDashboardSonification() {
  const engineRef = useRef<Chord | null>(null);
  const ids = useRef({ osc: '', filt: '', noise: '', noiseGain: '' });

  useEffect(() => {
    const engine = new Chord();
    engineRef.current = engine;

    // Base tone represents system health
    const osc = engine.addNode('oscillator');
    engine.setParameter(osc, 'waveform', 3); // triangle
    engine.setParameter(osc, 'frequency', 220);
    engine.setParameter(osc, 'gain', 0.15);

    const filt = engine.addNode('filter');
    engine.setParameter(filt, 'cutoff', 1000);
    engine.setParameter(filt, 'resonance', 0.3);

    // Noise represents errors / instability
    const noise = engine.addNode('noise');
    engine.setParameter(noise, 'gain', 0);
    const noiseGain = engine.addNode('gain');
    engine.setParameter(noiseGain, 'gain', 0);

    const rev = engine.addNode('reverb');
    engine.setParameter(rev, 'room_size', 0.4);
    engine.setParameter(rev, 'mix', 0.2);

    engine.connect(osc, 'out', filt, 'in');
    engine.connect(filt, 'out', rev, 'in');
    engine.connect(noise, 'out', noiseGain, 'in');
    engine.connect(noiseGain, 'out', rev, 'in');

    ids.current = { osc, filt, noise, noiseGain };

    return () => engine.stop();
  }, []);

  function updateMetrics(metrics: DashboardMetrics) {
    const engine = engineRef.current;
    if (!engine) return;
    const { osc, filt, noiseGain } = ids.current;

    // CPU load -> pitch (low CPU = calm low tone, high CPU = tense high tone)
    engine.setParameter(osc, 'frequency', 130 + (metrics.cpu / 100) * 400);

    // Memory -> filter cutoff (more memory = brighter/harsher)
    engine.setParameter(filt, 'cutoff', 500 + (metrics.memory / 100) * 4000);

    // Request rate -> LFO-like volume modulation depth (busier = more movement)
    const reqNorm = Math.min(metrics.requests / 1000, 1);
    engine.setParameter(osc, 'gain', 0.1 + reqNorm * 0.15);

    // Error rate -> noise volume (errors add harshness)
    engine.setParameter(noiseGain, 'gain', metrics.errorRate * 0.2);
  }

  return { engine: engineRef, updateMetrics };
}
```

### Achievement / Alert Sounds on Threshold Crossings

Play distinct motifs when metrics cross defined thresholds.

```typescript
import { Chord } from '@chord/web';

class MetricAlerts {
  private engine: Chord;
  private prevValues: Map<string, number> = new Map();

  constructor(engine: Chord) {
    this.engine = engine;
    // Add reverb for alert sounds
    const rev = engine.addNode('reverb');
    engine.setParameter(rev, 'room_size', 0.4);
    engine.setParameter(rev, 'mix', 0.25);
  }

  check(name: string, value: number, thresholds: { warn: number; critical: number; direction: 'above' | 'below' }) {
    const prev = this.prevValues.get(name) ?? value;
    this.prevValues.set(name, value);

    const { warn, critical, direction } = thresholds;
    const crossedUp = (boundary: number) =>
      direction === 'above'
        ? prev < boundary && value >= boundary
        : prev > boundary && value <= boundary;

    if (crossedUp(critical)) {
      // Urgent: descending dissonant interval
      this.engine.playNote(880, 0.3, 0.2);
      setTimeout(() => this.engine.playNote(415.3, 0.5, 0.2), 150);
    } else if (crossedUp(warn)) {
      // Warning: two quick notes
      this.engine.playNote(660, 0.15, 0.12);
      setTimeout(() => this.engine.playNote(660, 0.15, 0.12), 200);
    }
  }

  celebrate(label: string) {
    // Achievement: bright ascending arpeggio
    this.engine.playScaleNote(0, 1, 0.2);
    setTimeout(() => this.engine.playScaleNote(2, 1, 0.2), 100);
    setTimeout(() => this.engine.playScaleNote(4, 1, 0.3), 200);
    setTimeout(() => this.engine.playScaleNote(0, 2, 0.5), 300);
    console.log(`Achievement unlocked: ${label}`);
  }
}

// Usage:
// const engine = new Chord();
// await engine.start();
// const alerts = new MetricAlerts(engine);
//
// // In your polling loop:
// alerts.check('cpu', currentCPU, { warn: 70, critical: 90, direction: 'above' });
// alerts.check('disk', currentDisk, { warn: 20, critical: 5, direction: 'below' });
//
// // On milestone:
// alerts.celebrate('1000 users online');
```

### Sonify a Time Series

Walk through an array of data points, mapping each to a note.

```typescript
import { Chord } from '@chord/web';

async function sonifyTimeSeries(
  engine: Chord,
  data: number[],
  options: { minFreq?: number; maxFreq?: number; noteDuration?: number; gap?: number } = {},
) {
  const { minFreq = 200, maxFreq = 1200, noteDuration = 0.15, gap = 80 } = options;
  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;

  for (const point of data) {
    const normalized = (point - minVal) / range;
    const freq = minFreq + normalized * (maxFreq - minFreq);
    engine.playNote(freq, noteDuration, 0.12);
    await new Promise((r) => setTimeout(r, gap));
  }
}

// Usage:
// const engine = new Chord();
// const rev = engine.addNode('reverb');
// engine.setParameter(rev, 'room_size', 0.5);
// engine.setParameter(rev, 'mix', 0.3);
// await engine.start();
//
// const revenue = [100, 120, 95, 140, 180, 160, 200, 250, 230, 310];
// await sonifyTimeSeries(engine, revenue, { gap: 120 });
```

---

## 7. Mobile Patterns

### Haptic + Audio Coordination

Trigger haptic feedback simultaneously with audio events on supported devices.

```tsx
import { Chord } from '@chord/web';

function hapticPulse(style: 'light' | 'medium' | 'heavy' = 'light') {
  if ('vibrate' in navigator) {
    const durationMap = { light: 10, medium: 25, heavy: 50 };
    navigator.vibrate(durationMap[style]);
  }
}

const engine = new Chord();
const rev = engine.addNode('reverb');
engine.setParameter(rev, 'room_size', 0.3);
engine.setParameter(rev, 'mix', 0.2);

const MobileInteractions = {
  tap() {
    hapticPulse('light');
    engine.playNote(660, 0.08, 0.1);
  },
  longPress() {
    hapticPulse('medium');
    engine.playNote(330, 0.3, 0.12);
  },
  success() {
    hapticPulse('medium');
    engine.playNote(523, 0.12, 0.12);
    setTimeout(() => {
      hapticPulse('light');
      engine.playNote(659, 0.12, 0.12);
    }, 100);
    setTimeout(() => {
      hapticPulse('light');
      engine.playNote(784, 0.2, 0.12);
    }, 200);
  },
  error() {
    hapticPulse('heavy');
    engine.playNote(220, 0.25, 0.15);
    setTimeout(() => {
      hapticPulse('heavy');
      engine.playNote(196, 0.35, 0.15);
    }, 150);
  },
  swipe(velocity: number) {
    // Faster swipe = higher pitch
    const freq = 400 + Math.min(velocity, 1) * 600;
    hapticPulse('light');
    engine.playNote(freq, 0.1, 0.06);
  },
};

export { MobileInteractions };
```

### Device Orientation Driving Audio Parameters

Use the `deviceorientation` event to map tilt to filter and reverb parameters.

```tsx
import { Chord } from '@chord/web';
import { useEffect, useRef } from 'react';

function TiltSynth() {
  const engineRef = useRef<Chord | null>(null);
  const ids = useRef({ osc: '', filt: '', rev: '' });

  useEffect(() => {
    const engine = new Chord();
    engineRef.current = engine;

    const osc = engine.addNode('oscillator');
    engine.setParameter(osc, 'waveform', 3); // triangle
    engine.setParameter(osc, 'frequency', 220);
    engine.setParameter(osc, 'gain', 0.2);

    const filt = engine.addNode('filter');
    engine.setParameter(filt, 'cutoff', 1000);
    engine.setParameter(filt, 'resonance', 0.4);

    const rev = engine.addNode('reverb');
    engine.setParameter(rev, 'room_size', 0.5);
    engine.setParameter(rev, 'mix', 0.25);

    engine.connect(osc, 'out', filt, 'in');
    engine.connect(filt, 'out', rev, 'in');
    ids.current = { osc, filt, rev };

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;

      // beta = front/back tilt (-180 to 180), gamma = left/right (-90 to 90)
      const pitch = (e.beta + 180) / 360;   // normalize to 0-1
      const roll = (e.gamma + 90) / 180;    // normalize to 0-1

      // Tilt forward/back -> filter cutoff
      engine.setParameter(ids.current.filt, 'cutoff', 200 + pitch * 5000);
      // Tilt left/right -> pitch
      engine.setParameter(ids.current.osc, 'frequency', 110 + roll * 660);
      // Combined tilt intensity -> reverb mix
      const tiltMag = Math.sqrt(pitch * pitch + roll * roll) / Math.SQRT2;
      engine.setParameter(ids.current.rev, 'mix', 0.1 + tiltMag * 0.4);
    };

    window.addEventListener('deviceorientation', onOrientation);

    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      engine.stop();
    };
  }, []);

  return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <p>Tilt your device to play</p>
      <button onClick={() => engineRef.current?.start()}>Start</button>
    </div>
  );
}
```

### Touch-Position Sound Map

Map multi-touch positions on a full-screen element to note frequencies.

```tsx
import { Chord } from '@chord/web';
import { useEffect, useRef } from 'react';

function TouchSoundPad() {
  const engineRef = useRef<Chord | null>(null);
  const padRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const engine = new Chord();
    const rev = engine.addNode('reverb');
    engine.setParameter(rev, 'room_size', 0.6);
    engine.setParameter(rev, 'mix', 0.3);
    engine.start();
    engineRef.current = engine;

    const el = padRef.current!;

    const handleTouch = (e: TouchEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const x = (touch.clientX - rect.left) / rect.width; // 0-1
        const y = (touch.clientY - rect.top) / rect.height;  // 0-1

        // X axis = pitch (C3 to C6), Y axis = volume
        const freq = 130.81 * Math.pow(2, x * 3);
        const volume = 0.05 + (1 - y) * 0.2;
        engine.playNote(freq, 0.4, volume);
      }
    };

    el.addEventListener('touchstart', handleTouch, { passive: false });
    el.addEventListener('touchmove', handleTouch, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleTouch);
      el.removeEventListener('touchmove', handleTouch);
      engine.stop();
    };
  }, []);

  return (
    <div
      ref={padRef}
      style={{
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#555',
        fontSize: 24,
      }}
    >
      Touch to play
    </div>
  );
}
```

---

## 8. Framework Integration

### Next.js App Router Audio Provider

Provide a single Chord engine instance across the entire app using React context.
Compatible with Next.js App Router (client components only for audio).

```tsx
// providers/audio-provider.tsx
'use client';

import { Chord, bindAudioToCSS } from '@chord/web';
import { createContext, useContext, useRef, useCallback, useEffect, useState, type ReactNode } from 'react';

interface AudioContextValue {
  engine: Chord | null;
  started: boolean;
  start: () => Promise<void>;
  stop: () => void;
  playNote: (freq: number, duration?: number, volume?: number) => void;
  playScaleNote: (degree: number, octave?: number, duration?: number) => void;
}

const AudioCtx = createContext<AudioContextValue>({
  engine: null,
  started: false,
  start: async () => {},
  stop: () => {},
  playNote: () => {},
  playScaleNote: () => {},
});

export function AudioProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<Chord | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const engine = new Chord();

    // Shared reverb for all one-shot sounds
    const rev = engine.addNode('reverb');
    engine.setParameter(rev, 'room_size', 0.4);
    engine.setParameter(rev, 'mix', 0.25);

    engineRef.current = engine;

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || started) return;
    await engine.start();
    // Bind CSS custom properties to the document root
    bindAudioToCSS(engine, document.documentElement);
    setStarted(true);
  }, [started]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setStarted(false);
  }, []);

  const playNote = useCallback((freq: number, dur = 0.4, vol = 0.2) => {
    engineRef.current?.playNote(freq, dur, vol);
  }, []);

  const playScaleNote = useCallback((deg: number, oct = 0, dur = 0.4) => {
    engineRef.current?.playScaleNote(deg, oct, dur);
  }, []);

  return (
    <AudioCtx.Provider value={{ engine: engineRef.current, started, start, stop, playNote, playScaleNote }}>
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudio() {
  return useContext(AudioCtx);
}
```

Usage in a page component:

```tsx
// app/page.tsx
'use client';

import { useAudio } from '@/providers/audio-provider';

export default function Home() {
  const { started, start, playScaleNote } = useAudio();

  return (
    <main>
      {!started && <button onClick={start}>Enable Audio</button>}
      <div style={{ display: 'flex', gap: 8 }}>
        {[0, 1, 2, 3, 4].map((deg) => (
          <button key={deg} onClick={() => playScaleNote(deg, 0, 0.4)}>
            Note {deg}
          </button>
        ))}
      </div>
    </main>
  );
}
```

### Zustand Store Integration

Manage audio engine state alongside application state in a Zustand store.

```typescript
// stores/audio-store.ts
import { create } from 'zustand';
import { Chord } from '@chord/web';

interface AudioState {
  engine: Chord | null;
  started: boolean;
  volume: number;
  muted: boolean;
  nodeIds: Record<string, string>;

  init: () => void;
  start: () => Promise<void>;
  stop: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  playNote: (freq: number, dur?: number) => void;
  cleanup: () => void;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  engine: null,
  started: false,
  volume: 0.5,
  muted: false,
  nodeIds: {},

  init() {
    if (get().engine) return;
    const engine = new Chord();

    // Build a default ambient patch
    const pad = engine.addNode('oscillator');
    engine.setParameter(pad, 'waveform', 1);
    engine.setParameter(pad, 'frequency', 130.81);
    engine.setParameter(pad, 'gain', 0.2);

    const filt = engine.addNode('filter');
    engine.setParameter(filt, 'cutoff', 800);
    engine.setParameter(filt, 'resonance', 0.2);

    const rev = engine.addNode('reverb');
    engine.setParameter(rev, 'room_size', 0.6);
    engine.setParameter(rev, 'mix', 0.3);

    engine.connect(pad, 'out', filt, 'in');
    engine.connect(filt, 'out', rev, 'in');

    set({ engine, nodeIds: { pad, filt, rev } });
  },

  async start() {
    const { engine, volume } = get();
    if (!engine) return;
    await engine.start();
    engine.setMasterVolume(volume);
    set({ started: true });
  },

  stop() {
    get().engine?.stop();
    set({ started: false });
  },

  setVolume(v: number) {
    const { engine, muted } = get();
    set({ volume: v });
    if (engine && !muted) engine.setMasterVolume(v);
  },

  toggleMute() {
    const { engine, muted, volume } = get();
    const next = !muted;
    set({ muted: next });
    engine?.setMasterVolume(next ? 0 : volume);
  },

  playNote(freq: number, dur = 0.4) {
    get().engine?.playNote(freq, dur, 0.2);
  },

  cleanup() {
    get().engine?.stop();
    set({ engine: null, started: false, nodeIds: {} });
  },
}));
```

Usage in a React component:

```tsx
import { useAudioStore } from '@/stores/audio-store';
import { useEffect } from 'react';

function AudioControls() {
  const { started, volume, muted, init, start, setVolume, toggleMute, cleanup } = useAudioStore();

  useEffect(() => {
    init();
    return () => cleanup();
  }, [init, cleanup]);

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {!started && <button onClick={start}>Start</button>}
      <button onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
      />
      <span>{Math.round(volume * 100)}%</span>
    </div>
  );
}
```

### Cleanup Patterns (`useEffect` Return)

Proper teardown for every pattern. The engine stops, the AudioContext closes, and
animation frames are cancelled.

```tsx
import { Chord, bindAudioToCSS, getAnalysisFrame, createWaveform } from '@chord/web';
import { useEffect, useRef } from 'react';

function AudioWidget() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // 1. Create engine and nodes
    const engine = new Chord();
    const osc = engine.addNode('oscillator');
    engine.setParameter(osc, 'waveform', 1);
    engine.setParameter(osc, 'frequency', 220);
    engine.setParameter(osc, 'gain', 0.2);

    // 2. Start engine
    engine.start();

    // 3. Set up CSS binding (returns its own cleanup)
    const unbindCSS = bindAudioToCSS(engine, document.documentElement);

    // 4. Set up canvas visualizer
    const canvas = canvasRef.current!;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    const viz = createWaveform(canvas, { mode: 'line', theme: 'chord' });

    // 5. Start animation loop
    let rafId: number;
    function loop() {
      const frame = getAnalysisFrame(engine);
      viz.update(frame);
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    // 6. Return cleanup function — tears down everything in reverse order
    return () => {
      cancelAnimationFrame(rafId);  // stop render loop
      unbindCSS();                  // stop CSS property updates
      engine.stop();                // stop audio context + all nodes
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: 150 }} />;
}
```

### Visibility-Aware Audio (Pause When Tab Hidden)

Suspend audio processing when the user switches tabs, resume when they return.

```tsx
import { Chord } from '@chord/web';
import { useEffect, useRef } from 'react';

function useVisibilityAwareEngine() {
  const engineRef = useRef<Chord | null>(null);
  const volumeBeforePause = useRef(0.5);

  useEffect(() => {
    const engine = new Chord();
    engineRef.current = engine;

    const onVisibilityChange = () => {
      if (document.hidden) {
        // Fade out quickly when tab is hidden
        volumeBeforePause.current = 0.5; // store current volume
        engine.setMasterVolume(0);
      } else {
        // Fade back in when tab is visible
        engine.setMasterVolume(volumeBeforePause.current);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      engine.stop();
    };
  }, []);

  return engineRef;
}
```

### Lazy Engine Initialization (Start on First Interaction)

Defer AudioContext creation until the user actually interacts, satisfying browser
autoplay policies while keeping the API ergonomic.

```tsx
import { Chord } from '@chord/web';
import { useRef, useCallback } from 'react';

function useLazyEngine() {
  const engineRef = useRef<Chord | null>(null);
  const startedRef = useRef(false);

  const getEngine = useCallback(async () => {
    if (!engineRef.current) {
      engineRef.current = new Chord();

      // Set up shared reverb
      const rev = engineRef.current.addNode('reverb');
      engineRef.current.setParameter(rev, 'room_size', 0.4);
      engineRef.current.setParameter(rev, 'mix', 0.25);
    }

    if (!startedRef.current) {
      await engineRef.current.start();
      startedRef.current = true;
    }

    return engineRef.current;
  }, []);

  const playNote = useCallback(async (freq: number, dur = 0.4, vol = 0.2) => {
    const engine = await getEngine();
    engine.playNote(freq, dur, vol);
  }, [getEngine]);

  const cleanup = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    startedRef.current = false;
  }, []);

  return { getEngine, playNote, cleanup };
}

// Usage: the engine starts only when the first button is pressed.
function LazyButtons() {
  const { playNote, cleanup } = useLazyEngine();

  useEffect(() => cleanup, [cleanup]);

  return (
    <div>
      {[261.63, 329.63, 392.00, 523.25].map((freq) => (
        <button key={freq} onClick={() => playNote(freq)}>
          {Math.round(freq)} Hz
        </button>
      ))}
    </div>
  );
}
```
