# Sound Design with Chord: A Masterclass for AI Assistants

This guide teaches you how to make audio that sounds **professional** using
Chord's Web Audio engine. It is not API documentation (see `api.md` for that).
It is a set of principles, techniques, and copy-paste recipes that will make
the difference between a thin demo buzzing out of a laptop speaker and a
production-quality sonic experience that people actually want to listen to.

Everything here uses the `Chord` class from `@chord/web`. The three methods you
will use most are:

```typescript
const chord = new Chord();
await chord.start();

const id = chord.addNode(type);          // create a node
chord.setParameter(id, param, value);    // set a parameter
chord.connect(fromId, 'out', toId, 'in'); // wire nodes together
chord.triggerNode(id);                   // fire a percussive hit
```

---

## The #1 Rule: Nothing Should Sound Like a Raw Waveform

A single oscillator routed straight to the output is the audio equivalent of
a stick figure. It might technically represent a sound, but nobody wants to
listen to it. Professional sound has **six qualities**:

| Quality | What It Means | What Happens Without It |
|---------|--------------|------------------------|
| **Multiple sources** | 2+ voices layered together | Thin, hollow, lifeless |
| **Filtering** | Sculpted frequency content | Harsh, buzzy, fatiguing |
| **Movement** | Parameters that change over time | Static, boring, synthetic |
| **Space** | Reverb, delay, stereo width | Flat, dry, "stuck to the speaker" |
| **Texture** | Saturation, noise, granularity | Sterile, clinical, cold |
| **Dynamic response** | Compression, envelopes, velocity | Lifeless, no punch, no groove |

Every single patch you build must address **all six**. If you skip even one,
the result will sound amateur.

### The Thin vs Thick Pattern

**THIN (never do this):**

```typescript
// A single naked oscillator. Sounds terrible.
const osc = chord.addNode('oscillator');
chord.setParameter(osc, 'frequency', 440);
chord.setParameter(osc, 'waveform', 1); // sawtooth
chord.setParameter(osc, 'gain', 0.3);
const out = chord.addNode('output');
chord.connect(osc, 'out', out, 'in');
```

**THICK (always do this):**

```typescript
// Multiple detuned voices + filtering + movement + space + texture
const osc1 = chord.addNode('oscillator');
chord.setParameter(osc1, 'frequency', 440);
chord.setParameter(osc1, 'waveform', 1);
chord.setParameter(osc1, 'detune', 12);
chord.setParameter(osc1, 'gain', 0.15);

const osc2 = chord.addNode('oscillator');
chord.setParameter(osc2, 'frequency', 440);
chord.setParameter(osc2, 'waveform', 1);
chord.setParameter(osc2, 'detune', -12);
chord.setParameter(osc2, 'gain', 0.15);

const sub = chord.addNode('oscillator');
chord.setParameter(sub, 'frequency', 220);
chord.setParameter(sub, 'waveform', 0); // sine
chord.setParameter(sub, 'gain', 0.1);

const nz = chord.addNode('noise');
chord.setParameter(nz, 'color', 1); // pink
chord.setParameter(nz, 'gain', 0.02);

const filt = chord.addNode('filter');
chord.setParameter(filt, 'cutoff', 3000);
chord.setParameter(filt, 'resonance', 1.2);
chord.setParameter(filt, 'mode', 0); // lowpass

const lfo1 = chord.addNode('lfo');
chord.setParameter(lfo1, 'rate', 0.3);
chord.setParameter(lfo1, 'depth', 1500);
chord.setParameter(lfo1, 'shape', 0); // sine

const chr = chord.addNode('chorus');
chord.setParameter(chr, 'rate', 0.4);
chord.setParameter(chr, 'depth', 0.35);
chord.setParameter(chr, 'mix', 0.2);

const rev = chord.addNode('reverb');
chord.setParameter(rev, 'decay', 2.5);
chord.setParameter(rev, 'mix', 0.2);
chord.setParameter(rev, 'damping', 0.6);

const out = chord.addNode('output');

// Routing: all voices -> filter -> chorus -> reverb -> output
chord.connect(osc1, 'out', filt, 'in');
chord.connect(osc2, 'out', filt, 'in');
chord.connect(sub, 'out', filt, 'in');
chord.connect(nz, 'out', filt, 'in');
chord.connect(lfo1, 'out', filt, 'cutoff'); // LFO modulates filter
chord.connect(filt, 'out', chr, 'in');
chord.connect(chr, 'out', rev, 'in');
chord.connect(rev, 'out', out, 'in');
```

The second version has 8 nodes instead of 2. That is the baseline for anything
you would actually want to listen to.

---

## How to Build Sound That Does Not Suck

### 1. Layer, Don't Solo

A single oscillator is a sine wave, a saw wave, or a square wave. None of those
exist in nature. Real instruments produce dozens of harmonics, body resonances,
and noise simultaneously. To approximate richness, you **layer**.

**The detuned unison trick** -- the single most important technique in
synthesis:

```typescript
// Two saws slightly detuned from each other create instant width
const saw1 = chord.addNode('oscillator');
chord.setParameter(saw1, 'frequency', 220);
chord.setParameter(saw1, 'waveform', 1);  // sawtooth
chord.setParameter(saw1, 'detune', 10);   // +10 cents
chord.setParameter(saw1, 'gain', 0.12);

const saw2 = chord.addNode('oscillator');
chord.setParameter(saw2, 'frequency', 220);
chord.setParameter(saw2, 'waveform', 1);  // sawtooth
chord.setParameter(saw2, 'detune', -10);  // -10 cents
chord.setParameter(saw2, 'gain', 0.12);
```

Detune amounts that sound good:
- **7-15 cents**: Subtle warmth, good for pads and basses
- **15-30 cents**: Obvious width, good for leads and stabs
- **30+ cents**: Extreme, use sparingly -- sounds like two separate notes

**The sub layer** -- every sound benefits from a clean sine an octave or two
below:

```typescript
const sub = chord.addNode('oscillator');
chord.setParameter(sub, 'frequency', 110); // one octave below A220
chord.setParameter(sub, 'waveform', 0);    // sine -- pure, clean
chord.setParameter(sub, 'gain', 0.08);     // subtle, felt more than heard
```

**The noise layer** -- adds "breath" and organic texture:

```typescript
const breath = chord.addNode('noise');
chord.setParameter(breath, 'color', 1);    // pink noise -- natural spectrum
chord.setParameter(breath, 'gain', 0.015); // barely audible, but you miss it
                                            // when it is gone
```

### 2. Always Filter

Raw waveforms have harsh harmonics that extend to the Nyquist frequency. This
is why an unfiltered sawtooth sounds like a buzz saw and not like a string.
Filtering tames the harmonics and shapes the character.

```typescript
const filt = chord.addNode('filter');
chord.setParameter(filt, 'cutoff', 2500);    // lowpass at 2500 Hz
chord.setParameter(filt, 'resonance', 1.0);  // slight resonance peak
chord.setParameter(filt, 'mode', 0);         // 0=lowpass
```

**Filter modes and when to use them:**

| Mode | Value | Use For |
|------|-------|---------|
| Lowpass | `0` | Everything. Pads, basses, leads. Default choice. |
| Highpass | `1` | Removing low rumble from noise layers, thin textures |
| Bandpass | `2` | Resonant sweeps, vocal-like sounds, telephone effect |

**Cutoff frequency guide:**

| Range | Character |
|-------|-----------|
| 200-800 Hz | Dark, muffled, distant -- good for background layers |
| 800-2000 Hz | Warm, present but not harsh -- sweet spot for basses |
| 2000-5000 Hz | Bright, forward -- good for leads and plucks |
| 5000-12000 Hz | Airy, shimmery -- use for high textures only |
| 12000+ Hz | Essentially fully open -- only for sounds that need sparkle |

**Resonance guide:**

| Range | Character |
|-------|-----------|
| 0.1-0.7 | Transparent -- just removes harmonics |
| 0.7-2.0 | Slight peak -- adds character and presence |
| 2.0-5.0 | Obvious resonance -- good for acid/squelchy sounds |
| 5.0-15.0 | Screaming -- use for risers, tension, special effects only |
| 15.0+ | Self-oscillation territory -- filter becomes an oscillator |

### 3. Always Add Movement

Static parameters are the hallmark of amateur synthesis. In the real world,
nothing stays perfectly constant. Use LFOs (Low Frequency Oscillators) to
modulate parameters over time.

**Filter cutoff modulation** -- the single most effective modulation target:

```typescript
const lfo1 = chord.addNode('lfo');
chord.setParameter(lfo1, 'rate', 0.2);     // slow sweep
chord.setParameter(lfo1, 'depth', 2000);   // sweeps cutoff +/- 2000 Hz
chord.setParameter(lfo1, 'shape', 0);      // sine -- smooth

chord.connect(lfo1, 'out', filt, 'cutoff');
```

