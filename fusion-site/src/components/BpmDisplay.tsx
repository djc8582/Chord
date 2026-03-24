/**
 * Live BPM display — shows current tempo.
 */

import { useAudio } from '../providers/AudioProvider.js';

export function BpmDisplay() {
  const { state, started } = useAudio();

  if (!started) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 font-mono text-xs text-white/20">
      {Math.round(state.tempo)} BPM
    </div>
  );
}
