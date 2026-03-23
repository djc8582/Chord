// ChordEngine — Real-time generative audio engine for the Atmosphere demo
// Uses Web Audio API exclusively. All parameter changes use ramping to avoid clicks.

// Pentatonic scale frequencies (C minor pentatonic)
const PENTATONIC_NOTES = {
  C2: 65.41, D2: 73.42, Eb2: 77.78, G2: 98.0, Ab2: 103.83, Bb2: 116.54,
  C3: 130.81, D3: 146.83, Eb3: 155.56, G3: 196.0, Ab3: 207.65, Bb3: 233.08,
  C4: 261.63, Eb4: 311.13, G4: 392.0, Ab4: 415.30, Bb4: 466.16,
  C5: 523.25, Eb5: 622.25, G5: 783.99, Ab5: 830.61, Bb5: 932.33,
  C6: 1046.5, Eb6: 1244.5, G6: 1567.98,
};

// Chord voicings (indices into pentatonic scale tones as frequencies)
const CHORD_PROGRESSIONS = [
  // i — Cm (C Eb G)
  [PENTATONIC_NOTES.C4, PENTATONIC_NOTES.Eb4, PENTATONIC_NOTES.G4],
  // VI — Ab (Ab C Eb)
  [PENTATONIC_NOTES.Ab3, PENTATONIC_NOTES.C4, PENTATONIC_NOTES.Eb4],
  // VII — Bb (Bb D G) — use Bb3, Eb4, G4 for minor feel
  [PENTATONIC_NOTES.Bb3, PENTATONIC_NOTES.Eb4, PENTATONIC_NOTES.G4],
  // v — Gm (G Bb D) — use G3, Bb3, Eb4
  [PENTATONIC_NOTES.G3, PENTATONIC_NOTES.Bb3, PENTATONIC_NOTES.Eb4],
  // iv — Fm (Ab C Eb higher voicing)
  [PENTATONIC_NOTES.Ab3, PENTATONIC_NOTES.C4, PENTATONIC_NOTES.Eb5],
];

const BASS_NOTES = [
  PENTATONIC_NOTES.C2,
  PENTATONIC_NOTES.Ab2,
  PENTATONIC_NOTES.Bb2,
  PENTATONIC_NOTES.G2,
  PENTATONIC_NOTES.Ab2,
];

const SHIMMER_NOTES = [
  PENTATONIC_NOTES.C6, PENTATONIC_NOTES.Eb6, PENTATONIC_NOTES.G6,
  PENTATONIC_NOTES.Eb6, PENTATONIC_NOTES.C6, PENTATONIC_NOTES.G5,
  PENTATONIC_NOTES.Ab5, PENTATONIC_NOTES.Bb5,
];

export class ChordEngine {
  private ctx!: AudioContext;
  private masterGain!: GainNode;
  private masterLimiter!: DynamicsCompressorNode;
  private analyser!: AnalyserNode;

  // Layer 1: Bass drone
  private bassOsc!: OscillatorNode;
  private bassGain!: GainNode;

  // Layer 2: Pad (3 detuned saws through LP filter + reverb)
  private padOscs: OscillatorNode[] = [];
  private padGains: GainNode[] = [];
  private padFilter!: BiquadFilterNode;
  private padMasterGain!: GainNode;

  // Layer 3: Shimmer (high sine arpeggios)
  private shimmerInterval: number | null = null;
  private shimmerGain!: GainNode;
  private shimmerNoteIndex = 0;

  // Layer 4: Rhythm (filtered noise)
  private rhythmFilter!: BiquadFilterNode;
  private rhythmGain!: GainNode;
  private rhythmInterval: number | null = null;

  // Effects
  private reverb!: ConvolverNode;
  private reverbGain!: GainNode;
  private dryGain!: GainNode;

  // Waveshaper for subtle saturation
  private waveshaper!: WaveShaperNode;
  private waveshaperGain!: GainNode;

