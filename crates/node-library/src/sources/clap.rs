//! Clap synthesis node — multiple noise micro-bursts.
//!
//! Self-contained drum sound: trigger in, complete clap sound out.
//! Simulates multiple hands clapping with 3-4 rapid filtered noise bursts
//! followed by a reverberant tail.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Clap synthesizer with multiple micro-burst layers.
///
/// ## Parameters
/// - `color` — Band-pass filter center frequency (default 1200 Hz, range 400-6000).
/// - `decay` — Envelope tail decay time (default 0.12 s, range 0.03-0.5).
/// - `spread` — Time between micro-bursts (default 0.5, range 0-1).
/// - `tone` — Noise tone shaping (default 0.5, range 0-1).
///
/// ## Inputs
/// - `[0]` trigger — rising edge triggers the clap.
///
/// ## Outputs
/// - `[0]` complete clap sound.
pub struct Clap {
    /// Amplitude envelope for the tail.
    amp_env: f32,
    /// Burst counter: tracks which micro-burst we're on (0-3).
    burst_index: u32,
    /// Samples remaining until next burst.
    burst_countdown: u32,
    /// Burst envelope (per-burst mini envelope).
    burst_env: f32,
    /// Total samples elapsed since trigger (for burst timing).
    samples_since_trigger: u32,
    /// Whether we're currently in a burst sequence.
    bursting: bool,
    /// Band-pass filter states.
    bp_lp_state: f32,
    bp_hp_state: f32,
    /// Previous trigger value for edge detection.
    prev_trigger: f32,
    /// LCG random state for noise.
    rng_state: u32,
}

/// Number of micro-bursts in a clap.
const NUM_BURSTS: u32 = 4;

impl Clap {
    pub fn new() -> Self {
        Self {
            amp_env: 0.0,
            burst_index: 0,
            burst_countdown: 0,
            burst_env: 0.0,
            samples_since_trigger: 0,
            bursting: false,
            bp_lp_state: 0.0,
            bp_hp_state: 0.0,
            prev_trigger: 0.0,
            rng_state: 33333,
        }
    }

    #[inline]
    fn next_random(&mut self) -> f32 {
        self.rng_state = self.rng_state.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.rng_state as i32 as f64 / i32::MAX as f64) as f32
    }
}

impl Default for Clap {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for Clap {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let color = ctx.parameters.get("color").unwrap_or(1200.0).clamp(400.0, 6000.0);
        let decay_param = ctx.parameters.get("decay").unwrap_or(0.12).clamp(0.03, 0.5);
        let spread = ctx.parameters.get("spread").unwrap_or(0.5).clamp(0.0, 1.0);
        let tone = ctx.parameters.get("tone").unwrap_or(0.5).clamp(0.0, 1.0);

        let sr = ctx.sample_rate as f32;

        let amp_decay_rate = 1.0 - (-1.0 / (decay_param * sr)).exp();

        // Time between bursts in samples (spread controls 0.5ms to 5ms gap).
        let burst_gap = ((0.5 + spread * 4.5) * 0.001 * sr) as u32;
        // Each individual burst length in samples (about 1ms).
        let burst_len = (0.001 * sr) as u32;
        let _ = burst_len; // We use the burst_env decay instead

        // Band-pass filter coefficients.
        let lp_cutoff = (color * 2.0).min(sr * 0.45);
        let hp_cutoff = color * 0.3;
        let lp_coeff = (2.0 * std::f32::consts::PI * lp_cutoff / sr).min(0.99);
        let hp_coeff = 1.0 / (1.0 + 2.0 * std::f32::consts::PI * hp_cutoff / sr);

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_trigger = !ctx.inputs.is_empty() && !ctx.inputs[0].is_empty();
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            // Trigger detection.
            if has_trigger {
                let trig = ctx.inputs[0][i];
                if self.prev_trigger < 0.5 && trig >= 0.5 {
                    self.amp_env = 1.0;
                    self.burst_index = 0;
                    self.burst_countdown = 0;
                    self.burst_env = 1.0;
                    self.samples_since_trigger = 0;
                    self.bursting = true;
                    self.bp_lp_state = 0.0;
                    self.bp_hp_state = 0.0;
                }
                self.prev_trigger = trig;
            }

            let mut burst_signal = 0.0_f32;

            if self.bursting {
                // Generate burst noise.
                if self.burst_countdown == 0 && self.burst_index < NUM_BURSTS {
                    // Start a new burst.
                    self.burst_env = 1.0;
                    self.burst_index += 1;
                    self.burst_countdown = burst_gap;
                }

                if self.burst_countdown > 0 {
                    self.burst_countdown -= 1;
                }

                // Burst envelope decays very quickly.
                burst_signal = self.next_random() * self.burst_env;
                self.burst_env *= 0.985; // ~1ms decay at 48kHz

                if self.burst_index >= NUM_BURSTS && self.burst_env < 0.01 {
                    self.bursting = false;
                }

                self.samples_since_trigger += 1;
            }

            // Combine burst with tail noise.
            let tail_noise = self.next_random() * self.amp_env * 0.3;
            let raw = burst_signal + tail_noise;

            // Band-pass filter.
            self.bp_lp_state += lp_coeff * (raw - self.bp_lp_state);
            let hp_in = self.bp_lp_state;
            let hp_lp = self.bp_hp_state + hp_coeff * (hp_in - self.bp_hp_state);
            self.bp_hp_state = hp_lp;
            let filtered = hp_in - hp_lp;

            // Mix filtered and raw based on tone parameter.
            let out = (filtered * tone + raw * (1.0 - tone) * 0.5) * self.amp_env;
            self.amp_env *= 1.0 - amp_decay_rate;

            output[i] = out.clamp(-1.0, 1.0);

            // Denormal protection.
            if self.amp_env.abs() < 1e-10 {
                self.amp_env = 0.0;
            }
            if self.burst_env.abs() < 1e-10 {
                self.burst_env = 0.0;
            }
            if self.bp_lp_state.abs() < 1e-10 {
                self.bp_lp_state = 0.0;
            }
            if self.bp_hp_state.abs() < 1e-10 {
                self.bp_hp_state = 0.0;
            }
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.amp_env = 0.0;
        self.burst_index = 0;
        self.burst_countdown = 0;
        self.burst_env = 0.0;
        self.samples_since_trigger = 0;
        self.bursting = false;
        self.bp_lp_state = 0.0;
        self.bp_hp_state = 0.0;
        self.prev_trigger = 0.0;
        self.rng_state = 33333;
    }
}
