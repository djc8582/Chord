// Web Audio implementations of Chord's node types.
// Each node wraps Web Audio API primitives and exposes a unified interface.

/** Smoothly ramp an AudioParam without scheduling conflicts. */
function smoothRamp(param: AudioParam, value: number, time: number, rampTime: number = 0.05) {
  param.cancelScheduledValues(time);
  param.setValueAtTime(param.value, time);
  param.linearRampToValueAtTime(value, time + rampTime);
}

export interface ChordNode {
  id: string;
  type: string;
  start(ctx: AudioContext, master: GainNode): void;
  stop(): void;
  setParameter(param: string, value: number, time: number): void;
  getParameter(param: string): number;
  getInput(port: string): AudioNode | AudioParam | null;
  getOutput(port: string): AudioNode | null;
  trigger?(): void;
}

// --- Oscillator Node ---
// Maps to OscillatorNode + GainNode
// Params: frequency, waveform (0=sine,1=sawtooth,2=square,3=triangle), detune, gain
// Output: "out"

class OscillatorChordNode implements ChordNode {
  id: string;
  type = 'oscillator';
  private osc: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('frequency', 440);
    this.params.set('waveform', 0);
    this.params.set('detune', 0);
    this.params.set('gain', 0.5);
  }

  start(ctx: AudioContext): void {
    this.osc = ctx.createOscillator();
    this.gainNode = ctx.createGain();

    this.osc.frequency.value = this.params.get('frequency')!;
    this.osc.detune.value = this.params.get('detune')!;
    this.gainNode.gain.value = this.params.get('gain')!;
    this.applyWaveform();

    this.osc.connect(this.gainNode);
    this.osc.start();
  }

  stop(): void {
    try { this.osc?.stop(); } catch { /* already stopped */ }
    this.osc?.disconnect();
    this.gainNode?.disconnect();
    this.osc = null;
    this.gainNode = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.osc || !this.gainNode) return;
    switch (param) {
      case 'frequency':
        smoothRamp(this.osc.frequency, value, time);
        break;
      case 'waveform':
        this.applyWaveform();
        break;
      case 'detune':
        smoothRamp(this.osc.detune, value, time);
        break;
      case 'gain':
        smoothRamp(this.gainNode.gain, value, time);
        break;
    }
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(): AudioNode | AudioParam | null {
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.gainNode;
    return null;
  }

  private applyWaveform(): void {
    if (!this.osc) return;
    const wf = Math.round(this.params.get('waveform') ?? 0);
    const types: OscillatorType[] = ['sine', 'sawtooth', 'square', 'triangle'];
    this.osc.type = types[Math.min(wf, types.length - 1)] ?? 'sine';
  }
}

// --- Filter Node ---
// Maps to BiquadFilterNode
// Params: cutoff (-> frequency), resonance (-> Q), mode (0=lowpass,1=highpass,2=bandpass)
// Input: "in", "cutoff_mod" (-> frequency AudioParam)
// Output: "out"

class FilterChordNode implements ChordNode {
  id: string;
  type = 'filter';
  private filter: BiquadFilterNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('cutoff', 2000);
    this.params.set('resonance', 1);
    this.params.set('mode', 0);
  }

  start(ctx: AudioContext): void {
    this.filter = ctx.createBiquadFilter();
    this.filter.frequency.value = this.params.get('cutoff')!;
    this.filter.Q.value = this.params.get('resonance')!;
    this.applyMode();
  }

  stop(): void {
    this.filter?.disconnect();
    this.filter = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.filter) return;
    switch (param) {
      case 'cutoff':
        smoothRamp(this.filter.frequency, value, time);
        break;
      case 'resonance':
        smoothRamp(this.filter.Q, value, time);
        break;
      case 'mode':
        this.applyMode();
        break;
    }
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(port: string): AudioNode | AudioParam | null {
    if (port === 'in') return this.filter;
    if (port === 'cutoff_mod') return this.filter?.frequency ?? null;
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.filter;
    return null;
  }

  private applyMode(): void {
    if (!this.filter) return;
    const mode = Math.round(this.params.get('mode') ?? 0);
    const types: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass'];
    this.filter.type = types[Math.min(mode, types.length - 1)] ?? 'lowpass';
  }
}

// --- Gain Node ---
// Params: gain
// Input: "in", Output: "out"

class GainChordNode implements ChordNode {
  id: string;
  type = 'gain';
  private gainNode: GainNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('gain', 1);
  }

  start(ctx: AudioContext): void {
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.params.get('gain')!;
  }

  stop(): void {
    this.gainNode?.disconnect();
    this.gainNode = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.gainNode) return;
    if (param === 'gain') {
      smoothRamp(this.gainNode.gain, value, time);
    }
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(port: string): AudioNode | AudioParam | null {
    if (port === 'in') return this.gainNode;
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.gainNode;
    return null;
  }
}