**Vibrato** -- subtle pitch variation:

```typescript
const vibrato = chord.addNode('lfo');
chord.setParameter(vibrato, 'rate', 5);    // 5 Hz -- natural vibrato speed
chord.setParameter(vibrato, 'depth', 3);   // 3 Hz pitch deviation -- subtle
chord.setParameter(vibrato, 'shape', 0);   // sine

chord.connect(vibrato, 'out', osc1, 'freq');
```

**Tremolo** -- amplitude variation:

```typescript
const tremolo = chord.addNode('lfo');
chord.setParameter(tremolo, 'rate', 3);
chord.setParameter(tremolo, 'depth', 0.15); // subtle volume pulsing
chord.setParameter(tremolo, 'shape', 1);    // triangle -- softer than sine

chord.connect(tremolo, 'out', gainNode, 'gain');
```

**LFO rate guide:**

| Rate | Feel |
|------|------|
| 0.01-0.1 Hz | Glacial drift. Listener does not notice it consciously. |
| 0.1-0.5 Hz | Slow evolving motion. Great for pads. |
| 0.5-2 Hz | Obvious movement. Wobbles, sweeps. |
| 2-8 Hz | Vibrato/tremolo range. Musical and expressive. |
| 8-20 Hz | Fast flutter. Use sparingly, creates tension. |
| 20+ Hz | Audio rate. Creates sidebands -- FM synthesis territory. |

### 4. Always Add Space

Dry audio sounds like it is being generated inside your ear canal. Reverb and
delay place sound in a physical space. Chorus adds width and shimmer.

**Reverb** -- use on almost everything:

```typescript
const rev = chord.addNode('reverb');
chord.setParameter(rev, 'decay', 2.5);     // 2.5 second tail
chord.setParameter(rev, 'mix', 0.2);       // 20% wet -- tasteful default
chord.setParameter(rev, 'damping', 0.6);   // darker tail, less harsh
chord.setParameter(rev, 'predelay', 0.02); // 20ms gap -- preserves clarity
chord.setParameter(rev, 'diffusion', 0.8); // smooth, dense
```

**Delay** -- adds depth and rhythm:

```typescript
const dly = chord.addNode('delay');
chord.setParameter(dly, 'time', 0.375);    // dotted eighth at 120 BPM
chord.setParameter(dly, 'feedback', 0.25); // moderate repeats
chord.setParameter(dly, 'mix', 0.15);      // 15% wet
chord.setParameter(dly, 'damping', 0.4);   // each repeat gets darker
```

**Chorus** -- instant stereo width:

```typescript
const chr = chord.addNode('chorus');
chord.setParameter(chr, 'rate', 0.4);
chord.setParameter(chr, 'depth', 0.35);
chord.setParameter(chr, 'mix', 0.2);
```

**Space parameter guidelines:**

| Parameter | Safe Range | Danger Zone |
|-----------|-----------|-------------|
| Reverb mix | 0.1-0.35 | Above 0.4 turns everything to mush |
| Reverb decay | 1.0-4.0 s | Above 6s = infinite wash (ambient only) |
| Delay mix | 0.1-0.25 | Above 0.35 competes with dry signal |
| Delay feedback | 0.15-0.4 | Above 0.8 = runaway feedback |
| Chorus mix | 0.15-0.3 | Above 0.5 = flanging, not chorusing |

### 5. Always Add Texture

Clean digital audio is sterile. Real-world sound has noise, saturation, and
imperfection. Add these deliberately.

**Saturation/waveshaping** -- adds warmth and harmonic density:

```typescript
const sat = chord.addNode('waveshaper');
chord.setParameter(sat, 'drive', 0.2);     // gentle warmth
chord.setParameter(sat, 'mode', 2);        // tape saturation
chord.setParameter(sat, 'mix', 0.3);       // blend with clean signal
```

**Waveshaper modes:**

| Mode | Value | Character |
|------|-------|-----------|
| Soft clip | `0` | Warm, transparent -- default choice |
| Hard clip | `1` | Aggressive, lo-fi |
| Tape | `2` | Warm, compressive -- best for bass and drums |
| Tube | `3` | Rich even harmonics -- best for vocals and pads |

**Noise texture layer** -- pink noise through a bandpass filter:

```typescript
const texNoise = chord.addNode('noise');
chord.setParameter(texNoise, 'color', 1);    // pink
chord.setParameter(texNoise, 'gain', 0.03);

const texFilt = chord.addNode('filter');
chord.setParameter(texFilt, 'cutoff', 3000);
chord.setParameter(texFilt, 'resonance', 1.5);
chord.setParameter(texFilt, 'mode', 2);      // bandpass -- focused texture

chord.connect(texNoise, 'out', texFilt, 'in');
chord.connect(texFilt, 'out', bus, 'in');
```

**Granular processing** -- transforms smooth signals into textured clouds:

```typescript
const gran = chord.addNode('granular');
chord.setParameter(gran, 'grain_size', 0.08);
chord.setParameter(gran, 'density', 12);
chord.setParameter(gran, 'pitch_scatter', 2);  // subtle pitch variation
chord.setParameter(gran, 'mix', 0.3);
```

---

## Recipes: Professional Sound Design Patterns

### Recipe 1: Warm Pad

A warm pad is the backbone of ambient music, film scores, and atmospheric
production. It should feel like a blanket of sound -- wide, enveloping, and
evolving.

**Architecture:** 4 detuned saws + sub sine + noise layer + filter with LFO +
chorus + reverb.

```typescript
const chord = new Chord();
await chord.start();
chord.setMasterVolume(0.5);

// --- Voice 1: Sawtooth, detuned sharp ---
const saw1 = chord.addNode('oscillator');
chord.setParameter(saw1, 'frequency', 130.81); // C3
chord.setParameter(saw1, 'waveform', 1);       // sawtooth
chord.setParameter(saw1, 'detune', 12);        // +12 cents
chord.setParameter(saw1, 'gain', 0.08);

// --- Voice 2: Sawtooth, detuned flat ---
const saw2 = chord.addNode('oscillator');
chord.setParameter(saw2, 'frequency', 130.81);
chord.setParameter(saw2, 'waveform', 1);
chord.setParameter(saw2, 'detune', -12);
chord.setParameter(saw2, 'gain', 0.08);

// --- Voice 3: Sawtooth at fifth, detuned sharp ---
const saw3 = chord.addNode('oscillator');
chord.setParameter(saw3, 'frequency', 196.0);  // G3 (perfect fifth)
chord.setParameter(saw3, 'waveform', 1);
chord.setParameter(saw3, 'detune', 7);
chord.setParameter(saw3, 'gain', 0.06);

// --- Voice 4: Triangle at fifth, detuned flat (softer layer) ---
const saw4 = chord.addNode('oscillator');
chord.setParameter(saw4, 'frequency', 196.0);
chord.setParameter(saw4, 'waveform', 3);       // triangle -- softer
chord.setParameter(saw4, 'detune', -7);
chord.setParameter(saw4, 'gain', 0.05);

// --- Sub: Pure sine one octave below ---
const sub = chord.addNode('oscillator');
chord.setParameter(sub, 'frequency', 65.41);   // C2
chord.setParameter(sub, 'waveform', 0);        // sine
chord.setParameter(sub, 'gain', 0.06);

// --- Noise: Filtered pink noise for breath ---
const nz = chord.addNode('noise');
chord.setParameter(nz, 'color', 1);            // pink
chord.setParameter(nz, 'gain', 0.015);

const nzFilt = chord.addNode('filter');
chord.setParameter(nzFilt, 'cutoff', 4000);
chord.setParameter(nzFilt, 'resonance', 0.5);
chord.setParameter(nzFilt, 'mode', 0);         // lowpass

// --- Main filter: Lowpass with slow LFO modulation ---
const filt = chord.addNode('filter');
chord.setParameter(filt, 'cutoff', 2500);
chord.setParameter(filt, 'resonance', 0.8);
chord.setParameter(filt, 'mode', 0);

const filterLfo = chord.addNode('lfo');
chord.setParameter(filterLfo, 'rate', 0.15);   // very slow sweep
chord.setParameter(filterLfo, 'depth', 1500);  // sweeps 1000-4000 Hz
chord.setParameter(filterLfo, 'shape', 0);     // sine

// --- Chorus: Adds stereo width and shimmer ---
const chr = chord.addNode('chorus');
chord.setParameter(chr, 'rate', 0.3);
chord.setParameter(chr, 'depth', 0.4);
chord.setParameter(chr, 'mix', 0.25);

// --- Reverb: Large, dark, lush ---
const rev = chord.addNode('reverb');
chord.setParameter(rev, 'decay', 4.0);
chord.setParameter(rev, 'mix', 0.3);
chord.setParameter(rev, 'damping', 0.7);       // dark tail
chord.setParameter(rev, 'predelay', 0.03);
chord.setParameter(rev, 'diffusion', 0.9);

const out = chord.addNode('output');

// --- Routing ---
// All oscillators -> main filter
chord.connect(saw1, 'out', filt, 'in');
chord.connect(saw2, 'out', filt, 'in');
chord.connect(saw3, 'out', filt, 'in');
chord.connect(saw4, 'out', filt, 'in');
chord.connect(sub, 'out', filt, 'in');

// Noise -> noise filter -> main filter
chord.connect(nz, 'out', nzFilt, 'in');
chord.connect(nzFilt, 'out', filt, 'in');

// LFO -> filter cutoff
chord.connect(filterLfo, 'out', filt, 'cutoff');

// Filter -> chorus -> reverb -> output
chord.connect(filt, 'out', chr, 'in');
chord.connect(chr, 'out', rev, 'in');
chord.connect(rev, 'out', out, 'in');
```

