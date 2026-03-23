export class VoidEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterComp: DynamicsCompressorNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private convolver: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;

  // Per-section gain nodes
  private sectionGains: Map<string, GainNode> = new Map();

  // Active oscillators/nodes (reserved for future use)
  // private activeVoices: Map<string, { osc: OscillatorNode; gain: GainNode }> = new Map();

  private _started = false;
  private waveformData = new Float32Array(1024);
  private frequencyData = new Float32Array(512);

  get started() {
    return this._started;
  }

  async start(): Promise<void> {
    this.ctx = new AudioContext();

    // Master chain: section gains -> master gain -> compressor -> limiter -> analyser -> output
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.6;

    this.masterComp = this.ctx.createDynamicsCompressor();
    this.masterComp.threshold.value = -12;
    this.masterComp.ratio.value = 3;
    this.masterComp.attack.value = 0.01;
    this.masterComp.release.value = 0.1;

    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -1;
    this.masterLimiter.ratio.value = 20;
    this.masterLimiter.attack.value = 0.001;
    this.masterLimiter.release.value = 0.05;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    // Generate reverb IR programmatically
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.createReverbIR(4, 3);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.3;
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.7;

    // Connect master chain
    this.masterGain.connect(this.dryGain);
    this.masterGain.connect(this.convolver);
    this.convolver.connect(this.reverbGain);
    this.dryGain.connect(this.masterComp);
    this.reverbGain.connect(this.masterComp);
    this.masterComp.connect(this.masterLimiter);
    this.masterLimiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this._started = true;
  }

  private createReverbIR(duration: number, decay: number): AudioBuffer {
    const sr = this.ctx!.sampleRate;
    const length = sr * duration;
    const buffer = this.ctx!.createBuffer(2, length, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / ((sr * decay) / 6));
      }
    }
    return buffer;
  }

  /** Get or create a section gain node */
  getSectionGain(sectionId: string): GainNode {
    if (!this.ctx || !this.masterGain) throw new Error("Not started");
    if (!this.sectionGains.has(sectionId)) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.masterGain);
      this.sectionGains.set(sectionId, gain);
    }
    return this.sectionGains.get(sectionId)!;
  }

  /** Set section volume (0-1) with smooth ramp */
  setSectionVolume(
    sectionId: string,
    volume: number,
    rampTime: number = 0.5
  ): void {
    const gain = this.getSectionGain(sectionId);
    if (!this.ctx) return;
    gain.gain.cancelScheduledValues(this.ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(
      volume,
      this.ctx.currentTime + rampTime
    );
  }

  /** Play a one-shot tone through a section */
  playTone(
    sectionId: string,
    freq: number,
    duration: number = 1,
    volume: number = 0.3,
    type: OscillatorType = "sine"
  ): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.getSectionGain(sectionId));
    osc.start(now);
    osc.stop(now + duration + 0.1);
  }

  /** Play a deep boom (for Act 1) */
  playBoom(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const sectionGain = this.getSectionGain("void");
    sectionGain.gain.setValueAtTime(1, now);

    // Sub boom: sine sweep from 100Hz to 30Hz
    const boom = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boom.type = "sine";
    boom.frequency.setValueAtTime(100, now);
    boom.frequency.exponentialRampToValueAtTime(30, now + 0.5);
    boomGain.gain.setValueAtTime(0.8, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 5);
    boom.connect(boomGain);
    boomGain.connect(sectionGain);
    boom.start(now);
    boom.stop(now + 6);

    // Noise burst
    const noiseBuffer = this.ctx.createBuffer(
      1,
      this.ctx.sampleRate * 0.1,
      this.ctx.sampleRate
    );
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++)
      noiseData[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 500;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(sectionGain);
    noise.start(now);

    // After boom, transition to ambient
    setTimeout(() => {
      this.startAmbientDrone("void");
    }, 3000);
  }

  /** Start a gentle ambient drone */
  startAmbientDrone(sectionId: string): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const sectionGain = this.getSectionGain(sectionId);

    // Bass drone (C2)
    const bass = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bass.type = "sine";
    bass.frequency.value = 65.41;
    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.linearRampToValueAtTime(0.15, now + 3);
    bass.connect(bassGain);
    bassGain.connect(sectionGain);
    bass.start(now);

    // Pad (C4 + Eb4 + G4, detuned saws through filter)
    const padFreqs = [261.6, 311.1, 392.0];
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 800;
    padFilter.Q.value = 1;
    padFilter.connect(sectionGain);

    for (const freq of padFreqs) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 10;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 5);
      osc.connect(gain);
      gain.connect(padFilter);
      osc.start(now);
    }

    // Slow LFO on filter cutoff
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.1;
    lfoGain.gain.value = 400;
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start(now);
  }

  /** Set reverb amount (0-1) */
  setReverbMix(mix: number): void {
    if (!this.ctx || !this.reverbGain || !this.dryGain) return;
    const now = this.ctx.currentTime;
    this.reverbGain.gain.linearRampToValueAtTime(mix, now + 0.1);
    this.dryGain.gain.linearRampToValueAtTime(1 - mix * 0.5, now + 0.1);
  }

  /** Get analysis data */
  getWaveformData(): Float32Array {
    this.analyser?.getFloatTimeDomainData(this.waveformData);
    return this.waveformData;
  }

  getFrequencyData(): Float32Array {
    this.analyser?.getFloatFrequencyData(this.frequencyData);
    return this.frequencyData;
  }

  getRMS(): number {
    const data = this.getWaveformData();
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  }

  get context(): AudioContext | null {
    return this.ctx;
  }
}