// --- Delay Node ---
// Maps to DelayNode + feedback GainNode + wet/dry mixing
// Params: time, feedback, mix
// Input: "in", Output: "out"

class DelayChordNode implements ChordNode {
  id: string;
  type = 'delay';
  private inputGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private feedbackGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private outputGain: GainNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('time', 0.3);
    this.params.set('feedback', 0.3);
    this.params.set('mix', 0.3);
  }

  start(ctx: AudioContext): void {
    this.inputGain = ctx.createGain();
    this.delayNode = ctx.createDelay(5.0);
    this.feedbackGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.outputGain = ctx.createGain();

    this.delayNode.delayTime.value = this.params.get('time')!;
    this.feedbackGain.gain.value = this.params.get('feedback')!;
    const mix = this.params.get('mix')!;
    this.wetGain.gain.value = mix;
    this.dryGain.gain.value = 1 - mix;

    // Routing: input -> dry -> output
    //          input -> delay -> wet -> output
    //          delay -> feedback -> delay
    this.inputGain.connect(this.dryGain);
    this.inputGain.connect(this.delayNode);
    this.delayNode.connect(this.wetGain);
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);
    this.wetGain.connect(this.outputGain);
    this.dryGain.connect(this.outputGain);
  }

  stop(): void {
    this.inputGain?.disconnect();
    this.delayNode?.disconnect();
    this.feedbackGain?.disconnect();
    this.wetGain?.disconnect();
    this.dryGain?.disconnect();
    this.outputGain?.disconnect();
    this.inputGain = null;
    this.delayNode = null;
    this.feedbackGain = null;
    this.wetGain = null;
    this.dryGain = null;
    this.outputGain = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.delayNode || !this.feedbackGain || !this.wetGain || !this.dryGain) return;
    switch (param) {
      case 'time':
        smoothRamp(this.delayNode.delayTime, value, time);
        break;
      case 'feedback':
        smoothRamp(this.feedbackGain.gain, Math.min(value, 0.95), time);
        break;
      case 'mix':
        smoothRamp(this.wetGain.gain, value, time);
        smoothRamp(this.dryGain.gain, 1 - value, time);
        break;
    }
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(port: string): AudioNode | AudioParam | null {
    if (port === 'in') return this.inputGain;
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.outputGain;
    return null;
  }
}

// --- Reverb Node ---
// Maps to ConvolverNode with programmatic IR + wet/dry mix
// Params: room_size, damping, mix
// Input: "in", Output: "out"

class ReverbChordNode implements ChordNode {
  id: string;
  type = 'reverb';
  private ctx: AudioContext | null = null;
  private inputGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private outputGain: GainNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('room_size', 0.5);
    this.params.set('damping', 0.5);
    this.params.set('mix', 0.3);
  }

  start(ctx: AudioContext): void {
    this.ctx = ctx;
    this.inputGain = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.wetGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.outputGain = ctx.createGain();

    const mix = this.params.get('mix')!;
    this.wetGain.gain.value = mix;
    this.dryGain.gain.value = 1 - mix;

    this.buildIR();

    // Routing: input -> dry -> output
    //          input -> convolver -> wet -> output
    this.inputGain.connect(this.dryGain);
    this.inputGain.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.outputGain);
    this.dryGain.connect(this.outputGain);
  }

  stop(): void {
    this.inputGain?.disconnect();
    this.convolver?.disconnect();
    this.wetGain?.disconnect();
    this.dryGain?.disconnect();
    this.outputGain?.disconnect();
    this.inputGain = null;
    this.convolver = null;
    this.wetGain = null;
    this.dryGain = null;
    this.outputGain = null;
    this.ctx = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.wetGain || !this.dryGain) return;
    switch (param) {
      case 'room_size':
      case 'damping':
        this.buildIR();
        break;
      case 'mix':
        smoothRamp(this.wetGain.gain, value, time);
        smoothRamp(this.dryGain.gain, 1 - value, time);
        break;
    }
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(port: string): AudioNode | AudioParam | null {
    if (port === 'in') return this.inputGain;
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.outputGain;
    return null;
  }

  private buildIR(): void {
    if (!this.ctx || !this.convolver) return;
    const roomSize = this.params.get('room_size') ?? 0.5;
    const damping = this.params.get('damping') ?? 0.5;
    const duration = 1 + roomSize * 4; // 1s to 5s
    const decay = 0.5 + roomSize * 3;  // faster or slower decay
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // Exponential decay with damping (high freq rolloff simulated by filtering randomness)
        const t = i / sampleRate;
        const envelope = Math.exp(-t / (decay / 3));
        // Damping: reduce high-frequency content over time by smoothing
        const noise = Math.random() * 2 - 1;
        data[i] = noise * envelope * (1 - damping * 0.5 * t / duration);
      }
    }

    this.convolver.buffer = buffer;
  }
}

