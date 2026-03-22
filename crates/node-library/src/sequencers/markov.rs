//! Markov Chain Sequencer node.
//!
//! Generates melodic sequences using a Markov chain with configurable
//! transition probabilities between scale degrees. The `randomness` parameter
//! controls the balance between deterministic (highest-probability) transitions
//! and fully random selection.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Number of scale degrees in the Markov chain.
const NUM_DEGREES: usize = 7;

/// Scale definitions as semitone offsets from root.
const SCALE_MAJOR: [i32; 7] = [0, 2, 4, 5, 7, 9, 11];
const SCALE_MINOR: [i32; 7] = [0, 2, 3, 5, 7, 8, 10];
const SCALE_DORIAN: [i32; 7] = [0, 2, 3, 5, 7, 9, 10];
const SCALE_PENTATONIC: [i32; 7] = [0, 2, 4, 7, 9, 12, 14];

/// Default transition probability matrix (row = current degree, col = next degree).
/// Each row sums to approximately 1.0.
/// Favors stepwise motion (moving to adjacent scale degrees) with some skips.
const DEFAULT_TRANSITIONS: [[f32; NUM_DEGREES]; NUM_DEGREES] = [
    // From degree 0 (I): prefer steps up or down, occasional skip
    [0.05, 0.30, 0.10, 0.05, 0.25, 0.05, 0.20],
    // From degree 1 (II): prefer resolving to I or stepping to III
    [0.25, 0.05, 0.30, 0.10, 0.15, 0.10, 0.05],
    // From degree 2 (III): prefer stepping to II or IV
    [0.10, 0.25, 0.05, 0.30, 0.10, 0.15, 0.05],
    // From degree 3 (IV): prefer resolving to V or stepping to III
    [0.10, 0.05, 0.20, 0.05, 0.35, 0.15, 0.10],
    // From degree 4 (V): strong pull to I, also to VI
    [0.35, 0.10, 0.05, 0.15, 0.05, 0.20, 0.10],
    // From degree 5 (VI): prefer stepping to V or VII
    [0.10, 0.10, 0.15, 0.05, 0.20, 0.05, 0.35],
    // From degree 6 (VII): strong pull to I (leading tone resolution)
    [0.40, 0.10, 0.05, 0.10, 0.10, 0.20, 0.05],
];

/// Markov Chain Sequencer node.
///
/// ## Parameters
/// - `randomness` — Balance between deterministic and random transitions
///   (default 0.3, range 0..1). 0 = always pick highest probability, 1 = fully random.
/// - `root_note` — Root MIDI note number (default 60 = middle C, range 0..127).
/// - `scale_type` — Scale type: 0=major, 1=minor, 2=dorian, 3=pentatonic (default 0).
///
/// ## Inputs
/// - `[0]` clock input: rising edge triggers the next note.
///
/// ## Outputs
/// - `[0]` pitch output: MIDI note number.
/// - `[1]` gate trigger: 1.0 when triggered, 0.0 otherwise.
pub struct MarkovSequencer {
    /// Transition probability matrix.
    transitions: [[f32; NUM_DEGREES]; NUM_DEGREES],
    /// Current scale degree index (0..NUM_DEGREES-1).
    current_degree: usize,
    /// Whether the clock was high on the previous sample (for edge detection).
    clock_was_high: bool,
    /// Current pitch output value.
    pitch_value: f32,
    /// Current gate output value.
    gate_value: f32,
    /// Samples since last trigger (for gate timing).
    samples_since_trigger: u64,
    /// Gate duration in samples.
    gate_duration: u64,
    /// Simple PRNG state (xorshift32).
    rng_state: u32,
}

impl MarkovSequencer {
    pub fn new() -> Self {
        Self {
            transitions: DEFAULT_TRANSITIONS,
            current_degree: 0,
            clock_was_high: false,
            pitch_value: 60.0,
            gate_value: 0.0,
            samples_since_trigger: 0,
            gate_duration: 4800,
            rng_state: 0xCAFEBABE,
        }
    }

