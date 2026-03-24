/**
 * Jazz Fusion Trio Audio Engine
 *
 * Three instruments sharing one Chord engine:
 *   1. Rhodes keys — FM-style electric piano with chorus + tremolo
 *   2. Electric bass — rich saw+sub with filter envelope
 *   3. Drums — kick, snare (sticks/brushes), ride, hi-hat, ghost notes
 *
 * All generative. All through Chord's node graph.
 * The arrangement is driven by scroll position (0-1).
 */

import { Chord } from '@chord/web';
import { bindAudioToCSS } from '@chord/web';
import {
  midiToFreq, bpmToMs, swingEighth,
  PROGRESSION, PROGRESSION_MODULATED,
  APPROACH_PATTERNS, getScaleNotes,
  BASE_TEMPO, RUBATO_TEMPO,
  type ChordVoicing,
} from './constants.js';

// ─── Types ───

export interface FusionEngine {
  chord: Chord;
  start: () => Promise<void>;
  stop: () => void;
  /** Set scroll position 0-1 driving the arrangement */
  setScroll: (t: number) => void;
  /** Set mouse X normalized 0-1 (harmonic tension) */
  setMouseX: (x: number) => void;
  /** Set mouse Y normalized 0-1 (energy/register) */
  setMouseY: (y: number) => void;
  /** Set mouse velocity 0-1 (rhythmic density) */
  setMouseVelocity: (v: number) => void;
  /** Mouse has been idle for 5+ seconds */
  setMouseIdle: (idle: boolean) => void;
  /** Fast scroll triggers micro-glitch */
  triggerScrollGlitch: (intensity: number) => void;
  /** Get current state for visualizers */
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
  keysPlaying: number[];  // MIDI notes currently sounding
}

// ─── Internal state ───

interface InternalState {
  scroll: number;
  mouseX: number;
  mouseY: number;
  mouseVelocity: number;
  mouseIdle: boolean;
  tempo: number;
  currentChordIndex: number;
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
    currentChordIndex: 0,
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
  // NODE GRAPH — shared signal path
  // ═══════════════════════════════════════════

  // Master effects chain
  const masterComp = chord.addNode('compressor');
  const masterRev = chord.addNode('reverb');
  const masterDelay = chord.addNode('delay');
  const masterFilter = chord.addNode('filter');

  // Master reverb — warm room
  chord.setParameter(masterRev, 'decay', 2.5);
  chord.setParameter(masterRev, 'mix', 0.18);
  chord.setParameter(masterRev, 'damping', 0.6);

  // Master delay — subtle depth
  chord.setParameter(masterDelay, 'time', 0.28);
  chord.setParameter(masterDelay, 'feedback', 0.15);
  chord.setParameter(masterDelay, 'mix', 0.08);

  // Master compressor — glue
  chord.setParameter(masterComp, 'threshold', -14);
  chord.setParameter(masterComp, 'ratio', 2.5);
  chord.setParameter(masterComp, 'attack', 0.02);
  chord.setParameter(masterComp, 'release', 0.15);

  // Master filter — for sweeps and glitch
  chord.setParameter(masterFilter, 'cutoff', 18000);
  chord.setParameter(masterFilter, 'resonance', 0);

  // Signal path: instruments → reverb → delay → comp → filter → output
  chord.connect(masterRev, 'out', masterDelay, 'in');
  chord.connect(masterDelay, 'out', masterComp, 'in');
  chord.connect(masterComp, 'out', masterFilter, 'in');

  // ═══════════════════════════════════════════
  // RHODES KEYS — FM-like electric piano
  // ═══════════════════════════════════════════
  // Rhodes tone: sine fundamental + sine at ~2x freq (FM carrier/modulator)
  // Plus chorus and tremolo for that warm, shimmering character

  const keysTrem = chord.addNode('lfo');
  chord.setParameter(keysTrem, 'rate', 4.5);    // tremolo rate
  chord.setParameter(keysTrem, 'depth', 0.08);  // subtle amplitude wobble