// --- LFO Node ---
// Maps to OscillatorNode + GainNode (depth) producing a unipolar 0-1 signal
// Params: rate, depth, waveform
// Output: "out"

class LFOChordNode implements ChordNode {
  id: string;
  type = 'lfo';
  private osc: OscillatorNode | null = null;
  private depthGain: GainNode | null = null;
  private offsetNode: ConstantSourceNode | null = null;
  private outputGain: GainNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('rate', 1);
    this.params.set('depth', 0.5);
    this.params.set('waveform', 0);
  }

  start(ctx: AudioContext): void {
    // LFO output = offset + osc * depth
    // To produce unipolar 0-1: offset=0.5, osc amplitude=0.5*depth
    this.osc = ctx.createOscillator();
    this.depthGain = ctx.createGain();
    this.offsetNode = ctx.createConstantSource();
    this.outputGain = ctx.createGain();

    const depth = this.params.get('depth')!;
    this.osc.frequency.value = this.params.get('rate')!;
    this.applyWaveform();
    this.depthGain.gain.value = 0.5 * depth;
    this.offsetNode.offset.value = 0.5;
    this.outputGain.gain.value = 1;

    // osc -> depthGain -> outputGain
    // offsetNode -> outputGain
    this.osc.connect(this.depthGain);
    this.depthGain.connect(this.outputGain);
    this.offsetNode.connect(this.outputGain);

    this.osc.start();
    this.offsetNode.start();
  }

  stop(): void {
    try { this.osc?.stop(); } catch { /* already stopped */ }
    try { this.offsetNode?.stop(); } catch { /* already stopped */ }
    this.osc?.disconnect();
    this.depthGain?.disconnect();
    this.offsetNode?.disconnect();
    this.outputGain?.disconnect();
    this.osc = null;
    this.depthGain = null;
    this.offsetNode = null;
    this.outputGain = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.osc || !this.depthGain) return;
    switch (param) {
      case 'rate':
        smoothRamp(this.osc.frequency, value, time);
        break;
      case 'depth':
        smoothRamp(this.depthGain.gain, 0.5 * value, time);
        break;
      case 'waveform':
        this.applyWaveform();
        break;
    }
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(): AudioNode | AudioParam | null {
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.outputGain;
    return null;
  }

  private applyWaveform(): void {
    if (!this.osc) return;
    const wf = Math.round(this.params.get('waveform') ?? 0);
    const types: OscillatorType[] = ['sine', 'sawtooth', 'square', 'triangle'];
    this.osc.type = types[Math.min(wf, types.length - 1)] ?? 'sine';
  }
}

// --- Noise Node ---
// Maps to AudioBufferSourceNode with a looping white noise buffer
// Params: gain
// Output: "out"

class NoiseChordNode implements ChordNode {
  id: string;
  type = 'noise';
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('gain', 0.1);
  }

  start(ctx: AudioContext): void {
    // Create white noise buffer (2 seconds, looping)
    const bufferLength = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferLength, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferLength; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.source = ctx.createBufferSource();
    this.source.buffer = noiseBuffer;
    this.source.loop = true;

    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.params.get('gain')!;

    this.source.connect(this.gainNode);
    this.source.start();
  }

  stop(): void {
    try { this.source?.stop(); } catch { /* already stopped */ }
    this.source?.disconnect();
    this.gainNode?.disconnect();
    this.source = null;
    this.gainNode = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.gainNode) return;
    if (param === 'gain') {
      smoothRamp(this.gainNode.gain, value, time);
    }
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(): AudioNode | AudioParam | null {
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.gainNode;
    return null;
  }
}

// --- Output Node ---
// Connects input to the master gain
// Input: "in"

class OutputChordNode implements ChordNode {
  id: string;
  type = 'output';
  private inputGain: GainNode | null = null;

  constructor(id: string) {
    this.id = id;
  }

  start(ctx: AudioContext, master: GainNode): void {
    this.inputGain = ctx.createGain();
    this.inputGain.connect(master);
  }

  stop(): void {
    this.inputGain?.disconnect();
    this.inputGain = null;
  }

  setParameter(): void {
    // No parameters
  }

  getParameter(): number {
    return 0;
  }

  getInput(port: string): AudioNode | AudioParam | null {
    if (port === 'in') return this.inputGain;
    return null;
  }

  getOutput(): AudioNode | null {
    return null;
  }
}

