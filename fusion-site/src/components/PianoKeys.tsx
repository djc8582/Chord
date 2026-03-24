/**
 * Mini piano keyboard showing which notes the keys are currently playing.
 */

import { useAudio } from '../providers/AudioProvider.js';

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
const BLACK_KEYS = [1, 3, 6, 8, 10]; // C# D# F# G# A#

// Show 2 octaves (C3-B4)
const RANGE_START = 48; // C3
const RANGE_END = 72;   // C5

export function PianoKeys() {
  const { state, started } = useAudio();

  if (!started) return null;

  const activeNotes = new Set(state.keysPlaying);
  const keys: { midi: number; isBlack: boolean; isActive: boolean }[] = [];

  for (let midi = RANGE_START; midi < RANGE_END; midi++) {
    const pc = midi % 12;
    keys.push({
      midi,
      isBlack: BLACK_KEYS.includes(pc),
      isActive: activeNotes.has(midi),
    });
  }

  return (
    <div className="fixed bottom-6 left-6 z-40 flex h-8 gap-px opacity-40">
      {keys.filter(k => !k.isBlack).map((key) => (
        <div
          key={key.midi}
          className="w-2 rounded-b-sm transition-colors duration-75"
          style={{
            height: '100%',
            background: key.isActive ? '#d4a053' : 'rgba(255,255,255,0.08)',
          }}
        />
      ))}
    </div>
  );
}
