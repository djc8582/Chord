import type { Chord } from '@chord/web';

const TYPING_NOTES: Record<string, number> = {
  // Bottom row — low octave
  z: 130.8, x: 146.8, c: 164.8, v: 174.6, b: 196.0, n: 220.0, m: 246.9,
  // Middle row — mid octave
  a: 261.6, s: 293.7, d: 329.6, f: 349.2, g: 392.0, h: 440.0, j: 493.9, k: 523.3, l: 587.3,
  // Top row — high octave
  q: 523.3, w: 587.3, e: 659.3, r: 698.5, t: 784.0, y: 880.0, u: 987.8, i: 1046.5, o: 1174.7, p: 1318.5,
};

interface MusicalTypingProps {
  chord: Chord;
}

export function MusicalTyping({ chord }: MusicalTypingProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <h3 className="text-2xl font-bold mb-4 text-[#c8ff00]">Musical Typing</h3>
      <p className="text-gray-400 mb-4 text-sm">Every keystroke is a note. Type something beautiful.</p>
      <textarea
        className="w-full h-32 bg-black/50 border-2 border-white/10 rounded-lg p-4 text-white
                   font-mono text-lg focus:border-[#c8ff00] focus:outline-none resize-none"
        placeholder="Start typing..."
        onKeyDown={(e) => {
          const freq = TYPING_NOTES[e.key.toLowerCase()];
          if (freq) chord.playNote(freq, 0.25);
        }}
      />
    </div>
  );
}