**Why it works:** Four detuned saws create a wide, shimmering wall. The sub
fills in the low end that saws lack. Pink noise adds organic breath. The
slowly modulated filter gives the sound a living, evolving quality. Chorus
widens the stereo field. Reverb places it in a vast space.

**To change the chord,** update the frequencies of all oscillators. The root
voices (saw1, saw2, sub) get the root note. The fifth voices (saw3, saw4) get
the fifth. Example for Am: root = 110 Hz (A2), sub = 55 Hz (A1), fifth =
164.81 Hz (E3).

---

### Recipe 2: Deep Bass

A professional bass sound needs weight in the sub frequencies, character in the
mids, and punch from a filter envelope. Never use a raw oscillator for bass.

**Architecture:** Saw oscillator + sub sine + lowpass filter with resonance +
tape saturation + compression.

```typescript
const chord = new Chord();
await chord.start();
chord.setMasterVolume(0.5);

// --- Main voice: Sawtooth for harmonics ---
const sawBass = chord.addNode('oscillator');
chord.setParameter(sawBass, 'frequency', 55);   // A1
chord.setParameter(sawBass, 'waveform', 1);     // sawtooth
chord.setParameter(sawBass, 'gain', 0.15);

// --- Sub layer: Pure sine for weight ---
const subBass = chord.addNode('oscillator');
chord.setParameter(subBass, 'frequency', 55);
chord.setParameter(subBass, 'waveform', 0);     // sine -- clean sub
chord.setParameter(subBass, 'gain', 0.2);

// --- Filter: Lowpass to control brightness ---
const bassFilt = chord.addNode('filter');
chord.setParameter(bassFilt, 'cutoff', 800);    // starts warm
chord.setParameter(bassFilt, 'resonance', 3.0); // resonant peak for 808 char
chord.setParameter(bassFilt, 'mode', 0);        // lowpass

// --- Saturation: Tape mode for warmth and presence ---
const bassSat = chord.addNode('waveshaper');
chord.setParameter(bassSat, 'drive', 0.25);
chord.setParameter(bassSat, 'mode', 2);         // tape
chord.setParameter(bassSat, 'mix', 0.4);

// --- Compressor: Glues sub and saw together ---
const bassComp = chord.addNode('compressor');
chord.setParameter(bassComp, 'threshold', -15);
chord.setParameter(bassComp, 'ratio', 4);
chord.setParameter(bassComp, 'attack', 0.01);
chord.setParameter(bassComp, 'release', 0.1);
chord.setParameter(bassComp, 'knee', 6);
chord.setParameter(bassComp, 'makeup', 3);

// --- Slow filter movement ---
const bassLfo = chord.addNode('lfo');
chord.setParameter(bassLfo, 'rate', 0.1);
chord.setParameter(bassLfo, 'depth', 300);      // subtle cutoff wobble
chord.setParameter(bassLfo, 'shape', 0);

const out = chord.addNode('output');

// --- Routing ---
// Both oscillators -> filter
chord.connect(sawBass, 'out', bassFilt, 'in');
chord.connect(subBass, 'out', bassFilt, 'in');

// LFO -> filter cutoff
chord.connect(bassLfo, 'out', bassFilt, 'cutoff');

// Filter -> saturation -> compressor -> output
chord.connect(bassFilt, 'out', bassSat, 'in');
chord.connect(bassSat, 'out', bassComp, 'in');
chord.connect(bassComp, 'out', out, 'in');
```

**Filter envelope trick for plucky bass:** To get that classic bass pluck where
the filter opens on each note and closes quickly, use `setParameter` to snap
the cutoff high and then ramp it down:

```typescript
// On note trigger:
chord.setParameter(bassFilt, 'cutoff', 5000);  // snap open
// Then immediately schedule the close (e.g., in a setTimeout or animation frame):
// After 50ms:
chord.setParameter(bassFilt, 'cutoff', 800);   // ramp back down (50ms auto-smoothing)
```

**Why it works:** The saw provides harmonics that the filter shapes. The sine
sub provides clean low-end weight that the saturation would otherwise destroy.
Tape saturation adds warmth and harmonic density. The compressor ensures the
sub and saw move together as a single unified sound.

---

### Recipe 3: Professional Drums

The difference between amateur and professional drums is this: **every drum
sound needs processing after the synthesis**. A kick drum node into the output
is a demo. A kick drum through EQ, compression, and saturation is a record.

#### Kick Drum

```typescript
// --- Kick synthesis ---
const kick = chord.addNode('kick_drum');
chord.setParameter(kick, 'frequency', 50);
chord.setParameter(kick, 'pitch_env', 300);    // high start for click
chord.setParameter(kick, 'pitch_decay', 0.04); // fast pitch sweep
chord.setParameter(kick, 'body_decay', 0.35);  // medium-long body
chord.setParameter(kick, 'click', 0.6);        // prominent transient
chord.setParameter(kick, 'drive', 0.2);        // speaker presence

// --- EQ: Boost sub, cut mud, add click ---
const kickEq = chord.addNode('eq');
chord.setParameter(kickEq, 'low_freq', 60);
chord.setParameter(kickEq, 'low_gain', 4);     // boost the thump
chord.setParameter(kickEq, 'mid_freq', 350);
chord.setParameter(kickEq, 'mid_gain', -3);    // cut boxy frequencies
chord.setParameter(kickEq, 'mid_q', 2);
chord.setParameter(kickEq, 'high_freq', 4000);
chord.setParameter(kickEq, 'high_gain', 2);    // add beater click

// --- Compressor: Controls the body ---
const kickComp = chord.addNode('compressor');
chord.setParameter(kickComp, 'threshold', -10);
chord.setParameter(kickComp, 'ratio', 3);
chord.setParameter(kickComp, 'attack', 0.005);  // let transient through
chord.setParameter(kickComp, 'release', 0.08);
chord.setParameter(kickComp, 'makeup', 2);

const kickGain = chord.addNode('gain');
chord.setParameter(kickGain, 'gain', 0.7);

// Routing: kick -> EQ -> compressor -> gain
chord.connect(kick, 'out', kickEq, 'in');
chord.connect(kickEq, 'out', kickComp, 'in');
chord.connect(kickComp, 'out', kickGain, 'in');
```

#### Snare Drum

```typescript
// --- Snare synthesis ---
const snare = chord.addNode('snare_drum');
chord.setParameter(snare, 'body_freq', 200);
chord.setParameter(snare, 'body_decay', 0.08);
chord.setParameter(snare, 'noise_decay', 0.15);
chord.setParameter(snare, 'noise_color', 0.6);  // slightly bright
chord.setParameter(snare, 'crack', 0.7);        // sharp transient
chord.setParameter(snare, 'mix', 0.5);          // balanced body/noise

// --- EQ: Cut low mud, boost crack, add presence ---
const snareEq = chord.addNode('eq');
chord.setParameter(snareEq, 'low_freq', 150);
chord.setParameter(snareEq, 'low_gain', -4);    // remove kick bleed range
chord.setParameter(snareEq, 'mid_freq', 1000);
chord.setParameter(snareEq, 'mid_gain', 2);     // body presence
chord.setParameter(snareEq, 'mid_q', 1.5);
chord.setParameter(snareEq, 'high_freq', 6000);
chord.setParameter(snareEq, 'high_gain', 3);    // crack and sizzle

// --- Compressor: Punchy attack ---
const snareComp = chord.addNode('compressor');
chord.setParameter(snareComp, 'threshold', -8);
chord.setParameter(snareComp, 'ratio', 3.5);
chord.setParameter(snareComp, 'attack', 0.003); // very fast -- preserve snap
chord.setParameter(snareComp, 'release', 0.06);
chord.setParameter(snareComp, 'makeup', 3);

const snareGain = chord.addNode('gain');
chord.setParameter(snareGain, 'gain', 0.5);

// Routing: snare -> EQ -> compressor -> gain
chord.connect(snare, 'out', snareEq, 'in');
chord.connect(snareEq, 'out', snareComp, 'in');
chord.connect(snareComp, 'out', snareGain, 'in');
```

