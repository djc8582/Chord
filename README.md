# Chord

The audio engine for everything. Describe sound, get sound.

## For Developers

```bash
npm install @chord/web
```

```typescript
import { Chord } from '@chord/web';

// Create an engine, add nodes, connect them, press play.
const engine = new Chord();
const osc = engine.addNode('oscillator');
const filter = engine.addNode('filter');
const reverb = engine.addNode('reverb');
engine.connect(osc, 'out', filter, 'in');
engine.connect(filter, 'out', reverb, 'in');
engine.setParameter(osc, 'frequency', 261.63);
engine.setParameter(filter, 'cutoff', 2000);
await engine.start();
```

## What Chord Does

Chord is a real-time audio synthesis engine. It runs in any browser via Web Audio API with zero dependencies. No audio files. No samples. Every sound is synthesized from mathematical models — oscillators, filters, effects, sequencers, physical models.

You build a node graph. Chord plays it.

```typescript
// DSL — write patches as code
import { patch, osc, filter, delay, reverb, output, lfo, euclidean } from '@chord/web';

export default patch('ambient-garden', { tempo: 85, key: 'C', scale: 'minor' }, (p) => {
  const rhythm = euclidean({ steps: 16, pulses: 7 });
  const synth = osc({ waveform: 'saw', detune: 12 });
  const filt = filter({ type: 'lowpass', cutoff: 2000, resonance: 0.3 });
  const space = reverb({ decay: 3.5, mix: 0.25, damping: 0.6 });
  const mod = lfo({ rate: 0.15, depth: 1200 });

  mod.connect(filt, 'cutoff');
  rhythm.connect(synth).connect(filt).connect(space).connect(output());

  p.expose('brightness', filt, 'cutoff', { min: 200, max: 8000 });
});
```

## The Engine

Under the hood, Chord runs a full synthesis engine:

- **47 node types** — oscillators, filters, effects, sequencers, physical models, drums, granular, waveshapers
- **6 sequencer types** — step, Euclidean, Markov, gravity, cellular automata, polyrhythm
- **18 visualizers** — waveform, spectrum, particles, piano roll, spectrogram, terrain, network, and more
- **Real-time diagnostics** — auto-prevents clipping, clicks, DC offset, NaN
- **Professional mixing** — master limiter, auto gain staging, bus compression
- **DSL** — write patches as TypeScript code with full type safety
- **MCP integration** — every feature programmable by AI assistants via Model Context Protocol

All of this is accessible through a clean API. Built in Rust (desktop/WASM), runs on Web Audio (browser).

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                        │
│  ┌──────────────────────────────┐ ┌─────────────────────┐  │
│  │       React Frontend         │ │   Rust Backend       │  │
│  │  Canvas · Timeline · Piano   │ │  Audio Graph         │  │
│  │  Inspector · Mixer · Browser │ │  DSP Runtime         │  │
│  │                              │ │  Audio I/O           │  │
│  │  Yjs CRDT Document Model     │ │  Plugin Host         │  │
│  └──────────────────────────────┘ │  Node Library        │  │
│                                   │  MIDI Engine         │  │
│  Tauri IPC + Shared Memory       │  Diagnostics          │  │
│                                   └─────────────────────┘  │
└────────────────────────────────────────────────────────────┘
         │                                     │
         │             ┌──────────┐            │
         └─────────────│MCP Server│────────────┘
                       └────┬─────┘
                            │
                   Claude Code / AI
```

## Packages

| Package | Description |
|---------|------------|
| `@chord/web` | Browser SDK — nodes, connections, DSL, visualizers |
| `@chord/cli` | CLI tool — init, create, validate, build, search, publish |
| `@chord/document-model` | Yjs CRDT document schema for collaborative editing |
| `@chord/gesture-system` | MediaPipe hand/body/face tracking for gestural control |
| `@chord/controller-integration` | Hardware MIDI controller auto-mapping |

## Rust Crates

| Crate | Description |
|-------|------------|
| `audio-graph` | Core graph data structure + topological sort compiler |
| `dsp-runtime` | Real-time audio processing engine |
| `audio-io` | CPAL-based cross-platform audio I/O |
| `plugin-host` | VST3/CLAP/AU plugin hosting |
| `node-library` | All 47 built-in node implementations |
| `midi-engine` | MIDI I/O and processing |
| `diagnostics` | Audio diagnostics, signal monitoring, profiling |
| `export-engine` | Compile patches to web, desktop, VST3, CLAP targets |
| `mcp-server` | MCP server for AI integration |
| `scripting-runtime` | Expression/code node execution |
| `testing-framework` | Patch testing & audio assertions |
| `chord-wasm` | WebAssembly compilation target |

## Quick Links

- [API Reference](./docs/api.md)
- [Sound Description Guide](./docs/descriptions.md)
- [Sound Design Guide](./docs/sound-design.md)
- [Visualizers](./docs/visualizers.md)
- [React Integration](./docs/react.md)
- [DSL Reference](./docs/dsl.md)
- [MCP Integration](./docs/mcp.md)
- [Community Library](./docs/community.md)
- [Desktop App](./docs/desktop.md)
- [Examples](./docs/examples.md)

## Build

```bash
# Rust
cargo build --workspace
cargo test --workspace

# TypeScript
pnpm install
pnpm build
pnpm test

# Desktop app
cd app && pnpm tauri dev

# MCP server
cargo run -p chord-mcp-server
```

## License

MIT
