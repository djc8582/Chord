# Sound Description Guide — Chord Vibe-to-Sound Engine

This document is a training reference for writing sound descriptions that Chord's
vibe-to-sound translation engine can parse into audio patches. It is intended as
structured data for AI systems, not casual documentation. Every example is
copy-paste usable. Every pattern is intentional.

---

## 1. Description Structure

Every effective description follows the **CHARACTER + ELEMENTS + CONTEXT** pattern.

| Component   | Purpose                                          | Example Fragment                          |
|-------------|--------------------------------------------------|-------------------------------------------|
| CHARACTER   | The overall sonic identity — mood, genre, energy | "dark minimal techno"                     |
| ELEMENTS    | Specific sonic building blocks requested         | "with a detuned saw bass and clap reverb" |
| CONTEXT     | Where/how it will be used, tempo, key, duration  | "for a warehouse set at 132 BPM"          |

### Minimal Valid Description

A description needs at least CHARACTER and one ELEMENT:

```
warm ambient pad with slow filter sweep
```

### Full Description

When all three components are present, the engine produces the most accurate results:

```
dark minimal techno kick and bass loop with sidechain compression and tape saturation, 130 BPM in D minor, for a peak-time DJ set
```

### Component Order

Order is flexible, but CHARACTER-first descriptions parse most reliably. These are equivalent:

```
dreamy lo-fi piano with vinyl crackle and tape wobble at 75 BPM
```
```
75 BPM lo-fi piano, dreamy, with vinyl crackle and tape wobble
```

The first form is preferred because the engine weights early tokens more heavily during
character classification.

---

## 2. Description Cookbook

Each entry below includes the description string and a note explaining what it produces.

### 2.1 Ambient / Background Music

#### Meditation

```
deep tibetan singing bowl drone with slow beating frequencies and gentle overtone shimmer, tuned to 432 Hz, 10 minutes of continuous evolution
```
> Produces a sustained drone built from detuned sine pairs creating binaural-style beating, with additive harmonics that fade in and out over long time scales.

```
warm analog pad washing between two chords, Cmaj7 to Am9, with granular rain texture underneath and a sub-bass hum at the root, very slow tempo
```
> Two-chord generative progression with granular sample playback layered beneath a filtered pad voice. Sub oscillator locked to chord root.

```
breathing meditation tone that swells in and out on a 4-second inhale/exhale cycle, sine wave with soft harmonics, no rhythm
```
> Amplitude-modulated sine cluster with LFO rate matched to breath cycle. No percussive elements.

```
crystal singing bowls layered with forest ambience, occasional bird calls panned wide, root note E3, shimmering and spacious
```
> Additive synthesis bowls with convolution reverb, sample-based nature layer, randomized trigger timing for bird events.

#### Focus / Productivity

```
brown noise shaped with a gentle low-pass filter at 200 Hz, mixed with soft generative marimba hits every 5-10 seconds, pentatonic C major
```
> Noise generator with static filter, sparse random note triggers from a quantized pitch set. Marimba voice uses FM synthesis.

```
lo-fi study beats, dusty Rhodes chords with vinyl crackle, simple boom-bap kick and snare at 72 BPM, tape-saturated master bus
```
> Classic lo-fi hip-hop patch: FM electric piano through bitcrusher and saturation, noise layer, simple two-step drum pattern.

```
steady white noise waterfall with subtle binaural 10 Hz alpha wave embedded, stereo width 100%, no tonal elements
```
> Stereo noise with slight pitch offset between L/R channels to produce binaural frequency difference. No melodic content.

#### Website / UI Background

```
minimal ambient texture, soft sine pad holding a single Cmaj7 chord, very quiet, with occasional high-frequency sparkle hits panned randomly
```
> Static chord pad at low amplitude with randomized trigger events for transient layer. Designed to sit beneath UI without demanding attention.

```
corporate ambient warmth, clean digital pad with slow attack, major key, gentle and optimistic, no rhythm, loop-ready 8 bars
```
> Simple sustained pad voice with long attack/release envelope. Loopable structure with crossfade-compatible start and end.

#### Sleep / Relaxation

```
deep ocean drone at 60 Hz with slow wave-like amplitude modulation, pitch drifting down by a semitone over 30 minutes, pink noise bed underneath
```
> Sub-frequency oscillator with very slow LFO on amplitude and a glacial pitch envelope. Pink noise mixed low.

```
gentle rainfall with distant thunder every 2-3 minutes, warm low-pass filtered noise, no tonal elements, continuous and non-looping
```
> Noise synthesis with dynamic filter modulation for rain character. Low-probability random trigger for thunder burst events.