#### Hi-Hat

```typescript
// --- Hi-hat synthesis ---
const hat = chord.addNode('hi_hat');
chord.setParameter(hat, 'decay', 0.03);        // tight closed hat
chord.setParameter(hat, 'tone', 0.7);          // bright
chord.setParameter(hat, 'ring_mod', 0.7);      // metallic character

// --- Highpass filter: Remove low energy that fights with kick ---
const hatFilt = chord.addNode('filter');
chord.setParameter(hatFilt, 'cutoff', 6000);
chord.setParameter(hatFilt, 'resonance', 0.5);
chord.setParameter(hatFilt, 'mode', 1);         // highpass

const hatGain = chord.addNode('gain');
chord.setParameter(hatGain, 'gain', 0.3);

// Routing: hat -> highpass -> gain
chord.connect(hat, 'out', hatFilt, 'in');
chord.connect(hatFilt, 'out', hatGain, 'in');
```

#### Clap

```typescript
// --- Clap synthesis ---
const clap = chord.addNode('clap');
chord.setParameter(clap, 'bursts', 4);
chord.setParameter(clap, 'spread', 0.012);
chord.setParameter(clap, 'decay', 0.15);
chord.setParameter(clap, 'tone', 0.5);

// --- Reverb: Claps always get a touch of room ---
const clapRev = chord.addNode('reverb');
chord.setParameter(clapRev, 'decay', 1.2);
chord.setParameter(clapRev, 'mix', 0.2);
chord.setParameter(clapRev, 'damping', 0.5);

const clapGain = chord.addNode('gain');
chord.setParameter(clapGain, 'gain', 0.4);

// Routing: clap -> reverb -> gain
chord.connect(clap, 'out', clapRev, 'in');
chord.connect(clapRev, 'out', clapGain, 'in');
```

#### Full Drum Bus (putting it all together)

```typescript
// --- Drum bus: Sum all drums, compress, limit ---
const drumBus = chord.addNode('gain');
chord.setParameter(drumBus, 'gain', 1.0);

// --- Bus compressor: Glues the kit together ---
const drumComp = chord.addNode('compressor');
chord.setParameter(drumComp, 'threshold', -6);
chord.setParameter(drumComp, 'ratio', 2.5);
chord.setParameter(drumComp, 'attack', 0.01);   // lets transients breathe
chord.setParameter(drumComp, 'release', 0.12);
chord.setParameter(drumComp, 'knee', 8);
chord.setParameter(drumComp, 'makeup', 2);

const out = chord.addNode('output');

// All drum gains -> bus -> compressor -> output
chord.connect(kickGain, 'out', drumBus, 'in');
chord.connect(snareGain, 'out', drumBus, 'in');
chord.connect(hatGain, 'out', drumBus, 'in');
chord.connect(clapGain, 'out', drumBus, 'in');

chord.connect(drumBus, 'out', drumComp, 'in');
chord.connect(drumComp, 'out', out, 'in');

// --- Trigger drums in a pattern ---
// (Use setInterval, requestAnimationFrame, or Chord's sequencer nodes)
chord.triggerNode(kick);
chord.triggerNode(snare);
chord.triggerNode(hat);
chord.triggerNode(clap);
```

**Why each drum needs processing:**
- **Kick** needs EQ to separate the sub thump from the beater click, and
  compression to control the body envelope.
- **Snare** needs EQ to cut the low-end mud that fights the kick, and
  compression to make the crack snap consistently.
- **Hi-hat** needs highpass filtering because its low frequencies are just
  garbage that competes with everything else.
- **Clap** needs reverb because a dry clap sounds like a glitch -- real claps
  happen in rooms.
- **The whole kit** needs bus compression to glue it together so it sounds like
  one drum kit, not four disconnected samples.

---

### Recipe 4: Ambient Textures

Ambient textures work by layering multiple independent elements at different
frequency ranges and modulation rates. The key word is **independent** -- if
everything moves in sync, it sounds mechanical.

```typescript
const chord = new Chord();
await chord.start();
chord.setMasterVolume(0.4);

// === Layer 1: Deep drone (20-200 Hz) ===
const drone = chord.addNode('oscillator');
chord.setParameter(drone, 'frequency', 55);     // A1
chord.setParameter(drone, 'waveform', 0);       // sine
chord.setParameter(drone, 'gain', 0.1);

const droneLfo = chord.addNode('lfo');
chord.setParameter(droneLfo, 'rate', 0.03);     // 33 second cycle
chord.setParameter(droneLfo, 'depth', 3);       // very subtle pitch drift
chord.setParameter(droneLfo, 'shape', 0);
chord.connect(droneLfo, 'out', drone, 'freq');

// === Layer 2: Mid texture (300-3000 Hz) ===
const tex1 = chord.addNode('noise');
chord.setParameter(tex1, 'color', 2);           // brown noise -- dark
chord.setParameter(tex1, 'gain', 0.04);

const texBp = chord.addNode('filter');
chord.setParameter(texBp, 'cutoff', 800);
chord.setParameter(texBp, 'resonance', 2.0);
chord.setParameter(texBp, 'mode', 2);           // bandpass

const texLfo = chord.addNode('lfo');
chord.setParameter(texLfo, 'rate', 0.07);       // 14 second cycle -- different
chord.setParameter(texLfo, 'depth', 500);
chord.setParameter(texLfo, 'shape', 0);

chord.connect(tex1, 'out', texBp, 'in');
chord.connect(texLfo, 'out', texBp, 'cutoff');

// === Layer 3: High shimmer (2000-10000 Hz) ===
const shimmer1 = chord.addNode('oscillator');
chord.setParameter(shimmer1, 'frequency', 523.25); // C5
chord.setParameter(shimmer1, 'waveform', 3);       // triangle
chord.setParameter(shimmer1, 'gain', 0.02);

const shimmer2 = chord.addNode('oscillator');
chord.setParameter(shimmer2, 'frequency', 524.5);  // slightly detuned
chord.setParameter(shimmer2, 'waveform', 0);       // sine
chord.setParameter(shimmer2, 'detune', 8);
chord.setParameter(shimmer2, 'gain', 0.015);

const shimLfo = chord.addNode('lfo');
chord.setParameter(shimLfo, 'rate', 0.12);         // 8 second cycle -- different
chord.setParameter(shimLfo, 'depth', 30);           // pitch wobble
chord.setParameter(shimLfo, 'shape', 0);

chord.connect(shimLfo, 'out', shimmer1, 'freq');

// === Layer 4: Air / breath (8000+ Hz) ===
const air = chord.addNode('noise');
chord.setParameter(air, 'color', 0);               // white noise
chord.setParameter(air, 'gain', 0.008);

const airFilt = chord.addNode('filter');
chord.setParameter(airFilt, 'cutoff', 10000);
chord.setParameter(airFilt, 'resonance', 0.3);
chord.setParameter(airFilt, 'mode', 1);             // highpass

chord.connect(air, 'out', airFilt, 'in');

// === Effects ===
const bus = chord.addNode('gain');
chord.setParameter(bus, 'gain', 1.0);

const dly = chord.addNode('delay');
chord.setParameter(dly, 'time', 0.75);              // long delay
chord.setParameter(dly, 'feedback', 0.35);
chord.setParameter(dly, 'mix', 0.2);
chord.setParameter(dly, 'damping', 0.6);

const rev = chord.addNode('reverb');
chord.setParameter(rev, 'decay', 6.0);              // very long tail
chord.setParameter(rev, 'mix', 0.35);
chord.setParameter(rev, 'damping', 0.7);
chord.setParameter(rev, 'diffusion', 0.9);

const out = chord.addNode('output');

// All layers -> bus -> delay -> reverb -> output
chord.connect(drone, 'out', bus, 'in');
chord.connect(texBp, 'out', bus, 'in');
chord.connect(shimmer1, 'out', bus, 'in');
chord.connect(shimmer2, 'out', bus, 'in');
chord.connect(airFilt, 'out', bus, 'in');

chord.connect(bus, 'out', dly, 'in');
chord.connect(dly, 'out', rev, 'in');
chord.connect(rev, 'out', out, 'in');
```

**Why it works:** Each layer occupies a different frequency range (sub, mid,
high, air) so they never fight. Each LFO runs at a different rate (0.03, 0.07,
0.12 Hz) so the combined motion is complex and never repeats in a predictable
cycle. Heavy reverb and delay push everything into a deep, immersive space.

