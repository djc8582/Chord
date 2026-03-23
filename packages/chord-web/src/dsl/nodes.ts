import type { NodeRef, NodeDef, ConnectionDef } from './types.js';

// Global accumulators (reset by each patch() call)
let _nodes: NodeDef[] = [];
let _connections: ConnectionDef[] = [];
let _nextId = 1;

export function _reset() {
  _nodes = [];
  _connections = [];
  _nextId = 1;
}

export function _getNodes() { return _nodes; }
export function _getConnections() { return _connections; }

function createNodeRef(id: string, type: string, defaultOutPort: string = 'out', defaultInPort: string = 'in'): NodeRef {
  return {
    id,
    type,
    connect(target: NodeRef, fromPort?: string, toPort?: string): NodeRef {
      _connections.push({
        fromId: id,
        fromPort: fromPort ?? defaultOutPort,
        toId: target.id,
        toPort: toPort ?? defaultInPort,
      });
      return target; // enables chaining
    },
    modulate(param: string, source: NodeRef, _depth?: number) {
      _connections.push({
        fromId: source.id,
        fromPort: 'out',
        toId: id,
        toPort: `${param}_mod`,
      });
    },
    set(param: string, value: number): NodeRef {
      const node = _nodes.find(n => n.id === id);
      if (node) node.params[param] = value;
      return this;
    },
  };
}

function makeNode(type: string, params: Record<string, number>, outPort: string = 'out', inPort: string = 'in'): NodeRef {
  const id = `${type}_${_nextId++}`;
  _nodes.push({ id, type, params: { ...params } });
  return createNodeRef(id, type, outPort, inPort);
}

// ─── Node factories ───

export interface OscParams { waveform?: 'sine' | 'saw' | 'square' | 'triangle'; freq?: number; detune?: number; }
export function osc(p: OscParams = {}): NodeRef {
  const waveformMap = { sine: 0, saw: 1, square: 2, triangle: 3 };
  return makeNode('oscillator', {
    frequency: p.freq ?? 440,
    waveform: waveformMap[p.waveform ?? 'sine'],
    detune: p.detune ?? 0,
  });
}

export interface FilterParams { type?: 'lowpass' | 'highpass' | 'bandpass'; cutoff?: number; resonance?: number; }
export function filter(p: FilterParams = {}): NodeRef {
  const modeMap = { lowpass: 0, highpass: 1, bandpass: 2 };
  return makeNode('filter', {
    cutoff: p.cutoff ?? 1000,
    resonance: p.resonance ?? 0.707,
    mode: modeMap[p.type ?? 'lowpass'],
  });
}

export function gain(p: { level?: number; gain?: number } = {}): NodeRef {
  // Accept dB (level) or linear (gain)
  const g = p.gain ?? (p.level !== undefined ? Math.pow(10, p.level / 20) : 1.0);
  return makeNode('gain', { gain: g });
}

export interface DelayParams { time?: number | string; feedback?: number; mix?: number; }
export function delay(p: DelayParams = {}): NodeRef {
  const time = typeof p.time === 'number' ? p.time : 0.375;
  return makeNode('delay', { time, feedback: p.feedback ?? 0.3, mix: p.mix ?? 0.25 });
}

export interface ReverbParams { decay?: number; roomSize?: number; damping?: number; mix?: number; }
export function reverb(p: ReverbParams = {}): NodeRef {
  const roomSize = p.roomSize ?? (p.decay ? Math.min(p.decay / 5, 1) : 0.5);
  return makeNode('reverb', { room_size: roomSize, damping: p.damping ?? 0.5, mix: p.mix ?? 0.3 });
}

export function noise(p: { color?: 'white' | 'pink' | 'brown' } = {}): NodeRef {
  const colorMap = { white: 0, pink: 1, brown: 2 };
  return makeNode('noise', { color: colorMap[p.color ?? 'white'] });
}

export function mixer(): NodeRef {
  return makeNode('mixer', {});
}

export function output(): NodeRef {
  return makeNode('output', {});
}

export interface LfoParams { rate?: number; depth?: number; shape?: 'sine' | 'saw' | 'square' | 'triangle'; }
export function lfo(p: LfoParams = {}): NodeRef {
  const waveformMap = { sine: 0, saw: 1, square: 2, triangle: 3 };
  return makeNode('lfo', { rate: p.rate ?? 1, depth: p.depth ?? 1, waveform: waveformMap[p.shape ?? 'sine'] });
}

