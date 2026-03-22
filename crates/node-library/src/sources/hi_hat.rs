//! Hi-hat synthesis node — metallic noise percussion.
//!
//! Self-contained drum sound: trigger in, complete hi-hat sound out.
//! Uses 6 detuned square oscillators for metallic character, mixed with
//! white noise, then band-pass filtered. Open/closed control adjusts decay.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Hi-hat synthesizer with metallic tone + noise.
///
/// ## Parameters
/// - `color` — Band-pass filter center frequency (default 8000 Hz, range 2000-16000).
/// - `decay` — Envelope decay time (default 0.05 s, range 0.01-0.5).
/// - `open` — Open amount; 0=closed, 1=open. Lengthens decay (default 0.0, range 0-1).
/// - `tone` — Metal vs noise balance (default 0.5, range 0-1). 1=all metallic, 0=all noise.
///
/// ## Inputs
/// - `[0]` trigger — rising edge triggers the hit.
///
/// ## Outputs
/// - `[0]` complete hi-hat sound.
pub struct HiHat {
    /// Phases for 6 detuned square oscillators.
    metal_phases: [f64; 6],
    /// Amplitude envelope.
    amp_env: f32,
    /// Band-pass filter states (two one-pole filters in series).
    bp_lp_state: f32,
    bp_hp_state: f32,
    /// Previous trigger input value for edge detection.
    prev_trigger: f32,
    /// LCG random state for noise.
    rng_state: u32,
}

/// Frequencies for the 6 detuned square oscillators (Hz).
/// These are harmonically unrelated to produce metallic character,
/// inspired by the Roland TR-808 hi-hat circuit.
const METAL_FREQS: [f64; 6] = [
    205.3, 304.4, 369.6, 523.3, 800.6, 1127.3,
];

impl HiHat {
    pub fn new() -> Self {
        Self {
            metal_phases: [0.0; 6],
            amp_env: 0.0,
            bp_lp_state: 0.0,
            bp_hp_state: 0.0,
            prev_trigger: 0.0,
            rng_state: 11111,
        }
    }

    #[inline]
    fn next_random(&mut self) -> f32 {
        self.rng_state = self.rng_state.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.rng_state as i32 as f64 / i32::MAX as f64) as f32
    }
}

impl Default for HiHat {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for HiHat {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let color = ctx.parameters.get("color").unwrap_or(8000.0).clamp(2000.0, 16000.0);
        let base_decay = ctx.parameters.get("decay").unwrap_or(0.05).clamp(0.01, 0.5);
        let open = ctx.parameters.get("open").unwrap_or(0.0).clamp(0.0, 1.0);
        let tone = ctx.parameters.get("tone").unwrap_or(0.5).clamp(0.0, 1.0);

        let sr = ctx.sample_rate as f32;

        // Open parameter extends the decay time.
        let effective_decay = base_decay + open * 0.45;
        let amp_decay_rate = 1.0 - (-1.0 / (effective_decay * sr)).exp();

        // Band-pass filter: LP then HP in series.
        // LP cutoff slightly above color, HP cutoff slightly below.
        let lp_cutoff = (color * 1.5).min(sr * 0.45);
        let hp_cutoff = color * 0.5;
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
                    // Don't reset phases for more natural retriggering.
                }
                self.prev_trigger = trig;
            }

            // Metallic component: sum of 6 detuned square waves.
            let mut metal = 0.0_f32;
            for (j, phase) in self.metal_phases.iter_mut().enumerate() {
                let sq = if *phase < 0.5 { 1.0_f32 } else { -1.0_f32 };
                metal += sq;
                *phase += METAL_FREQS[j] / ctx.sample_rate;
                *phase -= phase.floor();
            }
            metal /= 6.0; // Normalize.

            // Noise component.
            let noise = self.next_random();

            // Mix metal and noise.
            let raw = metal * tone + noise * (1.0 - tone);

            // Band-pass filter (LP then HP).
            self.bp_lp_state += lp_coeff * (raw - self.bp_lp_state);
            let lp_out = self.bp_lp_state;
            let hp_in = lp_out;
            let hp_lp = self.bp_hp_state + hp_coeff * (hp_in - self.bp_hp_state);
            self.bp_hp_state = hp_lp;
            let bp_out = hp_in - hp_lp;

            // Apply amplitude envelope.
            let out = bp_out * self.amp_env;
            self.amp_env *= 1.0 - amp_decay_rate;

            output[i] = out.clamp(-1.0, 1.0);

            // Denormal protection.
            if self.amp_env.abs() < 1e-10 {
                self.amp_env = 0.0;
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
        self.metal_phases = [0.0; 6];
        self.amp_env = 0.0;
        self.bp_lp_state = 0.0;
        self.bp_hp_state = 0.0;
        self.prev_trigger = 0.0;
        self.rng_state = 11111;
    }
}