// --- Mixer Node ---
// Sums multiple inputs into one output
// Inputs: "in1", "in2", "in3", "in4"
// Output: "out"

class MixerChordNode implements ChordNode {
  id: string;
  type = 'mixer';
  private inputGains: Map<string, GainNode> = new Map();
  private outputGain: GainNode | null = null;

  constructor(id: string) {
    this.id = id;
  }

  start(ctx: AudioContext): void {
    this.outputGain = ctx.createGain();
    for (const port of ['in1', 'in2', 'in3', 'in4']) {
      const g = ctx.createGain();
      g.connect(this.outputGain);
      this.inputGains.set(port, g);
    }
  }

  stop(): void {
    for (const g of this.inputGains.values()) g.disconnect();
    this.outputGain?.disconnect();
    this.inputGains.clear();
    this.outputGain = null;
  }

  setParameter(): void {
    // No user-facing parameters on the mixer
  }

  getParameter(): number {
    return 0;
  }

  getInput(port: string): AudioNode | AudioParam | null {
    return this.inputGains.get(port) ?? null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.outputGain;
    return null;
  }
}

// --- Kick Drum Node ---
// Custom synthesis: OscillatorNode with pitch sweep + GainNode amplitude decay
// Params: pitch_start, pitch_end, decay, drive
// Output: "out"

class KickDrumChordNode implements ChordNode {
  id: string;
  type = 'kick_drum';
  private ctx: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('pitch_start', 160);
    this.params.set('pitch_end', 40);
    this.params.set('decay', 0.4);
    this.params.set('drive', 0);
  }

  start(ctx: AudioContext): void {
    this.ctx = ctx;
    this.outputGain = ctx.createGain();
  }

  stop(): void {
    this.outputGain?.disconnect();
    this.outputGain = null;
    this.ctx = null;
  }

  trigger(): void {
    if (!this.ctx || !this.outputGain) return;
    const now = this.ctx.currentTime;
    const pitchStart = this.params.get('pitch_start')!;
    const pitchEnd = this.params.get('pitch_end')!;
    const decay = this.params.get('decay')!;
    const drive = this.params.get('drive')!;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitchStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(pitchEnd, 1), now + decay * 0.5);

    gain.gain.setValueAtTime(1 + drive, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

    osc.connect(gain);
    gain.connect(this.outputGain);
    osc.start(now);
    osc.stop(now + decay + 0.05);
  }

  setParameter(param: string, value: number): void {
    this.params.set(param, value);
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(): AudioNode | AudioParam | null {
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.outputGain;
    return null;
  }
}

// --- Snare Drum Node ---
// Noise + oscillator + gains with trigger
// Params: tone, snap, decay
// Output: "out"

