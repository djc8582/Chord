/**
 * ChordPatch — High-level wrapper returned by Chord.create().
 *
 * Provides simple controls (start/stop/modify/setParameter) over a
 * fully-built generative audio patch. The user never touches nodes
 * or connections directly.
 */

import { Chord } from './Chord.js';
import type { BuiltPatch } from './vibe/patch-builder.js';
import type { PatchRecipe } from './vibe/types.js';
import type { ChordSymbol } from './harmonic-sequencer.js';
import { getAnalysisFrame, type AudioAnalysisFrame } from './visualizers/index.js';

export class ChordPatch {
  private _engine: Chord;
  private patch: BuiltPatch;
  private recipe: PatchRecipe;
  private _destroyed = false;
  private masterLoop: ReturnType<typeof setTimeout> | null = null;
  private barCount = 0;

  // Current state
  private _intensity = 0.5;
  private _tempo: number;
  private _soloMode = false;

  constructor(engine: Chord, patch: BuiltPatch, recipe: PatchRecipe) {
    this._engine = engine;
    this.patch = patch;
    this.recipe = recipe;
    this._tempo = recipe.tempo;
  }

  /** Access the underlying Chord engine for advanced use */
  get engine(): Chord {
    return this._engine;
  }

  /** Start audio playback. Must be called after a user gesture. */
  async start(): Promise<void> {
    await this._engine.start();

    // Start the rhythm engine (drums)
    if (this.patch.rhythm) {
      this.patch.rhythm.start();
    }

    // Start the harmonic/bass scheduling loop
    this.startMasterLoop();
  }

  /** Stop playback and release resources. */
  stop(): void {
    this.patch.rhythm?.stop();
    if (this.masterLoop) clearTimeout(this.masterLoop);
    this._engine.stop();
  }

  /** Destroy the patch completely. */
  destroy(): void {
    this._destroyed = true;
    this.stop();
  }

  /** Is the engine currently running? */
  get isPlaying(): boolean {
    return this._engine.started;
  }

  // ═══════════════════════════════════════════
  // Natural language modification
  // ═══════════════════════════════════════════

  /** Modify the patch with natural language. */
  modify(description: string): void {
    const desc = description.toLowerCase();

    // Volume/intensity
    if (desc.includes('louder') || desc.includes('more intense')) {
      this.setIntensity(Math.min(1, this._intensity + 0.2));
    }
    if (desc.includes('quieter') || desc.includes('softer') || desc.includes('less intense')) {
      this.setIntensity(Math.max(0, this._intensity - 0.2));
    }

    // Tempo
    if (desc.includes('faster') || desc.includes('speed up')) {
      this.setTempo(this._tempo * 1.15);
    }
    if (desc.includes('slower') || desc.includes('slow down')) {
      this.setTempo(this._tempo * 0.85);
    }

    // Tone
    if (desc.includes('darker') || desc.includes('warmer')) {
      const current = this._engine.getParameter(this.patch.masterFilterId, 'cutoff');
      this._engine.setParameter(this.patch.masterFilterId, 'cutoff', Math.max(500, current * 0.6));
    }
    if (desc.includes('brighter') || desc.includes('crisper')) {
      const current = this._engine.getParameter(this.patch.masterFilterId, 'cutoff');
      this._engine.setParameter(this.patch.masterFilterId, 'cutoff', Math.min(18000, current * 1.5));
    }

    // Space
    if (desc.includes('more reverb') || desc.includes('more space') || desc.includes('wetter')) {
      const current = this._engine.getParameter(this.patch.masterRevId, 'mix');
      this._engine.setParameter(this.patch.masterRevId, 'mix', Math.min(0.7, current + 0.1));
    }
    if (desc.includes('drier') || desc.includes('less reverb') || desc.includes('less space')) {
      const current = this._engine.getParameter(this.patch.masterRevId, 'mix');
      this._engine.setParameter(this.patch.masterRevId, 'mix', Math.max(0.05, current - 0.1));
    }

    // Mood shifts
    const moods: Record<string, () => void> = {
      'dark': () => this._engine.setParameter(this.patch.masterFilterId, 'cutoff', 1500),
      'bright': () => this._engine.setParameter(this.patch.masterFilterId, 'cutoff', 12000),
      'tense': () => this._engine.setParameter(this.patch.masterFilterId, 'resonance', 0.3),
      'relaxed': () => this._engine.setParameter(this.patch.masterFilterId, 'resonance', 0),
    };
    for (const [mood, action] of Object.entries(moods)) {
      if (desc.includes(mood)) { action(); break; }
    }
  }

  // ═══════════════════════════════════════════
  // Parameter control
  // ═══════════════════════════════════════════

