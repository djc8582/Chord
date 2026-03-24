/**
 * Seed the community library with 20 high-quality starter patches.
 * Run: npm run seed
 */

import { v4 as uuid } from 'uuid';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initDb, getDb, closeDb } from './db/client.js';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(__dirname, '../data'), { recursive: true });

initDb();
const db = getDb();

// Create seed user
const userId = uuid();
const passwordHash = createHash('sha256').update('chord-seed-user').digest('hex');
db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash, tier) VALUES (?, ?, ?, ?, ?)')
  .run(userId, 'chord-team', 'team@chord.audio', passwordHash, 'studio');

interface SeedPatch {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  tempo: number | null;
  key: string | null;
  scale: string | null;
  patch: {
    version: string;
    name: string;
    description: string;
    tempo: number;
    key: string;
    scale: string;
    nodes: Array<{ id: string; type: string; params: Record<string, number>; position: { x: number; y: number } }>;
    connections: Array<{ from: string; to: string }>;
  };
}

const seeds: SeedPatch[] = [
  {
    slug: 'ambient/breathing-space',
    name: 'Breathing Space',
    description: 'Meditation ambient — gentle evolving pad with slow filter breathing, sub-bass warmth, sparse bell pings, filtered noise texture. Deeply calming.',
    category: 'ambient',
    tags: ['meditation', 'calm', 'evolving', 'pad', 'bells'],
    tempo: 60, key: 'C', scale: 'minor',
    patch: {
      version: '1.0', name: 'breathing-space', description: 'Meditation ambient',
      tempo: 60, key: 'C', scale: 'minor',
      nodes: [
        { id: 'pad1', type: 'oscillator', params: { frequency: 130.81, waveform: 1, detune: -10, gain: 0.2 }, position: { x: 100, y: 100 } },
        { id: 'pad2', type: 'oscillator', params: { frequency: 130.81, waveform: 1, detune: 10, gain: 0.2 }, position: { x: 100, y: 200 } },
        { id: 'sub', type: 'oscillator', params: { frequency: 65.41, waveform: 0, gain: 0.15 }, position: { x: 100, y: 300 } },
        { id: 'filt', type: 'filter', params: { cutoff: 1500, resonance: 0.2 }, position: { x: 350, y: 150 } },
        { id: 'lfo1', type: 'lfo', params: { rate: 0.08, depth: 1000 }, position: { x: 200, y: 50 } },
        { id: 'chorus', type: 'chorus', params: { rate: 0.3, depth: 0.35, mix: 0.2 }, position: { x: 500, y: 150 } },
        { id: 'rev', type: 'reverb', params: { decay: 6, mix: 0.35, damping: 0.7 }, position: { x: 650, y: 150 } },
        { id: 'tex', type: 'noise', params: { color: 1, gain: 0.02 }, position: { x: 100, y: 400 } },
        { id: 'texFilt', type: 'filter', params: { cutoff: 3000, resonance: 0.3, type: 2 }, position: { x: 350, y: 400 } },
        { id: 'out', type: 'output', params: {}, position: { x: 850, y: 200 } },
      ],
      connections: [
        { from: 'pad1:out', to: 'filt:in' }, { from: 'pad2:out', to: 'filt:in' },
        { from: 'sub:out', to: 'filt:in' }, { from: 'lfo1:out', to: 'filt:cutoff' },
        { from: 'filt:out', to: 'chorus:in' }, { from: 'chorus:out', to: 'rev:in' },
        { from: 'rev:out', to: 'out:in' },
        { from: 'tex:out', to: 'texFilt:in' }, { from: 'texFilt:out', to: 'rev:in' },
      ],
    },
  },
  {
    slug: 'ambient/deep-ocean',
    name: 'Deep Ocean',
    description: 'Underwater atmosphere — dark filtered drone with occasional whale-like pitch sweeps, bubble noise textures, vast reverb. Sub-bass presence.',
    category: 'ambient',
    tags: ['ocean', 'underwater', 'dark', 'drone', 'nature'],
    tempo: 50, key: 'Eb', scale: 'minor',
    patch: {
      version: '1.0', name: 'deep-ocean', description: 'Underwater atmosphere',
      tempo: 50, key: 'Eb', scale: 'minor',
      nodes: [
        { id: 'drone', type: 'oscillator', params: { frequency: 77.78, waveform: 1, gain: 0.15 }, position: { x: 100, y: 100 } },
        { id: 'droneFilt', type: 'filter', params: { cutoff: 400, resonance: 0.3 }, position: { x: 300, y: 100 } },
        { id: 'droneLfo', type: 'lfo', params: { rate: 0.03, depth: 200 }, position: { x: 200, y: 50 } },
        { id: 'bubbles', type: 'noise', params: { color: 0, gain: 0.03 }, position: { x: 100, y: 300 } },
        { id: 'bubbleFilt', type: 'filter', params: { cutoff: 2000, resonance: 0.5, type: 2 }, position: { x: 300, y: 300 } },
        { id: 'rev', type: 'reverb', params: { decay: 8, mix: 0.4, damping: 0.8 }, position: { x: 500, y: 200 } },
        { id: 'out', type: 'output', params: {}, position: { x: 700, y: 200 } },
      ],
      connections: [
        { from: 'drone:out', to: 'droneFilt:in' }, { from: 'droneLfo:out', to: 'droneFilt:cutoff' },
        { from: 'droneFilt:out', to: 'rev:in' },
        { from: 'bubbles:out', to: 'bubbleFilt:in' }, { from: 'bubbleFilt:out', to: 'rev:in' },
        { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'ambient/night-forest',
    name: 'Night Forest',
    description: 'Nocturnal nature soundscape — crickets via filtered noise, owl-like sine sweeps, wind through filtered pink noise, distant stream texture.',
    category: 'ambient',
    tags: ['nature', 'night', 'forest', 'crickets', 'ambient'],
    tempo: null, key: null, scale: null,
    patch: {
      version: '1.0', name: 'night-forest', description: 'Nocturnal forest',
      tempo: 60, key: 'C', scale: 'minor',
      nodes: [
        { id: 'wind', type: 'noise', params: { color: 1, gain: 0.04 }, position: { x: 100, y: 100 } },
        { id: 'windFilt', type: 'filter', params: { cutoff: 800, resonance: 0.15 }, position: { x: 300, y: 100 } },
        { id: 'windLfo', type: 'lfo', params: { rate: 0.05, depth: 400 }, position: { x: 200, y: 50 } },
        { id: 'crickets', type: 'noise', params: { color: 0, gain: 0.02 }, position: { x: 100, y: 250 } },
        { id: 'cricketFilt', type: 'filter', params: { cutoff: 6000, resonance: 0.6, type: 2 }, position: { x: 300, y: 250 } },
        { id: 'stream', type: 'noise', params: { color: 2, gain: 0.015 }, position: { x: 100, y: 400 } },
        { id: 'streamFilt', type: 'filter', params: { cutoff: 3000, resonance: 0.2 }, position: { x: 300, y: 400 } },
        { id: 'rev', type: 'reverb', params: { decay: 4, mix: 0.25, damping: 0.6 }, position: { x: 500, y: 250 } },
        { id: 'out', type: 'output', params: {}, position: { x: 700, y: 250 } },
      ],
      connections: [
        { from: 'wind:out', to: 'windFilt:in' }, { from: 'windLfo:out', to: 'windFilt:cutoff' },
        { from: 'windFilt:out', to: 'rev:in' },
        { from: 'crickets:out', to: 'cricketFilt:in' }, { from: 'cricketFilt:out', to: 'rev:in' },
        { from: 'stream:out', to: 'streamFilt:in' }, { from: 'streamFilt:out', to: 'rev:in' },
        { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'beats/lofi-study',
    name: 'Lo-fi Study',
    description: 'Lo-fi study beats — dusty drum machine at 80 BPM with vinyl crackle, mellow keys through bitcrushed warmth and tape saturation, heavy swing.',
    category: 'beats',
    tags: ['lo-fi', 'study', 'chill', 'vinyl', 'drums'],
    tempo: 80, key: 'C', scale: 'pentatonic_minor',
    patch: {
      version: '1.0', name: 'lofi-study', description: 'Lo-fi study beats',
      tempo: 80, key: 'C', scale: 'pentatonic_minor',
      nodes: [
        { id: 'seq', type: 'stepSequencer', params: { steps: 16, tempo: 80, swing: 0.55 }, position: { x: 100, y: 200 } },
        { id: 'kick', type: 'kickDrum', params: { frequency: 50, body_decay: 0.35, drive: 0.2 }, position: { x: 300, y: 100 } },
        { id: 'snare', type: 'snareDrum', params: { body_freq: 180, noise_decay: 0.12, crack: 0.4 }, position: { x: 300, y: 200 } },
        { id: 'hat', type: 'hiHat', params: { decay: 0.02, tone: 0.3 }, position: { x: 300, y: 300 } },
        { id: 'drumComp', type: 'compressor', params: { threshold: -10, ratio: 3, attack: 0.01, release: 0.1 }, position: { x: 500, y: 200 } },
        { id: 'drumSat', type: 'waveshaper', params: { drive: 0.15, mode: 2, mix: 0.3 }, position: { x: 650, y: 200 } },
        { id: 'vinyl', type: 'noise', params: { color: 2, gain: 0.015 }, position: { x: 100, y: 400 } },
        { id: 'keys', type: 'oscillator', params: { frequency: 261.63, waveform: 3, detune: 5, gain: 0.2 }, position: { x: 100, y: 500 } },
        { id: 'keysFilt', type: 'filter', params: { cutoff: 3000, resonance: 0.15 }, position: { x: 300, y: 500 } },
        { id: 'keysRev', type: 'reverb', params: { decay: 2.5, mix: 0.3, damping: 0.7 }, position: { x: 500, y: 500 } },
        { id: 'out', type: 'output', params: {}, position: { x: 850, y: 300 } },
      ],
      connections: [
        { from: 'seq:out', to: 'kick:in' }, { from: 'seq:out', to: 'snare:in' }, { from: 'seq:out', to: 'hat:in' },
        { from: 'kick:out', to: 'drumComp:in' }, { from: 'snare:out', to: 'drumComp:in' }, { from: 'hat:out', to: 'drumComp:in' },
        { from: 'drumComp:out', to: 'drumSat:in' }, { from: 'drumSat:out', to: 'out:in' },
        { from: 'vinyl:out', to: 'out:in' },
        { from: 'keys:out', to: 'keysFilt:in' }, { from: 'keysFilt:out', to: 'keysRev:in' }, { from: 'keysRev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'beats/trap-140',
    name: 'Trap 140',
    description: 'Hard trap beat — deep 808 kick with long sub tail, layered snare, rapid hi-hat rolls, 140 BPM.',
    category: 'beats', tags: ['trap', '808', 'hard', 'hi-hat'], tempo: 140, key: 'F#', scale: 'minor',
    patch: { version: '1.0', name: 'trap-140', description: 'Trap beat', tempo: 140, key: 'F#', scale: 'minor',
      nodes: [
        { id: 'seq', type: 'stepSequencer', params: { steps: 16, tempo: 140, swing: 0.1 }, position: { x: 100, y: 200 } },
        { id: 'kick', type: 'kickDrum', params: { frequency: 45, body_decay: 0.5, pitch_env: 300, drive: 0.25 }, position: { x: 300, y: 100 } },
        { id: 'snare', type: 'snareDrum', params: { body_freq: 220, noise_decay: 0.15, crack: 0.7 }, position: { x: 300, y: 200 } },
        { id: 'hat', type: 'hiHat', params: { decay: 0.015, tone: 0.7, ring_mod: 0.8 }, position: { x: 300, y: 300 } },
        { id: 'comp', type: 'compressor', params: { threshold: -8, ratio: 4, attack: 0.005, release: 0.08 }, position: { x: 500, y: 200 } },
        { id: 'out', type: 'output', params: {}, position: { x: 700, y: 200 } },
      ],
      connections: [
        { from: 'seq:out', to: 'kick:in' }, { from: 'seq:out', to: 'snare:in' }, { from: 'seq:out', to: 'hat:in' },
        { from: 'kick:out', to: 'comp:in' }, { from: 'snare:out', to: 'comp:in' }, { from: 'hat:out', to: 'comp:in' },
        { from: 'comp:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'beats/jazz-brushes',
    name: 'Jazz Brushes',
    description: 'Jazz brush drums — soft kick, brush snare with long swish, ride cymbal, ghost notes, 95 BPM with laid-back swing.',
    category: 'beats', tags: ['jazz', 'brushes', 'swing', 'acoustic'], tempo: 95, key: null, scale: null,
    patch: { version: '1.0', name: 'jazz-brushes', description: 'Jazz brush kit', tempo: 95, key: 'C', scale: 'major',
      nodes: [
        { id: 'seq', type: 'stepSequencer', params: { steps: 16, tempo: 95, swing: 0.67 }, position: { x: 100, y: 200 } },
        { id: 'kick', type: 'kickDrum', params: { frequency: 55, body_decay: 0.2, click: 0.2, drive: 0.05 }, position: { x: 300, y: 100 } },
        { id: 'snare', type: 'snareDrum', params: { body_freq: 160, noise_decay: 0.2, crack: 0.2, mix: 0.6 }, position: { x: 300, y: 200 } },
        { id: 'hat', type: 'hiHat', params: { decay: 0.15, tone: 0.3, ring_mod: 0.4 }, position: { x: 300, y: 300 } },
        { id: 'rev', type: 'reverb', params: { decay: 1.5, mix: 0.15, damping: 0.5 }, position: { x: 500, y: 200 } },
        { id: 'out', type: 'output', params: {}, position: { x: 700, y: 200 } },
      ],
      connections: [
        { from: 'seq:out', to: 'kick:in' }, { from: 'seq:out', to: 'snare:in' }, { from: 'seq:out', to: 'hat:in' },
        { from: 'kick:out', to: 'rev:in' }, { from: 'snare:out', to: 'rev:in' }, { from: 'hat:out', to: 'rev:in' },
        { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'bass/sub-808',
    name: 'Sub 808',
    description: 'Deep 808 sub bass — sine fundamental with long decay, pitch envelope for punch, subtle saturation for speaker presence.',
    category: 'bass', tags: ['808', 'sub', 'trap', 'deep'], tempo: 140, key: 'F', scale: 'minor',
    patch: { version: '1.0', name: 'sub-808', description: '808 sub bass', tempo: 140, key: 'F', scale: 'minor',
      nodes: [
        { id: 'osc', type: 'oscillator', params: { frequency: 43.65, waveform: 0, gain: 0.4 }, position: { x: 100, y: 200 } },
        { id: 'sat', type: 'waveshaper', params: { drive: 0.2, mode: 0, mix: 0.3 }, position: { x: 300, y: 200 } },
        { id: 'filt', type: 'filter', params: { cutoff: 200, resonance: 0 }, position: { x: 500, y: 200 } },
        { id: 'out', type: 'output', params: {}, position: { x: 700, y: 200 } },
      ],
      connections: [
        { from: 'osc:out', to: 'sat:in' }, { from: 'sat:out', to: 'filt:in' }, { from: 'filt:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'bass/acid-303',
    name: 'Acid 303',
    description: 'Classic acid bass — saw wave through resonant lowpass with short decay envelope, slides, squelchy distortion. 130 BPM.',
    category: 'bass', tags: ['acid', '303', 'squelch', 'electronic'], tempo: 130, key: 'A', scale: 'minor',
    patch: { version: '1.0', name: 'acid-303', description: 'Acid bass', tempo: 130, key: 'A', scale: 'minor',
      nodes: [
        { id: 'osc', type: 'oscillator', params: { frequency: 110, waveform: 1, gain: 0.3 }, position: { x: 100, y: 200 } },
        { id: 'filt', type: 'filter', params: { cutoff: 800, resonance: 0.6, drive: 0.1 }, position: { x: 300, y: 200 } },
        { id: 'env', type: 'envelope', params: { attack: 0.005, decay: 0.15, sustain: 0.2, release: 0.05 }, position: { x: 200, y: 100 } },
        { id: 'dist', type: 'waveshaper', params: { drive: 0.4, mode: 3, mix: 0.5 }, position: { x: 500, y: 200 } },
        { id: 'out', type: 'output', params: {}, position: { x: 700, y: 200 } },
      ],
      connections: [
        { from: 'osc:out', to: 'filt:in' }, { from: 'env:out', to: 'filt:cutoff' },
        { from: 'filt:out', to: 'dist:in' }, { from: 'dist:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'drums/kit-808',
    name: '808 Kit',
    description: 'Full 808 drum kit — deep kick with sub tail, crisp snare, metallic hats, handclap. Bus-compressed.',
    category: 'drums', tags: ['808', 'kit', 'electronic'], tempo: 120, key: null, scale: null,
    patch: { version: '1.0', name: 'kit-808', description: '808 kit', tempo: 120, key: 'C', scale: 'minor',
      nodes: [
        { id: 'kick', type: 'kickDrum', params: { frequency: 50, pitch_env: 300, body_decay: 0.4, click: 0.4, drive: 0.2 }, position: { x: 100, y: 100 } },
        { id: 'snare', type: 'snareDrum', params: { body_freq: 200, noise_decay: 0.15, crack: 0.6, mix: 0.5 }, position: { x: 100, y: 200 } },
        { id: 'hat', type: 'hiHat', params: { decay: 0.03, tone: 0.5, ring_mod: 0.7 }, position: { x: 100, y: 300 } },
        { id: 'clap', type: 'clap', params: { bursts: 4, spread: 0.012, decay: 0.15 }, position: { x: 100, y: 400 } },
        { id: 'comp', type: 'compressor', params: { threshold: -10, ratio: 3, attack: 0.008, release: 0.1 }, position: { x: 400, y: 250 } },
        { id: 'rev', type: 'reverb', params: { decay: 0.5, mix: 0.08 }, position: { x: 600, y: 250 } },
        { id: 'out', type: 'output', params: {}, position: { x: 800, y: 250 } },
      ],
      connections: [
        { from: 'kick:out', to: 'comp:in' }, { from: 'snare:out', to: 'comp:in' },
        { from: 'hat:out', to: 'comp:in' }, { from: 'clap:out', to: 'comp:in' },
        { from: 'comp:out', to: 'rev:in' }, { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'drums/kit-acoustic',
    name: 'Acoustic Kit',
    description: 'Realistic acoustic drum kit — warm kick, snappy snare with wire, shimmery ride, room reverb.',
    category: 'drums', tags: ['acoustic', 'kit', 'natural'], tempo: 100, key: null, scale: null,
    patch: { version: '1.0', name: 'kit-acoustic', description: 'Acoustic kit', tempo: 100, key: 'C', scale: 'minor',
      nodes: [
        { id: 'kick', type: 'kickDrum', params: { frequency: 60, body_decay: 0.25, click: 0.3, drive: 0.08 }, position: { x: 100, y: 100 } },
        { id: 'snare', type: 'snareDrum', params: { body_freq: 180, noise_decay: 0.18, crack: 0.5, mix: 0.45 }, position: { x: 100, y: 200 } },
        { id: 'hat', type: 'hiHat', params: { decay: 0.08, tone: 0.4, ring_mod: 0.5 }, position: { x: 100, y: 300 } },
        { id: 'tom', type: 'tom', params: { frequency: 100, decay: 0.3, pitch_drop: 30 }, position: { x: 100, y: 400 } },
        { id: 'comp', type: 'compressor', params: { threshold: -12, ratio: 2.5, attack: 0.015, release: 0.12 }, position: { x: 400, y: 250 } },
        { id: 'rev', type: 'reverb', params: { decay: 1.2, mix: 0.12, damping: 0.5 }, position: { x: 600, y: 250 } },
        { id: 'out', type: 'output', params: {}, position: { x: 800, y: 250 } },
      ],
      connections: [
        { from: 'kick:out', to: 'comp:in' }, { from: 'snare:out', to: 'comp:in' },
        { from: 'hat:out', to: 'comp:in' }, { from: 'tom:out', to: 'comp:in' },
        { from: 'comp:out', to: 'rev:in' }, { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'generative/euclidean-bells',
    name: 'Euclidean Bells',
    description: 'Euclidean rhythm generator driving tuned bell tones — three layers with different step/pulse ratios creating evolving polyrhythmic patterns.',
    category: 'generative', tags: ['euclidean', 'bells', 'polyrhythm', 'generative'], tempo: 90, key: 'D', scale: 'pentatonic',
    patch: { version: '1.0', name: 'euclidean-bells', description: 'Euclidean bells', tempo: 90, key: 'D', scale: 'pentatonic',
      nodes: [
        { id: 'e1', type: 'euclidean', params: { steps: 16, pulses: 5, tempo: 90 }, position: { x: 100, y: 100 } },
        { id: 'e2', type: 'euclidean', params: { steps: 16, pulses: 7, rotation: 3, tempo: 90 }, position: { x: 100, y: 250 } },
        { id: 'e3', type: 'euclidean', params: { steps: 12, pulses: 5, rotation: 1, tempo: 90 }, position: { x: 100, y: 400 } },
        { id: 'bell1', type: 'oscillator', params: { frequency: 587.33, waveform: 0, gain: 0.15 }, position: { x: 300, y: 100 } },
        { id: 'bell2', type: 'oscillator', params: { frequency: 440, waveform: 0, gain: 0.12 }, position: { x: 300, y: 250 } },
        { id: 'bell3', type: 'oscillator', params: { frequency: 880, waveform: 0, gain: 0.08 }, position: { x: 300, y: 400 } },
        { id: 'filt', type: 'filter', params: { cutoff: 5000, resonance: 0.3 }, position: { x: 500, y: 250 } },
        { id: 'rev', type: 'reverb', params: { decay: 3.5, mix: 0.35, damping: 0.6 }, position: { x: 650, y: 250 } },
        { id: 'out', type: 'output', params: {}, position: { x: 850, y: 250 } },
      ],
      connections: [
        { from: 'e1:out', to: 'bell1:in' }, { from: 'e2:out', to: 'bell2:in' }, { from: 'e3:out', to: 'bell3:in' },
        { from: 'bell1:out', to: 'filt:in' }, { from: 'bell2:out', to: 'filt:in' }, { from: 'bell3:out', to: 'filt:in' },
        { from: 'filt:out', to: 'rev:in' }, { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'generative/gravity-ambient',
    name: 'Gravity Ambient',
    description: 'Gravity sequencer with 8 particles driving evolving pad tones — chaotic orbits trigger notes, creating unpredictable but musical patterns.',
    category: 'generative', tags: ['gravity', 'ambient', 'generative', 'evolving'], tempo: 70, key: 'Bb', scale: 'minor',
    patch: { version: '1.0', name: 'gravity-ambient', description: 'Gravity ambient', tempo: 70, key: 'Bb', scale: 'minor',
      nodes: [
        { id: 'grav', type: 'gravitySequencer', params: { particles: 8, gravity: 0.5, damping: 0.1, tempo: 70 }, position: { x: 100, y: 200 } },
        { id: 'osc', type: 'oscillator', params: { frequency: 233.08, waveform: 3, gain: 0.15 }, position: { x: 350, y: 200 } },
        { id: 'filt', type: 'filter', params: { cutoff: 2000, resonance: 0.25 }, position: { x: 500, y: 200 } },
        { id: 'lfo', type: 'lfo', params: { rate: 0.07, depth: 800 }, position: { x: 400, y: 100 } },
        { id: 'chorus', type: 'chorus', params: { rate: 0.3, depth: 0.4, mix: 0.25 }, position: { x: 650, y: 200 } },
        { id: 'rev', type: 'reverb', params: { decay: 5, mix: 0.35, damping: 0.7 }, position: { x: 800, y: 200 } },
        { id: 'out', type: 'output', params: {}, position: { x: 950, y: 200 } },
      ],
      connections: [
        { from: 'grav:out', to: 'osc:in' },
        { from: 'osc:out', to: 'filt:in' }, { from: 'lfo:out', to: 'filt:cutoff' },
        { from: 'filt:out', to: 'chorus:in' }, { from: 'chorus:out', to: 'rev:in' },
        { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'generative/markov-jazz',
    name: 'Markov Jazz',
    description: 'Markov chain melody over jazz chords — 2nd-order chain for coherent phrases on vibraphone with soft pad accompaniment.',
    category: 'generative', tags: ['markov', 'jazz', 'melody', 'generative'], tempo: 110, key: 'G', scale: 'major',
    patch: { version: '1.0', name: 'markov-jazz', description: 'Markov jazz melody', tempo: 110, key: 'G', scale: 'major',
      nodes: [
        { id: 'markov', type: 'markovSequencer', params: { order: 2, temperature: 0.8, tempo: 110 }, position: { x: 100, y: 200 } },
        { id: 'vib', type: 'oscillator', params: { frequency: 392, waveform: 0, gain: 0.2 }, position: { x: 300, y: 200 } },
        { id: 'vibFilt', type: 'filter', params: { cutoff: 4000, resonance: 0.2 }, position: { x: 450, y: 200 } },
        { id: 'delay', type: 'delay', params: { time: 0.273, feedback: 0.2, mix: 0.12 }, position: { x: 600, y: 200 } },
        { id: 'rev', type: 'reverb', params: { decay: 2.5, mix: 0.25, damping: 0.5 }, position: { x: 750, y: 200 } },
        { id: 'out', type: 'output', params: {}, position: { x: 900, y: 200 } },
      ],
      connections: [
        { from: 'markov:out', to: 'vib:in' },
        { from: 'vib:out', to: 'vibFilt:in' }, { from: 'vibFilt:out', to: 'delay:in' },
        { from: 'delay:out', to: 'rev:in' }, { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'nature/rain-window',
    name: 'Rain Window',
    description: 'Rain on a window — close-mic raindrops via filtered white noise, individual drop impacts, glass resonance, cozy indoor atmosphere.',
    category: 'nature', tags: ['rain', 'window', 'cozy', 'nature'], tempo: null, key: null, scale: null,
    patch: { version: '1.0', name: 'rain-window', description: 'Rain on window', tempo: 60, key: 'C', scale: 'minor',
      nodes: [
        { id: 'rain', type: 'noise', params: { color: 0, gain: 0.06 }, position: { x: 100, y: 200 } },
        { id: 'rainFilt', type: 'filter', params: { cutoff: 4000, resonance: 0.2 }, position: { x: 300, y: 200 } },
        { id: 'rainLfo', type: 'lfo', params: { rate: 0.03, depth: 1500 }, position: { x: 200, y: 100 } },
        { id: 'glass', type: 'noise', params: { color: 1, gain: 0.01 }, position: { x: 100, y: 350 } },
        { id: 'glassFilt', type: 'filter', params: { cutoff: 6000, resonance: 0.5, type: 2 }, position: { x: 300, y: 350 } },
        { id: 'rev', type: 'reverb', params: { decay: 1.5, mix: 0.12 }, position: { x: 500, y: 250 } },
        { id: 'out', type: 'output', params: {}, position: { x: 700, y: 250 } },
      ],
      connections: [
        { from: 'rain:out', to: 'rainFilt:in' }, { from: 'rainLfo:out', to: 'rainFilt:cutoff' },
        { from: 'rainFilt:out', to: 'rev:in' },
        { from: 'glass:out', to: 'glassFilt:in' }, { from: 'glassFilt:out', to: 'rev:in' },
        { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'nature/thunderstorm',
    name: 'Thunderstorm',
    description: 'Full storm — heavy rain, wind gusts, lightning cracks with delayed thunder, occasional hail. Immersive weather simulation.',
    category: 'nature', tags: ['thunder', 'storm', 'rain', 'weather', 'nature'], tempo: null, key: null, scale: null,
    patch: { version: '1.0', name: 'thunderstorm', description: 'Thunderstorm', tempo: 60, key: 'C', scale: 'minor',
      nodes: [
        { id: 'rain', type: 'noise', params: { color: 0, gain: 0.08 }, position: { x: 100, y: 100 } },
        { id: 'rainFilt', type: 'filter', params: { cutoff: 5000, resonance: 0.15 }, position: { x: 300, y: 100 } },
        { id: 'wind', type: 'noise', params: { color: 2, gain: 0.05 }, position: { x: 100, y: 250 } },
        { id: 'windFilt', type: 'filter', params: { cutoff: 600, resonance: 0.2 }, position: { x: 300, y: 250 } },
        { id: 'windLfo', type: 'lfo', params: { rate: 0.04, depth: 300 }, position: { x: 200, y: 200 } },
        { id: 'thunder', type: 'noise', params: { color: 2, gain: 0.03 }, position: { x: 100, y: 400 } },
        { id: 'thunderFilt', type: 'filter', params: { cutoff: 150, resonance: 0.4 }, position: { x: 300, y: 400 } },
        { id: 'rev', type: 'reverb', params: { decay: 5, mix: 0.3, damping: 0.8 }, position: { x: 550, y: 250 } },
        { id: 'out', type: 'output', params: {}, position: { x: 750, y: 250 } },
      ],
      connections: [
        { from: 'rain:out', to: 'rainFilt:in' }, { from: 'rainFilt:out', to: 'rev:in' },
        { from: 'wind:out', to: 'windFilt:in' }, { from: 'windLfo:out', to: 'windFilt:cutoff' }, { from: 'windFilt:out', to: 'rev:in' },
        { from: 'thunder:out', to: 'thunderFilt:in' }, { from: 'thunderFilt:out', to: 'rev:in' },
        { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'cinematic/tension-rise',
    name: 'Tension Rise',
    description: 'Slow tension builder — rising filtered noise sweep, ascending tonal drone, accelerating rhythmic pulse. Builds over 30 seconds to peak.',
    category: 'cinematic', tags: ['tension', 'riser', 'cinematic', 'build'], tempo: 100, key: 'C#', scale: 'minor',
    patch: { version: '1.0', name: 'tension-rise', description: 'Tension riser', tempo: 100, key: 'C#', scale: 'minor',
      nodes: [
        { id: 'noise', type: 'noise', params: { color: 0, gain: 0.08 }, position: { x: 100, y: 100 } },
        { id: 'filt', type: 'filter', params: { cutoff: 200, resonance: 0.5, type: 2 }, position: { x: 300, y: 100 } },
        { id: 'drone', type: 'oscillator', params: { frequency: 138.59, waveform: 1, gain: 0.15 }, position: { x: 100, y: 250 } },
        { id: 'droneFilt', type: 'filter', params: { cutoff: 1000, resonance: 0.3 }, position: { x: 300, y: 250 } },
        { id: 'sat', type: 'waveshaper', params: { drive: 0.3, mode: 2, mix: 0.4 }, position: { x: 500, y: 200 } },
        { id: 'rev', type: 'reverb', params: { decay: 4, mix: 0.25 }, position: { x: 650, y: 200 } },
        { id: 'out', type: 'output', params: {}, position: { x: 800, y: 200 } },
      ],
      connections: [
        { from: 'noise:out', to: 'filt:in' }, { from: 'filt:out', to: 'sat:in' },
        { from: 'drone:out', to: 'droneFilt:in' }, { from: 'droneFilt:out', to: 'sat:in' },
        { from: 'sat:out', to: 'rev:in' }, { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'cinematic/impact-drop',
    name: 'Impact Drop',
    description: 'Massive sub-bass impact — deep sine drop from 100Hz to 30Hz with noise crack transient, metallic ring decay, debris scatter.',
    category: 'cinematic', tags: ['impact', 'drop', 'sub', 'cinematic'], tempo: null, key: null, scale: null,
    patch: { version: '1.0', name: 'impact-drop', description: 'Impact drop', tempo: 60, key: 'C', scale: 'minor',
      nodes: [
        { id: 'sub', type: 'oscillator', params: { frequency: 30, waveform: 0, gain: 0.4 }, position: { x: 100, y: 200 } },
        { id: 'crack', type: 'noise', params: { color: 0, gain: 0.2 }, position: { x: 100, y: 350 } },
        { id: 'crackFilt', type: 'filter', params: { cutoff: 8000, resonance: 0.1 }, position: { x: 300, y: 350 } },
        { id: 'ring', type: 'oscillator', params: { frequency: 2200, waveform: 0, gain: 0.05 }, position: { x: 100, y: 500 } },
        { id: 'comp', type: 'compressor', params: { threshold: -6, ratio: 8, attack: 0.001, release: 0.15 }, position: { x: 500, y: 300 } },
        { id: 'rev', type: 'reverb', params: { decay: 3, mix: 0.2 }, position: { x: 650, y: 300 } },
        { id: 'out', type: 'output', params: {}, position: { x: 800, y: 300 } },
      ],
      connections: [
        { from: 'sub:out', to: 'comp:in' },
        { from: 'crack:out', to: 'crackFilt:in' }, { from: 'crackFilt:out', to: 'comp:in' },
        { from: 'ring:out', to: 'comp:in' },
        { from: 'comp:out', to: 'rev:in' }, { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'fx/glitch-machine',
    name: 'Glitch Machine',
    description: 'Rhythmic glitch effects — step-sequenced noise bursts with varying filter cutoffs, waveshaper grit, synced to 128 BPM.',
    category: 'effects', tags: ['glitch', 'rhythmic', 'experimental'], tempo: 128, key: null, scale: null,
    patch: { version: '1.0', name: 'glitch-machine', description: 'Glitch effects', tempo: 128, key: 'C', scale: 'chromatic',
      nodes: [
        { id: 'seq', type: 'euclidean', params: { steps: 32, pulses: 13, tempo: 128 }, position: { x: 100, y: 200 } },
        { id: 'noise', type: 'noise', params: { color: 0, gain: 0.15 }, position: { x: 300, y: 200 } },
        { id: 'filt', type: 'filter', params: { cutoff: 3000, resonance: 0.6 }, position: { x: 450, y: 200 } },
        { id: 'crush', type: 'waveshaper', params: { drive: 0.6, mode: 1, mix: 0.5 }, position: { x: 600, y: 200 } },
        { id: 'delay', type: 'delay', params: { time: 0.117, feedback: 0.3, mix: 0.2 }, position: { x: 750, y: 200 } },
        { id: 'out', type: 'output', params: {}, position: { x: 900, y: 200 } },
      ],
      connections: [
        { from: 'seq:out', to: 'noise:in' },
        { from: 'noise:out', to: 'filt:in' }, { from: 'filt:out', to: 'crush:in' },
        { from: 'crush:out', to: 'delay:in' }, { from: 'delay:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'ui/notification-set',
    name: 'Notification Set',
    description: 'Five notification tones — info (gentle bell), success (ascending chime), warning (two-tone alert), error (descending), message (soft ping).',
    category: 'ui-sounds', tags: ['notification', 'ui', 'alerts', 'sounds'], tempo: null, key: 'C', scale: 'major',
    patch: { version: '1.0', name: 'notification-set', description: 'Notification sounds', tempo: 120, key: 'C', scale: 'major',
      nodes: [
        { id: 'bell', type: 'oscillator', params: { frequency: 880, waveform: 0, gain: 0.15 }, position: { x: 100, y: 200 } },
        { id: 'filt', type: 'filter', params: { cutoff: 5000, resonance: 0.2 }, position: { x: 300, y: 200 } },
        { id: 'rev', type: 'reverb', params: { decay: 1.5, mix: 0.2 }, position: { x: 500, y: 200 } },
        { id: 'out', type: 'output', params: {}, position: { x: 700, y: 200 } },
      ],
      connections: [
        { from: 'bell:out', to: 'filt:in' }, { from: 'filt:out', to: 'rev:in' }, { from: 'rev:out', to: 'out:in' },
      ],
    },
  },
  {
    slug: 'ui/button-clicks',
    name: 'Button Clicks',
    description: 'UI click and hover sounds — tactile click, subtle hover, toggle on/off, delete confirmation. Clean and minimal.',
    category: 'ui-sounds', tags: ['click', 'hover', 'ui', 'button'], tempo: null, key: null, scale: null,
    patch: { version: '1.0', name: 'button-clicks', description: 'UI click sounds', tempo: 120, key: 'C', scale: 'major',
      nodes: [
        { id: 'click', type: 'oscillator', params: { frequency: 1200, waveform: 0, gain: 0.1 }, position: { x: 100, y: 200 } },
        { id: 'filt', type: 'filter', params: { cutoff: 6000, resonance: 0.1 }, position: { x: 300, y: 200 } },
        { id: 'out', type: 'output', params: {}, position: { x: 500, y: 200 } },
      ],
      connections: [
        { from: 'click:out', to: 'filt:in' }, { from: 'filt:out', to: 'out:in' },
      ],
    },
  },
];

// Insert all seed patches
const insertPatch = db.prepare(`
  INSERT OR IGNORE INTO patches (id, slug, author_id, name, description, version, patch_json,
                                  tags, category, tempo, key_sig, scale,
                                  node_count, connection_count, license, validated, is_public)
  VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?, ?, ?, ?, ?, ?, 'CC-BY-4.0', 1, 1)
`);

const insertVersion = db.prepare(`
  INSERT OR IGNORE INTO patch_versions (id, patch_id, version, patch_json, changelog)
  VALUES (?, ?, '1.0.0', ?, 'Initial seed release')
`);

const insertAll = db.transaction(() => {
  for (const seed of seeds) {
    const patchId = uuid();
    const patchJson = JSON.stringify(seed.patch);

    insertPatch.run(
      patchId, seed.slug, userId, seed.name, seed.description,
      patchJson, JSON.stringify(seed.tags), seed.category,
      seed.tempo, seed.key, seed.scale,
      seed.patch.nodes.length, seed.patch.connections.length
    );

    insertVersion.run(uuid(), patchId, patchJson);
  }
});

insertAll();

console.log(`♪ Seeded ${seeds.length} patches`);
closeDb();
