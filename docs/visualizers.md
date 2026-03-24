# Chord Visualizers

18 audio-reactive visualizers for building audio-driven UI, from simple waveforms to 3D terrain.

## Architecture

All visualizers follow the same pattern:

```typescript
import { createXxx } from '@chord/web';

// Attach to a canvas element
const viz = createXxx(canvas, engine, options);

// Control lifecycle
viz.start();     // begin animation loop (requestAnimationFrame)
viz.stop();      // pause animation
viz.destroy();   // cleanup and release resources
```

Visualizers read analysis data from the Chord engine every frame. They render to a `<canvas>` element using Canvas 2D or WebGL.

---

## Wave 1 — Core Visualizers

### Waveform (Oscilloscope)

```typescript
import { createWaveform } from '@chord/web';

const viz = createWaveform(canvas, engine, {
  color: '#00ff88',          // line color
  lineWidth: 2,              // line thickness
  backgroundColor: 'transparent',
  mirror: false,             // mirror top/bottom
});
```

Displays the time-domain audio signal as a continuous line. Classic oscilloscope look.

### Spectrum (Frequency Analyzer)

```typescript
import { createSpectrum } from '@chord/web';

const viz = createSpectrum(canvas, engine, {
  mode: 'bars',              // 'bars' | 'line' | 'fill'
  barCount: 64,              // number of frequency bars
  color: '#00ff88',
  minDecibels: -90,          // dB floor
  maxDecibels: -10,          // dB ceiling
});
```

Displays the frequency spectrum. Bars mode shows discrete bars, line mode draws a smooth curve, fill mode fills under the curve.

### Level Meter

```typescript
import { createLevelMeter } from '@chord/web';

const viz = createLevelMeter(canvas, engine, {
  orientation: 'vertical',   // 'horizontal' | 'vertical'
  peakHold: 1500,            // ms to hold peak indicator
  color: '#00ff88',
});
```

Traditional RMS/peak meter with peak hold indicator.

### Particles

```typescript
import { createParticles } from '@chord/web';

const viz = createParticles(canvas, engine, {
  count: 500,                // number of particles
  reactTo: 'beat',           // 'rms' | 'beat' | 'spectrum'
  color: '#00ff88',
  maxSize: 4,                // max particle radius
  speed: 1,                  // particle velocity multiplier
});
```

Audio-reactive particle system. Particles respond to RMS (size/brightness), beats (bursts), or spectrum (frequency-mapped colors/positions).

---

## Wave 2 — Musical Visualizers

### Piano Roll

```typescript
import { createPianoRoll } from '@chord/web';

const viz = createPianoRoll(canvas, engine, {
  noteRange: [36, 96],       // MIDI note range (C2-C7)
  scrollSpeed: 2,            // pixels per frame
  noteColor: '#00ff88',
  gridColor: '#333',
});
```

Live piano roll showing active notes scrolling in real-time.

### Chord Display

```typescript
import { createChordDisplay } from '@chord/web';

const viz = createChordDisplay(canvas, engine, {
  showNoteName: true,
  showChordName: true,
  fontSize: 24,
});
```

Detects and displays the current chord being played.

### Drum Grid

```typescript
import { createDrumGrid } from '@chord/web';

const viz = createDrumGrid(canvas, engine, {
  rows: 4,                   // drum channels
  columns: 16,               // steps
  cellColor: '#00ff88',
  activeColor: '#ff3366',
});
```

Step sequencer grid showing active beats.

### Melody Contour

```typescript
import { createMelodyContour } from '@chord/web';

const viz = createMelodyContour(canvas, engine, {
  pitchRange: [100, 2000],   // Hz range
  trailLength: 200,          // pixels of history
  color: '#00ff88',
});
```

Tracks and displays pitch over time as a flowing contour line.

---

## Wave 3 — Creative Visualizers

### Geometry

```typescript
import { createGeometry } from '@chord/web';

const viz = createGeometry(canvas, engine, {
  shape: 'sphere',           // 'sphere' | 'cube' | 'torus'
  wireframe: true,
  color: '#00ff88',
  reactTo: 'spectrum',       // 'rms' | 'spectrum'
});
```

Audio-reactive 3D wireframe shape. Vertices deform based on audio data.

### Kaleidoscope

```typescript
import { createKaleidoscope } from '@chord/web';

const viz = createKaleidoscope(canvas, engine, {
  segments: 8,               // mirror segments
  rotation: true,            // auto-rotate
  color: '#00ff88',
});
```

Kaleidoscopic mirror effect driven by audio spectrum.

---

## Wave 4 — UI Primitives

### Audio Background

```typescript
import { createAudioBackground } from '@chord/web';

const viz = createAudioBackground(canvas, engine, {
  type: 'gradient',          // 'gradient' | 'solid' | 'noise'
  intensity: 0.3,            // 0-1, how reactive
  colors: ['#001122', '#003366', '#006699'],
});
```

Full-page audio-reactive gradient background. Subtle enough for behind content.

### Audio Loader

```typescript
import { createAudioLoader } from '@chord/web';

const viz = createAudioLoader(canvas, engine, {
  size: 60,                  // diameter
  color: '#00ff88',
  ringCount: 3,
});
```

Loading spinner that pulses with audio. Great for "loading" states with audio feedback.

---

## Wave 5 — Advanced Visualizers