---

### Recipe 5: Risers and Transitions

A riser builds tension over time. It combines three elements: a rising filter
sweep, a rising pitch, and an accelerating rhythm (optional). The trick is to
coordinate them so they all peak at exactly the same moment.

```typescript
const chord = new Chord();
await chord.start();
chord.setMasterVolume(0.5);

// --- Noise riser: Filtered noise with rising cutoff ---
const riserNoise = chord.addNode('noise');
chord.setParameter(riserNoise, 'color', 0);       // white
chord.setParameter(riserNoise, 'gain', 0.12);

const riserFilt = chord.addNode('filter');
chord.setParameter(riserFilt, 'cutoff', 200);      // starts dark
chord.setParameter(riserFilt, 'resonance', 8);     // high resonance = screaming
chord.setParameter(riserFilt, 'mode', 2);          // bandpass for focus

// --- Pitch riser: Sine that sweeps up ---
const riserTone = chord.addNode('oscillator');
chord.setParameter(riserTone, 'frequency', 100);   // starts low
chord.setParameter(riserTone, 'waveform', 0);      // sine
chord.setParameter(riserTone, 'gain', 0.06);

// --- Reverb: Gets wetter as it builds ---
const riserRev = chord.addNode('reverb');
chord.setParameter(riserRev, 'decay', 3.0);
chord.setParameter(riserRev, 'mix', 0.15);
chord.setParameter(riserRev, 'damping', 0.4);

const out = chord.addNode('output');

// Routing
chord.connect(riserNoise, 'out', riserFilt, 'in');
chord.connect(riserFilt, 'out', riserRev, 'in');
chord.connect(riserTone, 'out', riserRev, 'in');
chord.connect(riserRev, 'out', out, 'in');

// --- Automation: Sweep parameters over 4 seconds ---
const riserDuration = 4000; // ms
const startTime = performance.now();

function updateRiser() {
  const elapsed = performance.now() - startTime;
  const t = Math.min(elapsed / riserDuration, 1); // 0 to 1

  // Exponential curves feel more natural than linear
  const curve = t * t; // quadratic -- slow start, fast finish

  // Filter cutoff: 200 -> 14000 Hz
  chord.setParameter(riserFilt, 'cutoff', 200 + curve * 13800);

  // Resonance: increases for more screaming at the peak
  chord.setParameter(riserFilt, 'resonance', 8 + curve * 7);

  // Pitch: 100 -> 2000 Hz
  chord.setParameter(riserTone, 'frequency', 100 + curve * 1900);

  // Volume: builds from quiet to loud
  chord.setParameter(riserNoise, 'gain', 0.04 + curve * 0.16);
  chord.setParameter(riserTone, 'gain', 0.02 + curve * 0.1);

  // Reverb: gets wetter toward the peak
  chord.setParameter(riserRev, 'mix', 0.15 + curve * 0.3);

  if (t < 1) {
    requestAnimationFrame(updateRiser);
  }
}
requestAnimationFrame(updateRiser);
```

**To create the "drop" at the end of a riser:** At `t = 1`, instantly silence
the riser, slam the filter shut, and fire an impact sound (see next recipe):

```typescript
// At peak (t = 1):
chord.setParameter(riserNoise, 'gain', 0);
chord.setParameter(riserTone, 'gain', 0);
chord.setParameter(riserFilt, 'cutoff', 200);
// Fire impact sound (see Recipe 6)
```

---

### Recipe 6: Film Impacts

An impact is a short, explosive transient used at the climax of a riser, a
scene change, or a logo reveal. Professional impacts layer four elements:
a sub drop, a noise crack, a metallic ring, and a reverb tail.

```typescript
const chord = new Chord();
await chord.start();
chord.setMasterVolume(0.5);

// --- Sub drop: Sine that sweeps from 80 Hz to 25 Hz ---
const impactSub = chord.addNode('oscillator');
chord.setParameter(impactSub, 'frequency', 80);
chord.setParameter(impactSub, 'waveform', 0);     // sine
chord.setParameter(impactSub, 'gain', 0.3);

// --- Noise crack: Short burst of shaped noise ---
const impactNoise = chord.addNode('noise');
chord.setParameter(impactNoise, 'color', 0);      // white
chord.setParameter(impactNoise, 'gain', 0.25);

const crackFilt = chord.addNode('filter');
chord.setParameter(crackFilt, 'cutoff', 5000);
chord.setParameter(crackFilt, 'resonance', 1.0);
chord.setParameter(crackFilt, 'mode', 0);         // lowpass

// --- Metallic ring: High oscillator with fast decay ---
const ring1 = chord.addNode('oscillator');
chord.setParameter(ring1, 'frequency', 1200);
chord.setParameter(ring1, 'waveform', 0);         // sine
chord.setParameter(ring1, 'gain', 0.08);

const ring2 = chord.addNode('oscillator');
chord.setParameter(ring2, 'frequency', 1837);     // inharmonic ratio for metal
chord.setParameter(ring2, 'waveform', 0);
chord.setParameter(ring2, 'gain', 0.05);

// --- Heavy reverb on everything ---
const impactRev = chord.addNode('reverb');
chord.setParameter(impactRev, 'decay', 4.0);
chord.setParameter(impactRev, 'mix', 0.4);        // very wet
chord.setParameter(impactRev, 'damping', 0.5);
chord.setParameter(impactRev, 'diffusion', 0.9);

// --- Waveshaper for grit ---
const impactSat = chord.addNode('waveshaper');
chord.setParameter(impactSat, 'drive', 0.35);
chord.setParameter(impactSat, 'mode', 1);         // hard clip -- aggressive
chord.setParameter(impactSat, 'mix', 0.3);

const bus = chord.addNode('gain');
chord.setParameter(bus, 'gain', 1.0);

const out = chord.addNode('output');

// Routing
chord.connect(impactSub, 'out', bus, 'in');
chord.connect(impactNoise, 'out', crackFilt, 'in');
chord.connect(crackFilt, 'out', bus, 'in');
chord.connect(ring1, 'out', bus, 'in');
chord.connect(ring2, 'out', bus, 'in');

chord.connect(bus, 'out', impactSat, 'in');
chord.connect(impactSat, 'out', impactRev, 'in');
chord.connect(impactRev, 'out', out, 'in');

// --- Automation: Everything decays after the initial hit ---
const hitTime = performance.now();

function updateImpact() {
  const elapsed = (performance.now() - hitTime) / 1000; // seconds

  // Sub: pitch drops from 80 to 25 Hz over 0.5s
  if (elapsed < 0.5) {
    const t = elapsed / 0.5;
    chord.setParameter(impactSub, 'frequency', 80 - t * 55);
  }

  // Sub gain: decays over 1 second
  chord.setParameter(impactSub, 'gain', Math.max(0, 0.3 * (1 - elapsed / 1.0)));

  // Noise crack: very fast decay (50ms)
  chord.setParameter(impactNoise, 'gain', Math.max(0, 0.25 * (1 - elapsed / 0.05)));

  // Metallic ring: medium decay (300ms)
  chord.setParameter(ring1, 'gain', Math.max(0, 0.08 * (1 - elapsed / 0.3)));
  chord.setParameter(ring2, 'gain', Math.max(0, 0.05 * (1 - elapsed / 0.3)));

  // Filter on noise closes fast
  chord.setParameter(crackFilt, 'cutoff', Math.max(200, 5000 * (1 - elapsed / 0.1)));

  if (elapsed < 4) {
    requestAnimationFrame(updateImpact);
  }
}
requestAnimationFrame(updateImpact);
```

**Variation for "reverse swell" before the impact:** Create a 2-second riser
(Recipe 5) that peaks at the exact moment the impact fires. The riser creates
anticipation; the impact delivers the payoff.

---

## Layering Rules

### Frequency Stacking

The audible spectrum is finite. When two elements occupy the same frequency
range, they fight each other and create mud. The solution is to assign each
element a frequency "home" and use EQ and filtering to keep it there.

| Band | Range | What Lives Here |
|------|-------|----------------|
| Sub | 20-60 Hz | Kick fundamental, sub bass sine. One element only. |
| Bass | 60-250 Hz | Bass body, kick body. Use EQ to carve between them. |
| Low-mid | 250-500 Hz | The "mud zone." Cut aggressively on everything except bass. |
| Mid | 500-2000 Hz | Snare body, lead melody, pad presence. Most musical info. |
| High-mid | 2000-6000 Hz | Snare crack, hi-hat, lead brightness, vocal presence. |
| Presence | 6000-10000 Hz | Hi-hat shimmer, air, sparkle. |
| Air | 10000-20000 Hz | Noise texture, extreme high shimmer. Subtle. |