---

### 2.2 Drums / Percussion

#### 808 / Trap

```
hard 808 kick with long sub tail, pitch dropping from G1 to C1, slight distortion on the transient, tight and punchy
```
> Sine oscillator with pitch envelope, fast attack transient layered with noise burst, waveshaper on transient portion only.

```
trap hi-hat pattern, closed hats in rapid triplet rolls with occasional open hat accents, metallic and crispy, 140 BPM half-time feel
```
> Noise-based hi-hat synthesis with bandpass filter, sequenced with triplet subdivisions and velocity variation. Open hat uses longer decay.

```
dark trap drum kit: booming 808 kick, sharp snare with heavy reverb tail, skittering hi-hats with roll automation, rim shots on offbeats, 70 BPM (140 half-time)
```
> Full trap drum patch with four voice allocation. 808 kick uses pitch envelope, snare has noise + tone layers, hi-hat uses sequencer with probability-based rolls.

```
808 cowbell, tuned to F#, dry and metallic, square wave body with short noise burst on attack
```
> Two-operator FM with fixed frequency ratio for metallic timbre. Noise burst envelope at onset.

#### Acoustic / Jazz

```
brushed jazz snare with wire sizzle, soft ghost notes between backbeats, natural velocity variation, swing at 65%, 120 BPM
```
> Physical modeling snare with brush exciter. Sequenced with swing quantization and humanized velocity curves.

```
acoustic jazz kit: warm kick with felt beater, brushed snare, ride cymbal with bell accents on beat 1, hi-hat foot splash on 2 and 4, 135 BPM swing
```
> Multi-voice acoustic drum modeling. Ride cymbal uses separate bell and bow strike models. Swing applied globally.

```
hand percussion ensemble: djembe playing a 6/8 pattern, shaker on eighth notes, clave on the tresillo rhythm, all panned slightly different, 110 BPM
```
> Physical modeling percussion voices. Each voice has independent pan position and pattern. Clave follows 3-3-2 tresillo figure.

#### Electronic / Techno

```
punchy techno kick, short sine body at 55 Hz with sharp click transient, no sub tail, very tight, designed for 4-on-the-floor at 128 BPM
```
> Sine oscillator with fast pitch envelope for click, very short amplitude decay. Optimized for sidechain pumping.

```
industrial techno percussion loop: distorted kick, metallic clang on offbeats, noise snare with bitcrusher, mechanical and relentless, 134 BPM
```
> Aggressive drum synthesis with waveshaping on all voices. Metallic hit uses ring modulation. Pattern is straight sixteenths with accent variation.

```
minimal techno hi-hat pattern, 16th notes with velocity accent on every 3rd hit creating a polymetric feel, slightly open filter on accented hits, 126 BPM
```
> Noise-based hat with filter envelope modulated by velocity. Accent pattern creates 3-against-4 feel against 4/4 kick.

```
acid techno drum loop with Roland TR-style sounds: thick analog kick, snappy snare, open and closed hats alternating, 138 BPM straight
```
> Analog-modeled drum synthesis using the classic TR topology. Kick uses bridged-T resonator, snare uses noise + tone mix.

#### Breakbeat / Jungle

```
chopped amen break with timestretched hits, snare rush into drop, pitched down 3 semitones, 170 BPM jungle style
```
> Sample-based break with granular timestretch. Snare fill uses accelerating retrigger. Global pitch shift applied.

```
breakbeat pattern with think break kick, funky ghost snares, open hat riding eighth notes, half-time shuffle feel at 90 BPM, dusty and vintage
```
> Synthesis-based breakbeat voices with low-pass filter and saturation for vintage character. Shuffle quantization applied.

---

### 2.3 Bass

#### Sub Bass

```
pure sub bass sine at the root note, gentle saturation to add upper harmonics for speaker visibility, sidechain ducking from kick, sustained legato
```
> Clean sine oscillator with mild waveshaping. Sidechain compressor input from kick trigger. Legato note handling with glide.

```
deep sub bass with slow pitch wobble of +/- 5 cents, triangle wave filtered to remove upper harmonics, C1, constant drone
```
> Triangle oscillator with LFO on pitch at very low depth. Low-pass filter set just above fundamental.

#### Acid 303

```
squelchy acid bass line, saw wave through resonant low-pass filter with accent-driven envelope, random 16th note pattern in A minor, filter cutoff sweeping, 130 BPM
```
> Saw oscillator into resonant 4-pole LPF. Filter envelope depth modulated by accent sequencer. Randomized note pattern quantized to scale.

