# Chord DSL Reference

Write audio patches as TypeScript code with full type safety, chainable connections, and compile-time validation.

## Overview

The DSL is an alternative to building patches imperatively with `addNode`/`connect`. It's declarative, composable, and produces the same underlying patch format.

```typescript
import { patch, osc, filter, reverb, output, lfo } from '@chord/web';

export default patch('warm-pad', { tempo: 85, key: 'C', scale: 'minor' }, (p) => {
  const synth = osc({ waveform: 'saw', detune: 12 });
  const filt = filter({ cutoff: 2000, resonance: 0.2 });
  const mod = lfo({ rate: 0.12, depth: 1200 });
  const space = reverb({ decay: 3.5, mix: 0.25 });

  mod.connect(filt, 'cutoff');
  synth.connect(filt).connect(space).connect(output());

  p.expose('brightness', filt, 'cutoff', { min: 200, max: 8000 });
});
```

## patch(name, config, builder)

The entry point for every DSL patch.

```typescript
function patch(
  name: string,
  config: PatchConfig,
  builder: (p: PatchBuilder) => void
): CompiledPatch;
```

**PatchConfig:**
```typescript
interface PatchConfig {
  tempo?: number;                    // BPM (20-300, default: 120)
  key?: string;                      // 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'
  scale?: string;                    // See scale list below
  timeSignature?: [number, number];  // default: [4, 4]
}
```

**Scales:** `major`, `minor`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `aeolian`, `locrian`, `pentatonic`, `pentatonic_minor`, `blues`, `chromatic`, `whole_tone`, `harmonic_minor`, `melodic_minor`

**PatchBuilder (p):**
- `p.expose(name, nodeRef, param, options?)` — make a parameter controllable from outside
- `p.setTempo(bpm)` — set tempo programmatically
- `p.setKey(key)` — set key programmatically

## Node Factories

Every node type has a factory function that returns a `NodeRef`:

```typescript
interface NodeRef {
  id: string;
  connect(target: NodeRef, port?: string): NodeRef;  // returns target for chaining
}
```

### Sources

```typescript
// Oscillator
osc({ waveform: 'saw', freq: 440, detune: 0, gain: 0.5 })
// waveform: 'sine' | 'saw' | 'square' | 'triangle'

// Noise
noise({ color: 'pink', gain: 0.3 })
// color: 'white' | 'pink' | 'brown'

// Drums
kickDrum({ frequency: 55, pitch_env: 250, body_decay: 0.3, click: 0.5, drive: 0.15 })
snareDrum({ body_freq: 200, noise_decay: 0.15, crack: 0.6, mix: 0.5 })
hiHat({ decay: 0.03, tone: 0.5, ring_mod: 0.7 })
clap({ bursts: 4, spread: 0.012, decay: 0.15 })
tom({ frequency: 120, decay: 0.4, pitch_drop: 50 })
```

### Effects

```typescript
filter({ type: 'lowpass', cutoff: 2000, resonance: 0.2, drive: 0.05 })
// type: 'lowpass' | 'highpass' | 'bandpass' | 'notch'

reverb({ decay: 2.5, mix: 0.2, damping: 0.6, predelay: 0.02 })
delay({ time: 0.375, feedback: 0.25, mix: 0.15, damping: 0.4 })
compressor({ threshold: -12, ratio: 2.5, attack: 0.015, release: 0.15, knee: 6 })
limiter({ ceiling: -1, release: 0.1 })
chorus({ rate: 0.4, depth: 0.35, mix: 0.2 })
phaser({ rate: 0.5, depth: 0.5, feedback: 0.3, mix: 0.3 })
eq({ low_freq: 100, low_gain: 0, mid_freq: 1000, mid_gain: 0, mid_q: 1, high_freq: 8000, high_gain: 0 })
waveshaper({ drive: 0.3, mode: 'tape', mix: 0.5 })
// mode: 'soft_clip' | 'hard_clip' | 'tape' | 'tube'
granular({ grain_size: 0.08, density: 12, pitch_scatter: 0, mix: 0.5 })
```

### Control

```typescript
lfo({ rate: 1, depth: 1, shape: 'sine', phase: 0 })
// shape: 'sine' | 'triangle' | 'square' | 'random'

envelope({ attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 })
gain({ gain: 1 })
mixer()
output()
```

### Sequencers

```typescript
stepSequencer({ steps: 16, tempo: 120, swing: 0 })
euclidean({ steps: 16, pulses: 7, rotation: 0, tempo: 120 })
markovSequencer({ order: 2, temperature: 1, tempo: 120 })
gravitySequencer({ particles: 8, gravity: 1, damping: 0.1, tempo: 120 })
gameOfLife({ width: 32, height: 32, density: 0.3, tempo: 120 })
polyrhythm({ pattern_a: 7, pattern_b: 11, pattern_c: 0, tempo: 120 })
```

### Utility

```typescript
subpatch({ name: 'my-sub', inputs: ['in'], outputs: ['out'] })
```

## Connections

```typescript
// Basic: connect output → input
synth.connect(filt);

// Chaining: returns the target, so you can chain
synth.connect(filt).connect(reverb).connect(output());

// Modulation: connect to a specific parameter
lfo.connect(filt, 'cutoff');   // LFO modulates filter cutoff
env.connect(gain, 'gain');      // Envelope controls volume
```

## Exposing Parameters

Make parameters controllable from outside the patch:

```typescript
p.expose('brightness', filt, 'cutoff', {
  min: 200,
  max: 8000,
  default: 2000,
  unit: 'Hz',
  description: 'Filter brightness',
});

p.expose('space', rev, 'mix', {
  min: 0,
  max: 0.6,
  default: 0.2,
});
```

## Compile / Decompile

Convert between DSL patches and JSON:

