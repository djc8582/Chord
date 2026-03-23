import type { PatchConfig, PatchBuilder, PatchDefinition, NodeRef, ExposeOptions, ExposedParam } from './types.js';
import { _reset, _getNodes, _getConnections } from './nodes.js';

// Scale frequencies (C = degree 0)
const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minor_pentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

const KEY_SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

export function patch(
  name: string,
  config: PatchConfig,
  builder: (p: PatchBuilder) => void,
): PatchDefinition {
  _reset();

  const exposed: ExposedParam[] = [];
  const tempo = config.tempo ?? 120;
  const key = config.key ?? 'C';
  const scale = config.scale ?? 'minor';

  const keySemitone = KEY_SEMITONES[key] ?? 0;
  const scaleIntervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.minor;

  const p: PatchBuilder = {
    tempo,
    key,
    scale,
    scaleNote(octave: number, degree: number): number {
      const idx = ((degree % scaleIntervals.length) + scaleIntervals.length) % scaleIntervals.length;
      const semitone = keySemitone + scaleIntervals[idx] + (octave + 1) * 12;
      return 440 * Math.pow(2, (semitone - 69) / 12);
    },
    tempoSync(division: string): number {
      const beatsPerSecond = tempo / 60;
      const map: Record<string, number> = {
        '1/1': 4, '1/2': 2, '1/4': 1, '1/8': 0.5, '1/16': 0.25,
        '3/16': 0.75, '1/4T': 2/3, '1/8T': 1/3,
      };
      return (map[division] ?? 1) / beatsPerSecond;
    },
    expose(name: string, node: NodeRef, param: string, options?: ExposeOptions) {
      exposed.push({ name, nodeId: node.id, param, options: options ?? {} });
    },
  };

  builder(p);

  return {
    name,
    config,
    nodes: _getNodes(),
    connections: _getConnections(),
    exposedParams: exposed,
  };
}
