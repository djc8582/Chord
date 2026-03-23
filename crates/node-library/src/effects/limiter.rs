//! Limiter node — brick-wall limiter with ceiling and release.
//!
//! Prevents audio from exceeding the ceiling level. Uses peak envelope tracking
//! with instant attack and configurable release. The gain reduction is computed as
//! ceiling/peak so the output is guaranteed not to exceed the ceiling.
//! Lookahead-free for simplicity and zero latency.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Limiter node.
///
/// ## Parameters
/// - `ceiling` — Maximum output level in dB (default 0.0, range -24..0).
/// - `release` — Release time in ms (default 100.0, range 1..1000).
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Modulation Inputs
/// - `[1]` ceiling_mod — bipolar modulation of ceiling level.
///
/// ## Outputs
/// - `[0]` limited audio output.
pub struct Limiter {
    /// Peak envelope follower state (linear amplitude).
    peak_envelope: f64,
}

impl Limiter {
    pub fn new() -> Self {
        Self { peak_envelope: 0.0 }
    }
}

impl Default for Limiter {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for Limiter {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let base_ceiling_db = (ctx.parameters.get("ceiling").unwrap_or(0.0) as f64).clamp(-24.0, 0.0);
        let release_ms = (ctx.parameters.get("release").unwrap_or(100.0) as f64).clamp(1.0, 1000.0);

        let release_coeff = (-1.0 / (release_ms * 0.001 * ctx.sample_rate)).exp();

        // Check for modulation input: ceiling_mod at [1]
        let has_ceiling_mod = ctx.inputs.len() > 1 && !ctx.inputs[1].is_empty();

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let sample = input[i] as f64;
            let abs_sample = sample.abs();

            // Per-sample modulation (dB scale: mod * 24.0)
            let ceil_mod = if has_ceiling_mod { ctx.inputs[1][i] as f64 } else { 0.0 };
            let ceiling_db = (base_ceiling_db + ceil_mod * 24.0).clamp(-24.0, 0.0);
            let ceiling_linear = 10.0_f64.powf(ceiling_db / 20.0);

            // Peak envelope: instant attack, smooth release.
            if abs_sample > self.peak_envelope {
                self.peak_envelope = abs_sample; // Instant attack.
            } else {
                self.peak_envelope = release_coeff * self.peak_envelope
                    + (1.0 - release_coeff) * abs_sample;
            }

            // Denormal protection.
            if self.peak_envelope < 1e-30 {
                self.peak_envelope = 0.0;
            }

            // Compute gain: if peak exceeds ceiling, reduce gain so output = ceiling.
            // gain = ceiling / peak, clamped to 1.0 (never boost).
            let gain = if self.peak_envelope > ceiling_linear {
                ceiling_linear / self.peak_envelope
            } else {
                1.0
            };

            output[i] = (sample * gain) as f32;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.peak_envelope = 0.0;
    }
}
