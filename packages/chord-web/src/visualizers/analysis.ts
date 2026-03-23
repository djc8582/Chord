/**
 * Audio analysis pipeline — extracts analysis data from the Chord engine.
 * Runs once per animation frame, shared by all visualizers.
 */
import type { Chord } from '../Chord.js';
import type { AudioAnalysisFrame } from './types.js';

let _smoothRms = 0;
let _attackEnv = 0;
let _prevSpectralFlux = 0;
let _beatThreshold = 0.15;

/**
 * Extract a complete analysis frame from the Chord engine.
 * Call this once per requestAnimationFrame, pass the result to all visualizers.
 */
export function getAnalysisFrame(chord: Chord): AudioAnalysisFrame {
  const waveform = new Float32Array(chord.getWaveformData?.() ?? []);
  const spectrum = new Float32Array(chord.getFrequencyData?.() ?? []);
  const rms = chord.getRMS?.() ?? 0;
  const peak = Math.max(...(waveform.length > 0 ? Array.from(waveform).map(Math.abs) : [0]));

  // Smoothed RMS (100ms smoothing)
  _smoothRms += (rms - _smoothRms) * 0.15;

  // Attack envelope (fast attack, slow release)
  if (rms > _attackEnv) {
    _attackEnv = rms; // instant attack
  } else {
    _attackEnv *= 0.95; // slow release
  }

  // Band energy extraction from spectrum
  const binCount = spectrum.length || 1;
  const nyquist = 24000; // approximate
  const hzPerBin = nyquist / binCount;

  function bandEnergy(lowHz: number, highHz: number): number {
    const lowBin = Math.floor(lowHz / hzPerBin);
    const highBin = Math.min(Math.ceil(highHz / hzPerBin), binCount - 1);
    let sum = 0;
    let count = 0;
    for (let i = lowBin; i <= highBin; i++) {
      const val = spectrum[i] ?? 0;
      // spectrum might be in dB, normalize
      sum += val < 0 ? Math.pow(10, val / 20) : val;
      count++;
    }
    return count > 0 ? Math.min(sum / count * 3, 1) : 0;
  }

  const sub = bandEnergy(20, 60);
  const bass = bandEnergy(60, 250);
  const lowMid = bandEnergy(250, 500);
  const mid = bandEnergy(500, 2000);
  const highMid = bandEnergy(2000, 4000);
  const presence = bandEnergy(4000, 6000);
  const brilliance = bandEnergy(6000, 20000);

  // Spectral centroid
  let weightedSum = 0, totalEnergy = 0;
  for (let i = 0; i < binCount; i++) {
    const mag = spectrum[i] < 0 ? Math.pow(10, spectrum[i] / 20) : (spectrum[i] ?? 0);
    weightedSum += i * hzPerBin * mag;
    totalEnergy += mag;
  }
  const spectralCentroid = totalEnergy > 0.001 ? weightedSum / totalEnergy : 1000;

  // Beat detection (simple onset detection via spectral flux in bass band)
  const currentBassEnergy = bass + sub;
  const flux = Math.max(0, currentBassEnergy - _prevSpectralFlux);
  _prevSpectralFlux = currentBassEnergy * 0.8 + _prevSpectralFlux * 0.2;
  const isBeat = flux > _beatThreshold && rms > 0.05;
  // Adaptive threshold
  _beatThreshold = _beatThreshold * 0.99 + flux * 0.01;

  const rmsDB = rms > 0.0001 ? 20 * Math.log10(rms) : -96;

  return {
    waveform,
    spectrum,
    rms,
    peak,
    rmsDB,
    sub, bass, lowMid, mid, highMid, presence, brilliance,
    spectralCentroid,
    isBeat,
    beatStrength: flux / Math.max(_beatThreshold, 0.01),
    smoothRms: _smoothRms,
    attackEnvelope: _attackEnv,
  };
}