```
classic 303 acid line with slide between notes, high resonance just before self-oscillation, short decay on non-accented steps, octave jumps on accents, 126 BPM in C minor
```
> Monophonic saw oscillator with portamento on tied steps. Resonance set to ~90% of self-oscillation. Accent triggers longer filter decay.

```
dark acid bass, square wave 303 style with lower resonance than usual, pattern mostly in the low octave with occasional octave-up accents, 135 BPM, D minor
```
> Square wave variant of acid topology. Lower resonance setting for darker, less screamy character. Accent probability controls octave transposition.

#### Reese Bass

```
massive reese bass, two detuned saw waves with slow unison drift, low-pass filtered with subtle movement, dark and menacing, D1
```
> Dual saw oscillators with free-running LFO on detune amount. LP filter with slow random modulation. Heavy and wide.

```
DnB reese bass with mid-range growl, two saws detuned 15 cents apart, bandpass filter modulated by an LFO at 1/4 note rate, distortion after filter, 174 BPM
```
> Detuned saw pair into bandpass with tempo-synced LFO. Post-filter distortion for harmonic aggression. Sequenced with drum pattern.

#### FM Bass

```
punchy FM bass with electric slap character, carrier at fundamental with modulator at 2x ratio, fast mod envelope decay, short notes, staccato feel
```
> Two-operator FM with 2:1 ratio. Modulation index controlled by fast-decay envelope for plucky transient. Short amplitude envelope.

```
deep FM bass with metallic overtones, carrier sine with three modulators in parallel at ratios 1:1, 3:1, and 7:1, slow attack, sustained, C2
```
> Four-operator FM (1 carrier, 3 parallel modulators). Odd ratios create complex harmonic spectrum. Long envelope for pad-like bass.

```
gritty digital FM bass, high modulation index creating aliased upper partials, mod envelope with medium decay, aggressive and biting, good for neuro DnB
```
> High-index FM with intentional aliasing from extreme modulation depth. Envelope shapes spectral content from harsh to warm.

---

### 2.4 Melodic

#### Lo-fi Keys

```
dusty Rhodes electric piano, slight detuning between tines, low-pass filtered at 3 kHz, with vinyl crackle layer and tape saturation, playing jazzy 7th chords, 80 BPM
```
> FM-based electric piano model with detuned operator pairs. Post-processing chain: LPF, saturation, noise layer. Chord voicings from jazz vocabulary.

```
lo-fi toy piano with bitcrushed decay tail, notes slightly out of tune with each other, sparse melody in C pentatonic, music box character, 65 BPM
```
> Simple sine/triangle voice with per-note random pitch offset. Bitcrusher on output with sample rate reduction for digital grit.

```
warm Wurlitzer-style keys with tremolo at 5 Hz, soft overdrive, playing a simple two-chord vamp between Dm7 and G7, lo-fi tape warble on master
```
> FM electric piano with amplitude tremolo LFO. Mild waveshaper for overdrive. Chord sequencer with two-bar loop. Tape wow/flutter on output.

#### Synth Leads

```
bright supersaw lead with 7 voices detuned across 25 cents, high-pass filtered to cut below 300 Hz, unison spread wide in stereo, portamento between notes
```
> Seven-oscillator supersaw with spread detuning. HPF removes low-end mud. Stereo spread via panning of individual oscillator voices. Glide enabled.

```
screaming mono lead, square wave with pulse width modulation at 3 Hz, resonant low-pass filter with fast envelope, vibrato after 200ms note hold, for a solo over 130 BPM trance
```
> Pulse oscillator with LFO on pulse width. Filter envelope with fast attack/decay. Delayed vibrato using delayed LFO onset.

```
retro chiptune lead, pure square wave with fast arpeggio cycling through chord tones at 1/32 note speed, no filter, dry, 8-bit character, 150 BPM
```
> Square oscillator with arpeggiator cycling note buffer at 32nd-note divisions. No filtering or effects for clean 8-bit aesthetic.

#### Pads

```
lush ambient pad, 4 detuned saw waves through a low-pass filter with very slow LFO modulation, long attack of 3 seconds, infinite sustain, stereo chorus, Cmaj9 chord
```
> Quad-saw unison voice with slow filter movement. Long attack envelope. Chorus effect for width. Sustained chord voicing.

```
dark evolving pad with wavetable oscillator scanning slowly through harmonic tables, reverb with 8-second decay, granular texture layered on top, Dm chord, ominous
```
> Wavetable oscillator with slow scan position LFO. Large reverb. Secondary granular layer for textural complexity.