  const keysChorus = chord.addNode('chorus');
  chord.setParameter(keysChorus, 'rate', 0.8);
  chord.setParameter(keysChorus, 'depth', 0.25);
  chord.setParameter(keysChorus, 'mix', 0.15);

  const keysFilter = chord.addNode('filter');
  chord.setParameter(keysFilter, 'cutoff', 4000);
  chord.setParameter(keysFilter, 'resonance', 0.1);

  const keysGain = chord.addNode('gain');
  chord.setParameter(keysGain, 'gain', 0.35);

  // Keys signal path: [per-note oscillators] → keysFilter → keysChorus → keysGain → masterRev
  chord.connect(keysFilter, 'out', keysChorus, 'in');
  chord.connect(keysChorus, 'out', keysGain, 'in');
  chord.connect(keysTrem, 'out', keysGain, 'gain');
  chord.connect(keysGain, 'out', masterRev, 'in');

  // ═══════════════════════════════════════════
  // BASS — rich tone with sub
  // ═══════════════════════════════════════════

  const bassOsc = chord.addNode('oscillator');
  const bassSub = chord.addNode('oscillator');
  const bassFilter = chord.addNode('filter');
  const bassDrive = chord.addNode('waveshaper');
  const bassGain = chord.addNode('gain');

  chord.setParameter(bassOsc, 'waveform', 1);  // saw
  chord.setParameter(bassOsc, 'frequency', 82.41); // E2 default
  chord.setParameter(bassOsc, 'gain', 0.2);
  chord.setParameter(bassSub, 'waveform', 0);  // sine sub
  chord.setParameter(bassSub, 'frequency', 41.2);
  chord.setParameter(bassSub, 'gain', 0.15);
  chord.setParameter(bassFilter, 'cutoff', 900);
  chord.setParameter(bassFilter, 'resonance', 0.25);
  chord.setParameter(bassDrive, 'drive', 0.12);
  chord.setParameter(bassDrive, 'mode', 2); // tape
  chord.setParameter(bassDrive, 'mix', 0.3);
  chord.setParameter(bassGain, 'gain', 0);  // starts silent

  chord.connect(bassOsc, 'out', bassFilter, 'in');
  chord.connect(bassSub, 'out', bassFilter, 'in');
  chord.connect(bassFilter, 'out', bassDrive, 'in');
  chord.connect(bassDrive, 'out', bassGain, 'in');
  chord.connect(bassGain, 'out', masterRev, 'in');

  // ═══════════════════════════════════════════
  // DRUMS
  // ═══════════════════════════════════════════

  const kick = chord.addNode('kickDrum');
  const snare = chord.addNode('snareDrum');
  const hat = chord.addNode('hiHat');
  const drumGain = chord.addNode('gain');
  const drumComp = chord.addNode('compressor');

  // Kick: jazz kick — not too deep, tight
  chord.setParameter(kick, 'frequency', 60);
  chord.setParameter(kick, 'body_decay', 0.2);
  chord.setParameter(kick, 'click', 0.3);
  chord.setParameter(kick, 'drive', 0.08);

  // Snare: starts as brushes (quiet, long decay)
  chord.setParameter(snare, 'body_freq', 180);
  chord.setParameter(snare, 'noise_decay', 0.2);
  chord.setParameter(snare, 'crack', 0.15);
  chord.setParameter(snare, 'mix', 0.6);

  // Hi-hat: ride cymbal character (longer decay, lower tone)
  chord.setParameter(hat, 'decay', 0.15);
  chord.setParameter(hat, 'tone', 0.35);
  chord.setParameter(hat, 'ring_mod', 0.5);

  // Drum bus compression
  chord.setParameter(drumComp, 'threshold', -12);
  chord.setParameter(drumComp, 'ratio', 3);
  chord.setParameter(drumComp, 'attack', 0.005);
  chord.setParameter(drumComp, 'release', 0.08);

