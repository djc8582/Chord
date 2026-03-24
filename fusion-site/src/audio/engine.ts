/**
 * Jazz Fusion Trio Audio Engine — v2
 *
 * Now uses Chord's generative music systems:
 *   - RhythmEngine for evolving drum patterns with swing + humanization
 *   - HarmonicSequencer for jazz comping with varied voicings
 *   - WalkingBassGenerator for chromatic approach bass lines
 *   - SoloGenerator for melodic phrases during mouse idle
 *
 * Plus the new node types: compressor, distortion, chorus, bitcrusher
 *
 * Three instruments sharing one Chord engine:
 *   1. Rhodes keys — filtered through chorus + tremolo
 *   2. Electric bass — saw+sub through filter + distortion + compressor
 *   3. Drums — kick, snare, ride with bus compression
 */

import { Chord } from '@chord/web';
import { bindAudioToCSS } from '@chord/web';
import { RhythmEngine } from '@chord/web';
import { HarmonicSequencer, type ChordSymbol } from '@chord/web';
import { WalkingBassGenerator } from '@chord/web';
import { SoloGenerator } from '@chord/web';
import {
  midiToFreq,
  PROGRESSION, PROGRESSION_MODULATED,
  getScaleNotes,
  BASE_TEMPO, RUBATO_TEMPO, DORIAN_INTERVALS,
} from './constants.js';

// ─── Types ───

export interface FusionEngine {
  chord: Chord;
  start: () => Promise<void>;
  stop: () => void;
  setScroll: (t: number) => void;
  setMouseX: (x: number) => void;
  setMouseY: (y: number) => void;
  setMouseVelocity: (v: number) => void;
  setMouseIdle: (idle: boolean) => void;
  triggerScrollGlitch: (intensity: number) => void;
  getState: () => EngineState;
  destroy: () => void;
}

export interface EngineState {
  currentChord: string;
  tempo: number;
  scrollPosition: number;
  section: string;
  isGlitching: boolean;
  isSilent: boolean;
  modulated: boolean;
  keysPlaying: number[];
}

interface InternalState {
  scroll: number;
  mouseX: number;
  mouseY: number;
  mouseVelocity: number;
  mouseIdle: boolean;
  tempo: number;
  currentChordName: string;
  modulated: boolean;
  section: string;
  isGlitching: boolean;
  isSilent: boolean;
  keysActive: number[];
  destroyed: boolean;
  keysGainTarget: number;
  bassGainTarget: number;
  drumGainTarget: number;
}

// ─── Convert our progression format to ChordSymbol for the sequencers ───

function makeChordSymbols(modulated: boolean): ChordSymbol[] {
  const prog = modulated ? PROGRESSION_MODULATED : PROGRESSION;
  return prog.map(cv => ({
    name: cv.name,
    root: cv.bassNote + 24, // keys register
    tones: cv.offsets,
  }));
}

function getScale(modulated: boolean): number[] {
  const root = modulated ? 8 : 3; // Ab=8, Eb=3 (pitch class)
  return DORIAN_INTERVALS.map(i => root + i);
}

// ─── Create the engine ───

