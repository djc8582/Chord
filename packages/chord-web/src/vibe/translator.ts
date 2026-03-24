import type { PatchRecipe, LayerRecipe, EffectChainRecipe } from './types.js';
import { GENRE_DATABASE, GENRE_KEYWORDS, MOOD_KEYWORDS, INSTRUMENT_KEYWORDS } from './genres.js';
import type { GenreProfile } from './types.js';

export class VibeTranslator {
  static translate(description: string): PatchRecipe {
    const desc = description.toLowerCase();

    const genre = this.detectGenre(desc);
    const mood = this.detectMood(desc);
    const instruments = this.detectInstruments(desc, genre);
    const tempo = this.detectTempo(desc) ?? genre?.defaultTempo ?? 100;
    const key = this.detectKey(desc) ?? 'C';
    const scale = this.detectScale(desc) ?? genre?.defaultScale ?? 'minor';

    return {
      tempo, key, scale,
      layers: this.buildLayers(instruments, genre, mood),
      effects: this.buildEffects(genre, mood),
    };
  }

  // --- Detection methods ---

  private static detectGenre(desc: string): GenreProfile | null {
    for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
      if (keywords.some(k => desc.includes(k))) return GENRE_DATABASE[genre] ?? null;
    }
    return null;
  }

  private static detectMood(desc: string): { brightness: number; energy: number; tension: number } | null {
    for (const [mood, params] of Object.entries(MOOD_KEYWORDS)) {
      if (desc.includes(mood)) return params;
    }
    return null;
  }

  private static detectInstruments(desc: string, genre: GenreProfile | null): string[] {
    const found: Set<string> = new Set();
    for (const [keyword, instrument] of Object.entries(INSTRUMENT_KEYWORDS)) {
      if (desc.includes(keyword)) found.add(instrument);
    }
    if (found.size === 0 && genre) return [...genre.layers];
    if (found.size === 0) return ['pad', 'bass'];
    return [...found];
  }

  private static detectTempo(desc: string): number | null {
    // Look for "N BPM" or "at N"
    const bpmMatch = desc.match(/(\d{2,3})\s*bpm/);
    if (bpmMatch) return parseInt(bpmMatch[1]);
    // Tempo words
    if (desc.includes('fast') || desc.includes('upbeat')) return 130;
    if (desc.includes('slow') || desc.includes('gentle')) return 70;
    return null;
  }

  private static detectKey(desc: string): string | null {
    const keys = ['C#', 'Db', 'D#', 'Eb', 'F#', 'Gb', 'G#', 'Ab', 'A#', 'Bb', 'C', 'D', 'E', 'F', 'G', 'A', 'B'];
    for (const k of keys) {
      // Look for key mentions like "in Eb" or "Eb dorian" or "key of C"
      if (desc.includes(` ${k.toLowerCase()} `) || desc.includes(`key of ${k.toLowerCase()}`) || desc.includes(`in ${k.toLowerCase()}`)) return k;
    }
    return null;
  }

  private static detectScale(desc: string): string | null {
    const scales: Record<string, string[]> = {
      major: ['major', 'happy', 'bright', 'uplifting'],
      minor: ['minor', 'sad', 'dark', 'melancholy'],
      dorian: ['dorian', 'jazz', 'fusion'],
      pentatonic: ['pentatonic'],
      blues: ['blues', 'bluesy'],
      lydian: ['lydian', 'dreamy', 'ethereal'],
    };
    for (const [scale, kws] of Object.entries(scales)) {
      if (kws.some(k => desc.includes(k))) return scale;
    }
    return null;
  }

  // --- Layer building ---

  private static buildLayers(instruments: string[], genre: GenreProfile | null, mood: { brightness: number; energy: number; tension: number } | null): LayerRecipe[] {
    const layers: LayerRecipe[] = [];
    const energy = mood?.energy ?? 0.5;
    const brightness = mood?.brightness ?? 0.5;

    for (const inst of instruments) {
      switch (inst) {
        case 'keys':
          layers.push(this.buildKeysLayer(genre, brightness));
          break;
        case 'bass':
          layers.push(this.buildBassLayer(genre, energy));
          break;
        case 'drums':
          layers.push(this.buildDrumsLayer(genre, energy));
          break;
        case 'pad':
          layers.push(this.buildPadLayer(brightness));
          break;
        case 'texture':
          layers.push(this.buildTextureLayer());
          break;
        case 'rain':
          layers.push(this.buildRainLayer());
          break;
        case 'bells':
          layers.push(this.buildBellsLayer());
          break;
        default:
          // For unknown instruments, create a simple pad
          layers.push(this.buildPadLayer(brightness));
      }
    }
    return layers;
  }

  private static buildKeysLayer(genre: GenreProfile | null, brightness: number): LayerRecipe {
    const cutoff = 2000 + brightness * 4000;
    return {
      name: 'keys',
      nodes: [
        { type: 'filter', params: { cutoff, resonance: 0.15 } },
        { type: 'chorus', params: { rate: 0.8, depth: 0.25, mix: 0.15 } },
        { type: 'gain', params: { gain: 0.3 } },
      ],
      sequencing: {
        type: 'harmonic',
        style: genre?.harmonyStyle ?? 'triads',
        density: 0.4,
      },
    };
  }

  private static buildBassLayer(genre: GenreProfile | null, energy: number): LayerRecipe {
    return {
      name: 'bass',
      nodes: [
        { type: 'oscillator', params: { waveform: 1, gain: 0.2 } },
        { type: 'oscillator', params: { waveform: 0, gain: 0.15 } },
        { type: 'filter', params: { cutoff: 600 + energy * 600, resonance: 0.25 } },
        { type: 'distortion', params: { drive: 0.1, mix: 0.2 } },
        { type: 'compressor', params: { threshold: -10, ratio: 4, attack: 0.005, release: 0.1 } },
        { type: 'gain', params: { gain: 0.35 } },
      ],
      sequencing: {
        type: genre?.bassStyle === 'walking' ? 'walking' : 'root',
        energy,
      },
    };
  }

  private static buildDrumsLayer(genre: GenreProfile | null, energy: number): LayerRecipe {
    const snap = 0.15 + energy * 0.25;
    return {
      name: 'drums',
      nodes: [
        { type: 'kick_drum', params: { pitch_start: 140, pitch_end: 45, decay: 0.25 + energy * 0.1, drive: 0.08 + energy * 0.1 } },
        { type: 'snare_drum', params: { tone: 180 + energy * 40, snap, decay: 0.15 + energy * 0.1 } },
        { type: 'hi_hat', params: { tone: 4000 + energy * 4000, decay: 0.06 + energy * 0.08, openness: energy * 0.3 } },
        { type: 'compressor', params: { threshold: -12, ratio: 3, attack: 0.005, release: 0.08 } },
        { type: 'gain', params: { gain: 0.3 + energy * 0.1 } },
      ],
      sequencing: {
        type: 'rhythm_engine',
        swing: genre?.swing ?? 0,
        humanize: genre?.humanization ?? 5,
        mutateEvery: 4,
        style: genre?.drumStyle ?? 'electronic',
      },
    };
  }

  private static buildPadLayer(brightness: number): LayerRecipe {
    const cutoff = 1000 + brightness * 3000;
    return {
      name: 'pad',
      nodes: [
        { type: 'oscillator', params: { waveform: 1, gain: 0.08, detune: -7 } },
        { type: 'oscillator', params: { waveform: 1, gain: 0.08, detune: 7 } },
        { type: 'filter', params: { cutoff, resonance: 0.2 } },
        { type: 'chorus', params: { rate: 0.4, depth: 0.3, mix: 0.2 } },
        { type: 'gain', params: { gain: 0.25 } },
      ],
      modulation: [
        { sourceType: 'lfo', targetNodeIndex: 2, targetParam: 'cutoff', rate: 0.1, depth: 800 },
      ],
    };
  }

  private static buildTextureLayer(): LayerRecipe {
    return {
      name: 'texture',
      nodes: [
        { type: 'noise', params: { gain: 0.02 } },
        { type: 'filter', params: { cutoff: 3000, resonance: 0.3, mode: 2 } },
        { type: 'gain', params: { gain: 0.12 } },
      ],
      modulation: [
        { sourceType: 'lfo', targetNodeIndex: 1, targetParam: 'cutoff', rate: 0.05, depth: 2000 },
      ],
    };
  }

  private static buildRainLayer(): LayerRecipe {
    return {
      name: 'rain',
      nodes: [
        { type: 'noise', params: { gain: 0.06 } },
        { type: 'filter', params: { cutoff: 4000, resonance: 0.2 } },
        { type: 'gain', params: { gain: 0.15 } },
      ],
      modulation: [
        { sourceType: 'lfo', targetNodeIndex: 1, targetParam: 'cutoff', rate: 0.03, depth: 1500 },
      ],
    };
  }

  private static buildBellsLayer(): LayerRecipe {
    return {
      name: 'bells',
      nodes: [
        { type: 'filter', params: { cutoff: 6000, resonance: 0.3 } },
        { type: 'gain', params: { gain: 0.12 } },
      ],
      sequencing: { type: 'none' },
    };
  }

  // --- Effects ---

  private static buildEffects(genre: GenreProfile | null, mood: { brightness: number; energy: number; tension: number } | null): EffectChainRecipe {
    return {
      reverb: {
        room_size: genre?.reverbSize ?? 0.5,
        damping: 0.5 + (mood?.brightness ?? 0.5) * -0.3, // bright = less damping
        mix: genre?.reverbMix ?? 0.2,
      },
      delay: { time: 0.28, feedback: 0.15, mix: 0.08 },
      compressor: { threshold: -14, ratio: 2.5, attack: 0.02, release: 0.15 },
    };
  }
}