```
glass pad, sine waves with high harmonics from additive synthesis, bright and crystalline, shimmer reverb with pitch-shifted feedback, slow chord movement, ethereal
```
> Additive synthesis voice with upper partial emphasis. Shimmer reverb using pitch-shifted feedback network. Smooth chord interpolation.

```
analog-style polysynth pad, slightly unstable pitch on each voice, warm filter with key tracking, vintage chorus effect, Fmaj7 to Bbmaj7, slow and nostalgic
```
> Saw/pulse oscillators with random pitch drift per voice. Filter cutoff follows note pitch. Analog-modeled chorus. Two-chord loop.

#### Bells / Mallets

```
tubular bell hit, FM synthesis with 1:3.5 ratio for inharmonic partials, long decay with high-frequency damping, single strike on C4, large hall reverb
```
> FM bell with inharmonic ratio for metallic character. Amplitude envelope with frequency-dependent decay. Convolution reverb.

```
kalimba pluck, short sine burst with quick pitch drop, gentle and woody, played in a repeating pentatonic pattern, 100 BPM, dry with subtle room reverb
```
> Sine oscillator with fast pitch envelope and short amplitude decay. Pattern sequenced from pentatonic scale. Small room reverb.

```
vibraphone chord with motor vibrato at 4.5 Hz, soft mallets, Cmaj7 voicing spread across two octaves, slow tremolo depth modulation, jazz club ambience
```
> FM mallet model with amplitude vibrato LFO. Four-note voicing with octave displacement. LFO depth itself modulated for expressive variation.

#### Plucks

```
sharp pluck synth, short envelope on a low-pass filter with high resonance, saw wave, quick pitch drop of one octave on attack, tight and percussive, for arpeggiated patterns at 128 BPM
```
> Saw oscillator with fast filter envelope and pitch envelope. Very short amplitude sustain. Designed for rapid arpeggio sequencing.

```
nylon guitar pluck using Karplus-Strong synthesis, warm and soft, slight position variation for realism, fingerpicked arpeggiated chords in E minor, 90 BPM
```
> Karplus-Strong physical model with filtered noise exciter. Pluck position parameter randomized per note for timbral variation.

```
metallic pluck, ring-modulated sine waves creating bell-like inharmonic spectrum, short decay, played in a generative euclidean pattern of 5 hits over 8 steps, 115 BPM
```
> Ring modulation between two sine oscillators for inharmonic spectrum. Euclidean rhythm generator distributes 5 events across 8 slots.

---

### 2.5 Sound Effects

#### Nature

```
ocean waves with slow wash cycle every 8-12 seconds, filtered noise with resonant peak sweeping up on approach and down on retreat, distant seagull calls randomly every 30-60 seconds
```
> Noise with bandpass filter automated by slow random envelope for wave shape. Secondary event trigger for processed bird sample.

```
gentle stream with water babbling over rocks, high-frequency noise filtered to sound liquid, stereo movement suggesting water flow from left to right, continuous
```
> Shaped noise with multiple bandpass filters for water character. Stereo autopan at slow rate. Amplitude modulation for babbling rhythm.

```
thunderstorm at medium distance: steady rain bed, thunder rumbles every 20-40 seconds with low-frequency boom and crackle tail, lightning flash implied by sharp transient before thunder
```
> Layered noise for rain. Thunder events use filtered noise burst with pitch envelope for boom, followed by granular crackle tail. Pre-thunder transient click.

#### Weather / Environmental

```
wind through trees, slowly varying bandpass-filtered noise with occasional gusts that brighten the filter, subtle whistle on strong gusts, stereo swirl
```
> Noise generator with bandpass filter modulated by slow random walk. Gust events increase filter cutoff and add narrowband whistle layer.

```
crackling campfire with random pop and snap events, warm low-frequency rumble bed, occasional louder log-shift sound, intimate and close-miked
```
> Granular noise for fire bed. Random impulse generator for crackle events with variable amplitude and filter settings. Low-passed rumble layer.

#### Mechanical / Industrial

```
factory machine rhythm, metallic clanking at a steady 100 BPM, hydraulic hiss on every 4th beat, deep mechanical rumble underneath, harsh and industrial
```
> Ring-modulated percussive hits for metallic clank. Noise burst with bandpass for hydraulic hiss. Low-frequency oscillator for rumble bed.

```
clock ticking at 60 BPM exactly, sharp transient with short metallic resonance, slight stereo width, hypnotic and precise
```
> Impulse exciter into short resonant filter for tick sound. Exact tempo lock to 60 BPM. Minimal stereo offset between L/R for width.