  chord.setParameter(drumGain, 'gain', 0);  // starts silent

  chord.connect(kick, 'out', drumComp, 'in');
  chord.connect(snare, 'out', drumComp, 'in');
  chord.connect(hat, 'out', drumComp, 'in');
  chord.connect(drumComp, 'out', drumGain, 'in');
  chord.connect(drumGain, 'out', masterRev, 'in');

  // ═══════════════════════════════════════════
  // SEQUENCING LOOP
  // ═══════════════════════════════════════════

  let loopTimer: ReturnType<typeof setTimeout> | null = null;
  let beatCount = 0;
  let subBeat = 0;

  function getProgression(): ChordVoicing[] {
    return state.modulated ? PROGRESSION_MODULATED : PROGRESSION;
  }

  function getCurrentChord(): ChordVoicing {
    return getProgression()[state.currentChordIndex % 4];
  }

  // ─── KEYS: play chord voicing ───
  function playKeysChord() {
    if (state.isSilent || state.section === 'silence') return;

    const cv = getCurrentChord();
    state.currentChordName = cv.name;

    // Determine voicing register based on mouseY
    const registerShift = state.mouseY > 0.5 ? 12 : 0; // higher register when mouse is high
    const root = cv.bassNote + 24 + registerShift; // keys play 2 octaves above bass

    // Harmonic tension from mouseX — add chromatic alterations
    const tension = state.mouseX;
    const detuneAmount = tension * 15; // cents of harmonic "roughness"

    const noteFreqs: number[] = [];
    for (const offset of cv.offsets) {
      const midi = root + offset;
      let freq = midiToFreq(midi);
      // Add tension-based micro-detuning
      if (tension > 0.6) {
        freq *= 1 + (Math.random() - 0.5) * 0.005 * tension;
      }
      noteFreqs.push(freq);
    }

    // Play each note as a quick playNote with varying velocity
    const velocity = 0.06 + state.mouseY * 0.06;
    const duration = state.section === 'intro' ? 3.0 : 0.8 + Math.random() * 0.5;

    state.keysActive = [];
    for (const freq of noteFreqs) {
      chord.playNote(freq, duration, velocity + Math.random() * 0.02);
      state.keysActive.push(Math.round(69 + 12 * Math.log2(freq / 440)));
    }

    // If mouse is idle, add a melodic solo line
    if (state.mouseIdle && state.section !== 'intro') {
      playSoloNote();
    }
  }

  // ─── SOLO: melodic line during mouse idle ───
  function playSoloNote() {
    const scaleRoot = state.modulated ? 68 : 63; // Ab or Eb
    const scale = getScaleNotes(scaleRoot);
    const note = scale[Math.floor(Math.random() * scale.length)];
    const freq = midiToFreq(note + 12); // one octave up for clarity
    chord.playNote(freq, 0.3 + Math.random() * 0.4, 0.08);
  }

  // ─── BASS: walking bass ───
  function playBassNote() {
    if (state.isSilent || state.bassGainTarget === 0) return;

    const cv = getCurrentChord();
    const pattern = APPROACH_PATTERNS[Math.floor(Math.random() * APPROACH_PATTERNS.length)];

    // Pick the note based on where we are in the pattern
    const approachIdx = subBeat % pattern.length;
    const targetMidi = cv.bassNote + pattern[approachIdx];
    const freq = midiToFreq(targetMidi);

    chord.setParameter(bassOsc, 'frequency', freq);
    chord.setParameter(bassSub, 'frequency', freq / 2);

    // Filter envelope — pluck character
    const baseFilterCutoff = 600 + state.mouseY * 800;
    chord.setParameter(bassFilter, 'cutoff', baseFilterCutoff + 400);
    setTimeout(() => {
      chord.setParameter(bassFilter, 'cutoff', baseFilterCutoff);
    }, 60);
  }

