# Sonic Landing Page

A Next.js landing page where every interaction has sound. Scroll drives a filter sweep, sections trigger pentatonic notes, and buttons play UI sounds -- all powered by the Chord audio engine.

## Patterns Demonstrated

1. **Scroll-driven audio** -- `useScrollAudio` maps window scroll position to filter cutoff and reverb mix, so the ambient pad evolves as you scroll.
2. **Intersection Observer sounds** -- `SonicSection` plays a pentatonic scale note when each section enters the viewport.
3. **Audio-reactive CSS** -- `bindAudioToCSS` injects `--chord-rms`, `--chord-bass`, etc. as CSS custom properties for visual feedback.
4. **UI interaction sounds** -- `SonicButton` plays a short pitched note on click and a subtle sound on hover.
5. **Ambient audio engine** -- `AudioProvider` constructs a warm pad from 2 detuned oscillators routed through a lowpass filter, LFO-modulated cutoff, and reverb.
6. **Click-to-start pattern** -- Audio context starts on first user click (browser autoplay policy).
7. **Graceful cleanup** -- Engine stops and context closes on unmount.

## Running

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000 and click anywhere to start audio.