```
old tape machine startup: motor whir rising in pitch over 3 seconds, flutter beginning irregular then stabilizing, tape hiss fading in, warm and analog
```
> Rising oscillator for motor whir with LFO-modulated pitch instability that decreases over time. Noise layer with fade-in envelope.

#### Sci-Fi

```
spaceship engine hum, low sawtooth drone at 40 Hz with slow phase modulation, occasional power fluctuation dips, metallic resonance overtones, vast and ominous
```
> Low saw drone with phase modulation from slow LFO. Random amplitude dips for power fluctuation. Resonant bandpass filters for metallic overtones.

```
laser zap sound, fast descending pitch sweep from 4 kHz to 200 Hz in 100ms, sine wave with ring modulation for metallic quality, short and punchy
```
> Sine oscillator with fast exponential pitch envelope. Ring modulator adds inharmonic content. Very short amplitude envelope.

```
alien communication signal, rapidly modulated tones with pitch jumping in non-musical intervals, intermittent bursts of 200-500ms, filtered and distant, unsettling
```
> FM synthesis with random modulation index jumps. Trigger probability creates intermittent bursts. Bandpass filter and reverb for distance.

#### UI Sounds

```
soft notification chime, two sine tones a perfect fifth apart, 50ms attack, 300ms decay, gentle and non-intrusive, high register around C6-G6
```
> Dual sine oscillators at C6 and G6 (perfect fifth). Short attack/decay envelope. Low amplitude for non-intrusive character.

```
subtle button click, very short noise burst of 5ms with bandpass filter at 2 kHz, no sustain, tactile and satisfying
```
> Noise impulse with tight bandpass filter. Extremely short envelope for immediate transient. Clean and functional.

```
error buzz, 150 Hz square wave with 3 short 80ms pulses separated by 50ms gaps, slight distortion, urgent but not harsh
```
> Gated square oscillator with three-pulse trigger pattern. Mild waveshaping. Designed to signal error without causing alarm.

```
success jingle, ascending three-note arpeggio C5-E5-G5 in sine waves, each note 100ms with 50ms overlap, gentle reverb tail, positive and bright
```
> Three-event sine voice with overlapping envelopes creating ascending major triad. Small reverb for polish.

---

### 2.6 Generative / Algorithmic

#### Polyrhythmic

```
polyrhythmic percussion: kick on 4/4, clave on 3/4, hi-hat on 7/8, all starting synchronized and drifting into complex interlocking patterns, 120 BPM base tempo
```
> Three independent clock dividers generating different meter patterns. Phase relationships evolve over time creating shifting accent patterns.

```
two marimbas playing interlocking patterns, one in 5/4 and one in 4/4, pentatonic scale in G, Steve Reich-style phase music, 108 BPM
```
> Two identical mallet voices with different pattern lengths. Phase offset accumulates over time. Both quantized to G pentatonic.

```
three-layer polyrhythm: bass note every 3 beats, chord stab every 5 beats, bell hit every 7 beats, all cycling against a 4/4 grid, tempo 100 BPM, evolving phase relationships
```
> Three event generators with coprime cycle lengths. Each voice has independent sound design. Phase alignment recurs at LCM of all cycle lengths.

#### Gravity / Physics-Based

```
bouncing ball simulation: pluck sound with decreasing interval between hits following gravity equation, pitch rising slightly with each bounce, reverb increasing as energy dissipates
```
> Trigger timing follows quadratic decay curve. Pitch envelope offset increases per event. Reverb send increases inversely to amplitude.

```
gravitational orbit sonification: two tones orbiting each other in stereo, panning speed increasing as they approach, pitch Doppler-shifted, elliptical orbit, 30-second period
```
> Two oscillators with autopan following orbital mechanics. Panning rate modulated by distance function. Pitch shift proportional to velocity.

```
particle collision sounds: random high-frequency pings when probability threshold is crossed, density increasing over time like a Geiger counter approaching a source, metallic and tiny
```
> Random trigger with increasing probability density over time. FM ping voice with variable frequency per event. Sparse to dense evolution.

#### Cellular Automata

```
1D cellular automaton (Rule 110) mapped to a 16-step pitch sequence, each generation replaces the previous pattern, pentatonic C minor, bell timbre, new generation every 2 bars, 110 BPM
```
> Rule 110 automaton state mapped to pitch values. Pattern updates every 2 bars. Dead cells are rests, live cells trigger from pitch lookup table.

```
Game of Life on an 8x8 grid mapped to a synth pad, each living cell adds a harmonic partial, evolving every beat, starting from a glider pattern, FM synthesis, 90 BPM
```
> Conway's Game of Life state mapped to additive synthesis partials. Grid position determines frequency and amplitude of each partial. State advances per beat.