  // ─── DRUMS: swing pattern ───
  function playDrumHit() {
    if (state.isSilent || state.drumGainTarget === 0) return;

    const energy = state.mouseY;
    const density = state.mouseVelocity;
    const isOnBeat = subBeat % 2 === 0;
    const isBeat2or4 = beatCount % 4 >= 2;

    // Ride cymbal — jazz ride pattern (ding-da-ding-da-ding)
    if (isOnBeat || Math.random() < 0.4 + density * 0.3) {
      chord.setParameter(hat, 'decay', 0.08 + energy * 0.12);
      chord.triggerNode(hat);
    }

    // Kick — beats 1 and 3 (sometimes)
    if (beatCount % 4 === 0 || (beatCount % 4 === 2 && Math.random() < 0.4 + energy * 0.3)) {
      chord.triggerNode(kick);
    }

    // Snare — ghost notes + backbeats
    if (isBeat2or4 && isOnBeat) {
      // Backbeat
      chord.setParameter(snare, 'crack', 0.2 + energy * 0.3);
      chord.triggerNode(snare);
    } else if (Math.random() < 0.15 + density * 0.2) {
      // Ghost note — very quiet
      chord.setParameter(snare, 'crack', 0.05);
      chord.triggerNode(snare);
    }
  }

  // ─── Main sequencing loop ───
  function scheduleNext() {
    if (state.destroyed) return;

    const beatMs = bpmToMs(state.tempo);
    const [longEighth, shortEighth] = swingEighth(beatMs / 2, 0.58);
    const nextDelay = subBeat % 2 === 0 ? longEighth : shortEighth;

    // Play drums on every sub-beat
    playDrumHit();

    // Bass on every sub-beat (walking)
    if (subBeat % 2 === 0) {
      playBassNote();
    }

    // Keys on beat 1 of each bar, sometimes beat 3
    if (subBeat === 0) {
      playKeysChord();
    } else if (subBeat === 4 && Math.random() < 0.3 + state.mouseVelocity * 0.3) {
      playKeysChord();
    }

    subBeat++;
    if (subBeat >= 8) {
      subBeat = 0;
      beatCount++;

      // Advance chord every 2 bars (8 beats)
      if (beatCount % 8 === 0) {
        state.currentChordIndex = (state.currentChordIndex + 1) % 4;
      }
    }

    loopTimer = setTimeout(scheduleNext, nextDelay);
  }

  // ═══════════════════════════════════════════
  // ARRANGEMENT — scroll position drives everything
  // ═══════════════════════════════════════════

  // Hidden internal state for smooth gain targets
  state.keysGainTarget = 0.35;
  state.bassGainTarget = 0;
  state.drumGainTarget = 0;

  function updateArrangement(t: number) {
    state.scroll = t;
    state.isGlitching = false;
    state.isSilent = false;

    // ── Section mapping ──
    if (t < 0.10) {
      // INTRO: keys alone, rubato
      state.section = 'intro';
      state.tempo = RUBATO_TEMPO + t * 200; // gradually speed up
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
      // TENSION — everything intensifies
      state.section = 'tension';
      const p = (t - 0.40) / 0.10;
      state.tempo = BASE_TEMPO + p * 12;
      state.keysGainTarget = 0.35 + p * 0.1;
      state.bassGainTarget = 0.35 + p * 0.1;
      state.drumGainTarget = 0.35 + p * 0.15;
      chord.setParameter(masterFilter, 'resonance', p * 0.3);
      state.modulated = false;
    } else if (t < 0.55) {
      // GLITCH BREAKDOWN
      state.section = 'glitch-1';
      state.isGlitching = true;
      state.tempo = BASE_TEMPO + 12;
      applyGlitch(((t - 0.50) / 0.05));
    } else if (t < 0.57) {
      // SILENCE
      state.section = 'silence';
      state.isSilent = true;
      chord.setMasterVolume(0);
      state.tempo = BASE_TEMPO;
      state.modulated = true; // prepare modulation
    } else if (t < 0.60) {
      // THE DROP — new key
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
      // Impact on entry
      if (p < 0.1) chord.playNote(midiToFreq(44), 1.5, 0.35); // Ab sub impact
    } else if (t < 0.80) {
      // PEAK — maximum energy
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
      applyGlitch(((t - 0.80) / 0.05) * 1.5); // 1.5x intensity
    } else {
      // OUTRO — strip away
      state.section = 'outro';
      const p = (t - 0.85) / 0.15;
      state.modulated = false;
      state.tempo = BASE_TEMPO - p * (BASE_TEMPO - RUBATO_TEMPO);
      state.drumGainTarget = Math.max(0, (1 - p * 2)) * 0.3;
      state.bassGainTarget = Math.max(0, (1 - p * 1.5)) * 0.3;
      state.keysGainTarget = 0.3 * (1 - p * 0.7);
      chord.setMasterVolume(0.5 * (1 - p * 0.8));
    }

    // Smoothly apply gain targets
    chord.setParameter(keysGain, 'gain', state.keysGainTarget);
    chord.setParameter(bassGain, 'gain', state.bassGainTarget);
    chord.setParameter(drumGain, 'gain', state.drumGainTarget);

    // Restore master volume for non-silent sections
    if (!state.isSilent && state.section !== 'outro') {
      chord.setMasterVolume(0.5);
    }
  }