  // Parameters
  private params: Map<string, number> = new Map();
  private _started = false;

  get started(): boolean {
    return this._started;
  }

  async start(): Promise<void> {
    if (this._started) return;

    this.ctx = new AudioContext();

    // --- Master chain ---
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -6;
    this.masterLimiter.knee.value = 12;
    this.masterLimiter.ratio.value = 8;
    this.masterLimiter.attack.value = 0.003;
    this.masterLimiter.release.value = 0.15;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;

    // --- Reverb ---
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.createReverbIR(3, 2.5);

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.5;

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.7;

    // --- Waveshaper ---
    this.waveshaper = this.ctx.createWaveShaper();
    this.waveshaper.curve = this.makeDistortionCurve(5);
    this.waveshaper.oversample = '2x';
    this.waveshaperGain = this.ctx.createGain();
    this.waveshaperGain.gain.value = 0;

    // Routing: sources -> dryGain -> masterGain
    //          sources -> reverb -> reverbGain -> masterGain
    //          sources -> waveshaper -> waveshaperGain -> masterGain
    // masterGain -> limiter -> analyser -> destination

    this.dryGain.connect(this.masterGain);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);
    this.waveshaper.connect(this.waveshaperGain);
    this.waveshaperGain.connect(this.masterGain);
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // --- Layer 1: Bass drone ---
    this.bassOsc = this.ctx.createOscillator();
    this.bassOsc.type = 'sine';
    this.bassOsc.frequency.value = PENTATONIC_NOTES.C2;
    this.bassGain = this.ctx.createGain();
    this.bassGain.gain.value = 0.12;
    this.bassOsc.connect(this.bassGain);
    this.bassGain.connect(this.dryGain);
    this.bassGain.connect(this.reverb);
    this.bassOsc.start();

    // --- Layer 2: Pad (3 detuned saws through filter) ---
    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 800;
    this.padFilter.Q.value = 1.5;

    this.padMasterGain = this.ctx.createGain();
    this.padMasterGain.gain.value = 0.08;

    this.padFilter.connect(this.padMasterGain);
    this.padMasterGain.connect(this.dryGain);
    this.padMasterGain.connect(this.reverb);

