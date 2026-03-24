import type { GenreProfile } from './types.js';

export const GENRE_DATABASE: Record<string, GenreProfile> = {
  ambient: { name: 'ambient', tempoRange: [0, 90], defaultTempo: 70, swing: 0, humanization: 0, defaultScale: 'minor', reverbSize: 0.8, reverbMix: 0.4, drumStyle: 'none', bassStyle: 'sub', harmonyStyle: 'ambient', layers: ['pad', 'texture'] },
  jazz: { name: 'jazz', tempoRange: [80, 240], defaultTempo: 120, swing: 0.55, humanization: 10, defaultScale: 'dorian', reverbSize: 0.4, reverbMix: 0.15, drumStyle: 'acoustic', bassStyle: 'walking', harmonyStyle: 'jazz', layers: ['keys', 'bass', 'drums'] },
  lofi: { name: 'lofi', tempoRange: [70, 95], defaultTempo: 82, swing: 0.55, humanization: 8, defaultScale: 'dorian', reverbSize: 0.35, reverbMix: 0.15, drumStyle: 'electronic', bassStyle: 'root', harmonyStyle: 'jazz', layers: ['keys', 'bass', 'drums'] },
  electronic: { name: 'electronic', tempoRange: [120, 140], defaultTempo: 128, swing: 0, humanization: 0, defaultScale: 'minor', reverbSize: 0.3, reverbMix: 0.15, drumStyle: 'electronic', bassStyle: 'synth', harmonyStyle: 'triads', layers: ['pad', 'bass', 'drums'] },
  cinematic: { name: 'cinematic', tempoRange: [60, 130], defaultTempo: 90, swing: 0, humanization: 3, defaultScale: 'minor', reverbSize: 0.7, reverbMix: 0.3, drumStyle: 'none', bassStyle: 'sub', harmonyStyle: 'sevenths', layers: ['pad', 'bass'] },
  techno: { name: 'techno', tempoRange: [125, 150], defaultTempo: 130, swing: 0, humanization: 0, defaultScale: 'minor', reverbSize: 0.2, reverbMix: 0.1, drumStyle: 'electronic', bassStyle: 'synth', harmonyStyle: 'none', layers: ['bass', 'drums'] },
  synthwave: { name: 'synthwave', tempoRange: [100, 120], defaultTempo: 108, swing: 0, humanization: 2, defaultScale: 'minor', reverbSize: 0.5, reverbMix: 0.2, drumStyle: 'electronic', bassStyle: 'synth', harmonyStyle: 'triads', layers: ['pad', 'bass', 'drums'] },
  dnb: { name: 'dnb', tempoRange: [160, 180], defaultTempo: 174, swing: 0, humanization: 3, defaultScale: 'minor', reverbSize: 0.25, reverbMix: 0.12, drumStyle: 'electronic', bassStyle: 'synth', harmonyStyle: 'none', layers: ['bass', 'drums', 'pad'] },
  trap: { name: 'trap', tempoRange: [130, 160], defaultTempo: 140, swing: 0.1, humanization: 2, defaultScale: 'minor', reverbSize: 0.3, reverbMix: 0.1, drumStyle: 'electronic', bassStyle: 'sub', harmonyStyle: 'triads', layers: ['bass', 'drums'] },
  meditation: { name: 'meditation', tempoRange: [0, 60], defaultTempo: 50, swing: 0, humanization: 0, defaultScale: 'pentatonic', reverbSize: 0.9, reverbMix: 0.5, drumStyle: 'none', bassStyle: 'sub', harmonyStyle: 'ambient', layers: ['pad', 'texture', 'bells'] },
  classical: { name: 'classical', tempoRange: [60, 160], defaultTempo: 100, swing: 0, humanization: 5, defaultScale: 'major', reverbSize: 0.6, reverbMix: 0.25, drumStyle: 'none', bassStyle: 'root', harmonyStyle: 'sevenths', layers: ['pad', 'bass'] },
  drone: { name: 'drone', tempoRange: [0, 40], defaultTempo: 30, swing: 0, humanization: 0, defaultScale: 'minor', reverbSize: 0.95, reverbMix: 0.6, drumStyle: 'none', bassStyle: 'sub', harmonyStyle: 'ambient', layers: ['pad', 'texture'] },
};

/** Genre keyword detection map */
export const GENRE_KEYWORDS: Record<string, string[]> = {
  ambient: ['ambient', 'atmospheric', 'soundscape', 'ethereal', 'background'],
  jazz: ['jazz', 'fusion', 'bebop', 'swing', 'trio', 'quartet', 'comping'],
  lofi: ['lo-fi', 'lofi', 'lo fi', 'chillhop', 'study beats', 'chill beats'],
  electronic: ['electronic', 'edm', 'synth', 'house'],
  cinematic: ['cinematic', 'film', 'score', 'epic', 'trailer', 'dramatic'],
  techno: ['techno', 'industrial', 'minimal techno'],
  synthwave: ['synthwave', 'retro', '80s', 'retrowave', 'outrun'],
  dnb: ['drum and bass', 'dnb', 'd&b', 'jungle', 'breakbeat'],
  trap: ['trap', '808', 'drill'],
  meditation: ['meditation', 'zen', 'mindful', 'breathing', 'sleep', 'relax'],
  classical: ['classical', 'orchestral', 'chamber'],
  drone: ['drone', 'dark ambient'],
};

/** Mood keyword map - parameter adjustments */
export const MOOD_KEYWORDS: Record<string, { brightness: number; energy: number; tension: number }> = {
  happy: { brightness: 0.7, energy: 0.6, tension: 0 },
  sad: { brightness: 0.3, energy: 0.3, tension: 0.2 },
  dark: { brightness: 0.2, energy: 0.4, tension: 0.4 },
  bright: { brightness: 0.8, energy: 0.5, tension: 0 },
  tense: { brightness: 0.4, energy: 0.7, tension: 0.8 },
  chill: { brightness: 0.5, energy: 0.3, tension: 0 },
  epic: { brightness: 0.6, energy: 0.9, tension: 0.5 },
  dreamy: { brightness: 0.6, energy: 0.2, tension: 0 },
  aggressive: { brightness: 0.5, energy: 0.9, tension: 0.7 },
  mysterious: { brightness: 0.3, energy: 0.3, tension: 0.5 },
  warm: { brightness: 0.45, energy: 0.4, tension: 0 },
  minimal: { brightness: 0.5, energy: 0.2, tension: 0.1 },
  playful: { brightness: 0.7, energy: 0.6, tension: 0 },
  melancholy: { brightness: 0.3, energy: 0.25, tension: 0.15 },
};

/** Instrument keyword detection */
export const INSTRUMENT_KEYWORDS: Record<string, string> = {
  piano: 'keys', rhodes: 'keys', keys: 'keys', keyboard: 'keys', ep: 'keys',
  bass: 'bass', sub: 'bass', 'sub-bass': 'bass', 'sub bass': 'bass',
  drums: 'drums', beat: 'drums', percussion: 'drums', rhythm: 'drums', kit: 'drums',
  pad: 'pad', synth: 'pad',
  rain: 'rain', thunder: 'thunder', wind: 'wind', ocean: 'ocean', water: 'ocean',
  birds: 'birds', bird: 'birds', nature: 'nature',
  bells: 'bells', bell: 'bells', chime: 'bells',
  strings: 'strings', violin: 'strings', cello: 'strings',
  noise: 'texture', texture: 'texture', crackle: 'texture', vinyl: 'texture',
};