  // ─── Glitch effects ───
  function applyGlitch(intensity: number) {
    const i = Math.min(intensity, 1.5);

    // Rapid filter sweeps
    chord.setParameter(masterFilter, 'cutoff', 200 + Math.random() * 6000 * i);
    chord.setParameter(masterFilter, 'resonance', 0.3 + Math.random() * 0.4 * i);

    // Distort the bass
    chord.setParameter(bassDrive, 'drive', 0.3 + i * 0.5);

    // Make drums chaotic
    chord.setParameter(snare, 'crack', 0.1 + Math.random() * 0.7);
    chord.setParameter(hat, 'decay', 0.01 + Math.random() * 0.2);

    // Random note bursts
    if (Math.random() < 0.3 * i) {
      const freq = 200 + Math.random() * 2000;
      chord.playNote(freq, 0.05, 0.15 * i);
    }
  }

  function triggerScrollGlitch(intensity: number) {
    if (state.section === 'silence') return;
    const i = Math.min(intensity, 1);

    // Brief filter sweep
    const origCutoff = 18000;
    chord.setParameter(masterFilter, 'cutoff', 1000 + Math.random() * 3000);
    chord.setParameter(masterFilter, 'resonance', 0.2 * i);
    setTimeout(() => {
      if (!state.isGlitching) {
        chord.setParameter(masterFilter, 'cutoff', origCutoff);
        chord.setParameter(masterFilter, 'resonance', 0);
      }
    }, 80);

    // Micro stutter — retrigger the current chord
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
      scheduleNext();
    },

    stop() {
      if (loopTimer) clearTimeout(loopTimer);
      chord.stop();
    },

    setScroll(t: number) {
      updateArrangement(Math.max(0, Math.min(1, t)));
    },

    setMouseX(x: number) {
      state.mouseX = Math.max(0, Math.min(1, x));
      // Harmonic tension drives reverb and delay
      chord.setParameter(masterRev, 'mix', 0.15 + state.mouseX * 0.15);
      chord.setParameter(masterDelay, 'feedback', 0.1 + state.mouseX * 0.2);
    },

    setMouseY(y: number) {
      state.mouseY = Math.max(0, Math.min(1, y));
      // Energy drives drum character
      const energy = state.mouseY;
      // High energy: sticks, bright, tight
      // Low energy: brushes, dark, loose
      chord.setParameter(snare, 'noise_decay', 0.1 + (1 - energy) * 0.15);
      chord.setParameter(snare, 'crack', 0.1 + energy * 0.3);
      chord.setParameter(hat, 'tone', 0.2 + energy * 0.4);
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
      if (loopTimer) clearTimeout(loopTimer);
      chord.stop();
    },
  };
}