export function createFusionEngine(): FusionEngine {
  const chord = new Chord();

  const state: InternalState = {
    scroll: 0,
    mouseX: 0.5,
    mouseY: 0.5,
    mouseVelocity: 0,
    mouseIdle: false,
    tempo: RUBATO_TEMPO,
    currentChordName: 'Ebm9',
    modulated: false,
    section: 'intro',
    isGlitching: false,
    isSilent: false,
    keysActive: [],
    destroyed: false,
    keysGainTarget: 0.35,
    bassGainTarget: 0,
    drumGainTarget: 0,
  };

  // ═══════════════════════════════════════════
  // NODE GRAPH — full signal chain with new node types
  // ═══════════════════════════════════════════

  // Master effects chain
  const masterComp = chord.addNode('compressor');
  const masterRev = chord.addNode('reverb');
  const masterDelay = chord.addNode('delay');
  const masterFilter = chord.addNode('filter');
  const masterLimiter = chord.addNode('limiter');
  const masterOut = chord.addNode('output');

  chord.setParameter(masterRev, 'room_size', 0.55);
  chord.setParameter(masterRev, 'damping', 0.55);
  chord.setParameter(masterRev, 'mix', 0.18);

  chord.setParameter(masterDelay, 'time', 0.28);
  chord.setParameter(masterDelay, 'feedback', 0.15);
  chord.setParameter(masterDelay, 'mix', 0.08);

  chord.setParameter(masterComp, 'threshold', -14);
  chord.setParameter(masterComp, 'ratio', 2.5);
  chord.setParameter(masterComp, 'attack', 0.02);
  chord.setParameter(masterComp, 'release', 0.15);

  chord.setParameter(masterFilter, 'cutoff', 18000);
  chord.setParameter(masterFilter, 'resonance', 0);

  chord.setParameter(masterLimiter, 'ceiling', -1);

  // instruments → reverb → delay → comp → filter → limiter → output
  chord.connect(masterRev, 'out', masterDelay, 'in');
  chord.connect(masterDelay, 'out', masterComp, 'in');
  chord.connect(masterComp, 'out', masterFilter, 'in');
  chord.connect(masterFilter, 'out', masterLimiter, 'in');
  chord.connect(masterLimiter, 'out', masterOut, 'in');

  // ═══════════════════════════════════════════
  // RHODES KEYS — with chorus + tremolo
  // ═══════════════════════════════════════════

  const keysTrem = chord.addNode('lfo');
  chord.setParameter(keysTrem, 'rate', 4.5);
  chord.setParameter(keysTrem, 'depth', 0.08);

  const keysFilter = chord.addNode('filter');
  chord.setParameter(keysFilter, 'cutoff', 4000);
  chord.setParameter(keysFilter, 'resonance', 0.1);

  const keysChorus = chord.addNode('chorus');
  chord.setParameter(keysChorus, 'rate', 0.8);
  chord.setParameter(keysChorus, 'depth', 0.25);
  chord.setParameter(keysChorus, 'mix', 0.15);

  const keysGain = chord.addNode('gain');
  chord.setParameter(keysGain, 'gain', 0.35);

  chord.connect(keysFilter, 'out', keysChorus, 'in');
  chord.connect(keysChorus, 'out', keysGain, 'in');
  chord.connect(keysTrem, 'out', keysGain, 'gain');
  chord.connect(keysGain, 'out', masterRev, 'in');

  // ═══════════════════════════════════════════
  // BASS — saw + sub → filter → distortion → compressor
  // ═══════════════════════════════════════════

  const bassOsc = chord.addNode('oscillator');
  const bassSub = chord.addNode('oscillator');
  const bassFilter = chord.addNode('filter');
  const bassDist = chord.addNode('distortion');
  const bassComp = chord.addNode('compressor');
  const bassGain = chord.addNode('gain');

  chord.setParameter(bassOsc, 'waveform', 1); // saw
  chord.setParameter(bassOsc, 'frequency', 82.41);
  chord.setParameter(bassOsc, 'gain', 0.2);
  chord.setParameter(bassSub, 'waveform', 0); // sine sub
  chord.setParameter(bassSub, 'frequency', 41.2);
  chord.setParameter(bassSub, 'gain', 0.15);
  chord.setParameter(bassFilter, 'cutoff', 900);
  chord.setParameter(bassFilter, 'resonance', 0.25);
  chord.setParameter(bassDist, 'drive', 0.12);
  chord.setParameter(bassDist, 'mix', 0.3);
  chord.setParameter(bassComp, 'threshold', -10);
  chord.setParameter(bassComp, 'ratio', 4);
  chord.setParameter(bassComp, 'attack', 0.005);
  chord.setParameter(bassComp, 'release', 0.1);
  chord.setParameter(bassGain, 'gain', 0);

  chord.connect(bassOsc, 'out', bassFilter, 'in');
  chord.connect(bassSub, 'out', bassFilter, 'in');
  chord.connect(bassFilter, 'out', bassDist, 'in');
  chord.connect(bassDist, 'out', bassComp, 'in');
  chord.connect(bassComp, 'out', bassGain, 'in');
  chord.connect(bassGain, 'out', masterRev, 'in');

  // ═══════════════════════════════════════════
  // DRUMS — kick, snare, hat → compressor → gain
  // ═══════════════════════════════════════════

  const kick = chord.addNode('kick_drum');
  const snare = chord.addNode('snare_drum');
  const hat = chord.addNode('hi_hat');
  const drumComp = chord.addNode('compressor');
  const drumGain = chord.addNode('gain');

  chord.setParameter(kick, 'pitch_start', 140);
  chord.setParameter(kick, 'pitch_end', 45);
  chord.setParameter(kick, 'decay', 0.25);
  chord.setParameter(kick, 'drive', 0.1);

  chord.setParameter(snare, 'tone', 180);
  chord.setParameter(snare, 'snap', 0.2);
  chord.setParameter(snare, 'decay', 0.25);

  chord.setParameter(hat, 'tone', 4000);
  chord.setParameter(hat, 'decay', 0.15);
  chord.setParameter(hat, 'openness', 0.3);

  chord.setParameter(drumComp, 'threshold', -12);
  chord.setParameter(drumComp, 'ratio', 3);
  chord.setParameter(drumComp, 'attack', 0.005);
  chord.setParameter(drumComp, 'release', 0.08);

  chord.setParameter(drumGain, 'gain', 0);

  chord.connect(kick, 'out', drumComp, 'in');
  chord.connect(snare, 'out', drumComp, 'in');
  chord.connect(hat, 'out', drumComp, 'in');
  chord.connect(drumComp, 'out', drumGain, 'in');
  chord.connect(drumGain, 'out', masterRev, 'in');

  // ═══════════════════════════════════════════
  // GLITCH — bitcrusher on master for glitch sections
  // ═══════════════════════════════════════════

  const glitchCrush = chord.addNode('bitcrusher');
  chord.setParameter(glitchCrush, 'bits', 16); // clean by default
  chord.setParameter(glitchCrush, 'rate', 1);
  chord.setParameter(glitchCrush, 'mix', 0); // off by default

  // Insert between comp and filter in master chain
  chord.connect(masterComp, 'out', glitchCrush, 'in');
  chord.connect(glitchCrush, 'out', masterFilter, 'in');

  // ═══════════════════════════════════════════
  // GENERATIVE MUSIC SYSTEMS
  // ═══════════════════════════════════════════

  // Rhythm engine — evolving jazz drum patterns
  const rhythmEngine = new RhythmEngine(chord, RUBATO_TEMPO);
  rhythmEngine.swing = 0.55;

  // Ride cymbal pattern — jazz ride (ding-ga-da-ding)
  rhythmEngine.addTrack('ride', {
    nodeId: hat,
    //            1 e & a 2 e & a 3 e & a 4 e & a
    steps:       [0.8,0,0.4,0, 0.6,0,0.3,0, 0.8,0,0.4,0, 0.7,0,0.5,0],
    probability: [1,  0,0.8,0, 0.9,0,0.6,0, 1,  0,0.7,0, 0.9,0,0.8,0],
    velocityVariance: 0.15,
    humanize: 8,
    mutateEvery: 8,
    velocityMap: {
      decay: [0.06, 0.2],
      openness: [0.1, 0.5],
    },
  });

  // Kick — sparse jazz kick
  rhythmEngine.addTrack('kick', {
    nodeId: kick,
    steps:       [0.9,0,0,0, 0,0,0,0, 0.7,0,0,0, 0,0,0.3,0],
    probability: [1,  0,0,0, 0,0,0,0, 0.6,0,0,0, 0,0,0.2,0],
    velocityVariance: 0.12,
    humanize: 5,
    mutateEvery: 4,
    velocityMap: {
      pitch_start: [120, 180],
      drive: [0.05, 0.25],
    },
  });

  // Snare — ghost notes + backbeat hits
  rhythmEngine.addTrack('snare', {
    nodeId: snare,
    steps:       [0, 0.1,0,0.12, 0,0,0,0.08, 0.7,0.1,0,0.15, 0,0,0,0.1],
    probability: [0, 0.3,0,0.2,  0,0,0,0.25, 1,  0.2,0,0.3,  0,0,0,0.15],
    velocityVariance: 0.2,
    humanize: 10,
    mutateEvery: 4,
    velocityMap: {
      snap: [0.05, 0.5],
      tone: [150, 220],
    },
  });

  // Harmonic sequencer — jazz comping
  const harmSeq = new HarmonicSequencer(chord);
  harmSeq.setProgression(makeChordSymbols(false));

  // Walking bass generator
  const bassGen = new WalkingBassGenerator(chord);

  // Solo generator (for mouse idle)
  const soloGen = new SoloGenerator(chord);

  // ═══════════════════════════════════════════
  // COMPING + BASS SCHEDULING LOOP
  // ═══════════════════════════════════════════

  let compTimer: ReturnType<typeof setTimeout> | null = null;
  let barCount = 0;

  function scheduleBar() {
    if (state.destroyed || state.isSilent) {
      compTimer = setTimeout(scheduleBar, 500);
      return;
    }

    const beatMs = 60000 / state.tempo;
    const barMs = beatMs * 4;

    // ─── Keys: generate and play comping for this bar ───
    if (state.keysGainTarget > 0) {
      const density = 0.3 + state.mouseVelocity * 0.3 + (state.section === 'peak' ? 0.2 : 0);
      const tension = state.mouseX;
      const events = harmSeq.generateBar(density, tension);

      state.keysActive = [];
      for (const event of events) {
        const delayMs = (event.time / 16) * barMs;
        setTimeout(() => {
          if (state.isSilent) return;
          const vol = event.velocity * 0.08 * (state.keysGainTarget / 0.35);
          for (const midi of event.voicing) {
            const freq = midiToFreq(midi);
            chord.playNote(freq, event.duration, vol);
            state.keysActive.push(midi);
          }
        }, delayMs);
      }

      // Update chord name from sequencer
      state.currentChordName = harmSeq.getCurrentChord().name;
    }

    // ─── Bass: generate walking line for this bar ───
    if (state.bassGainTarget > 0) {
      const currentChord = harmSeq.getCurrentChord();
      const nextChord = (() => {
        const symbols = makeChordSymbols(state.modulated);
        const prog = state.modulated ? PROGRESSION_MODULATED : PROGRESSION;
        const idx = prog.findIndex(p => p.name === currentChord.name);
        return symbols[(idx + 1) % symbols.length];
      })();

      const scale = getScale(state.modulated);
      const energy = state.mouseY;
      const bassNotes = bassGen.generateBar(currentChord, nextChord, scale, energy);

      for (let i = 0; i < bassNotes.length; i++) {
        const delayMs = (i / bassNotes.length) * barMs;
        setTimeout(() => {
          if (state.isSilent || state.bassGainTarget === 0) return;
          const note = bassNotes[i];
          if (note.ghost) {
            // Ghost note: very brief filter blip
            chord.setParameter(bassFilter, 'cutoff', 1200);
            setTimeout(() => chord.setParameter(bassFilter, 'cutoff', 900), 30);
          } else {
            bassGen.playNote(note, bassOsc, bassSub, bassFilter);
          }
        }, delayMs);
      }
    }

    // ─── Solo: generate a phrase if mouse is idle ───
    if (state.mouseIdle && state.section !== 'intro' && state.section !== 'silence') {
      const currentChord = harmSeq.getCurrentChord();
      const scaleNotes = getScaleNotes(state.modulated ? 68 : 63);
      const phrase = soloGen.generatePhrase(currentChord, scaleNotes, state.mouseY, state.mouseX);
      soloGen.playPhrase(phrase);
    }

    // ─── Advance chord every 2 bars ───
    barCount++;
    if (barCount % 2 === 0) {
      harmSeq.advanceChord();
      // Keep progression in sync with modulation state
      harmSeq.setProgression(makeChordSymbols(state.modulated));
    }

    compTimer = setTimeout(scheduleBar, barMs);
  }

  // ═══════════════════════════════════════════
  // ARRANGEMENT — scroll position drives everything
  // ═══════════════════════════════════════════

  function updateArrangement(t: number) {
    state.scroll = t;
    state.isGlitching = false;
    state.isSilent = false;

    // Reset glitch effects
    chord.setParameter(glitchCrush, 'mix', 0);
    chord.setParameter(glitchCrush, 'bits', 16);

    if (t < 0.10) {
      // INTRO: keys alone, rubato
      state.section = 'intro';
      state.tempo = RUBATO_TEMPO + t * 200;
      state.keysGainTarget = 0.35;
      state.bassGainTarget = 0;
      state.drumGainTarget = 0;
      state.modulated = false;
    } else if (t < 0.20) {
      // BASS ENTERS
      state.section = 'bass-enters';
      const p = (t - 0.10) / 0.10;
      state.tempo = RUBATO_TEMPO + p * (BASE_TEMPO - RUBATO_TEMPO);
      state.keysGainTarget = 0.3;
      state.bassGainTarget = p * 0.35;
      state.drumGainTarget = 0;
      state.modulated = false;
    } else if (t < 0.40) {
      // FULL GROOVE
      state.section = 'groove';
      const p = (t - 0.20) / 0.20;
      state.tempo = BASE_TEMPO;
      state.keysGainTarget = 0.3;
      state.bassGainTarget = 0.35;
      state.drumGainTarget = Math.min(p * 2, 1) * 0.35;
      state.modulated = false;
    } else if (t < 0.50) {
      // TENSION
      state.section = 'tension';
      const p = (t - 0.40) / 0.10;
      state.tempo = BASE_TEMPO + p * 12;
      state.keysGainTarget = 0.35 + p * 0.1;
      state.bassGainTarget = 0.35 + p * 0.1;
      state.drumGainTarget = 0.35 + p * 0.15;
      chord.setParameter(masterFilter, 'resonance', p * 0.3);
      chord.setParameter(bassDist, 'drive', 0.12 + p * 0.2);
      state.modulated = false;
    } else if (t < 0.55) {
      // GLITCH BREAKDOWN
      state.section = 'glitch-1';
      state.isGlitching = true;
      state.tempo = BASE_TEMPO + 12;
      applyGlitch((t - 0.50) / 0.05);
    } else if (t < 0.57) {
      // SILENCE
      state.section = 'silence';
      state.isSilent = true;
      chord.setMasterVolume(0);
      state.tempo = BASE_TEMPO;
      state.modulated = true;
    } else if (t < 0.60) {
      // THE DROP
      state.section = 'drop';
      const p = (t - 0.57) / 0.03;
      state.isSilent = false;
      state.modulated = true;
      chord.setMasterVolume(0.5);
      state.tempo = BASE_TEMPO + 4;
      state.keysGainTarget = 0.4;
      state.bassGainTarget = 0.4;
      state.drumGainTarget = 0.4;
      chord.setParameter(masterFilter, 'cutoff', 18000);
      chord.setParameter(masterFilter, 'resonance', 0);
      if (p < 0.1) chord.playNote(midiToFreq(44), 1.5, 0.35);
    } else if (t < 0.80) {
      // PEAK
      state.section = 'peak';
      state.tempo = BASE_TEMPO + 4;
      state.modulated = true;
      state.keysGainTarget = 0.4;
      state.bassGainTarget = 0.4;
      state.drumGainTarget = 0.45;
    } else if (t < 0.85) {
      // SECOND GLITCH — harder
      state.section = 'glitch-2';
      state.isGlitching = true;
      state.modulated = true;
      state.tempo = BASE_TEMPO + 8;
      applyGlitch(((t - 0.80) / 0.05) * 1.5);
    } else {
      // OUTRO
      state.section = 'outro';
      const p = (t - 0.85) / 0.15;
      state.modulated = false;
      state.tempo = BASE_TEMPO - p * (BASE_TEMPO - RUBATO_TEMPO);
      state.drumGainTarget = Math.max(0, (1 - p * 2)) * 0.3;
      state.bassGainTarget = Math.max(0, (1 - p * 1.5)) * 0.3;
      state.keysGainTarget = 0.3 * (1 - p * 0.7);
      chord.setMasterVolume(0.5 * (1 - p * 0.8));
    }

    // Apply gain targets
    chord.setParameter(keysGain, 'gain', state.keysGainTarget);
    chord.setParameter(bassGain, 'gain', state.bassGainTarget);
    chord.setParameter(drumGain, 'gain', state.drumGainTarget);

    // Update rhythm engine tempo
    rhythmEngine.setTempo(state.tempo);

    // Restore master volume for non-silent sections
    if (!state.isSilent && state.section !== 'outro') {
      chord.setMasterVolume(0.5);
    }
  }

  // ─── Glitch effects — now with bitcrusher + distortion ───
  function applyGlitch(intensity: number) {
    const i = Math.min(intensity, 1.5);

    // Bitcrusher: reduce bits and sample rate
    chord.setParameter(glitchCrush, 'mix', 0.3 + i * 0.4);
    chord.setParameter(glitchCrush, 'bits', Math.max(2, 16 - Math.floor(i * 12)));
    chord.setParameter(glitchCrush, 'rate', Math.max(0.1, 1 - i * 0.7));

    // Filter sweeps
    chord.setParameter(masterFilter, 'cutoff', 200 + Math.random() * 6000 * i);
    chord.setParameter(masterFilter, 'resonance', 0.3 + Math.random() * 0.4 * i);

    // Bass distortion cranks up
    chord.setParameter(bassDist, 'drive', 0.3 + i * 0.5);
    chord.setParameter(bassDist, 'mix', 0.5 + i * 0.3);

    // Drum chaos
    chord.setParameter(snare, 'snap', 0.1 + Math.random() * 0.7);
    chord.setParameter(hat, 'decay', 0.01 + Math.random() * 0.2);

    // Random note bursts
    if (Math.random() < 0.3 * i) {
      chord.playNote(200 + Math.random() * 2000, 0.05, 0.15 * i);
    }
  }

  function triggerScrollGlitch(intensity: number) {
    if (state.section === 'silence') return;
    const i = Math.min(intensity, 1);

    // Brief bitcrush burst
    chord.setParameter(glitchCrush, 'mix', i * 0.3);
    chord.setParameter(glitchCrush, 'bits', Math.max(6, 16 - Math.floor(i * 8)));
    setTimeout(() => {
      if (!state.isGlitching) {
        chord.setParameter(glitchCrush, 'mix', 0);
        chord.setParameter(glitchCrush, 'bits', 16);
      }
    }, 80);

    // Brief filter sweep
    chord.setParameter(masterFilter, 'cutoff', 1000 + Math.random() * 3000);
    chord.setParameter(masterFilter, 'resonance', 0.2 * i);
    setTimeout(() => {
      if (!state.isGlitching) {
        chord.setParameter(masterFilter, 'cutoff', 18000);
        chord.setParameter(masterFilter, 'resonance', 0);
      }
    }, 80);

    if (i > 0.3) {
      chord.playNote(midiToFreq(63 + Math.floor(Math.random() * 12)), 0.04, 0.1 * i);
    }
  }

  // ═══════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════

  return {
    chord,

    async start() {
      await chord.start();
      chord.setMasterVolume(0.5);
      bindAudioToCSS(chord, document.documentElement);
      rhythmEngine.start();
      scheduleBar();
    },

    stop() {
      rhythmEngine.stop();
      if (compTimer) clearTimeout(compTimer);
      chord.stop();
    },

    setScroll(t: number) {
      updateArrangement(Math.max(0, Math.min(1, t)));
    },

    setMouseX(x: number) {
      state.mouseX = Math.max(0, Math.min(1, x));
      chord.setParameter(masterRev, 'mix', 0.15 + state.mouseX * 0.15);
      chord.setParameter(masterDelay, 'feedback', 0.1 + state.mouseX * 0.2);
    },

    setMouseY(y: number) {
      state.mouseY = Math.max(0, Math.min(1, y));
      const energy = state.mouseY;
      chord.setParameter(snare, 'decay', 0.1 + (1 - energy) * 0.15);
      chord.setParameter(snare, 'snap', 0.1 + energy * 0.3);
      chord.setParameter(hat, 'tone', 3000 + energy * 6000);
      chord.setParameter(keysFilter, 'cutoff', 2000 + energy * 4000);
    },

    setMouseVelocity(v: number) {
      state.mouseVelocity = Math.max(0, Math.min(1, v));
    },

    setMouseIdle(idle: boolean) {
      state.mouseIdle = idle;
    },

    triggerScrollGlitch,

    getState(): EngineState {
      return {
        currentChord: state.currentChordName,
        tempo: state.tempo,
        scrollPosition: state.scroll,
        section: state.section,
        isGlitching: state.isGlitching,
        isSilent: state.isSilent,
        modulated: state.modulated,
        keysPlaying: [...state.keysActive],
      };
    },

    destroy() {
      state.destroyed = true;
      rhythmEngine.stop();
      if (compTimer) clearTimeout(compTimer);
      chord.stop();
    },
  };
}
