# node-library

> **Tier 2** — Depends on `dsp-runtime`, `midi-engine`.

## What This Is

ALL built-in node implementations. This is the largest crate. Every source, effect, control, sequencer, analysis, utility, AI, gesture, MCP, and sound design node lives here.

## Structure

Organized into sub-modules matching the spec categories:

```
node-library/
├── src/
│   ├── sources/         # Oscillator, Sampler, Granular, PhysicalModel, etc.
│   ├── effects/         # Filter, Delay, Reverb, Compressor, etc.
│   ├── control/         # LFO, Envelope, Math, Logic, Macro, etc.
│   ├── sequencers/      # Step, Euclidean, Gravity, GameOfLife, Markov, etc.
│   ├── midi/            # MidiInput, MidiOutput, Arpeggiator, etc.
│   ├── analysis/        # Oscilloscope, Spectrum, PitchTracker, etc.
│   ├── utility/         # Mixer, Gain, Recorder, Expression, CodeNode, etc.
│   ├── network/         # OSC, HTTP, WebSocket, AbletonLink, etc.
│   ├── ai/              # ClaudeText, AudioGenerate, Separation, etc.
│   ├── gesture/         # HandTracking, BodyTracking, etc.
│   ├── sound_design/    # WhooshDesigner, ImpactDesigner, FoleyGen, etc.
│   ├── mastering/       # Dither, LoudnessTargeter, MasteringChain, etc.
│   └── registry.rs      # Central registry of all node types
```

## Implementation Priority

Build nodes in this order (each group can be parallel within itself):

**Wave 1 (MVP nodes):** Oscillator, Filter, Gain, ADSR Envelope, LFO, Mixer, Output, MidiInput, MidiNote
**Wave 2 (Basic production):** Delay, Reverb, Compressor, EQ, StepSequencer, FilePlayer, Sampler, Pan, Recorder
**Wave 3 (Generative):** EuclideanSeq, GravitySeq, MarkovSeq, GameOfLifeSeq, PolyrhythmEngine, RandomWalk
**Wave 4 (Advanced):** Granular, Spectral, Vocoder, PitchShift, PhysicalModels, all remaining effects
**Wave 5 (AI/Network/SoundDesign):** All AI nodes, network nodes, sound design toolkit, gesture nodes

## Key Rule

Every node implements `AudioNode` from `dsp-runtime` and registers itself in `registry.rs` with a `NodeFactory`.

## Dependencies
- `dsp-runtime` (Tier 1) — AudioNode trait, ProcessContext
- `midi-engine` (Tier 0) — MidiMessage types

## Definition of Done
- [ ] Wave 1 nodes all working and tested
- [ ] Every node has at least one unit test verifying basic processing
- [ ] Registry returns correct NodeFactory for every registered type
- [ ] Oscillator is anti-aliased (verify no spectral leakage above Nyquist in test)
- [ ] Filter is stable at high resonance (verify no NaN/explosion)
- [ ] All generative sequencers produce non-trivial output with default settings