```
elementary cellular automaton controlling drum pattern: Rule 30 generating pseudo-random hi-hat triggers, Rule 90 generating kick pattern, new row per bar, 125 BPM
```
> Two parallel automata controlling different drum voice triggers. Each automaton advances one generation per bar. Binary cell state maps to hit/rest.

#### Markov Chain

```
Markov chain melody generator trained on jazz intervals, weighted toward stepwise motion with occasional leaps, trumpet-like synth lead, swing feel at 140 BPM, Bb major
```
> First-order Markov chain with transition matrix biased toward small intervals. FM trumpet voice. Swing quantization applied to output timing.

```
second-order Markov chain generating a bass line, transitions weighted by common funk patterns, slap bass timbre, syncopated rhythm with ghost notes, 95 BPM in E minor
```
> Second-order Markov chain (considers two previous notes) for more coherent phrase structure. Physical modeling bass voice with slap exciter.

```
chord progression generated by Markov chain with jazz harmony transition probabilities, Rhodes piano voicings, 4 beats per chord, new chord on each bar, medium swing at 120 BPM
```
> Markov chain operating on chord symbols with jazz-informed transition weights. FM Rhodes voice with four-note voicings. One transition per bar.

---

## 3. Keywords the Engine Understands

The following keyword categories are recognized by the engine during description parsing.
Use these words intentionally. Combining keywords from different categories produces
more specific and accurate results.

### Mood / Emotion

| Keyword       | Mapping                                                    |
|---------------|------------------------------------------------------------|
| dark          | Lower filter cutoffs, minor modes, reduced high-frequency  |
| bright        | Higher filter cutoffs, open voicings, presence boost       |
| warm          | Saturated low-mids, gentle roll-off above 5 kHz           |
| cold          | Clean digital synthesis, sparse arrangement, sterile reverb|
| aggressive    | Distortion, high resonance, dense modulation               |
| gentle        | Low velocity, soft envelopes, reduced dynamics             |
| melancholy    | Minor key, slow tempo, descending phrases                  |
| euphoric      | Major key, bright supersaw, rising energy, wide stereo     |
| ominous       | Low drones, dissonant intervals, slow evolution            |
| playful       | Staccato patterns, pentatonic scales, bouncy rhythms       |
| dreamy        | Long reverb, detuned oscillators, slow modulation          |
| tense         | Dissonance, rising pitch, increasing density               |
| nostalgic     | Analog-modeled warmth, lo-fi processing, vintage timbres   |
| ethereal      | Shimmer reverb, high register, sparse arrangement          |

### Genre

| Keyword       | Mapping                                                    |
|---------------|------------------------------------------------------------|
| techno        | 4/4 kick, straight rhythm, 124-138 BPM, minimal tonality  |
| house         | 4/4 kick, off-beat hats, 120-128 BPM, chord stabs         |
| ambient       | No strict tempo, long envelopes, reverb-heavy, evolving    |
| trap          | 808 kick, hi-hat rolls, half-time feel, 130-160 BPM       |
| jungle        | Chopped breaks, sub bass, 160-180 BPM, complex rhythms    |
| lo-fi         | Bitcrushing, tape saturation, vinyl noise, reduced bandwidth|
| jazz          | Swing feel, 7th/9th chords, brush drums, walking bass     |
| synthwave     | Analog-style pads, gated reverb, 80s timbres, 100-118 BPM|
| drone         | Sustained tones, no rhythm, slow evolution, layered        |
| IDM           | Complex rhythms, glitch, unusual timbres, experimental     |
| DnB           | Fast breaks, reese bass, 170-180 BPM, half-time drops     |
| dub           | Heavy delay, spring reverb, sparse arrangement, bass focus |
| chiptune      | Square/pulse waves, limited polyphony, 8-bit aesthetic     |
| industrial    | Metallic percussion, noise, distortion, mechanical rhythm  |
| classical     | Orchestral timbres, dynamic range, traditional harmony     |

### Texture / Character

| Keyword       | Mapping                                                    |
|---------------|------------------------------------------------------------|
| gritty        | Distortion, bitcrushing, analog noise                      |
| smooth        | Low resonance, gentle filtering, no distortion             |
| crunchy       | Moderate bitcrushing, sample rate reduction                |
| metallic      | Ring modulation, inharmonic partials, FM with odd ratios   |
| woody         | Filtered noise exciter, physical modeling body resonance   |
| glassy        | Sine-based, high partials, clean, crystalline              |
| dusty         | Low-pass filter, noise layer, reduced sample rate          |
| lush          | Detuned unison, chorus, wide stereo, rich harmonics        |
| thin          | High-pass filtered, single oscillator, narrow stereo       |
| massive       | Many unison voices, wide detuning, bass-heavy, stereo fill |
| crispy        | High-frequency emphasis, clean transients, bright noise    |
| hollow        | Bandpass filtered, resonant, reduced harmonics             |
| saturated     | Tape/tube saturation, soft clipping, added harmonics       |
| sterile       | No saturation, clinical EQ, digital precision              |