class SnareDrumChordNode implements ChordNode {
  id: string;
  type = 'snare_drum';
  private ctx: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('tone', 200);
    this.params.set('snap', 0.5);
    this.params.set('decay', 0.2);
  }

  start(ctx: AudioContext): void {
    this.ctx = ctx;
    this.outputGain = ctx.createGain();

    // Pre-generate noise buffer
    const length = ctx.sampleRate * 0.5;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  stop(): void {
    this.outputGain?.disconnect();
    this.outputGain = null;
    this.ctx = null;
    this.noiseBuffer = null;
  }

  trigger(): void {
    if (!this.ctx || !this.outputGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const tone = this.params.get('tone')!;
    const snap = this.params.get('snap')!;
    const decay = this.params.get('decay')!;

    // Tonal component
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(tone, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(tone * 0.5, 1), now + decay);
    oscGain.gain.setValueAtTime(0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + decay * 0.8);
    osc.connect(oscGain);
    oscGain.connect(this.outputGain);
    osc.start(now);
    osc.stop(now + decay + 0.05);

    // Noise component
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 2000;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(snap, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + decay);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.outputGain);
    noise.start(now);
    noise.stop(now + decay + 0.05);
  }

  setParameter(param: string, value: number): void {
    this.params.set(param, value);
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(): AudioNode | AudioParam | null {
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.outputGain;
    return null;
  }
}

// --- Hi-Hat Node ---
// Noise + bandpass filter + gain with trigger
// Params: tone, decay, openness
// Output: "out"

class HiHatChordNode implements ChordNode {
  id: string;
  type = 'hi_hat';
  private ctx: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('tone', 8000);
    this.params.set('decay', 0.08);
    this.params.set('openness', 0);
  }

  start(ctx: AudioContext): void {
    this.ctx = ctx;
    this.outputGain = ctx.createGain();

    const length = ctx.sampleRate * 0.5;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  stop(): void {
    this.outputGain?.disconnect();
    this.outputGain = null;
    this.ctx = null;
    this.noiseBuffer = null;
  }

  trigger(): void {
    if (!this.ctx || !this.outputGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const tone = this.params.get('tone')!;
    const decay = this.params.get('decay')!;
    const openness = this.params.get('openness')!;
    const effectiveDecay = decay + openness * 0.3;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = tone;
    bandpass.Q.value = 1;

    const highpass = this.ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 5000;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + effectiveDecay);

    noise.connect(bandpass);
    bandpass.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.outputGain);
    noise.start(now);
    noise.stop(now + effectiveDecay + 0.05);
  }

  setParameter(param: string, value: number): void {
    this.params.set(param, value);
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(): AudioNode | AudioParam | null {
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.outputGain;
    return null;
  }
}

// --- Compressor Node ---
// Wraps DynamicsCompressorNode
// Params: threshold (dB), ratio, attack (s), release (s), knee (dB)
// Input: "in", Output: "out"

class CompressorChordNode implements ChordNode {
  id: string;
  type = 'compressor';
  private compressor: DynamicsCompressorNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('threshold', -12);
    this.params.set('ratio', 4);
    this.params.set('attack', 0.01);
    this.params.set('release', 0.15);
    this.params.set('knee', 6);
  }

  start(ctx: AudioContext): void {
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = this.params.get('threshold')!;
    this.compressor.ratio.value = this.params.get('ratio')!;
    this.compressor.attack.value = this.params.get('attack')!;
    this.compressor.release.value = this.params.get('release')!;
    this.compressor.knee.value = this.params.get('knee')!;
  }

  stop(): void {
    this.compressor?.disconnect();
    this.compressor = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.compressor) return;
    switch (param) {
      case 'threshold':
        smoothRamp(this.compressor.threshold, value, time);
        break;
      case 'ratio':
        smoothRamp(this.compressor.ratio, value, time);
        break;
      case 'attack':
        smoothRamp(this.compressor.attack, value, time);
        break;
      case 'release':
        smoothRamp(this.compressor.release, value, time);
        break;
      case 'knee':
        smoothRamp(this.compressor.knee, value, time);
        break;
    }
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(port: string): AudioNode | AudioParam | null {
    if (port === 'in') return this.compressor;
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.compressor;
    return null;
  }
}

// --- Distortion Node ---
// Wraps WaveShaperNode with drive curve + wet/dry mix
// Params: drive (0-1), mix (0-1)
// Input: "in", Output: "out"

function makeSoftClipCurve(drive: number): Float32Array {
  const samples = 256;
  const curve = new Float32Array(samples);
  const k = drive * 50 + 1;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

class DistortionChordNode implements ChordNode {
  id: string;
  type = 'distortion';
  private inputGain: GainNode | null = null;
  private waveshaper: WaveShaperNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private outputGain: GainNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('drive', 0.2);
    this.params.set('mix', 0.5);
  }

  start(ctx: AudioContext): void {
    this.inputGain = ctx.createGain();
    this.waveshaper = ctx.createWaveShaper();
    this.wetGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.outputGain = ctx.createGain();

    const drive = this.params.get('drive')!;
    const mix = this.params.get('mix')!;
    this.waveshaper.curve = makeSoftClipCurve(drive) as Float32Array<ArrayBuffer>;
    this.waveshaper.oversample = '2x';
    this.wetGain.gain.value = mix;
    this.dryGain.gain.value = 1 - mix;

    // Routing: input -> dry -> output
    //          input -> waveshaper -> wet -> output
    this.inputGain.connect(this.dryGain);
    this.inputGain.connect(this.waveshaper);
    this.waveshaper.connect(this.wetGain);
    this.wetGain.connect(this.outputGain);
    this.dryGain.connect(this.outputGain);
  }

  stop(): void {
    this.inputGain?.disconnect();
    this.waveshaper?.disconnect();
    this.wetGain?.disconnect();
    this.dryGain?.disconnect();
    this.outputGain?.disconnect();
    this.inputGain = null;
    this.waveshaper = null;
    this.wetGain = null;
    this.dryGain = null;
    this.outputGain = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.waveshaper || !this.wetGain || !this.dryGain) return;
    switch (param) {
      case 'drive':
        this.waveshaper.curve = makeSoftClipCurve(value) as Float32Array<ArrayBuffer>;
        break;
      case 'mix':
        smoothRamp(this.wetGain.gain, value, time);
        smoothRamp(this.dryGain.gain, 1 - value, time);
        break;
    }
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(port: string): AudioNode | AudioParam | null {
    if (port === 'in') return this.inputGain;
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.outputGain;
    return null;
  }
}

// --- Chorus Node ---
// Short modulated delay mixed with dry signal
// Params: rate (Hz), depth (0-1), mix (0-1)
// Input: "in", Output: "out"

