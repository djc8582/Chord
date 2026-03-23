/**
 * React hooks and CSS primitives for audio-reactive UI.
 */
import type { Chord } from '../Chord.js';
import type { AudioAnalysisFrame } from './types.js';
import { getAnalysisFrame } from './analysis.js';

/**
 * Returns audio analysis data that updates at 60fps.
 * Use in React components to make any element audio-reactive.
 *
 * Usage:
 *   const audio = useAudioReactive(chord);
 *   return <div style={{ transform: `scale(${1 + audio.rms * 0.3})` }} />;
 */
export function useAudioReactive(chord: Chord | null): AudioAnalysisFrame & {
  /** HSL color string mapped from spectral centroid */
  hslColor: string;
  /** CSS-ready scale value (1.0 + rms * factor) */
  scale: number;
} {
  // In a real React implementation, this would use useState + useEffect + requestAnimationFrame.
  // For the SDK package (no React dependency), we provide the data extraction function.
  // React wrappers import and use this in their hooks.

  const frame = chord ? getAnalysisFrame(chord) : defaultFrame();
  const hue = Math.floor((frame.spectralCentroid / 8000) * 300);

  return {
    ...frame,
    hslColor: `hsl(${hue}, 70%, 55%)`,
    scale: 1 + frame.smoothRms * 0.3,
  };
}

/**
 * Bind audio analysis data to CSS custom properties on an element.
 * Updates at 60fps via requestAnimationFrame.
 *
 * Usage:
 *   bindAudioToCSS(chord, document.documentElement);
 *   // Now use in CSS: transform: scale(calc(1 + var(--chord-rms) * 0.3));
 */
export function bindAudioToCSS(chord: Chord, element: HTMLElement): () => void {
  let rafId: number;

  function update() {
    const frame = getAnalysisFrame(chord);
    const style = element.style;

    style.setProperty('--chord-rms', frame.rms.toFixed(4));
    style.setProperty('--chord-peak', frame.peak.toFixed(4));
    style.setProperty('--chord-bass', frame.bass.toFixed(4));
    style.setProperty('--chord-mid', frame.mid.toFixed(4));
    style.setProperty('--chord-treble', frame.brilliance.toFixed(4));
    style.setProperty('--chord-beat', frame.isBeat ? '1' : '0');
    style.setProperty('--chord-brightness', (frame.spectralCentroid / 8000).toFixed(4));
    style.setProperty('--chord-hue', Math.floor((frame.spectralCentroid / 8000) * 300).toString());
    style.setProperty('--chord-smooth-rms', frame.smoothRms.toFixed(4));
    style.setProperty('--chord-attack', frame.attackEnvelope.toFixed(4));
    style.setProperty('--chord-sub', frame.sub.toFixed(4));
    style.setProperty('--chord-presence', frame.presence.toFixed(4));

    rafId = requestAnimationFrame(update);
  }

  rafId = requestAnimationFrame(update);

  // Return cleanup function
  return () => cancelAnimationFrame(rafId);
}

function defaultFrame(): AudioAnalysisFrame {
  return {
    waveform: new Float32Array(0),
    spectrum: new Float32Array(0),
    rms: 0, peak: 0, rmsDB: -96,
    sub: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, presence: 0, brilliance: 0,
    spectralCentroid: 1000, isBeat: false, beatStrength: 0,
    smoothRms: 0, attackEnvelope: 0,
  };
}
