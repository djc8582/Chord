//! Kick drum synthesis node — classic analog kick.
//!
//! Self-contained drum sound: trigger in, complete kick sound out.
//! Uses pitch sweep from high to low frequency, amplitude envelope,
//! click transient (noise burst), and tanh soft-clip drive.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Classic analog kick drum synthesizer.
///
/// ## Parameters
/// - `pitch_start` — Starting frequency of pitch sweep (default 150 Hz, range 50-500).
/// - `pitch_end` — Ending frequency of pitch sweep (default 45 Hz, range 20-200).
/// - `pitch_decay` — Pitch sweep time (default 0.05, range 0.01-0.3).
/// - `decay` — Amplitude envelope decay time (default 0.3 s, range 0.05-2.0).
/// - `click` — Click transient amount (default 0.3, range 0-1).
/// - `drive` — Soft saturation amount (default 0.2, range 0-1).
///
/// ## Inputs
/// - `[0]` trigger — rising edge (crossing above 0.5) triggers the hit.
///
/// ## Outputs
/// - `[0]` complete kick drum sound.
pub struct KickDrum {
    /// Oscillator phase [0, 1).
    phase: f64,
    /// Amplitude envelope (1.0 at trigger, decays toward 0).
    amp_env: f32,
    /// Pitch envelope (1.0 at trigger, decays toward 0).
    pitch_env: f32,
    /// Click envelope (1.0 at trigger, very fast decay).
    click_env: f32,
    /// Previous trigger input value for edge detection.
    prev_trigger: f32,
    /// LCG random state for click noise.
    rng_state: u32,
}

impl KickDrum {
    pub fn new() -> Self {
        Self {
            phase: 0.0,
            amp_env: 0.0,
            pitch_env: 0.0,
            click_env: 0.0,
            prev_trigger: 0.0,
            rng_state: 54321,
        }
    }

    /// Generate a white noise sample in [-1, 1] using LCG.
    #[inline]
    fn next_random(&mut self) -> f32 {
        self.rng_state = self.rng_state.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.rng_state as i32 as f64 / i32::MAX as f64) as f32
    }
}

impl Default for KickDrum {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for KickDrum {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let pitch_start = ctx.parameters.get("pitch_start").unwrap_or(150.0);
        let pitch_end = ctx.parameters.get("pitch_end").unwrap_or(45.0);
        let pitch_decay_param = ctx.parameters.get("pitch_decay").unwrap_or(0.05).clamp(0.01, 0.3);
        let decay_param = ctx.parameters.get("decay").unwrap_or(0.3).clamp(0.05, 2.0);
        let click_amount = ctx.parameters.get("click").unwrap_or(0.3).clamp(0.0, 1.0);
        let drive = ctx.parameters.get("drive").unwrap_or(0.2).clamp(0.0, 1.0);

        let sr = ctx.sample_rate as f32;

        // Pre-compute decay rates from time constants.
        // Rate = 1 - e^(-1 / (time * sample_rate)), approximated for efficiency.
        let amp_decay_rate = 1.0 - (-1.0 / (decay_param * sr)).exp();
        let pitch_decay_rate = 1.0 - (-1.0 / (pitch_decay_param * sr)).exp();

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_trigger = !ctx.inputs.is_empty() && !ctx.inputs[0].is_empty();

        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            // Trigger detection: rising edge crossing 0.5.
            if has_trigger {
                let trig = ctx.inputs[0][i];
                if self.prev_trigger < 0.5 && trig >= 0.5 {
                    self.phase = 0.0;
                    self.amp_env = 1.0;
                    self.pitch_env = 1.0;
                    self.click_env = 1.0;
                }
                self.prev_trigger = trig;
            }

            // Pitch sweep: exponential decay from pitch_start to pitch_end.
            let pitch = pitch_end + (pitch_start - pitch_end) * self.pitch_env;
            self.pitch_env *= 1.0 - pitch_decay_rate;

            // Oscillator (sine).
            let osc = (self.phase * std::f64::consts::TAU).sin() as f32;
            self.phase += pitch as f64 / ctx.sample_rate;
            self.phase -= self.phase.floor();

            // Click (noise burst with very fast decay).
            let click_sample = self.next_random();
            self.click_env *= 0.95;
            let click_out = click_sample * self.click_env * click_amount;

            // Amplitude envelope.
            self.amp_env *= 1.0 - amp_decay_rate;
            let out = (osc + click_out) * self.amp_env;

            // Drive (tanh soft clip).
            let driven = (out * (1.0 + drive * 4.0)).tanh();
            output[i] = driven;

            // Denormal protection.
            if self.amp_env.abs() < 1e-10 {
                self.amp_env = 0.0;
            }
            if self.pitch_env.abs() < 1e-10 {
                self.pitch_env = 0.0;
            }
            if self.click_env.abs() < 1e-10 {
                self.click_env = 0.0;
            }
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.phase = 0.0;
        self.amp_env = 0.0;
        self.pitch_env = 0.0;
        self.click_env = 0.0;
        self.prev_trigger = 0.0;
        self.rng_state = 54321;
    }
}