class ChorusChordNode implements ChordNode {
  id: string;
  type = 'chorus';
  private inputGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private outputGain: GainNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('rate', 0.8);
    this.params.set('depth', 0.3);
    this.params.set('mix', 0.2);
  }

  start(ctx: AudioContext): void {
    this.inputGain = ctx.createGain();
    this.delayNode = ctx.createDelay(0.1);
    this.lfo = ctx.createOscillator();
    this.lfoGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.outputGain = ctx.createGain();

    const rate = this.params.get('rate')!;
    const depth = this.params.get('depth')!;
    const mix = this.params.get('mix')!;

    // Delay oscillates around 7ms
    this.delayNode.delayTime.value = 0.007;
    this.lfo.frequency.value = rate;
    this.lfo.type = 'sine';
    // LFO amplitude controls how much the delay time wobbles (depth * 3ms)
    this.lfoGain.gain.value = depth * 0.003;
    this.wetGain.gain.value = mix;
    this.dryGain.gain.value = 1 - mix;

    // LFO -> delay time modulation
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delayNode.delayTime);

    // Routing: input -> dry -> output
    //          input -> delay -> wet -> output
    this.inputGain.connect(this.dryGain);
    this.inputGain.connect(this.delayNode);
    this.delayNode.connect(this.wetGain);
    this.wetGain.connect(this.outputGain);
    this.dryGain.connect(this.outputGain);

    this.lfo.start();
  }

  stop(): void {
    try { this.lfo?.stop(); } catch { /* already stopped */ }
    this.inputGain?.disconnect();
    this.delayNode?.disconnect();
    this.lfo?.disconnect();
    this.lfoGain?.disconnect();
    this.wetGain?.disconnect();
    this.dryGain?.disconnect();
    this.outputGain?.disconnect();
    this.inputGain = null;
    this.delayNode = null;
    this.lfo = null;
    this.lfoGain = null;
    this.wetGain = null;
    this.dryGain = null;
    this.outputGain = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.lfo || !this.lfoGain || !this.wetGain || !this.dryGain) return;
    switch (param) {
      case 'rate':
        smoothRamp(this.lfo.frequency, value, time);
        break;
      case 'depth':
        smoothRamp(this.lfoGain.gain, value * 0.003, time);
        break;
      case 'mix':
        smoothRamp(this.wetGain.gain, value, time);
        smoothRamp(this.dryGain.gain, 1 - value, time);
        break;
    }
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(port: string): AudioNode | AudioParam | null {
    if (port === 'in') return this.inputGain;
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.outputGain;
    return null;
  }
}

// --- Stereo Panner Node ---
// Wraps StereoPannerNode
// Params: pan (-1 to 1)
// Input: "in", Output: "out"

class StereoPannerChordNode implements ChordNode {
  id: string;
  type = 'panner';
  private panner: StereoPannerNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('pan', 0);
  }

  start(ctx: AudioContext): void {
    this.panner = ctx.createStereoPanner();
    this.panner.pan.value = this.params.get('pan')!;
  }

  stop(): void {
    this.panner?.disconnect();
    this.panner = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.panner) return;
    if (param === 'pan') {
      smoothRamp(this.panner.pan, value, time);
    }
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(port: string): AudioNode | AudioParam | null {
    if (port === 'in') return this.panner;
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.panner;
    return null;
  }
}

// --- Limiter Node ---
// DynamicsCompressorNode with high ratio (20:1) acting as a limiter
// Params: ceiling (dB), release (s)
// Input: "in", Output: "out"

class LimiterChordNode implements ChordNode {
  id: string;
  type = 'limiter';
  private compressor: DynamicsCompressorNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('ceiling', -1);
    this.params.set('release', 0.1);
  }

  start(ctx: AudioContext): void {
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = this.params.get('ceiling')!;
    this.compressor.ratio.value = 20;
    this.compressor.knee.value = 0;
    this.compressor.attack.value = 0.001;
    this.compressor.release.value = this.params.get('release')!;
  }

  stop(): void {
    this.compressor?.disconnect();
    this.compressor = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.compressor) return;
    switch (param) {
      case 'ceiling':
        smoothRamp(this.compressor.threshold, value, time);
        break;
      case 'release':
        smoothRamp(this.compressor.release, value, time);
        break;
    }
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(port: string): AudioNode | AudioParam | null {
    if (port === 'in') return this.compressor;
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.compressor;
    return null;
  }
}

// --- Bitcrusher Node ---
// Sample rate + bit depth reduction via ScriptProcessorNode
// Params: bits (1-16), rate (fraction 0-1), mix (0-1)
// Input: "in", Output: "out"