    /// Simple xorshift32 PRNG. Returns the next random u32.
    fn next_random_u32(&mut self) -> u32 {
        let mut x = self.rng_state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.rng_state = x;
        x
    }

    /// Returns a random f32 in [0, 1).
    fn next_random_f32(&mut self) -> f32 {
        (self.next_random_u32() & 0x7FFFFF) as f32 / 0x800000 as f32
    }

    /// Choose the next scale degree based on transition probabilities and randomness.
    fn next_degree(&mut self, randomness: f32) -> usize {
        let row = &self.transitions[self.current_degree];

        if randomness <= 0.001 {
            // Fully deterministic: pick the highest probability transition.
            let mut best = 0;
            let mut best_prob = row[0];
            for i in 1..NUM_DEGREES {
                if row[i] > best_prob {
                    best_prob = row[i];
                    best = i;
                }
            }
            return best;
        }

        if randomness >= 0.999 {
            // Fully random: uniform distribution.
            return (self.next_random_u32() as usize) % NUM_DEGREES;
        }

        // Blend between the transition probabilities and uniform distribution.
        // At randomness=0, use the exact probabilities.
        // At randomness=1, use uniform (1/NUM_DEGREES each).
        let uniform = 1.0 / NUM_DEGREES as f32;
        let mut blended = [0.0_f32; NUM_DEGREES];
        for i in 0..NUM_DEGREES {
            blended[i] = row[i] * (1.0 - randomness) + uniform * randomness;
        }

        // Normalize (should already be ~1.0, but ensure correctness).
        let sum: f32 = blended.iter().sum();
        if sum > 0.0 {
            for prob in &mut blended {
                *prob /= sum;
            }
        }

        // Weighted random selection.
        let r = self.next_random_f32();
        let mut cumulative = 0.0;
        for i in 0..NUM_DEGREES {
            cumulative += blended[i];
            if r < cumulative {
                return i;
            }
        }

        // Fallback (due to floating-point rounding).
        NUM_DEGREES - 1
    }

    /// Map a scale degree to a MIDI note number.
    fn degree_to_midi(&self, degree: usize, root_note: f32, scale_type: usize) -> f32 {
        let scale = match scale_type {
            0 => &SCALE_MAJOR,
            1 => &SCALE_MINOR,
            2 => &SCALE_DORIAN,
            _ => &SCALE_PENTATONIC,
        };
        let semitones = scale[degree.min(NUM_DEGREES - 1)];
        root_note + semitones as f32
    }
}

impl Default for MarkovSequencer {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for MarkovSequencer {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let randomness = ctx.parameters.get("randomness").unwrap_or(0.3).clamp(0.0, 1.0);
        let root_note = ctx.parameters.get("root_note").unwrap_or(60.0).clamp(0.0, 127.0);
        let scale_type = (ctx.parameters.get("scale_type").unwrap_or(0.0) as usize).min(3);

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_clock = !ctx.inputs.is_empty();
        let has_gate_output = ctx.outputs.len() > 1;

        for i in 0..ctx.buffer_size {
            let clock = if has_clock { ctx.inputs[0][i] > 0.5 } else { false };

            // Detect rising edge of clock.
            if clock && !self.clock_was_high {
                // Transition to next degree.
                let next = self.next_degree(randomness);
                self.current_degree = next;

                // Convert degree to MIDI note.
                self.pitch_value = self.degree_to_midi(next, root_note, scale_type);
                self.gate_value = 1.0;
                self.samples_since_trigger = 0;
                self.gate_duration = (ctx.sample_rate * 0.1) as u64;
            }
            self.clock_was_high = clock;

            // Close the gate after duration.
            if self.samples_since_trigger >= self.gate_duration {
                self.gate_value = 0.0;
            }

            ctx.outputs[0][i] = super::midi_to_hz(self.pitch_value);
            if has_gate_output {
                ctx.outputs[1][i] = self.gate_value;
            }

            self.samples_since_trigger += 1;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.current_degree = 0;
        self.clock_was_high = false;
        self.pitch_value = 60.0;
        self.gate_value = 0.0;
        self.samples_since_trigger = 0;
    }
}
