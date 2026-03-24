# Chord API Reference

Complete reference for the `@chord/web` SDK.

---

## Chord (class)

The main engine class. Manages the audio graph, node lifecycle, and Web Audio output.

### Constructor

```typescript
const engine = new Chord();
```

Creates a new Chord engine instance. No AudioContext is created until `start()` is called.

---

### engine.start(): Promise\<void\>

Start audio playback. Creates the AudioContext and initializes all nodes.

**Must be called after a user gesture** (click, keydown, etc.) due to browser autoplay policy.

Sets up the master chain: masterGain → limiter → analyser → destination.

```typescript
button.addEventListener('click', async () => {
  await engine.start();
});
```

---

### engine.stop(): void

Stop playback. Fades out over 500ms to prevent clicks, then closes the AudioContext and releases all Web Audio resources.

```typescript
engine.stop();
```

---

### engine.started: boolean (readonly)

Whether the engine is currently started and producing audio.

```typescript
if (engine.started) {
  engine.stop();
}
```

---

### engine.addNode(type: string): string

Add a node of the given type to the graph.

**Parameters:**
- `type` (string): The node type identifier. See [Node Types](#node-types) for the full list.

**Returns:** `string` — the node ID (e.g., `"node-1"`, `"node-2"`)

If the engine is already started, the node begins processing immediately.

```typescript
const oscId = engine.addNode('oscillator');
const filterId = engine.addNode('filter');
const reverbId = engine.addNode('reverb');
```

---

### engine.removeNode(id: string): void

Remove a node by ID. Automatically disconnects all connections involving this node.

**Parameters:**
- `id` (string): The node ID returned by `addNode()`.

```typescript
engine.removeNode(oscId);
```

---

### engine.connect(fromId: string, fromPort: string, toId: string, toPort: string): void

Connect an output port of one node to an input port of another.

**Parameters:**
- `fromId` (string): Source node ID
- `fromPort` (string): Source output port name (usually `"out"`)
- `toId` (string): Destination node ID
- `toPort` (string): Destination input port name (usually `"in"`, or a parameter name for modulation)

```typescript
// Audio signal connection
engine.connect(oscId, 'out', filterId, 'in');

// Modulation connection (LFO → filter cutoff)
engine.connect(lfoId, 'out', filterId, 'cutoff');
```

---

### engine.disconnect(fromId: string, fromPort: string, toId: string, toPort: string): void

Remove a specific connection between two nodes.

**Parameters:** Same as `connect()`.

```typescript
engine.disconnect(oscId, 'out', filterId, 'in');
```

---

### engine.setParameter(nodeId: string, param: string, value: number): void

Set a parameter on a node. Parameters are smoothly ramped over 50ms to prevent audio clicks.

**Parameters:**
- `nodeId` (string): Target node ID
- `param` (string): Parameter name (node-type-specific, see [Node Types](#node-types))
- `value` (number): Parameter value

```typescript
engine.setParameter(oscId, 'frequency', 440);
engine.setParameter(filterId, 'cutoff', 2000);
engine.setParameter(reverbId, 'mix', 0.2);
```

---

### engine.getParameter(nodeId: string, param: string): number

Get the current value of a parameter.

**Parameters:**
- `nodeId` (string): Target node ID
- `param` (string): Parameter name

**Returns:** `number` — current parameter value, or `0` if node/param not found.

```typescript
const freq = engine.getParameter(oscId, 'frequency'); // 440
```

---

### engine.triggerNode(nodeId: string): void

Trigger a percussive/one-shot node (kick drum, snare, etc.). Nodes that support triggers will fire their internal envelope.

```typescript
engine.triggerNode(kickId);
```

---

### engine.playNote(freq: number, duration?: number, volume?: number): void

Play a quick one-shot note with automatic layering (fundamental + octave + fifth) routed through reverb if available.

**Parameters:**
- `freq` (number): Frequency in Hz
- `duration` (number, default: `0.5`): Duration in seconds
- `volume` (number, default: `0.25`): Volume 0-1

```typescript
engine.playNote(440, 0.5, 0.3);    // A4, half second, moderate volume
engine.playNote(261.63, 1.0);       // Middle C, one second
```

---

### engine.playScaleNote(degree: number, octave?: number, duration?: number): void

Play a note from the C minor pentatonic scale. Always sounds musical regardless of which degree you pick.

**Parameters:**
- `degree` (number): Scale degree (0-based, wraps around). 0=C, 1=Eb, 2=F, 3=G, 4=Bb
- `octave` (number, default: `0`): Octave offset (negative = lower, positive = higher)
- `duration` (number, default: `0.4`): Duration in seconds

```typescript
engine.playScaleNote(0);       // C4
engine.playScaleNote(2, 1);    // F5
engine.playScaleNote(4, -1);   // Bb3
```

---

### engine.getWaveformData(): Float32Array

Get time-domain waveform data for visualization. Returns a Float32Array of samples (length = analyser FFT size, default 2048).

Values range from -1 to 1. Returns zeroes if engine is not started.

```typescript
const waveform = engine.getWaveformData();
// Draw on canvas, etc.
```

---

### engine.getFrequencyData(): Float32Array

Get frequency-domain spectrum data for visualization. Returns a Float32Array of frequency bin magnitudes in dB (length = frequencyBinCount).

Values typically range from -100 to 0 dB. Returns zeroes if engine is not started.

```typescript
const spectrum = engine.getFrequencyData();
// spectrum[0] = lowest frequency bin magnitude in dB
```

---

### engine.getRMS(): number

Get the current RMS (root mean square) level. A simple loudness measurement.

**Returns:** `number` — RMS level, typically 0 to ~0.7 for normal audio.

```typescript
const loudness = engine.getRMS();
element.style.opacity = String(0.5 + loudness);
```

---

### engine.setMasterVolume(value: number): void

Set the master output volume. Smoothly ramped over 50ms.

**Parameters:**
- `value` (number): Volume level 0-1 (clamped to max 1)

```typescript
engine.setMasterVolume(0.8);
```

---

### engine.getNodeCount(): number

Returns the number of nodes currently in the graph.

---

### engine.getConnectionCount(): number

Returns the number of active connections.

---

### engine.getNodeIds(): string[]

Returns an array of all node IDs in the graph.

---

### engine.getNodeType(nodeId: string): string | null

Returns the type of a node by ID, or null if not found.

---

## Node Types

Every node type, its parameters, and its ports.

### oscillator

A basic waveform generator.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `frequency` | number | 20-20000 Hz | 440 | Oscillator frequency |
| `waveform` | number | 0-3 | 0 | 0=sine, 1=sawtooth, 2=square, 3=triangle |
| `detune` | number | -1200-1200 cents | 0 | Fine-tune in cents |
| `gain` | number | 0-1 | 0.5 | Output volume |

**Ports:**
- Output: `out`

---

### noise

Noise generator.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `color` | number | 0-2 | 0 | 0=white, 1=pink, 2=brown |
| `gain` | number | 0-1 | 0.3 | Output volume |

**Ports:**
- Output: `out`

---

### filter

Multi-mode filter with resonance and optional drive.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `cutoff` | number | 20-20000 Hz | 3000 | Filter cutoff frequency |
| `resonance` | number | 0-30 | 0.15 | Resonance (Q factor) |
| `type` | number | 0-3 | 0 | 0=lowpass, 1=highpass, 2=bandpass, 3=notch |
| `drive` | number | 0-1 | 0.05 | Subtle saturation in filter |

**Ports:**
- Input: `in`, `cutoff` (modulatable)
- Output: `out`

---

### reverb

Algorithmic reverb with damping and modulation.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `decay` | number | 0.1-20 s | 2.5 | Reverb tail length |
| `mix` | number | 0-1 | 0.2 | Dry/wet mix |
| `damping` | number | 0-1 | 0.6 | High-frequency absorption (higher = darker) |
| `predelay` | number | 0-0.1 s | 0.02 | Gap before reverb onset |
| `diffusion` | number | 0-1 | 0.8 | Reverb density/smoothness |
| `modulation` | number | 0-1 | 0.1 | Subtle chorusing in reverb tail |

**Ports:**
- Input: `in`
- Output: `out`

---

### delay

Tempo-syncable delay with damping and modulation.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `time` | number | 0.01-5 s | 0.375 | Delay time (0.375 = 1/8 note at 120 BPM) |
| `feedback` | number | 0-0.95 | 0.25 | Amount fed back (>0.9 = infinite) |
| `mix` | number | 0-1 | 0.15 | Dry/wet mix |
| `damping` | number | 0-1 | 0.4 | Each repeat gets darker |
| `modulation_rate` | number | 0-5 Hz | 0.5 | Pitch wobble rate |
| `modulation_depth` | number | 0-0.01 | 0.002 | Pitch wobble amount |

**Ports:**
- Input: `in`
- Output: `out`

---

### compressor

Dynamics compressor with sidechain support.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `threshold` | number | -60-0 dB | -12 | Level where compression starts |
| `ratio` | number | 1-20 | 2.5 | Compression ratio |
| `attack` | number | 0.001-1 s | 0.015 | Attack time |
| `release` | number | 0.01-2 s | 0.15 | Release time |
| `knee` | number | 0-40 dB | 6 | Soft knee width |
| `makeup` | number | 0-24 dB | 0 | Makeup gain |

**Ports:**
- Input: `in`, `sidechain`
- Output: `out`

---

### limiter

Brick-wall limiter for preventing clipping.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `ceiling` | number | -12-0 dB | -1 | Maximum output level |
| `release` | number | 0.01-1 s | 0.1 | Release time |

**Ports:**
- Input: `in`
- Output: `out`

---

### chorus

Multi-voice chorus for stereo width and shimmer.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `rate` | number | 0.05-5 Hz | 0.4 | Modulation rate |
| `depth` | number | 0-1 | 0.35 | Modulation depth |
| `mix` | number | 0-1 | 0.2 | Dry/wet mix |

**Ports:**
- Input: `in`
- Output: `out`

---

### phaser

Phase shifting effect.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `rate` | number | 0.05-10 Hz | 0.5 | Sweep rate |
| `depth` | number | 0-1 | 0.5 | Sweep depth |
| `feedback` | number | 0-0.95 | 0.3 | Resonance |
| `mix` | number | 0-1 | 0.3 | Dry/wet mix |

**Ports:**
- Input: `in`
- Output: `out`

---

### eq

Parametric EQ (3-band).

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `low_freq` | number | 20-500 Hz | 100 | Low band center |
| `low_gain` | number | -24-24 dB | 0 | Low band gain |
| `mid_freq` | number | 200-8000 Hz | 1000 | Mid band center |
| `mid_gain` | number | -24-24 dB | 0 | Mid band gain |
| `mid_q` | number | 0.1-10 | 1 | Mid band Q |
| `high_freq` | number | 2000-20000 Hz | 8000 | High band center |
| `high_gain` | number | -24-24 dB | 0 | High band gain |

**Ports:**
- Input: `in`
- Output: `out`

---

### waveshaper

Distortion / saturation with multiple modes.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `drive` | number | 0-1 | 0.3 | Distortion amount |
| `mode` | number | 0-3 | 0 | 0=soft clip, 1=hard clip, 2=tape, 3=tube |
| `mix` | number | 0-1 | 0.5 | Dry/wet mix |

**Ports:**
- Input: `in`
- Output: `out`

---

### granular

Granular synthesis / processing.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `grain_size` | number | 0.01-0.5 s | 0.08 | Individual grain duration |
| `density` | number | 1-50 | 12 | Grains per second |
| `pitch_scatter` | number | 0-24 semitones | 0 | Random pitch deviation |
| `position` | number | 0-1 | 0 | Playback position in buffer |
| `mix` | number | 0-1 | 0.5 | Dry/wet mix |

**Ports:**
- Input: `in`
- Output: `out`

---

### lfo

Low-frequency oscillator for modulation. Outputs control signal, not audio.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `rate` | number | 0.01-100 Hz | 1 | Modulation rate |
| `depth` | number | 0-10000 | 1 | Modulation depth (in target parameter's units) |
| `shape` | number | 0-3 | 0 | 0=sine, 1=triangle, 2=square, 3=random/S&H |
| `phase` | number | 0-360° | 0 | Phase offset |

**Ports:**
- Output: `out` (connect to any parameter input)

---

### envelope

ADSR envelope generator.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `attack` | number | 0.001-10 s | 0.01 | Attack time |
| `decay` | number | 0.001-10 s | 0.1 | Decay time |
| `sustain` | number | 0-1 | 0.7 | Sustain level |
| `release` | number | 0.001-10 s | 0.3 | Release time |

**Ports:**
- Input: `gate` (trigger signal)
- Output: `out`

---

### gain

Simple gain / volume control.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `gain` | number | 0-2 | 1 | Gain multiplier |

**Ports:**
- Input: `in`
- Output: `out`

---

### mixer

Multi-input mixer. Sums all connected inputs.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `gain` | number | 0-2 | 1 | Master output gain |

**Ports:**
- Input: `in` (accepts multiple connections)
- Output: `out`

---

### kickDrum

Synthesized kick drum with pitch envelope and click transient.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `frequency` | number | 30-100 Hz | 55 | Fundamental frequency |
| `pitch_env` | number | 100-500 Hz | 250 | Pitch envelope start frequency |
| `pitch_decay` | number | 0.01-0.2 s | 0.04 | Pitch envelope decay |
| `body_decay` | number | 0.05-1 s | 0.3 | Body amplitude decay |
| `click` | number | 0-1 | 0.5 | Click transient amount |
| `drive` | number | 0-1 | 0.15 | Saturation for speaker presence |

**Ports:**
- Output: `out`
- Supports `trigger()`

---

### snareDrum

Synthesized snare with body + noise layers.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `body_freq` | number | 100-400 Hz | 200 | Body tone frequency |
| `body_decay` | number | 0.02-0.2 s | 0.08 | Body decay time |
| `noise_decay` | number | 0.05-0.5 s | 0.15 | Noise (wire) decay |
| `noise_color` | number | 0-1 | 0.5 | Noise filter — 0=dark, 1=bright |
| `crack` | number | 0-1 | 0.6 | Initial transient snap |
| `mix` | number | 0-1 | 0.5 | Body vs noise balance |

**Ports:**
- Output: `out`
- Supports `trigger()`

---

### hiHat

Metallic hi-hat via ring modulation.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `decay` | number | 0.005-0.5 s | 0.03 | Closed: ~0.03, Open: ~0.3 |
| `tone` | number | 0-1 | 0.5 | Dark to bright |
| `ring_mod` | number | 0-1 | 0.7 | Metallic character amount |

**Ports:**
- Output: `out`
- Supports `trigger()`

---

### clap

Multi-burst handclap synthesis.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `bursts` | number | 2-6 | 4 | Number of micro-bursts |
| `spread` | number | 0.005-0.03 s | 0.012 | Time between bursts |
| `decay` | number | 0.05-0.5 s | 0.15 | Overall decay |
| `tone` | number | 0-1 | 0.5 | Dark to bright |

**Ports:**
- Output: `out`
- Supports `trigger()`

---

### tom

Tuned tom percussion.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `frequency` | number | 60-400 Hz | 120 | Fundamental pitch |
| `decay` | number | 0.1-1 s | 0.4 | Decay time |
| `pitch_drop` | number | 0-200 Hz | 50 | Pitch envelope depth |

**Ports:**
- Output: `out`
- Supports `trigger()`

---

### stepSequencer

Classic step sequencer.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `steps` | number | 1-64 | 16 | Number of steps |
| `tempo` | number | 20-300 BPM | 120 | Sequence tempo |
| `swing` | number | 0-1 | 0 | Swing amount (0=straight, 0.67=hard swing) |
| `velocity_variation` | number | 0-1 | 0.15 | Random velocity humanization |
| `timing_variation` | number | 0-0.02 s | 0.005 | Random timing humanization |

**Ports:**
- Output: `out` (trigger signal)

---

### euclidean

Euclidean rhythm generator. Distributes pulses as evenly as possible across steps.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `steps` | number | 1-64 | 16 | Total steps in pattern |
| `pulses` | number | 1-steps | 7 | Number of active hits |
| `rotation` | number | 0-steps | 0 | Pattern rotation offset |
| `tempo` | number | 20-300 BPM | 120 | Sequence tempo |
| `velocity_variation` | number | 0-1 | 0.15 | Humanization |

**Ports:**
- Output: `out` (trigger signal)

---

### markovSequencer

Markov chain-based melody/rhythm generator.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `order` | number | 1-4 | 2 | Chain order (1=random, higher=more coherent) |
| `temperature` | number | 0-2 | 1 | Randomness (0=deterministic, 2=chaotic) |
| `tempo` | number | 20-300 BPM | 120 | Sequence tempo |

**Ports:**
- Output: `out` (trigger + pitch signal)

---

### gravitySequencer

Particle gravity simulation driving note triggers.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `particles` | number | 2-16 | 8 | Number of orbiting particles |
| `gravity` | number | 0.01-10 | 1 | Gravitational constant |
| `damping` | number | 0-1 | 0.1 | Energy loss on collision |
| `tempo` | number | 20-300 BPM | 120 | Quantization tempo |

**Ports:**
- Output: `out` (trigger signal)

---

### gameOfLife

Cellular automata (Conway's Game of Life) driving note triggers.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `width` | number | 4-64 | 32 | Grid width |
| `height` | number | 4-64 | 32 | Grid height |
| `density` | number | 0-1 | 0.3 | Initial random fill density |
| `tempo` | number | 20-300 BPM | 120 | Generation rate |

**Ports:**
- Output: `out` (trigger signal)

---

### polyrhythm

Multiple overlapping rhythmic patterns.

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `pattern_a` | number | 2-16 | 7 | First rhythm division |
| `pattern_b` | number | 2-16 | 11 | Second rhythm division |
| `pattern_c` | number | 0-16 | 0 | Third rhythm (0=disabled) |
| `tempo` | number | 20-300 BPM | 120 | Base tempo |

**Ports:**
- Output: `out` (trigger signal)

---

### output

Master output node. **Every patch must have one.** Routes audio to the engine's master chain (gain → limiter → analyser → destination).

**Parameters:**
| Name | Type | Range | Default | Description |
|------|------|-------|---------|-------------|
| `gain` | number | 0-1 | 1 | Final output volume |

**Ports:**
- Input: `in`

---

### subpatch

Encapsulates a group of nodes as a single reusable unit.

**Parameters:** Defined by the subpatch's exposed parameters.

**Ports:**
- Input: `in`
- Output: `out`

---

## DSL Functions

The DSL (`@chord/web/dsl` or `@chord/web`) provides a declarative way to build patches.

### patch(name, config, builder)

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
  tempo?: number;       // BPM, default 120
  key?: string;         // 'C', 'C#', 'D', 'Eb', etc.
  scale?: string;       // 'major', 'minor', 'dorian', 'pentatonic', etc.
  timeSignature?: [number, number];  // [4, 4]
}
```

**PatchBuilder methods:**
- `p.expose(name, nodeRef, param, options?)` — expose a parameter for external control
- `p.setTempo(bpm)` — set patch tempo
- `p.setKey(key)` — set musical key

### Node factory functions

Every node type has a corresponding factory function:

```typescript
osc(params?)           // oscillator
filter(params?)        // filter
gain(params?)          // gain
delay(params?)         // delay
reverb(params?)        // reverb
noise(params?)         // noise
mixer()                // mixer
output()               // output
lfo(params?)           // LFO
envelope(params?)      // ADSR envelope
kickDrum(params?)      // kick drum
snareDrum(params?)     // snare drum
hiHat(params?)         // hi-hat
clap(params?)          // clap
tom(params?)           // tom
stepSequencer(params?) // step sequencer
euclidean(params?)     // euclidean rhythm
markovSequencer(p?)    // markov sequencer
gravitySequencer(p?)   // gravity sequencer
gameOfLife(params?)    // cellular automata
polyrhythm(params?)    // polyrhythm
compressor(params?)    // compressor
eq(params?)            // parametric EQ
chorus(params?)        // chorus
phaser(params?)        // phaser
waveshaper(params?)    // distortion/saturation
limiter(params?)       // limiter
granular(params?)      // granular
subpatch(config)       // subpatch
```

Each returns a `NodeRef` with:
- `.connect(target, port?)` — connect to another node, returns target for chaining
- `.id` — the node ID

### compile(patchDef) / decompile(json)

```typescript
compile(patchDef: CompiledPatch): PatchJSON;
decompile(json: PatchJSON): CompiledPatch;
```

Convert between DSL patch definitions and JSON format.

---

## Visualizers

All visualizer functions follow the pattern:

```typescript
const viz = createXxx(canvas: HTMLCanvasElement, engine: Chord, options?: XxxOptions);
viz.start();   // begin animation loop
viz.stop();    // stop animation
viz.destroy(); // cleanup
```

### createWaveform(canvas, engine, options?)

Oscilloscope-style waveform display.

```typescript
interface WaveformOptions {
  color?: string;         // default '#00ff88'
  lineWidth?: number;     // default 2
  backgroundColor?: string; // default 'transparent'
  mirror?: boolean;       // default false
}
```

### createSpectrum(canvas, engine, options?)

Frequency spectrum analyzer.

```typescript
interface SpectrumOptions {
  mode?: 'bars' | 'line' | 'fill';  // default 'bars'
  barCount?: number;       // default 64
  color?: string;          // default '#00ff88'
  minDecibels?: number;    // default -90
  maxDecibels?: number;    // default -10
}
```

### createLevelMeter(canvas, engine, options?)

RMS and peak level meter.

```typescript
interface LevelMeterOptions {
  orientation?: 'horizontal' | 'vertical';  // default 'vertical'
  peakHold?: number;       // ms to hold peak indicator, default 1500
  color?: string;
}
```

### createParticles(canvas, engine, options?)

Audio-reactive particle system.

```typescript
interface ParticlesOptions {
  count?: number;          // default 200
  reactTo?: 'rms' | 'beat' | 'spectrum';  // default 'rms'
  color?: string;
  maxSize?: number;        // default 4
  speed?: number;          // default 1
}
```

### createPianoRoll(canvas, engine, options?)

Live piano roll showing active notes.

### createChordDisplay(canvas, engine, options?)

Chord and note detection display.

### createDrumGrid(canvas, engine, options?)

Step sequencer grid visualization.

### createMelodyContour(canvas, engine, options?)

Pitch contour tracking visualization.

### createGeometry(canvas, engine, options?)

Audio-reactive 3D wireframe geometry.

```typescript
interface GeometryOptions {
  shape?: 'sphere' | 'cube' | 'torus';  // default 'sphere'
  wireframe?: boolean;     // default true
  color?: string;
  reactTo?: 'rms' | 'spectrum';
}
```

### createKaleidoscope(canvas, engine, options?)

Kaleidoscopic mirror effect driven by audio.

### createAudioBackground(canvas, engine, options?)

Full-screen audio-reactive gradient background.

```typescript
interface AudioBackgroundOptions {
  type?: 'gradient' | 'solid' | 'noise';  // default 'gradient'
  intensity?: number;      // 0-1, how reactive, default 0.3
  colors?: string[];       // gradient colors
}
```

### createAudioLoader(canvas, engine, options?)

Audio-reactive loading spinner.

### createSpectrogram(canvas, engine, options?)

Time-frequency heatmap (scrolling spectrogram).

```typescript
interface SpectrogramOptions {
  colormap?: 'magma' | 'viridis' | 'plasma' | 'inferno';
  scrollSpeed?: number;
  minDecibels?: number;
  maxDecibels?: number;
}
```

### createStereoField(canvas, engine, options?)

Goniometer / vectorscope for stereo analysis.

### createTerrain(canvas, engine, options?)

3D terrain landscape driven by spectrum data.

### createNetwork(canvas, engine, options?)

Constellation/network graph visualization.

### createNodeGraph(canvas, engine, options?)

Signal flow visualization showing the actual patch topology.

### createSequencerGrid(canvas, engine, options?)

Universal sequencer grid display.

---

## Analysis Functions

### getAnalysisFrame(engine)

Extract a complete analysis frame from the engine.

```typescript
import { getAnalysisFrame } from '@chord/web';

const frame = getAnalysisFrame(engine);
```

**Returns: AudioAnalysisFrame**
```typescript
interface AudioAnalysisFrame {
  rms: number;              // 0-1, overall loudness
  peak: number;             // 0-1, peak sample level
  bass: number;             // 0-1, energy 20-250Hz
  lowMid: number;           // 0-1, energy 250-500Hz
  mid: number;              // 0-1, energy 500-2kHz
  highMid: number;          // 0-1, energy 2k-6kHz
  treble: number;           // 0-1, energy 6k-20kHz
  spectralCentroid: number; // Hz, perceived brightness
  waveform: Float32Array;   // time-domain samples
  spectrum: Float32Array;   // frequency-domain dB values
}
```

### bindAudioToCSS(engine, element)

Inject audio analysis as CSS custom properties on a DOM element.

```typescript
bindAudioToCSS(engine, document.documentElement);
```

**CSS properties set (updated every frame):**
- `--chord-rms` — 0-1 loudness
- `--chord-bass` — 0-1 bass energy
- `--chord-mid` — 0-1 mid energy
- `--chord-treble` — 0-1 treble energy
- `--chord-beat` — 0 or 1 on detected beat
- `--chord-hue` — 0-360 hue derived from spectral centroid

**Usage in CSS:**
```css
.reactive-element {
  transform: scale(calc(1 + var(--chord-rms) * 0.3));
  filter: hue-rotate(calc(var(--chord-hue) * 1deg));
  opacity: calc(0.5 + var(--chord-bass) * 0.5);
}
```

### useAudioReactive(engine) — React Hook

```typescript
const audio = useAudioReactive(engine);
// audio.rms, audio.bass, audio.mid, audio.treble, audio.beat
// Updates on every animation frame
```

---

## Themes

```typescript
import { THEMES, getTheme } from '@chord/web';

const theme = getTheme('neon');
// theme.primary, theme.secondary, theme.background, theme.accent
```

**Built-in themes:** `'default'`, `'neon'`, `'warm'`, `'cool'`, `'dark'`, `'light'`, `'retro'`, `'minimal'`

---

## Configuration

```typescript
import { defineConfig } from '@chord/web';

const config = defineConfig({
  patchDir: './patches',
  outDir: './dist/audio',
  target: 'web',       // 'web' | 'react' | 'standalone'
  patches: {},
  defaults: {
    sampleRate: 48000,
    masterLimiter: true,
    autoGainStaging: true,
  },
});
```

---

## Tiers

```typescript
import { TIER_LIMITS, checkTierAccess, type Tier } from '@chord/web';

const tier: Tier = 'free';  // 'free' | 'pro' | 'studio'
const canUse = checkTierAccess(tier, 'granular');  // boolean
const limits = TIER_LIMITS[tier];
// limits.maxNodes, limits.maxConnections, etc.
```

---

## TypeScript Types

```typescript
// Re-exported from @chord/web
interface Connection {
  fromId: string;
  fromPort: string;
  toId: string;
  toPort: string;
}

interface ChordNode {
  id: string;
  type: string;
  start(ctx: AudioContext, master: GainNode): void;
  stop(): void;
  setParameter(param: string, value: number, time: number): void;
  getParameter(param: string): number;
  getInput(port: string): AudioNode | AudioParam | null;
  getOutput(port: string): AudioNode | null;
  trigger?(): void;
}

interface AudioAnalysisFrame {
  rms: number;
  peak: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  spectralCentroid: number;
  waveform: Float32Array;
  spectrum: Float32Array;
}

interface VisualizerTheme {
  primary: string;
  secondary: string;
  background: string;
  accent: string;
}

type Tier = 'free' | 'pro' | 'studio';
```