export interface EnvelopeParams { attack?: number; decay?: number; sustain?: number; release?: number; }
export function envelope(p: EnvelopeParams = {}): NodeRef {
  return makeNode('envelope', { attack: p.attack ?? 0.01, decay: p.decay ?? 0.1, sustain: p.sustain ?? 0.7, release: p.release ?? 0.3 }, 'out', 'gate');
}

// Drums
export function kickDrum(p: Record<string, number> = {}): NodeRef { return makeNode('kick_drum', p, 'out', 'trigger'); }
export function snareDrum(p: Record<string, number> = {}): NodeRef { return makeNode('snare_drum', p, 'out', 'trigger'); }
export function hiHat(p: Record<string, number> = {}): NodeRef { return makeNode('hi_hat', p, 'out', 'trigger'); }
export function clap(p: Record<string, number> = {}): NodeRef { return makeNode('clap', p, 'out', 'trigger'); }
export function tom(p: Record<string, number> = {}): NodeRef { return makeNode('tom', p, 'out', 'trigger'); }

// Sequencers
export function stepSequencer(p: { steps?: number; gateLength?: number } = {}): NodeRef {
  return makeNode('step_sequencer', { steps: p.steps ?? 8, gate_length: p.gateLength ?? 0.5 }, 'gate', 'clock');
}
export function euclidean(p: { steps?: number; pulses?: number; rotation?: number } = {}): NodeRef {
  return makeNode('euclidean', { steps: p.steps ?? 16, pulses: p.pulses ?? 4, rotation: p.rotation ?? 0 }, 'gate', 'clock');
}
export function markovSequencer(p: { rootNote?: number; scaleType?: number; randomness?: number } = {}): NodeRef {
  return makeNode('markov_sequencer', { root_note: p.rootNote ?? 60, scale_type: p.scaleType ?? 0, randomness: p.randomness ?? 0.3 }, 'freq', 'clock');
}
export function gravitySequencer(p: { gravity?: number; particles?: number; scale?: number } = {}): NodeRef {
  return makeNode('gravity_sequencer', { gravity: p.gravity ?? 1, num_particles: p.particles ?? 4, scale: p.scale ?? 0 }, 'freq', 'clock');
}
export function gameOfLife(p: { density?: number; width?: number; height?: number } = {}): NodeRef {
  return makeNode('game_of_life_sequencer', { density: p.density ?? 0.3, width: p.width ?? 16, height: p.height ?? 8 }, 'freq', 'clock');
}
export function polyrhythm(p: { a?: number; b?: number; c?: number } = {}): NodeRef {
  return makeNode('polyrhythm', { pattern_a: p.a ?? 3, pattern_b: p.b ?? 4, pattern_c: p.c ?? 5 }, 'a', 'clock');
}

// Effects
export function compressor(p: { threshold?: number; ratio?: number } = {}): NodeRef { return makeNode('compressor', { threshold: p.threshold ?? -12, ratio: p.ratio ?? 4 }); }
export function eq(p: { low?: number; mid?: number; high?: number } = {}): NodeRef { return makeNode('eq', { low_gain: p.low ?? 0, mid_gain: p.mid ?? 0, high_gain: p.high ?? 0 }); }
export function chorus(p: { rate?: number; depth?: number; mix?: number } = {}): NodeRef { return makeNode('chorus', { rate: p.rate ?? 1, depth: p.depth ?? 0.5, mix: p.mix ?? 0.5 }); }
export function phaser(p: { rate?: number; depth?: number; mix?: number } = {}): NodeRef { return makeNode('phaser', { rate: p.rate ?? 0.5, depth: p.depth ?? 0.5, mix: p.mix ?? 0.5 }); }
export function waveshaper(p: { drive?: number; mix?: number } = {}): NodeRef { return makeNode('waveshaper', { drive: p.drive ?? 1, mix: p.mix ?? 1 }); }
export function limiter(p: { ceiling?: number } = {}): NodeRef { return makeNode('limiter', { ceiling: p.ceiling ?? -1 }); }
export function granular(p: { grainSize?: number; density?: number; scatter?: number; pitch?: number } = {}): NodeRef {
  return makeNode('granular', { grain_size: p.grainSize ?? 0.05, density: p.density ?? 10, scatter: p.scatter ?? 0, pitch: p.pitch ?? 0, mix: 1 });
}

export type NodeParams = OscParams | FilterParams | DelayParams | ReverbParams | LfoParams | EnvelopeParams;
