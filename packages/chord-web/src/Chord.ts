// Chord — The main class for the @chord/web SDK.
// Mirrors Chord's Rust engine API: addNode, connect, setParameter.
// Runs entirely on the Web Audio API.

import { createWebAudioNode } from './nodes.js';
import type { ChordNode } from './nodes.js';

export interface Connection {
  fromId: string;
  fromPort: string;
  toId: string;
  toPort: string;
}

export class Chord {
  private ctx: AudioContext | null = null;
  private nodes: Map<string, ChordNode> = new Map();
  private connections: Connection[] = [];
  private activeWebAudioConnections: Array<{ source: AudioNode; target: AudioNode | AudioParam }> = [];
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private nextId = 1;
  private _started = false;

  get started(): boolean {
    return this._started;
  }

  /** Create the audio context and start all nodes. */
  async start(): Promise<void> {
    if (this._started) return;

    this.ctx = new AudioContext();

    // Master chain: masterGain -> limiter -> analyser -> destination
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Start all existing nodes
    for (const node of this.nodes.values()) {
      node.start(this.ctx, this.masterGain);
    }

    // Rebuild all connections using Web Audio
    this.rebuildConnections();

    // Fade in
    this.masterGain.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 2);

    this._started = true;
  }

  /** Stop the audio context and all nodes. */
  stop(): void {
    if (!this._started || !this.ctx || !this.masterGain) return;

    this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);

    setTimeout(() => {
      for (const node of this.nodes.values()) {
        node.stop();
      }
      this.activeWebAudioConnections = [];
      this.ctx?.close();
      this.ctx = null;
      this.masterGain = null;
      this.analyser = null;
      this.limiter = null;
      this._started = false;
    }, 600);
  }

  /** Add a node of the given type. Returns the node ID. */
  addNode(type: string): string {
    const id = `node-${this.nextId++}`;
    const node = createWebAudioNode(type, id);
    this.nodes.set(id, node);
    if (this.ctx && this.masterGain) {
      node.start(this.ctx, this.masterGain);
    }
    return id;
  }

  /** Remove a node by ID. Disconnects all its connections. */
  removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Remove connections involving this node
    this.connections = this.connections.filter(
      c => c.fromId !== id && c.toId !== id
    );

    node.stop();
    this.nodes.delete(id);

    if (this.ctx) this.rebuildConnections();
  }

  /** Connect two nodes. */
  connect(fromId: string, fromPort: string, toId: string, toPort: string): void {
    this.connections.push({ fromId, fromPort, toId, toPort });
    if (this.ctx) this.rebuildConnections();
  }

  /** Disconnect two nodes. */
  disconnect(fromId: string, fromPort: string, toId: string, toPort: string): void {
    this.connections = this.connections.filter(
      c => !(c.fromId === fromId && c.fromPort === fromPort && c.toId === toId && c.toPort === toPort)
    );
    if (this.ctx) this.rebuildConnections();
  }

  /** Set a parameter on a node. */
  setParameter(nodeId: string, param: string, value: number): void {
    const node = this.nodes.get(nodeId);
    if (node) node.setParameter(param, value, this.ctx?.currentTime ?? 0);
  }

  /** Get a parameter value from a node. */
  getParameter(nodeId: string, param: string): number {
    const node = this.nodes.get(nodeId);
    return node ? node.getParameter(param) : 0;
  }

  /** Trigger a drum/percussive node. */
  triggerNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node?.trigger) node.trigger();
  }

  /** Get waveform data for visualization. */
  getWaveformData(): Float32Array {
    if (!this._started || !this.analyser) return new Float32Array(1024);
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    return data;
  }

  /** Get frequency data for visualization. */
  getFrequencyData(): Float32Array {
    if (!this._started || !this.analyser) return new Float32Array(1024);
    const data = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(data);
    return data;
  }

  /** Get RMS level for visualization. */
  getRMS(): number {
    const data = this.getWaveformData();
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  }

  /** Play a quick one-shot note. */
  playNote(freq: number, duration: number = 0.5, volume: number = 0.25): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Create a rich note with fundamental + soft octave + fifth for warmth
    const createVoice = (f: number, vol: number, type: OscillatorType) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.frequency.value = f;
      osc.type = type;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + duration + 0.1);
      return gain;
    };

    // Fundamental (triangle — warm and soft)
    const v1 = createVoice(freq, volume, 'triangle');
    // Soft octave above (sine — pure shimmer)
    const v2 = createVoice(freq * 2, volume * 0.15, 'sine');
    // Quiet fifth (sine — harmonic richness)
    const v3 = createVoice(freq * 1.5, volume * 0.08, 'sine');

    // Route through reverb if available, otherwise master
    // Find the first reverb or output node to connect through
    let target: AudioNode = this.masterGain;
    for (const node of this.nodes.values()) {
      if (node.type === 'reverb') {
        const reverbInput = node.getInput('in');
        if (reverbInput && reverbInput instanceof AudioNode) {
          target = reverbInput;
          break;
        }
      }
    }

    v1.connect(target);
    v2.connect(target);
    v3.connect(target);
  }

  /** Play a note from a pentatonic scale (always sounds musical).
   *  `degree` is 0-based scale degree, `octave` offsets octaves. */
  playScaleNote(degree: number, octave: number = 0, duration: number = 0.4): void {
    // C minor pentatonic: C, Eb, F, G, Bb
    const scale = [261.63, 311.13, 349.23, 392.00, 466.16];
    const idx = ((degree % scale.length) + scale.length) % scale.length;
    const freq = scale[idx] * Math.pow(2, octave);
    this.playNote(freq, duration, 0.2);
  }

  /** Set master volume (0 to 1). */
  setMasterVolume(value: number): void {
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.linearRampToValueAtTime(
      Math.min(value, 1), this.ctx.currentTime + 0.05
    );
  }

  /** Get the node count. */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /** Get the connection count. */
  getConnectionCount(): number {
    return this.connections.length;
  }

  /** Get list of node IDs. */
  getNodeIds(): string[] {
    return Array.from(this.nodes.keys());
  }

  /** Get a node's type by ID. */
  getNodeType(nodeId: string): string | null {
    return this.nodes.get(nodeId)?.type ?? null;
  }

  // --- Internal ---

  private rebuildConnections(): void {
    // Disconnect all existing Web Audio connections
    for (const { source, target } of this.activeWebAudioConnections) {
      try {
        if (target instanceof AudioParam) {
          source.disconnect(target);
        } else {
          source.disconnect(target);
        }
      } catch {
        // Connection may already be removed
      }
    }
    this.activeWebAudioConnections = [];

    // Rebuild from the connection list
    for (const conn of this.connections) {
      const fromNode = this.nodes.get(conn.fromId);
      const toNode = this.nodes.get(conn.toId);
      if (!fromNode || !toNode) continue;

      const source = fromNode.getOutput(conn.fromPort);
      const target = toNode.getInput(conn.toPort);
      if (!source || !target) continue;

      try {
        if (target instanceof AudioParam) {
          source.connect(target);
        } else {
          source.connect(target);
        }
        this.activeWebAudioConnections.push({ source, target });
      } catch {
        // Ignore connection errors (e.g., cycle detection by Web Audio)
      }
    }
  }
}
