# Dashboard with Audio — Chord Example

A React dashboard that uses Chord for **data sonification**, **visualizer backgrounds**, and **audio-reactive CSS**. When metrics change, you hear it. When audio plays, the UI responds.

## Patterns Demonstrated

### Data Sonification

Metric cards play musical notes when values change significantly. Higher pitch = value went up, lower pitch = value went down. Notes come from a pentatonic scale so they always sound pleasant, even when multiple metrics change simultaneously.

```tsx
// From MetricCard.tsx — sonify a value change
const delta = newValue - prevValue;
const freq = delta > 0 ? 523.25 : 261.63; // C5 for up, C4 for down
engine.playNote(freq, 0.3, 0.15);
```

### Visualizer Backgrounds

The header contains a live waveform (oscilloscope) drawn on a canvas. The chart area has a spectrum analyzer rendered as a subtle background layer behind the data. Both use Chord's `createWaveform` and `createSpectrum` visualizer functions with `getAnalysisFrame` for per-frame data extraction.

```tsx
// Create a visualizer, then update it each frame with analysis data
const viz = createWaveform(canvas, { color: '#7c3aed', lineWidth: 2 });
function animate() {
  const frame = getAnalysisFrame(engine);
  viz.update(frame);
  requestAnimationFrame(animate);
}
```

### Audio-Reactive CSS

`bindAudioToCSS` injects CSS custom properties (`--chord-rms`, `--chord-bass`, `--chord-beat`, etc.) onto an element every frame. Any CSS rule can reference these to create audio-reactive animations without JavaScript in the render path.

```css
.metric-card {
  /* Glow intensity follows RMS level */
  box-shadow: 0 0 calc(var(--chord-rms, 0) * 40px) rgba(124, 58, 237, 0.4);
  /* Border color shifts with bass energy */
  border-color: hsl(calc(260 + var(--chord-bass, 0) * 40), 60%, 50%);
}
```

## Audio Patch

The example builds a generative ambient patch:

- **Oscillator** (triangle wave, 110 Hz) provides the tone
- **Filter** (lowpass, cutoff 800 Hz, resonance 4) shapes the timbre
- **LFO** (0.15 Hz sine) modulates the filter cutoff for slow movement
- **Reverb** (large room, 40% wet) adds space

The patch plays continuously while the dashboard is active, creating an ambient sonic layer that the visualizers and CSS properties react to.

## Running

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 and click "Start Audio" to activate the engine.
