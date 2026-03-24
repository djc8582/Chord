/**
 * Sounds — instant UI sound effects.
 *
 * A pre-built library of common interaction sounds.
 * Lazily creates a shared Chord engine on first use.
 *
 * @example
 * import { Sounds } from '@chord/web';
 * Sounds.click();
 * Sounds.success();
 * Sounds.toggle(true);
 */

import { Chord } from './Chord.js';

let sharedEngine: Chord | null = null;
let engineReady = false;
let enginePromise: Promise<void> | null = null;
let globalVolume = 0.3;
let isMuted = false;

async function getEngine(): Promise<Chord> {
  if (!sharedEngine) {
    sharedEngine = new Chord();
    // Add a reverb for pleasant tail on UI sounds
    const rev = sharedEngine.addNode('reverb');
    const out = sharedEngine.addNode('output');
    sharedEngine.setParameter(rev, 'room_size', 0.25);
    sharedEngine.setParameter(rev, 'damping', 0.6);
    sharedEngine.setParameter(rev, 'mix', 0.15);
    sharedEngine.connect(rev, 'out', out, 'in');
  }
  if (!engineReady) {
    if (!enginePromise) {
      enginePromise = sharedEngine.start().then(() => { engineReady = true; });
    }
    await enginePromise;
  }
  return sharedEngine;
}

export class Sounds {
  /** Set global volume for all UI sounds (0-1). Default: 0.3 */
  static setGlobalVolume(v: number): void {
    globalVolume = Math.max(0, Math.min(1, v));
  }

  /** Mute all UI sounds. */
  static mute(): void { isMuted = true; }

  /** Unmute UI sounds. */
  static unmute(): void { isMuted = false; }

  /** Tactile click — short, precise. */
  static async click(): Promise<void> {
    if (isMuted) return;
    const e = await getEngine();
    e.playNote(1800 + Math.random() * 200, 0.03, 0.04 * globalVolume);
  }

  /** Subtle hover — barely audible breath. */
  static async hover(): Promise<void> {
    if (isMuted) return;
    const e = await getEngine();
    e.playNote(2400 + Math.random() * 400, 0.025, 0.012 * globalVolume);
  }

  /** Success — ascending perfect 4th, bright. */
  static async success(): Promise<void> {
    if (isMuted) return;
    const e = await getEngine();
    e.playNote(880, 0.15, 0.04 * globalVolume);
    setTimeout(() => e.playNote(1174.7, 0.2, 0.035 * globalVolume), 80);
  }

  /** Error — descending minor 2nd, muted. */
  static async error(): Promise<void> {
    if (isMuted) return;
    const e = await getEngine();
    e.playNote(440, 0.12, 0.03 * globalVolume);
    setTimeout(() => e.playNote(415.3, 0.15, 0.025 * globalVolume), 70);
  }

  /** Warning — single mid-pitch ping. */
  static async warning(): Promise<void> {
    if (isMuted) return;
    const e = await getEngine();
    e.playNote(740, 0.15, 0.035 * globalVolume);
  }

  /** Notification — clear bell tone. */
  static async notification(): Promise<void> {
    if (isMuted) return;
    const e = await getEngine();
    e.playNote(1318.5, 0.12, 0.035 * globalVolume);
  }

  /** Toggle on/off — pitch goes up for on, down for off. */
  static async toggle(on: boolean): Promise<void> {
    if (isMuted) return;
    const e = await getEngine();
    e.playNote(on ? 1200 : 900, 0.06, 0.025 * globalVolume);
  }

  /** Page transition — quick filtered noise sweep. */
  static async transition(): Promise<void> {
    if (isMuted) return;
    const e = await getEngine();
    // Play a quick ascending + descending pair
    e.playNote(400, 0.08, 0.02 * globalVolume);
    setTimeout(() => e.playNote(800, 0.06, 0.015 * globalVolume), 30);
    setTimeout(() => e.playNote(600, 0.1, 0.01 * globalVolume), 70);
  }

  /** Delete — descending dissolve. */
  static async delete(): Promise<void> {
    if (isMuted) return;
    const e = await getEngine();
    e.playNote(600, 0.1, 0.025 * globalVolume);
    setTimeout(() => e.playNote(400, 0.12, 0.02 * globalVolume), 50);
    setTimeout(() => e.playNote(250, 0.15, 0.015 * globalVolume), 100);
  }

  /** Keystroke — very short mechanical tap with random pitch variation. */
  static async keystroke(): Promise<void> {
    if (isMuted) return;
    const e = await getEngine();
    e.playNote(1500 + Math.random() * 600, 0.015, 0.015 * globalVolume);
  }

  /** Custom sound (placeholder — plays a pitched tone). */
  static async custom(_description: string): Promise<void> {
    if (isMuted) return;
    const e = await getEngine();
    e.playNote(800 + Math.random() * 800, 0.1, 0.03 * globalVolume);
  }
}
