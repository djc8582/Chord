# visualizer

> **Tier 3** — Depends on `dsp-runtime` (via bridge).

## What This Is

Visualizer renderers. Receives signal data from the Rust audio engine via shared memory and renders in WebGL/Canvas2D. Waveforms, spectrums, particles, geometry, custom shaders.

## Key Features
- SharedArrayBuffer bridge for real-time audio data from Rust
- Waveform oscilloscope renderer
- Spectrum analyzer renderer (bar, mountain, circular)
- Particle system renderer (audio-reactive)
- Custom GLSL shader renderer
- Detachable to separate window (fullscreen for performances)

## Dependencies
- `dsp-runtime` via shared memory bridge

## Definition of Done
- [ ] Receives audio data from Rust engine at 60fps
- [ ] Waveform renderer displays audio signal
- [ ] Spectrum analyzer displays frequency content
- [ ] At least one additional visualizer type works
- [ ] Detaches to separate window