**The golden rule:** No more than 2-3 elements should be loud in any single
band at the same time.

**How to use EQ to carve space:**

```typescript
// Bass: remove everything above 250 Hz
const bassEq = chord.addNode('eq');
chord.setParameter(bassEq, 'mid_freq', 400);
chord.setParameter(bassEq, 'mid_gain', -6);
chord.setParameter(bassEq, 'mid_q', 0.8);
chord.setParameter(bassEq, 'high_freq', 3000);
chord.setParameter(bassEq, 'high_gain', -12);

// Lead: remove low end, boost presence
const leadEq = chord.addNode('eq');
chord.setParameter(leadEq, 'low_freq', 200);
chord.setParameter(leadEq, 'low_gain', -8);
chord.setParameter(leadEq, 'mid_freq', 2500);
chord.setParameter(leadEq, 'mid_gain', 3);
chord.setParameter(leadEq, 'mid_q', 1.5);
chord.setParameter(leadEq, 'high_freq', 8000);
chord.setParameter(leadEq, 'high_gain', 2);

// Pad: scoop the mids so it does not fight the lead
const padEq = chord.addNode('eq');
chord.setParameter(padEq, 'low_freq', 100);
chord.setParameter(padEq, 'low_gain', 2);
chord.setParameter(padEq, 'mid_freq', 2000);
chord.setParameter(padEq, 'mid_gain', -4);   // scoop
chord.setParameter(padEq, 'mid_q', 0.5);     // wide scoop
chord.setParameter(padEq, 'high_freq', 8000);
chord.setParameter(padEq, 'high_gain', 3);   // add air
```

### Depth Stacking

Not everything should be at the same distance from the listener. Create a sense
of front-to-back depth by varying reverb and volume:

| Layer | Reverb Mix | Volume | Character |
|-------|-----------|--------|-----------|
| **Front** | 0.05-0.1 | Loudest | Dry, sharp transients. Drums, lead melody. |
| **Middle** | 0.15-0.25 | Medium | Moderate space. Pads, bass, rhythm guitar. |
| **Back** | 0.3-0.4 | Quiet | Heavy reverb, soft. Ambient textures, drones. |

```typescript
// Front: drums with minimal reverb
const frontRev = chord.addNode('reverb');
chord.setParameter(frontRev, 'decay', 0.8);
chord.setParameter(frontRev, 'mix', 0.08);

// Middle: pad with moderate reverb
const midRev = chord.addNode('reverb');
chord.setParameter(midRev, 'decay', 2.5);
chord.setParameter(midRev, 'mix', 0.2);

// Back: ambient drone with heavy reverb
const backRev = chord.addNode('reverb');
chord.setParameter(backRev, 'decay', 6.0);
chord.setParameter(backRev, 'mix', 0.35);
```

### Gain Staging

Before the output, every element should be carefully leveled. Here is a
starting point for a typical mix:

| Element | Gain Range | Notes |
|---------|-----------|-------|
| Kick | 0.5-0.8 | Loudest drum. Anchor of the mix. |
| Snare | 0.4-0.6 | Slightly below kick. |
| Hi-hat | 0.15-0.3 | Much quieter than kick/snare. |
| Clap | 0.3-0.5 | Similar to snare. |
| Bass | 0.15-0.25 | Felt more than heard. |
| Lead | 0.06-0.12 | Sits on top, but does not dominate. |
| Pad | 0.03-0.06 | Background glue. Barely audible individually. |
| Sub oscillator | 0.05-0.1 | Foundational. Not loud, just present. |
| Noise texture | 0.01-0.03 | Should be subliminal. |
| Drone | 0.05-0.1 | Constant background. Never draws attention. |

---

## The Professional Sound Checklist

Before considering any patch "done," verify it passes all six checks:

### 1. Multiple Sources

- [ ] Are there at least 2 voices for any pitched element?
- [ ] Does it include a sub layer (sine, one octave below)?
- [ ] Is there a noise or texture layer?

### 2. Filtering

- [ ] Is every oscillator routed through a filter before the output?
- [ ] Is the filter cutoff appropriate (not wide open)?
- [ ] Is resonance above 0 but below 5 for normal sounds?

### 3. Movement

- [ ] Is at least one parameter being modulated by an LFO?
- [ ] Is the filter cutoff modulated?
- [ ] For ambient/pad sounds: are LFO rates different per layer?

### 4. Space

- [ ] Is there reverb in the chain?
- [ ] Is reverb mix between 0.1 and 0.35 (0.4 max for ambient)?
- [ ] Is there delay if the sound needs rhythmic depth?
- [ ] Is chorus/phaser considered for width?

### 5. Texture

- [ ] Is there saturation or waveshaping on bass/drum sounds?
- [ ] Is there a noise layer for organic character?
- [ ] For the "too clean" test: mute the noise and texture layers.
      Does it sound sterile? If yes, they are doing their job.

### 6. Dynamics

- [ ] Are drums running through a compressor?
- [ ] Is a bus compressor gluing grouped elements?
- [ ] Is the final output through a limiter (Chord's master chain
      includes one by default, but verify)?

---

## Common Parameter Ranges That Sound Good

Use these as starting points. They are not rules; they are guardrails.

### Oscillator

| Scenario | Waveform | Detune | Gain |
|----------|----------|--------|------|
| Pad voice | 1 (saw) | +/-7 to +/-15 cents | 0.04-0.08 |
| Bass | 1 (saw) | 0 | 0.1-0.2 |
| Sub | 0 (sine) | 0 | 0.06-0.15 |
| Lead | 2 (square) or 1 (saw) | 0 to +/-5 | 0.06-0.1 |
| Shimmer | 3 (triangle) or 0 (sine) | +/-5 to +/-10 | 0.01-0.03 |

### Filter

| Scenario | Cutoff | Resonance | Mode |
|----------|--------|-----------|------|
| Warm pad | 1500-3000 Hz | 0.5-1.5 | 0 (lowpass) |
| Bass | 400-1200 Hz | 1.0-4.0 | 0 (lowpass) |
| Dark drone | 200-600 Hz | 0.3-0.7 | 0 (lowpass) |
| Bright lead | 3000-6000 Hz | 1.0-2.0 | 0 (lowpass) |
| Noise texture | 2000-5000 Hz | 1.0-3.0 | 2 (bandpass) |
| Hi-hat cleanup | 5000-8000 Hz | 0.3-0.7 | 1 (highpass) |

### Reverb

| Scenario | Decay | Mix | Damping |
|----------|-------|-----|---------|
| Tight room (drums) | 0.5-1.5 s | 0.05-0.12 | 0.5-0.7 |
| Medium hall (pad/lead) | 2.0-4.0 s | 0.15-0.25 | 0.5-0.7 |
| Cathedral (ambient) | 4.0-8.0 s | 0.25-0.35 | 0.6-0.8 |
| Infinite wash (drone) | 10.0-20.0 s | 0.3-0.4 | 0.7-0.9 |

### Delay

| Scenario | Time | Feedback | Mix |
|----------|------|----------|-----|
| Slapback (rock) | 0.08-0.12 s | 0.1-0.2 | 0.1-0.2 |
| Eighth note (120 BPM) | 0.25 s | 0.2-0.35 | 0.1-0.2 |
| Dotted eighth (120 BPM) | 0.375 s | 0.2-0.3 | 0.12-0.2 |
| Long ambient | 0.5-1.5 s | 0.3-0.5 | 0.15-0.25 |
| Ping pong feel | 0.375 s | 0.25-0.4 | 0.15-0.25 |

### Compressor

| Scenario | Threshold | Ratio | Attack | Release |
|----------|----------|-------|--------|---------|
| Kick | -8 to -15 dB | 3-5 | 0.003-0.01 s | 0.05-0.1 s |
| Snare | -6 to -12 dB | 3-4 | 0.002-0.005 s | 0.04-0.08 s |
| Bass | -12 to -18 dB | 3-5 | 0.01-0.03 s | 0.1-0.2 s |
| Drum bus | -4 to -8 dB | 2-3 | 0.008-0.02 s | 0.08-0.15 s |
| Mix bus (gentle glue) | -3 to -6 dB | 1.5-2.5 | 0.015-0.03 s | 0.1-0.2 s |

### Waveshaper

| Scenario | Drive | Mode | Mix |
|----------|-------|------|-----|
| Subtle warmth | 0.1-0.2 | 0 (soft clip) | 0.2-0.3 |
| Bass presence | 0.2-0.35 | 2 (tape) | 0.3-0.5 |
| Aggressive grit | 0.4-0.7 | 1 (hard clip) | 0.3-0.5 |
| Pad richness | 0.1-0.2 | 3 (tube) | 0.2-0.4 |

---

## The "NEVER DO" List