class BitcrusherChordNode implements ChordNode {
  id: string;
  type = 'bitcrusher';
  private inputGain: GainNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private outputGain: GainNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('bits', 16);
    this.params.set('rate', 1);
    this.params.set('mix', 0.5);
  }

  start(ctx: AudioContext): void {
    this.inputGain = ctx.createGain();
    this.processor = ctx.createScriptProcessor(4096, 1, 1);
    this.wetGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.outputGain = ctx.createGain();

    const mix = this.params.get('mix')!;
    this.wetGain.gain.value = mix;
    this.dryGain.gain.value = 1 - mix;

    let lastSample = 0;
    let sampleCounter = 0;

    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const output = e.outputBuffer.getChannelData(0);
      const bits = this.params.get('bits')!;
      const rate = this.params.get('rate')!;
      const levels = Math.pow(2, bits);
      const step = Math.max(1, Math.round(1 / rate));

      for (let i = 0; i < input.length; i++) {
        sampleCounter++;
        if (sampleCounter >= step) {
          sampleCounter = 0;
          // Bit depth reduction
          lastSample = Math.round(input[i] * levels) / levels;
        }
        output[i] = lastSample;
      }
    };

    // Routing: input -> dry -> output
    //          input -> processor -> wet -> output
    this.inputGain.connect(this.dryGain);
    this.inputGain.connect(this.processor);
    this.processor.connect(this.wetGain);
    this.wetGain.connect(this.outputGain);
    this.dryGain.connect(this.outputGain);
  }

  stop(): void {
    if (this.processor) {
      this.processor.onaudioprocess = null;
    }
    this.inputGain?.disconnect();
    this.processor?.disconnect();
    this.wetGain?.disconnect();
    this.dryGain?.disconnect();
    this.outputGain?.disconnect();
    this.inputGain = null;
    this.processor = null;
    this.wetGain = null;
    this.dryGain = null;
    this.outputGain = null;
  }

  setParameter(param: string, value: number, time: number): void {
    this.params.set(param, value);
    if (!this.wetGain || !this.dryGain) return;
    if (param === 'mix') {
      smoothRamp(this.wetGain.gain, value, time);
      smoothRamp(this.dryGain.gain, 1 - value, time);
    }
    // bits and rate are read directly in the onaudioprocess callback
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(port: string): AudioNode | AudioParam | null {
    if (port === 'in') return this.inputGain;
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.outputGain;
    return null;
  }
}

// --- Clap Node ---
// Multiple noise bursts for hand-clap percussion
// Params: decay, tone (Hz), spread (s)
// Output: "out"