### Spectrogram

```typescript
import { createSpectrogram } from '@chord/web';

const viz = createSpectrogram(canvas, engine, {
  colormap: 'magma',         // 'magma' | 'viridis' | 'plasma' | 'inferno'
  scrollSpeed: 2,
  minDecibels: -90,
  maxDecibels: -10,
});
```

Scrolling time-frequency heatmap. Time on x-axis, frequency on y-axis, color = intensity.

### Stereo Field

```typescript
import { createStereoField } from '@chord/web';

const viz = createStereoField(canvas, engine, {
  mode: 'lissajous',         // 'lissajous' | 'polar'
  color: '#00ff88',
  decay: 0.95,               // trail persistence
});
```

Goniometer / vectorscope for analyzing stereo image.

### Terrain

```typescript
import { createTerrain } from '@chord/web';

const viz = createTerrain(canvas, engine, {
  wireframe: true,
  color: '#00ff88',
  rows: 40,
  perspective: 300,
});
```

3D landscape where height = spectrum data. Creates a scrolling mountain range driven by audio.

### Network

```typescript
import { createNetwork } from '@chord/web';

const viz = createNetwork(canvas, engine, {
  nodeCount: 50,
  connectionDistance: 100,
  color: '#00ff88',
  reactTo: 'spectrum',
});
```

Constellation-style network graph. Nodes move based on audio, connections appear when nodes are close.

---

## Wave 6 — Composition Visualizers

### Node Graph

```typescript
import { createNodeGraph } from '@chord/web';

const viz = createNodeGraph(canvas, engine, {
  showLabels: true,
  showSignalFlow: true,      // animate signal along connections
  nodeColor: '#00ff88',
  connectionColor: '#666',
});
```

Visualizes the actual patch topology — shows nodes and connections with signal flow animation.

### Sequencer Grid

```typescript
import { createSequencerGrid } from '@chord/web';

const viz = createSequencerGrid(canvas, engine, {
  steps: 16,
  tracks: 8,
  cellSize: 24,
  activeColor: '#00ff88',
  playheadColor: '#ff3366',
});
```

Universal sequencer display that works with any sequencer node type.

---

## CSS Integration

### bindAudioToCSS

The simplest way to make any UI audio-reactive without canvas:

```typescript
import { bindAudioToCSS } from '@chord/web';

bindAudioToCSS(engine, document.documentElement);
```

Sets CSS custom properties updated every animation frame:

| Property | Range | Description |
|----------|-------|-------------|
| `--chord-rms` | 0-1 | Overall loudness |
| `--chord-bass` | 0-1 | Bass energy (20-250Hz) |
| `--chord-mid` | 0-1 | Mid energy (250Hz-4kHz) |
| `--chord-treble` | 0-1 | Treble energy (4kHz+) |
| `--chord-beat` | 0 or 1 | Beat detection |
| `--chord-hue` | 0-360 | Hue from spectral centroid |

**Example CSS:**

```css
.hero-text {
  text-shadow: 0 0 calc(var(--chord-rms) * 20px) rgba(0, 255, 136, var(--chord-rms));
}

.background {
  background: hsl(calc(var(--chord-hue)), 50%, 10%);
}

.pulse-ring {
  transform: scale(calc(1 + var(--chord-bass) * 0.5));
  opacity: var(--chord-rms);
}
```

### useAudioReactive (React Hook)

```typescript
import { useAudioReactive } from '@chord/web';

function MyComponent({ engine }: { engine: Chord }) {
  const { rms, bass, mid, treble, beat } = useAudioReactive(engine);

  return (
    <div style={{
      transform: `scale(${1 + rms * 0.3})`,
      opacity: 0.5 + bass * 0.5,
    }}>
      {beat && <span className="flash">BEAT</span>}
    </div>
  );
}
```

---

## Analysis

### getAnalysisFrame

Get a complete analysis snapshot:

```typescript
import { getAnalysisFrame } from '@chord/web';

const frame = getAnalysisFrame(engine);

frame.rms;              // 0-1 loudness
frame.peak;             // 0-1 peak level
frame.bass;             // 0-1 bass energy
frame.lowMid;           // 0-1 low-mid energy
frame.mid;              // 0-1 mid energy
frame.highMid;          // 0-1 high-mid energy
frame.treble;           // 0-1 treble energy
frame.spectralCentroid; // Hz — perceived brightness
frame.waveform;         // Float32Array — time domain
frame.spectrum;         // Float32Array — frequency domain (dB)
```

---

## Themes

```typescript
import { THEMES, getTheme } from '@chord/web';

const theme = getTheme('neon');
// Use theme.primary, theme.secondary, theme.background, theme.accent
// as colors in visualizer options
```

**Built-in themes:** `default`, `neon`, `warm`, `cool`, `dark`, `light`, `retro`, `minimal`

---

## Performance Tips

1. **Match canvas size to display size.** Don't create a 4K canvas for a 200px element.
2. **Use `viz.stop()` when off-screen.** No point animating invisible visualizers.
3. **Limit particle count.** 200-500 is usually plenty. 1000+ may drop frames.
4. **One engine, many visualizers.** All visualizers share the same analysis data from one Chord engine instance.
5. **Prefer CSS variables** (`bindAudioToCSS`) over canvas visualizers for simple reactive effects. CSS transitions are hardware-accelerated.