These are the most common mistakes that instantly make audio sound amateur.
If you find yourself doing any of these, stop and fix it.

1. **NEVER route a raw oscillator directly to the output.** Always go through
   at least a filter. Always.

2. **NEVER build a pad with a single voice.** Minimum is 2 detuned oscillators
   plus a sub. Four voices is the standard.

3. **NEVER leave parameters static.** If nothing is modulated by an LFO or
   automation, the sound is dead. Add a slow filter LFO at minimum.

4. **NEVER skip compression on drums.** Uncompressed drums sound weak and
   inconsistent. Every drum element needs individual compression, and the drum
   bus needs bus compression.

5. **NEVER set reverb mix above 0.4 on anything except pure ambient textures.**
   High reverb mix washes out transients and creates mud. A mix of 0.2 goes a
   lot further than you think.

6. **NEVER put two loud elements in the same frequency band.** If the bass and
   the pad are both living in 100-400 Hz, use EQ to carve one or the other.
   This is the #1 cause of muddy mixes.

7. **NEVER use the same reverb settings for everything.** Drums want short,
   tight reverb. Pads want long, lush reverb. Using one reverb for everything
   sounds flat and one-dimensional.

8. **NEVER forget the sub layer.** Even if you cannot hear it on laptop
   speakers, the sub is what makes audio feel powerful on real playback systems.

9. **NEVER set all LFO rates to the same value.** If every layer pulses at the
   same speed, the effect is mechanical and obvious. Vary rates: 0.03, 0.07,
   0.12, 0.2 -- primes and odd numbers work well because they never sync up.

10. **NEVER skip gain staging.** If you just set everything to `gain: 0.5` and
    hope for the best, the mix will be a wall of sameness. Refer to the gain
    staging table above. Quiet elements are just as important as loud ones.

---

## Quick Reference: Signal Chain Templates

### Pad Signal Chain
```
oscillator x4 (detuned) ──┐
sub oscillator (sine) ─────┤
noise (pink, filtered) ────┼── filter (LP, LFO on cutoff) ── chorus ── reverb ── output
```

### Bass Signal Chain
```
oscillator (saw) ──┐
sub oscillator ────┼── filter (LP, resonant) ── waveshaper (tape) ── compressor ── output
```

### Drum Signal Chain
```
kick_drum ── EQ ── compressor ──┐
snare_drum ── EQ ── compressor ─┤
hi_hat ── highpass filter ──────┤
clap ── reverb ─────────────────┼── drum bus (gain) ── bus compressor ── output
```

### Ambient Signal Chain
```
drone (sine, LFO on pitch) ────────────┐
noise (brown, bandpass, LFO on cutoff) ┤
shimmer (triangle x2, detuned) ────────┤
air (white, highpass) ─────────────────┼── bus ── delay ── reverb ── output
```

### Riser Signal Chain
```
noise (white) ── bandpass filter (automated cutoff + resonance) ──┐
oscillator (automated pitch) ─────────────────────────────────────┼── reverb ── output
```

### Impact Signal Chain
```
sub oscillator (pitch drop) ────┐
noise (fast decay) ── lowpass ──┤
ring oscillators (fast decay) ──┼── bus ── waveshaper ── reverb ── output
```

---

## Putting It All Together: A Complete Scene

Here is a full scene that combines a pad, bass, drums, and atmosphere into a
cohesive mix. This is the kind of thing you should be generating when asked to
"make something that sounds good."