class ClapChordNode implements ChordNode {
  id: string;
  type = 'clap';
  private ctx: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('decay', 0.15);
    this.params.set('tone', 1000);
    this.params.set('spread', 0.012);
  }

  start(ctx: AudioContext): void {
    this.ctx = ctx;
    this.outputGain = ctx.createGain();

    // Pre-generate noise buffer
    const length = ctx.sampleRate * 0.5;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  stop(): void {
    this.outputGain?.disconnect();
    this.outputGain = null;
    this.ctx = null;
    this.noiseBuffer = null;
  }

  trigger(): void {
    if (!this.ctx || !this.outputGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const decay = this.params.get('decay')!;
    const tone = this.params.get('tone')!;
    const spread = this.params.get('spread')!;

    // Schedule 4 short noise bursts spaced by `spread` seconds
    for (let burst = 0; burst < 4; burst++) {
      const startTime = now + burst * spread;
      const burstDuration = burst === 3 ? decay : spread * 0.8;

      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = tone;
      bandpass.Q.value = 2;

      const gain = this.ctx.createGain();
      if (burst === 3) {
        // Final burst has the main decay envelope
        gain.gain.setValueAtTime(0.6, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + decay);
      } else {
        // Initial bursts are short staccato hits
        gain.gain.setValueAtTime(0.5, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + burstDuration);
      }

      noise.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(this.outputGain);
      noise.start(startTime);
      noise.stop(startTime + Math.max(burstDuration, decay) + 0.05);
    }
  }

  setParameter(param: string, value: number): void {
    this.params.set(param, value);
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(): AudioNode | AudioParam | null {
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.outputGain;
    return null;
  }
}

// --- Tom Node ---
// Pitched percussion: sine oscillator with pitch drop + amplitude decay
// Params: pitch (Hz), decay (s)
// Output: "out"

class TomChordNode implements ChordNode {
  id: string;
  type = 'tom';
  private ctx: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private params: Map<string, number> = new Map();

  constructor(id: string) {
    this.id = id;
    this.params.set('pitch', 120);
    this.params.set('decay', 0.3);
  }

  start(ctx: AudioContext): void {
    this.ctx = ctx;
    this.outputGain = ctx.createGain();
  }

  stop(): void {
    this.outputGain?.disconnect();
    this.outputGain = null;
    this.ctx = null;
  }

  trigger(): void {
    if (!this.ctx || !this.outputGain) return;
    const now = this.ctx.currentTime;
    const pitch = this.params.get('pitch')!;
    const decay = this.params.get('decay')!;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(pitch * 0.4, 1), now + decay * 0.6);

    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

    osc.connect(gain);
    gain.connect(this.outputGain);
    osc.start(now);
    osc.stop(now + decay + 0.05);
  }

  setParameter(param: string, value: number): void {
    this.params.set(param, value);
  }

  getParameter(param: string): number {
    return this.params.get(param) ?? 0;
  }

  getInput(): AudioNode | AudioParam | null {
    return null;
  }

  getOutput(port: string): AudioNode | null {
    if (port === 'out') return this.outputGain;
    return null;
  }
}

// --- Alias Map ---
const NODE_ALIASES: Record<string, string> = {
  // Canonical names
  oscillator: 'oscillator', filter: 'filter', gain: 'gain', delay: 'delay',
  reverb: 'reverb', lfo: 'lfo', noise: 'noise', output: 'output', mixer: 'mixer',
  kick_drum: 'kick_drum', snare_drum: 'snare_drum', hi_hat: 'hi_hat',
  compressor: 'compressor', distortion: 'distortion', chorus: 'chorus',
  panner: 'panner', limiter: 'limiter', bitcrusher: 'bitcrusher',
  clap: 'clap', tom: 'tom',
  // camelCase aliases
  kickDrum: 'kick_drum', snareDrum: 'snare_drum', hiHat: 'hi_hat',
  // Short aliases
  osc: 'oscillator', filt: 'filter', lpf: 'filter', hpf: 'filter',
  vol: 'gain', amp: 'gain',
  echo: 'delay', verb: 'reverb', space: 'reverb',
  kick: 'kick_drum', snare: 'snare_drum', hat: 'hi_hat', hh: 'hi_hat',
  comp: 'compressor', dynamics: 'compressor',
  dist: 'distortion', saturation: 'distortion', waveshaper: 'distortion', overdrive: 'distortion', drive: 'distortion',
  pan: 'panner', stereo: 'panner',
  crush: 'bitcrusher',
  out: 'output', master: 'output',
};

/** Resolve a node type name through aliases. Returns canonical name or null. */
export function resolveNodeType(type: string): string | null {
  return NODE_ALIASES[type] ?? null;
}

/** Get all canonical node type names. */
export function getNodeTypes(): string[] {
  return [...new Set(Object.values(NODE_ALIASES))];
}

/** Find similar node type names for error messages. */
function findSimilarTypes(type: string): string[] {
  const lower = type.toLowerCase();
  return Object.keys(NODE_ALIASES).filter(k => {
    if (k.includes(lower) || lower.includes(k)) return true;
    // Simple Levenshtein-ish: check if >60% of chars match
    let matches = 0;
    for (const c of lower) { if (k.includes(c)) matches++; }
    return matches / Math.max(lower.length, k.length) > 0.6;
  }).slice(0, 5);
}

// --- Factory ---

export function createWebAudioNode(type: string, id: string): ChordNode {
  const canonical = resolveNodeType(type);
  if (!canonical) {
    const similar = findSimilarTypes(type);
    throw new Error(
      `Unknown node type "${type}". ` +
      (similar.length > 0 ? `Did you mean: ${similar.join(', ')}? ` : '') +
      `Available: ${getNodeTypes().join(', ')}`
    );
  }

  switch (canonical) {
    case 'oscillator': return new OscillatorChordNode(id);
    case 'filter': return new FilterChordNode(id);
    case 'gain': return new GainChordNode(id);
    case 'delay': return new DelayChordNode(id);
    case 'reverb': return new ReverbChordNode(id);
    case 'lfo': return new LFOChordNode(id);
    case 'noise': return new NoiseChordNode(id);
    case 'output': return new OutputChordNode(id);
    case 'mixer': return new MixerChordNode(id);
    case 'kick_drum': return new KickDrumChordNode(id);
    case 'snare_drum': return new SnareDrumChordNode(id);
    case 'hi_hat': return new HiHatChordNode(id);
    case 'compressor': return new CompressorChordNode(id);
    case 'distortion': return new DistortionChordNode(id);
    case 'chorus': return new ChorusChordNode(id);
    case 'panner': return new StereoPannerChordNode(id);
    case 'limiter': return new LimiterChordNode(id);
    case 'bitcrusher': return new BitcrusherChordNode(id);
    case 'clap': return new ClapChordNode(id);
    case 'tom': return new TomChordNode(id);
    default: throw new Error(`Node type "${canonical}" registered but not implemented`);
  }
}
