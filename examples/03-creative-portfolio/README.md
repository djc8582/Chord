# Creative Portfolio

A single-page creative portfolio with generative ambient music, an audio-reactive particle system, CSS-driven audio reactivity, mouse-position audio control, and interaction sounds on project cards -- all powered by the Chord audio engine.

## Patterns Demonstrated

1. **Generative music via DSL** -- `ambient-patch.ts` defines a warm ambient pad using the Chord DSL: two detuned saws through a lowpass filter with LFO-modulated cutoff, chorus, delay, reverb, and pink noise texture. The `patch()` function compiles this into a graph that the engine can instantiate.

2. **Audio-reactive particle system** -- `ParticleHero.tsx` uses `createParticles` to run a canvas-based particle visualizer that reacts to audio beats and RMS energy. Particles burst on beats and drift with the ambient volume.

3. **CSS-driven audio reactivity** -- `bindAudioToCSS` injects CSS custom properties (`--chord-rms`, `--chord-bass`, `--chord-beat`, etc.) onto `<html>`, making the entire page subtly respond to audio. The hero title pulses, card borders glow, and backgrounds shift.

4. **Mouse-position audio** -- `useMouseAudio.ts` maps the mouse X position to the filter brightness parameter and the mouse Y position to the reverb space parameter, so moving the cursor sculpts the ambient sound in real time.

5. **Project card interaction sounds** -- `ProjectCard.tsx` calls `engine.playScaleNote(index)` on hover, playing a different pentatonic note per card. This guarantees every note sounds musical, no matter the order.

6. **Click-to-start pattern** -- The `AudioToggle` button handles browser autoplay policy by requiring an explicit user click to start the audio context.

7. **Exposed parameters** -- The DSL patch exposes `brightness` (filter cutoff) and `space` (reverb mix) as named parameters, which the mouse hook and other UI elements can control by node ID and parameter name.

## Running

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 and click the audio toggle to start the ambient engine.