```typescript
const chord = new Chord();
await chord.start();
chord.setMasterVolume(0.45);

// ============================================
//  PAD: 4 detuned saws + sub + chorus + reverb
// ============================================
const padSaw1 = chord.addNode('oscillator');
chord.setParameter(padSaw1, 'frequency', 130.81);
chord.setParameter(padSaw1, 'waveform', 1);
chord.setParameter(padSaw1, 'detune', 12);
chord.setParameter(padSaw1, 'gain', 0.04);

const padSaw2 = chord.addNode('oscillator');
chord.setParameter(padSaw2, 'frequency', 130.81);
chord.setParameter(padSaw2, 'waveform', 1);
chord.setParameter(padSaw2, 'detune', -12);
chord.setParameter(padSaw2, 'gain', 0.04);

const padSaw3 = chord.addNode('oscillator');
chord.setParameter(padSaw3, 'frequency', 196.0);
chord.setParameter(padSaw3, 'waveform', 1);
chord.setParameter(padSaw3, 'detune', 7);
chord.setParameter(padSaw3, 'gain', 0.03);

const padSaw4 = chord.addNode('oscillator');
chord.setParameter(padSaw4, 'frequency', 196.0);
chord.setParameter(padSaw4, 'waveform', 3);
chord.setParameter(padSaw4, 'detune', -7);
chord.setParameter(padSaw4, 'gain', 0.025);

const padSub = chord.addNode('oscillator');
chord.setParameter(padSub, 'frequency', 65.41);
chord.setParameter(padSub, 'waveform', 0);
chord.setParameter(padSub, 'gain', 0.05);

const padNoise = chord.addNode('noise');
chord.setParameter(padNoise, 'color', 1);
chord.setParameter(padNoise, 'gain', 0.01);

const padFilt = chord.addNode('filter');
chord.setParameter(padFilt, 'cutoff', 2500);
chord.setParameter(padFilt, 'resonance', 0.8);
chord.setParameter(padFilt, 'mode', 0);

const padLfo = chord.addNode('lfo');
chord.setParameter(padLfo, 'rate', 0.12);
chord.setParameter(padLfo, 'depth', 1200);
chord.setParameter(padLfo, 'shape', 0);

const padEq = chord.addNode('eq');
chord.setParameter(padEq, 'mid_freq', 2000);
chord.setParameter(padEq, 'mid_gain', -3);      // scoop mids for bass/lead
chord.setParameter(padEq, 'mid_q', 0.5);

const padChorus = chord.addNode('chorus');
chord.setParameter(padChorus, 'rate', 0.3);
chord.setParameter(padChorus, 'depth', 0.35);
chord.setParameter(padChorus, 'mix', 0.2);

const padRev = chord.addNode('reverb');
chord.setParameter(padRev, 'decay', 4.0);
chord.setParameter(padRev, 'mix', 0.25);
chord.setParameter(padRev, 'damping', 0.7);

// Pad routing
chord.connect(padSaw1, 'out', padFilt, 'in');
chord.connect(padSaw2, 'out', padFilt, 'in');
chord.connect(padSaw3, 'out', padFilt, 'in');
chord.connect(padSaw4, 'out', padFilt, 'in');
chord.connect(padSub, 'out', padFilt, 'in');
chord.connect(padNoise, 'out', padFilt, 'in');
chord.connect(padLfo, 'out', padFilt, 'cutoff');
chord.connect(padFilt, 'out', padEq, 'in');
chord.connect(padEq, 'out', padChorus, 'in');
chord.connect(padChorus, 'out', padRev, 'in');

// ============================================
//  BASS: Saw + sub + filter + saturation + comp
// ============================================
const bassSaw = chord.addNode('oscillator');
chord.setParameter(bassSaw, 'frequency', 65.41);
chord.setParameter(bassSaw, 'waveform', 1);
chord.setParameter(bassSaw, 'gain', 0.12);

const bassSub = chord.addNode('oscillator');
chord.setParameter(bassSub, 'frequency', 65.41);
chord.setParameter(bassSub, 'waveform', 0);
chord.setParameter(bassSub, 'gain', 0.15);

const bassFilt = chord.addNode('filter');
chord.setParameter(bassFilt, 'cutoff', 600);
chord.setParameter(bassFilt, 'resonance', 2.5);
chord.setParameter(bassFilt, 'mode', 0);

const bassSat = chord.addNode('waveshaper');
chord.setParameter(bassSat, 'drive', 0.2);
chord.setParameter(bassSat, 'mode', 2);
chord.setParameter(bassSat, 'mix', 0.35);

const bassComp = chord.addNode('compressor');
chord.setParameter(bassComp, 'threshold', -15);
chord.setParameter(bassComp, 'ratio', 4);
chord.setParameter(bassComp, 'attack', 0.01);
chord.setParameter(bassComp, 'release', 0.1);
chord.setParameter(bassComp, 'makeup', 3);

const bassEq = chord.addNode('eq');
chord.setParameter(bassEq, 'low_freq', 60);
chord.setParameter(bassEq, 'low_gain', 3);
chord.setParameter(bassEq, 'mid_freq', 400);
chord.setParameter(bassEq, 'mid_gain', -2);
chord.setParameter(bassEq, 'mid_q', 1);
chord.setParameter(bassEq, 'high_freq', 3000);
chord.setParameter(bassEq, 'high_gain', -8);

// Bass routing
chord.connect(bassSaw, 'out', bassFilt, 'in');
chord.connect(bassSub, 'out', bassFilt, 'in');
chord.connect(bassFilt, 'out', bassSat, 'in');
chord.connect(bassSat, 'out', bassComp, 'in');
chord.connect(bassComp, 'out', bassEq, 'in');

// ============================================
//  DRUMS: kick + snare + hat + clap, each processed
// ============================================
const kick = chord.addNode('kick_drum');
chord.setParameter(kick, 'frequency', 50);
chord.setParameter(kick, 'pitch_env', 300);
chord.setParameter(kick, 'pitch_decay', 0.04);
chord.setParameter(kick, 'body_decay', 0.3);
chord.setParameter(kick, 'click', 0.6);
chord.setParameter(kick, 'drive', 0.2);

const kickEq = chord.addNode('eq');
chord.setParameter(kickEq, 'low_freq', 60);
chord.setParameter(kickEq, 'low_gain', 4);
chord.setParameter(kickEq, 'mid_freq', 350);
chord.setParameter(kickEq, 'mid_gain', -3);
chord.setParameter(kickEq, 'mid_q', 2);
chord.setParameter(kickEq, 'high_freq', 4000);
chord.setParameter(kickEq, 'high_gain', 2);

const kickComp = chord.addNode('compressor');
chord.setParameter(kickComp, 'threshold', -10);
chord.setParameter(kickComp, 'ratio', 3);
chord.setParameter(kickComp, 'attack', 0.005);
chord.setParameter(kickComp, 'release', 0.08);
chord.setParameter(kickComp, 'makeup', 2);

const kickGain = chord.addNode('gain');
chord.setParameter(kickGain, 'gain', 0.7);

chord.connect(kick, 'out', kickEq, 'in');
chord.connect(kickEq, 'out', kickComp, 'in');
chord.connect(kickComp, 'out', kickGain, 'in');

const snare = chord.addNode('snare_drum');
chord.setParameter(snare, 'body_freq', 200);
chord.setParameter(snare, 'body_decay', 0.08);
chord.setParameter(snare, 'noise_decay', 0.15);
chord.setParameter(snare, 'noise_color', 0.6);
chord.setParameter(snare, 'crack', 0.7);
chord.setParameter(snare, 'mix', 0.5);

const snareEq = chord.addNode('eq');
chord.setParameter(snareEq, 'low_freq', 150);
chord.setParameter(snareEq, 'low_gain', -4);
chord.setParameter(snareEq, 'mid_freq', 1000);
chord.setParameter(snareEq, 'mid_gain', 2);
chord.setParameter(snareEq, 'mid_q', 1.5);
chord.setParameter(snareEq, 'high_freq', 6000);
chord.setParameter(snareEq, 'high_gain', 3);

const snareComp = chord.addNode('compressor');
chord.setParameter(snareComp, 'threshold', -8);
chord.setParameter(snareComp, 'ratio', 3.5);
chord.setParameter(snareComp, 'attack', 0.003);
chord.setParameter(snareComp, 'release', 0.06);
chord.setParameter(snareComp, 'makeup', 3);

const snareGain = chord.addNode('gain');
chord.setParameter(snareGain, 'gain', 0.5);

chord.connect(snare, 'out', snareEq, 'in');
chord.connect(snareEq, 'out', snareComp, 'in');
chord.connect(snareComp, 'out', snareGain, 'in');

const hat = chord.addNode('hi_hat');
chord.setParameter(hat, 'decay', 0.03);
chord.setParameter(hat, 'tone', 0.7);
chord.setParameter(hat, 'ring_mod', 0.7);

const hatHp = chord.addNode('filter');
chord.setParameter(hatHp, 'cutoff', 6000);
chord.setParameter(hatHp, 'resonance', 0.5);
chord.setParameter(hatHp, 'mode', 1);

const hatGain = chord.addNode('gain');
chord.setParameter(hatGain, 'gain', 0.25);

chord.connect(hat, 'out', hatHp, 'in');
chord.connect(hatHp, 'out', hatGain, 'in');

const clap = chord.addNode('clap');
chord.setParameter(clap, 'bursts', 4);
chord.setParameter(clap, 'spread', 0.012);
chord.setParameter(clap, 'decay', 0.15);
chord.setParameter(clap, 'tone', 0.5);

const clapRev = chord.addNode('reverb');
chord.setParameter(clapRev, 'decay', 1.2);
chord.setParameter(clapRev, 'mix', 0.2);
chord.setParameter(clapRev, 'damping', 0.5);

const clapGain = chord.addNode('gain');
chord.setParameter(clapGain, 'gain', 0.4);

chord.connect(clap, 'out', clapRev, 'in');
chord.connect(clapRev, 'out', clapGain, 'in');

// Drum bus
const drumBus = chord.addNode('gain');
chord.setParameter(drumBus, 'gain', 1.0);

const drumBusComp = chord.addNode('compressor');
chord.setParameter(drumBusComp, 'threshold', -6);
chord.setParameter(drumBusComp, 'ratio', 2.5);
chord.setParameter(drumBusComp, 'attack', 0.01);
chord.setParameter(drumBusComp, 'release', 0.12);
chord.setParameter(drumBusComp, 'knee', 8);
chord.setParameter(drumBusComp, 'makeup', 2);

chord.connect(kickGain, 'out', drumBus, 'in');
chord.connect(snareGain, 'out', drumBus, 'in');
chord.connect(hatGain, 'out', drumBus, 'in');
chord.connect(clapGain, 'out', drumBus, 'in');
chord.connect(drumBus, 'out', drumBusComp, 'in');

// ============================================
//  ATMOSPHERE: Noise texture + shimmer
// ============================================
const atmoNoise = chord.addNode('noise');
chord.setParameter(atmoNoise, 'color', 2);     // brown
chord.setParameter(atmoNoise, 'gain', 0.02);

const atmoBp = chord.addNode('filter');
chord.setParameter(atmoBp, 'cutoff', 1000);
chord.setParameter(atmoBp, 'resonance', 2.0);
chord.setParameter(atmoBp, 'mode', 2);

const atmoLfo = chord.addNode('lfo');
chord.setParameter(atmoLfo, 'rate', 0.07);
chord.setParameter(atmoLfo, 'depth', 600);
chord.setParameter(atmoLfo, 'shape', 0);

chord.connect(atmoNoise, 'out', atmoBp, 'in');
chord.connect(atmoLfo, 'out', atmoBp, 'cutoff');

const atmoRev = chord.addNode('reverb');
chord.setParameter(atmoRev, 'decay', 5.0);
chord.setParameter(atmoRev, 'mix', 0.3);
chord.setParameter(atmoRev, 'damping', 0.7);

chord.connect(atmoBp, 'out', atmoRev, 'in');

// ============================================
//  MASTER BUS
// ============================================
const masterBus = chord.addNode('gain');
chord.setParameter(masterBus, 'gain', 1.0);

const masterDly = chord.addNode('delay');
chord.setParameter(masterDly, 'time', 0.375);
chord.setParameter(masterDly, 'feedback', 0.2);
chord.setParameter(masterDly, 'mix', 0.1);
chord.setParameter(masterDly, 'damping', 0.5);

const out = chord.addNode('output');

// Everything -> master bus -> delay -> output
chord.connect(padRev, 'out', masterBus, 'in');
chord.connect(bassEq, 'out', masterBus, 'in');
chord.connect(drumBusComp, 'out', masterBus, 'in');
chord.connect(atmoRev, 'out', masterBus, 'in');

chord.connect(masterBus, 'out', masterDly, 'in');
chord.connect(masterDly, 'out', out, 'in');

// ============================================
//  PLAY: Trigger drums in a simple pattern
// ============================================
let step = 0;
setInterval(() => {
  if (step % 8 === 0) chord.triggerNode(kick);    // kick on 1
  if (step % 8 === 4) chord.triggerNode(snare);   // snare on 3
  if (step % 2 === 0) chord.triggerNode(hat);     // hats on every 8th
  if (step % 16 === 4) chord.triggerNode(clap);   // clap on 3 every 2 bars
  step++;
}, 125); // 125ms = 8th notes at 120 BPM
```

This scene has:
- **Multiple sources**: 4 pad saws, sub, noise, 2 bass oscs, 4 drum voices,
  atmosphere noise.
- **Filtering**: Pad lowpass, bass lowpass, hat highpass, atmosphere bandpass.
- **Movement**: Pad LFO on filter, atmosphere LFO on filter.
- **Space**: Pad reverb, clap reverb, atmosphere reverb, master delay.
- **Texture**: Bass saturation, pink noise on pad, brown noise atmosphere.
- **Dynamics**: Kick compressor, snare compressor, drum bus compressor.

That is a professional sound. That is what you should be building.