### Synthesis Type

| Keyword            | Mapping                                                 |
|--------------------|---------------------------------------------------------|
| FM                 | Frequency modulation synthesis with operator routing    |
| additive           | Multiple sine partials summed, individual control       |
| subtractive        | Oscillator through filter, classic analog topology      |
| granular           | Micro-grain sample playback, density/size/position      |
| wavetable          | Scanning through stored waveform tables                 |
| physical modeling  | Karplus-Strong, waveguide, resonant body simulation     |
| Karplus-Strong     | Plucked string model, noise exciter into delay line     |
| ring modulation    | Two signals multiplied, sum and difference frequencies  |
| AM                 | Amplitude modulation, tremolo at audio rate             |
| phase modulation   | Similar to FM but using phase offset (DX7-style)       |
| noise              | White/pink/brown noise generators, filtered             |
| sample-based       | Playback of recorded audio, with optional processing   |

### Sequencing / Pattern

| Keyword            | Mapping                                                 |
|--------------------|---------------------------------------------------------|
| arpeggio           | Cycling through chord tones in order                    |
| euclidean          | Euclidean rhythm algorithm (k hits in n steps)          |
| random             | Probabilistic note/trigger generation                   |
| generative         | Self-evolving patterns, algorithmic composition         |
| Markov             | Markov chain-based transition probabilities             |
| cellular automata  | Rule-based grid evolution mapped to parameters          |
| polyrhythm         | Multiple simultaneous meters/cycle lengths              |
| step sequencer     | Fixed-length pattern with per-step values               |
| probability        | Per-step trigger probability for variation              |
| swing              | Timing offset on even subdivisions for groove           |
| humanize           | Random timing/velocity offsets for natural feel         |

### Effects

| Keyword            | Mapping                                                 |
|--------------------|---------------------------------------------------------|
| reverb             | Algorithmic or convolution spatial simulation           |
| delay              | Time-delayed signal repetition, with feedback           |
| chorus             | Short modulated delay for thickening                    |
| phaser             | Allpass filter sweep for phase cancellation effect      |
| flanger            | Very short modulated delay with feedback                |
| distortion         | Waveshaping, clipping, harmonic generation              |
| saturation         | Soft clipping, tape or tube emulation                   |
| bitcrusher         | Sample rate and bit depth reduction                     |
| compressor         | Dynamic range reduction, glue, punch                    |
| sidechain          | Ducking effect driven by external trigger source        |
| shimmer reverb     | Reverb with pitch-shifted feedback for ethereal quality |
| tape delay         | Delay with wow/flutter, saturation, degrading repeats   |
| filter sweep       | Automated cutoff frequency movement over time           |
| EQ                 | Frequency-specific level adjustment                     |
| limiter            | Hard ceiling for output level protection                |

---

## 4. Combining Descriptions

Complex patches are built by layering concepts. The engine interprets combined
descriptions by splitting them into voice allocation groups and effect chains.

### Layering with "with" and "and"

Use "with" to add secondary elements. Use "and" to combine equal-weight elements.

```
warm pad with arpeggiated pluck on top and sub bass underneath
```
> Three-voice patch: sustained pad, sequenced pluck, and constant sub oscillator. Each gets independent processing.

### Layering with "over" and "underneath"

These words imply level hierarchy. "Over" means louder/foreground. "Underneath" means quieter/background.

```
aggressive acid bass line over a four-on-the-floor techno kick underneath a screaming resonant filter sweep
```
> Bass is primary voice. Kick is structural but lower in mix. Filter sweep is an effect applied to the overall output or a dedicated layer.

### Explicit Multi-Layer Descriptions

For maximum precision, describe each layer separately with a semicolon or "Layer 1 / Layer 2" syntax:

```
Layer 1: deep sub bass drone in D, continuous; Layer 2: granular texture from metallic samples, sparse random triggers; Layer 3: reverb pad holding Dm7 chord, very quiet; Layer 4: occasional bell hit from pentatonic set, every 5-10 seconds
```
> Four-layer patch with explicit voice allocation. Each layer has independent synthesis, sequencing, and processing.

