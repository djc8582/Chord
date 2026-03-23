/**
 * Shared types for all Chord visualizers.
 */

export interface AudioAnalysisFrame {
  waveform: Float32Array;
  spectrum: Float32Array;
  rms: number;
  peak: number;
  rmsDB: number;
  sub: number;       // 20-60Hz energy (0-1)
  bass: number;      // 60-250Hz
  lowMid: number;    // 250-500Hz
  mid: number;       // 500-2kHz
  highMid: number;   // 2-4kHz
  presence: number;  // 4-6kHz
  brilliance: number; // 6-20kHz
  spectralCentroid: number; // Hz
  isBeat: boolean;
  beatStrength: number;
  smoothRms: number;
  attackEnvelope: number;
}

export interface VisualizerTheme {
  background: string;
  primary: string;
  secondary: string;
  palette: string[];
  glow: boolean;
  lineWidth: number;
  opacity: number;
}

export const THEMES: Record<string, VisualizerTheme> = {
  neon: {
    background: '#0a0a0a',
    primary: '#00ff88',
    secondary: '#ff00ff',
    palette: ['#00ff88', '#00ccff', '#ff00ff', '#ffff00'],
    glow: true,
    lineWidth: 2,
    opacity: 0.9,
  },
  minimal: {
    background: '#ffffff',
    primary: '#000000',
    secondary: '#cccccc',
    palette: ['#000', '#333', '#666', '#999'],
    glow: false,
    lineWidth: 1.5,
    opacity: 1,
  },
  sunset: {
    background: '#1a0a2e',
    primary: '#ff6b35',
    secondary: '#ff1493',
    palette: ['#ff6b35', '#ff1493', '#7b2ff7', '#00d4ff'],
    glow: true,
    lineWidth: 2,
    opacity: 0.9,
  },
  arctic: {
    background: '#0a1628',
    primary: '#88ccff',
    secondary: '#ffffff',
    palette: ['#88ccff', '#aaddff', '#fff', '#cceeff'],
    glow: true,
    lineWidth: 1.5,
    opacity: 0.85,
  },
  fire: {
    background: '#0a0000',
    primary: '#ff4400',
    secondary: '#ffcc00',
    palette: ['#ff4400', '#ff6600', '#ff9900', '#ffcc00'],
    glow: true,
    lineWidth: 2.5,
    opacity: 0.9,
  },
  chord: {
    background: '#0a0a0a',
    primary: '#c8ff00',
    secondary: '#7c3aed',
    palette: ['#c8ff00', '#7c3aed', '#ff6b6b', '#ffd700'],
    glow: true,
    lineWidth: 2,
    opacity: 0.9,
  },
};

export function getTheme(name: string): VisualizerTheme {
  return THEMES[name] ?? THEMES.chord;
}