```typescript
import { compile, decompile } from '@chord/web';

// DSL → JSON
const json = compile(myPatch);
// Save as .chord.json file

// JSON → DSL (for editing)
const patchDef = decompile(json);
```

## Complete Examples

### Lo-fi Beat

```typescript
export default patch('lofi-study', { tempo: 80, key: 'C', scale: 'pentatonic_minor' }, (p) => {
  // Drums with swing and humanization
  const drums = stepSequencer({ steps: 16, tempo: 80, swing: 0.55 });
  const kick = kickDrum({ frequency: 50, body_decay: 0.35, drive: 0.2 });
  const snare = snareDrum({ body_freq: 180, noise_decay: 0.12, crack: 0.4 });
  const hat = hiHat({ decay: 0.025, tone: 0.3 });
  const drumBus = compressor({ threshold: -10, ratio: 3, attack: 0.01, release: 0.1 });
  const drumSat = waveshaper({ drive: 0.15, mode: 'tape', mix: 0.3 });

  drums.connect(kick);
  drums.connect(snare);
  drums.connect(hat);
  kick.connect(drumBus);
  snare.connect(drumBus);
  hat.connect(drumBus);
  drumBus.connect(drumSat).connect(output());

  // Electric piano
  const keys = osc({ waveform: 'triangle', detune: 5 });
  const keysFilt = filter({ cutoff: 3000, resonance: 0.15 });
  const keysRev = reverb({ decay: 2.5, mix: 0.3, damping: 0.7 });
  const vinyl = noise({ color: 'brown', gain: 0.02 }); // vinyl crackle

  keys.connect(keysFilt).connect(keysRev).connect(output());
  vinyl.connect(output());

  p.expose('warmth', keysFilt, 'cutoff', { min: 500, max: 5000 });
  p.expose('space', keysRev, 'mix', { min: 0.1, max: 0.5 });
});
```

### Generative Ambient

```typescript
export default patch('deep-ambient', { tempo: 60, key: 'C', scale: 'minor' }, (p) => {
  // Sub drone
  const sub = osc({ waveform: 'sine', freq: 65.41 }); // C2
  const subFilt = filter({ cutoff: 150, resonance: 0 });
  sub.connect(subFilt).connect(output());

  // Pad — 4 detuned voices
  const pad1 = osc({ waveform: 'saw', detune: -10 });
  const pad2 = osc({ waveform: 'saw', detune: 10 });
  const pad3 = osc({ waveform: 'saw', detune: -3 });
  const pad4 = osc({ waveform: 'saw', detune: 3 });
  const padMix = mixer();
  const padFilt = filter({ cutoff: 2000, resonance: 0.2 });
  const padMod = lfo({ rate: 0.08, depth: 1500 });
  const padChorus = chorus({ rate: 0.3, depth: 0.4, mix: 0.2 });
  const padSat = waveshaper({ drive: 0.08, mode: 'tape', mix: 0.4 });
  const bigRev = reverb({ decay: 6, mix: 0.35, damping: 0.7 });

  pad1.connect(padMix);
  pad2.connect(padMix);
  pad3.connect(padMix);
  pad4.connect(padMix);
  padMod.connect(padFilt, 'cutoff');
  padMix.connect(padFilt).connect(padChorus).connect(padSat).connect(bigRev).connect(output());

  // Texture — filtered noise
  const tex = noise({ color: 'pink', gain: 0.04 });
  const texFilt = filter({ type: 'bandpass', cutoff: 4000, resonance: 0.3 });
  const texMod = lfo({ rate: 0.05, depth: 2000 });
  texMod.connect(texFilt, 'cutoff');
  tex.connect(texFilt).connect(bigRev).connect(output());

  // Sparse bells via gravity sequencer
  const bells = gravitySequencer({ particles: 6, gravity: 0.5, tempo: 60 });
  const bell = osc({ waveform: 'sine', gain: 0.15 });
  const bellFilt = filter({ cutoff: 6000, resonance: 0.4 });
  const bellRev = reverb({ decay: 4, mix: 0.4 });
  bells.connect(bell);
  bell.connect(bellFilt).connect(bellRev).connect(output());

  p.expose('depth', padFilt, 'cutoff', { min: 300, max: 4000 });
  p.expose('density', bells, 'particles', { min: 2, max: 12 });
});
```

### Euclidean Percussion

```typescript
export default patch('euclidean-groove', { tempo: 110, key: 'A', scale: 'minor' }, (p) => {
  // Three Euclidean layers with different ratios
  const e1 = euclidean({ steps: 16, pulses: 5, rotation: 0, tempo: 110 });
  const e2 = euclidean({ steps: 16, pulses: 7, rotation: 3, tempo: 110 });
  const e3 = euclidean({ steps: 12, pulses: 5, rotation: 1, tempo: 110 });

  const kick = kickDrum({ frequency: 55, body_decay: 0.3 });
  const snare = snareDrum({ body_freq: 200, noise_decay: 0.1 });
  const hat = hiHat({ decay: 0.04, tone: 0.6, ring_mod: 0.8 });

  e1.connect(kick);
  e2.connect(snare);
  e3.connect(hat);

  // Drum bus
  const bus = mixer();
  const busComp = compressor({ threshold: -10, ratio: 3, attack: 0.008, release: 0.08 });
  const busRev = reverb({ decay: 0.8, mix: 0.1 });

  kick.connect(bus);
  snare.connect(bus);
  hat.connect(bus);
  bus.connect(busComp).connect(busRev).connect(output());

  p.expose('kick_pattern', e1, 'pulses', { min: 1, max: 16 });
  p.expose('snare_pattern', e2, 'pulses', { min: 1, max: 16 });
  p.expose('hat_pattern', e3, 'pulses', { min: 1, max: 12 });
});
```