  /** Set a named parameter. Universal params: 'intensity', 'brightness', 'tempo', 'reverb', 'swing' */
  setParameter(name: string, value: number): void {
    switch (name) {
      case 'intensity':
        this.setIntensity(value);
        break;
      case 'brightness':
        this._engine.setParameter(this.patch.masterFilterId, 'cutoff', 500 + value * 17500);
        break;
      case 'tempo':
        this.setTempo(value);
        break;
      case 'reverb':
      case 'space':
        this._engine.setParameter(this.patch.masterRevId, 'mix', value * 0.7);
        break;
      case 'swing':
        if (this.patch.rhythm) this.patch.rhythm.swing = value;
        break;
      default:
        console.warn(`[ChordPatch] Unknown parameter "${name}". Available: intensity, brightness, tempo, reverb, swing`);
    }
  }

  /** Set overall intensity (0-1). Affects volume, density, and energy of all layers. */
  setIntensity(value: number): void {
    this._intensity = Math.max(0, Math.min(1, value));
    // Scale all layer gains
    for (const [, gainId] of this.patch.layerGainIds) {
      this._engine.setParameter(gainId, 'gain', this._intensity * 0.5);
    }
    this._engine.setMasterVolume(0.2 + this._intensity * 0.4);
  }

  /** Set the mood (affects tone, energy, space). */
  setMood(mood: string): void {
    this.modify(mood);
  }

  /** Set tempo in BPM. */
  setTempo(bpm: number): void {
    this._tempo = Math.max(30, Math.min(300, bpm));
    if (this.patch.rhythm) {
      this.patch.rhythm.setTempo(this._tempo);
    }
  }

  /** Bind a parameter to a live value source. Called every frame. */
  bindParameter(name: string, source: () => number): void {
    const tick = () => {
      if (this._destroyed) return;
      this.setParameter(name, source());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Get audio analysis for driving visuals. */
  getAnalysisFrame(): AudioAnalysisFrame {
    return getAnalysisFrame(this._engine);
  }

  // ═══════════════════════════════════════════
  // Master scheduling loop
  // ═══════════════════════════════════════════

  private startMasterLoop(): void {
    const tick = () => {
      if (this._destroyed) return;

      const barMs = (60000 / this._tempo) * 4;

      // Generate comping for this bar
      if (this.patch.harmony) {
        const density = 0.3 + this._intensity * 0.3;
        const events = this.patch.harmony.generateBar(density, 0.3);

        for (const event of events) {
          const delayMs = (event.time / 16) * barMs;
          setTimeout(() => {
            if (this._destroyed) return;
            const vol = event.velocity * 0.07 * this._intensity;
            for (const midi of event.voicing) {
              const freq = 440 * Math.pow(2, (midi - 69) / 12);
              this._engine.playNote(freq, event.duration, vol);
            }
          }, delayMs);
        }
      }

      // Generate bass line
      if (this.patch.bass && this.patch.harmony && this.patch.bassOscIds.length >= 2) {
        const current = this.patch.harmony.getCurrentChord();
        const next = this.peekNextChord();
        if (current && next) {
          const scale = [0, 2, 3, 5, 7, 9, 10]; // dorian intervals
          const notes = this.patch.bass.generateBar(current, next, scale, this._intensity);
          for (let i = 0; i < notes.length; i++) {
            const delayMs = (i / notes.length) * barMs;
            setTimeout(() => {
              if (this._destroyed) return;
              const note = notes[i];
              if (this.patch.bassFilterId) {
                this.patch.bass!.playNote(
                  note,
                  this.patch.bassOscIds[0],
                  this.patch.bassOscIds[1],
                  this.patch.bassFilterId,
                );
              }
            }, delayMs);
          }
        }
      }

      // Solo mode
      if (this._soloMode && this.patch.solo && this.patch.harmony) {
        const chord = this.patch.harmony.getCurrentChord();
        const scale = [0, 2, 3, 5, 7, 9, 10].map(i => i + (chord?.root ?? 60));
        const phrase = this.patch.solo.generatePhrase(
          chord ?? { name: 'Cm', root: 60, tones: [0, 3, 7, 10] },
          scale, this._intensity, 0.3,
        );
        this.patch.solo.playPhrase(phrase);
      }

      // Advance chord every 2 bars
      this.barCount++;
      if (this.barCount % 2 === 0 && this.patch.harmony) {
        this.patch.harmony.advanceChord();
      }

      this.masterLoop = setTimeout(tick, barMs);
    };

    tick();
  }

  private peekNextChord(): ChordSymbol {
    // Return what the next chord will be without advancing
    if (this.patch.harmony) {
      const current = this.patch.harmony.getCurrentChord();
      return current; // simplified — just use current as next for approach notes
    }
    return { name: 'C', root: 60, tones: [0, 4, 7] };
  }
}