    const chordFreqs = CHORD_PROGRESSIONS[0];
    const detuneAmounts = [-8, 0, 8]; // cents
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = chordFreqs[i];
      osc.detune.value = detuneAmounts[i];
      const gain = this.ctx.createGain();
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(this.padFilter);
      osc.start();
      this.padOscs.push(osc);
      this.padGains.push(gain);
    }

    // --- Layer 3: Shimmer ---
    this.shimmerGain = this.ctx.createGain();
    this.shimmerGain.gain.value = 0.03;
    this.shimmerGain.connect(this.reverb); // heavy reverb only
    this.startShimmer();

    // --- Layer 4: Rhythm ---
    this.rhythmFilter = this.ctx.createBiquadFilter();
    this.rhythmFilter.type = 'bandpass';
    this.rhythmFilter.frequency.value = 2000;
    this.rhythmFilter.Q.value = 5;

    this.rhythmGain = this.ctx.createGain();
    this.rhythmGain.gain.value = 0.04;

    this.rhythmFilter.connect(this.rhythmGain);
    this.rhythmGain.connect(this.dryGain);
    this.rhythmGain.connect(this.reverb);
    this.startRhythm();

    // --- Set default params ---
    this.params.set('filterCutoff', 0.3);
    this.params.set('reverbMix', 0.5);
    this.params.set('masterVolume', 0.25);
    this.params.set('shimmerRate', 0.3);
    this.params.set('rhythmDensity', 0.3);
    this.params.set('distortion', 0);
    this.params.set('padChord', 0);
    this.params.set('idle', 0);

    // Fade in master gracefully
    this.masterGain.gain.linearRampToValueAtTime(0.25, this.ctx.currentTime + 2);

    // Apply time of day
    const hour = new Date().getHours();
    this.setParameter('timeOfDay', hour / 24);

    this._started = true;
  }

  stop(): void {
    if (!this._started) return;
    if (this.shimmerInterval) clearInterval(this.shimmerInterval);
    if (this.rhythmInterval) clearInterval(this.rhythmInterval);
    this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1);
    setTimeout(() => {
      this.bassOsc.stop();
      this.padOscs.forEach(o => o.stop());
      this.ctx.close();
      this._started = false;
    }, 1200);
  }

  setParameter(name: string, value: number): void {
    this.params.set(name, value);
    if (!this._started) return;

    const now = this.ctx.currentTime;
    const fast = now + 0.05;
    const med = now + 0.15;
    const slow = now + 0.4;

    switch (name) {
      case 'filterCutoff':
        this.padFilter.frequency.linearRampToValueAtTime(
          200 + value * 6000, fast
        );
        break;

      case 'reverbMix':
        this.reverbGain.gain.linearRampToValueAtTime(
          Math.min(value * 0.8, 0.8), med
        );
        this.dryGain.gain.linearRampToValueAtTime(
          0.7 - value * 0.3, med
        );
        break;

      case 'masterVolume':
        this.masterGain.gain.linearRampToValueAtTime(
          Math.min(value, 0.35), med
        );
        break;

      case 'bassNote': {
        const freq = 440 * Math.pow(2, (value - 69) / 12);
        this.bassOsc.frequency.linearRampToValueAtTime(freq, slow);
        break;
      }

      case 'padChord': {
        const idx = Math.floor(value * (CHORD_PROGRESSIONS.length - 0.01));
        const chord = CHORD_PROGRESSIONS[Math.min(idx, CHORD_PROGRESSIONS.length - 1)];
        const bassNote = BASS_NOTES[Math.min(idx, BASS_NOTES.length - 1)];
        for (let i = 0; i < this.padOscs.length; i++) {
          this.padOscs[i].frequency.linearRampToValueAtTime(chord[i], slow);
        }
        this.bassOsc.frequency.linearRampToValueAtTime(bassNote, slow);
        break;
      }

      case 'shimmerRate':
        // Restart shimmer with new rate
        this.startShimmer();
        break;

      case 'rhythmDensity':
        this.rhythmGain.gain.linearRampToValueAtTime(
          value * 0.1, med
        );
        // Restart rhythm with new density
        this.startRhythm();
        break;

      case 'distortion': {
        this.waveshaper.curve = this.makeDistortionCurve(5 + value * 50);
        this.waveshaperGain.gain.linearRampToValueAtTime(value * 0.15, med);
        break;
      }

      case 'timeOfDay':
        this.applyTimeOfDay(value);
        break;

      case 'scrollDepth':
        // Subtle pad brightness with scroll
        this.padFilter.frequency.linearRampToValueAtTime(
          400 + value * 3000, med
        );
        break;

      case 'idle':
        if (value > 0.5) {
          // Ambient mode: quieter, more reverb, slower
          this.padMasterGain.gain.linearRampToValueAtTime(0.04, now + 2);
          this.reverbGain.gain.linearRampToValueAtTime(0.7, now + 2);
          this.shimmerGain.gain.linearRampToValueAtTime(0.05, now + 2);
          this.rhythmGain.gain.linearRampToValueAtTime(0.01, now + 2);
        } else {
          this.padMasterGain.gain.linearRampToValueAtTime(0.08, now + 1);
          this.reverbGain.gain.linearRampToValueAtTime(0.5, now + 1);
          this.shimmerGain.gain.linearRampToValueAtTime(0.03, now + 1);
        }
        break;
    }
  }

  getParameter(name: string): number {
    return this.params.get(name) ?? 0;
  }

  getWaveformData(): Float32Array {
    if (!this._started) return new Float32Array(1024);
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    return data;
  }

  getFrequencyData(): Float32Array {
    if (!this._started) return new Float32Array(1024);
    const data = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(data);
    return data;
  }

  getRMS(): number {
    const data = this.getWaveformData();
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  }

  // Play a one-shot note for UI interactions
  playNote(freq: number, duration: number, volume: number = 0.15): void {
    if (!this._started) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.reverb); // through reverb for lush tail
    gain.connect(this.dryGain); // small amount dry too
    osc.start(now);
    osc.stop(now + duration + 0.1);
  }

  // UI click sound
  playClick(pitch: number = 1): void {
    this.playNote(1200 * pitch, 0.06, 0.06);
  }

  // Play a note from the pentatonic scale (index 0-7)
  playScaleNote(index: number, duration: number = 0.5): void {
    const notes = [
      PENTATONIC_NOTES.C5, PENTATONIC_NOTES.Eb5, PENTATONIC_NOTES.G5,
      PENTATONIC_NOTES.Ab5, PENTATONIC_NOTES.Bb5, PENTATONIC_NOTES.C6,
      PENTATONIC_NOTES.Eb6, PENTATONIC_NOTES.G6,
    ];
    const note = notes[index % notes.length];
    this.playNote(note, duration, 0.12);
  }

  // --- Private methods ---

  private createReverbIR(duration: number = 3, decay: number = 2.5): AudioBuffer {
    const length = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) *
          Math.exp(-i / (this.ctx.sampleRate * decay / 6));
      }
    }
    return buffer;
  }

  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) /
        (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  private startShimmer(): void {
    if (this.shimmerInterval) clearInterval(this.shimmerInterval);
    const rate = this.getParameter('shimmerRate') || 0.3;
    const intervalMs = 300 + (1 - rate) * 800; // 300ms to 1100ms

    this.shimmerInterval = window.setInterval(() => {
      if (!this._started) return;
      const note = SHIMMER_NOTES[this.shimmerNoteIndex % SHIMMER_NOTES.length];
      this.shimmerNoteIndex++;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = note;

      const now = this.ctx.currentTime;
      const vol = 0.02 + Math.random() * 0.02;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      osc.connect(gain);
      gain.connect(this.shimmerGain);
      osc.start(now);
      osc.stop(now + 2);
    }, intervalMs);
  }

  private startRhythm(): void {
    if (this.rhythmInterval) clearInterval(this.rhythmInterval);
    const density = this.getParameter('rhythmDensity') || 0.3;
    const intervalMs = 200 + (1 - density) * 600;

    this.rhythmInterval = window.setInterval(() => {
      if (!this._started) return;
      // Create a short noise burst
      const bufferSize = this.ctx.sampleRate * 0.05; // 50ms
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const burstGain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      burstGain.gain.setValueAtTime(0.3 + Math.random() * 0.4, now);
      burstGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      source.connect(burstGain);
      burstGain.connect(this.rhythmFilter);
      source.start(now);
    }, intervalMs);
  }

  private applyTimeOfDay(value: number): void {
    // value: 0 = midnight, 0.5 = noon, 1 = midnight
    // Night: darker, more reverb, lower filter, minor chords
    // Day: brighter, less reverb, higher filter, more shimmer
    const brightness = Math.sin(value * Math.PI); // 0 at midnight, 1 at noon
    const now = this.ctx.currentTime;
    const t = now + 1;

    this.padFilter.frequency.linearRampToValueAtTime(
      400 + brightness * 4000, t
    );
    this.reverbGain.gain.linearRampToValueAtTime(
      0.3 + (1 - brightness) * 0.4, t
    );
    this.shimmerGain.gain.linearRampToValueAtTime(
      0.02 + brightness * 0.04, t
    );
    this.bassGain.gain.linearRampToValueAtTime(
      0.08 + (1 - brightness) * 0.08, t
    );
  }
}