### Temporal Layering

Describe how elements enter and exit over time:

```
starts with solo kick at 128 BPM, hi-hats enter after 8 bars, bass line enters after 16 bars, full pad and lead after 32 bars, building energy throughout
```
> Arrangement-aware patch with element muting and timed unmuting. Energy curve applied to filter cutoffs and effect depths.

### Effect Chain Descriptions

Specify processing order when it matters:

```
saw bass through resonant low-pass filter, then distortion, then chorus, then short room reverb — filter before distortion is critical for the tone
```
> The engine places effects in the specified order. The note about filter-before-distortion is parsed as an ordering constraint.

---

## 5. What NOT to Write

The following patterns produce poor results. Each example includes the description,
the problem, and a corrected version.

### Too Vague

```
something chill
```
**Problem:** No elements, no synthesis direction, no tempo, no key. The engine has to
guess everything. "Chill" maps to a mood but without any structural guidance, the
output is generic.

**Better:**
```
chill ambient pad with slow filter movement and soft granular rain texture, Cmaj7, no rhythm, spacious reverb
```

---

### Too Short

```
bass
```
**Problem:** "Bass" is a frequency range, not a sound. Sub bass? Acid bass? FM bass?
Acoustic bass? Slap bass? The engine defaults to the most common interpretation (sub
sine bass) which is rarely what the user intended.

**Better:**
```
punchy FM bass with electric slap character, short staccato notes, C2, for a funk groove at 110 BPM
```

---

### Ambiguous Reference

```
make it sound like that one song
```
**Problem:** The engine has no context for "that one song." External references without
specific sonic attributes are not parseable.

**Better:**
```
Blade Runner-style synth pad, dark evolving CS-80 brass tone with slow vibrato, wide stereo, reverb with long pre-delay, D minor, cinematic and vast
```

---

### Contradictory Attributes

```
bright dark warm cold bass
```
**Problem:** "Bright" and "dark" are opposing filter mappings. "Warm" and "cold" are
opposing saturation mappings. The engine averages contradictions, producing a neutral,
uninteresting result.

**Better:** Choose one direction and commit:
```
dark warm bass with heavy saturation and rolled-off highs
```

---

### Technical Jargon Without Context

```
2-op FM at 3:7 ratio 50% index
```
**Problem:** While technically valid, this provides synthesis parameters without any
musical context. The engine will produce the specified oscillator configuration but
cannot make informed choices about envelope, effects, sequencing, or mix level.

**Better:**
```
metallic FM bell, 2-operator at 3:7 ratio with medium modulation index, long decay with high-frequency damping, single hits with 3 seconds between, hall reverb
```

---

### Emoji and Non-Text Content

```
vibes go 🔥🔥🔥 make it slap 💯
```
**Problem:** Emoji are stripped during parsing. "Vibes" without qualification is too
vague. "Slap" is ambiguous (slap bass? hard-hitting? impressive?). Colloquial
language is lossy.

**Better:**
```
hard-hitting trap beat with punchy 808 kick, aggressive hi-hat rolls, dark and energetic, 145 BPM half-time
```

---

### Referencing Specific Copyrighted Material as the Sole Description

```
the exact Stranger Things synth
```
**Problem:** The engine does not reproduce copyrighted material. It can approximate
timbral qualities when those qualities are described in synthesis terms.

**Better:**
```
dark pulsing C minor arpeggio, detuned analog-style saw and pulse oscillators, chorus and reverb, slow tempo around 100 BPM, ominous 80s synthwave character
```

---

### Overly Long Prose

```
I want something that kind of feels like you're floating through space but also there's this underlying tension like something is about to happen and the whole thing should feel really wide and immersive but not too busy, maybe some kind of pad sound with something rhythmic underneath but not a drum beat exactly, more like a pulse or heartbeat kind of thing, and it should work well for a scene in a short film where the character is alone in a big empty room thinking about their past
```
**Problem:** Prose buries the actionable parameters in filler. The engine extracts
keywords but loses structural relationships in long unstructured text.

**Better:**
```
vast floating pad in D minor with shimmer reverb and wide stereo, slow evolving filter, sub-bass pulse at 60 BPM like a heartbeat underneath, tense but spacious, cinematic
```

---

## Appendix: Quick Reference Template

Copy and fill in:

```
[mood] [genre] [primary element] with [secondary element] and [effect/texture],
[key/root] at [tempo] BPM, [context/purpose]
```

Example filled in:

```
dark minimal techno kick and bass loop with sidechain compression and tape saturation,
D minor at 130 BPM, for a peak-time DJ set
```
