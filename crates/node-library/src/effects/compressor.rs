//! Dynamics compressor node with envelope follower.
//!
//! Reduces the dynamic range of signals above the threshold according to the ratio.
//! Uses a peak-detecting envelope follower with configurable attack and release times.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Compressor node.
///
/// ## Parameters
/// - `threshold` — Threshold in dB (default -20.0, range -60..0).
/// - `ratio` — Compression ratio (default 4.0, range 1..∞). 1=no compression, ∞=limiter.
/// - `attack` — Attack time in ms (default 10.0, range 0.1..100).
/// - `release` — Release time in ms (default 100.0, range 10..1000).
/// - `makeup` — Makeup gain in dB (default 0.0, range 0..40).
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` compressed audio output.
pub struct CompressorNode {
    /// Envelope follower state (linear amplitude).
    envelope: f64,
}

impl CompressorNode {
    pub fn new() -> Self {
        Self { envelope: 0.0 }
    }
}

impl Default for CompressorNode {
    fn default() -> Self {
        Self::new()
    }
}

/// Convert decibels to linear amplitude.
#[inline]
fn db_to_linear(db: f64) -> f64 {
    10.0_f64.powf(db / 20.0)
}

/// Convert linear amplitude to decibels. Returns -120 dB for near-zero values.
#[inline]
fn linear_to_db(lin: f64) -> f64 {
    if lin.abs() < 1e-20 {
        -120.0
    } else {
        20.0 * lin.abs().log10()
    }
}

/// Compute the attack/release coefficient from a time constant in milliseconds.
#[inline]
fn time_constant(time_ms: f64, sample_rate: f64) -> f64 {
    if time_ms < 0.01 {
        0.0 // Instant
    } else {
        (-1.0 / (time_ms * 0.001 * sample_rate)).exp()
    }
}

impl AudioNode for CompressorNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let base_threshold_db = (ctx.parameters.get("threshold").unwrap_or(-20.0) as f64).clamp(-60.0, 0.0);
        let base_ratio = (ctx.parameters.get("ratio").unwrap_or(4.0) as f64).max(1.0);
        let attack_ms = (ctx.parameters.get("attack").unwrap_or(10.0) as f64).clamp(0.1, 100.0);
        let release_ms = (ctx.parameters.get("release").unwrap_or(100.0) as f64).clamp(10.0, 1000.0);
        let makeup_db = (ctx.parameters.get("makeup").unwrap_or(0.0) as f64).clamp(0.0, 40.0);

        let attack_coeff = time_constant(attack_ms, ctx.sample_rate);
        let release_coeff = time_constant(release_ms, ctx.sample_rate);
        let makeup_linear = db_to_linear(makeup_db);

        // Check for modulation inputs: threshold_mod at [1], ratio_mod at [2]
        let has_threshold_mod = ctx.inputs.len() > 1 && !ctx.inputs[1].is_empty();
        let has_ratio_mod = ctx.inputs.len() > 2 && !ctx.inputs[2].is_empty();

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let sample = input[i] as f64;
            let abs_sample = sample.abs();

            // Per-sample modulation
            let thr_mod = if has_threshold_mod { ctx.inputs[1][i] as f64 } else { 0.0 };
            let rat_mod = if has_ratio_mod { ctx.inputs[2][i] as f64 } else { 0.0 };
            let threshold_db = (base_threshold_db + thr_mod * 40.0).clamp(-60.0, 0.0);
            let ratio = (base_ratio + rat_mod * 20.0).max(1.0);

            // Envelope follower (peak detector with attack/release).
            if abs_sample > self.envelope {
                // Attack: envelope rises to follow the peak.
                self.envelope = attack_coeff * self.envelope + (1.0 - attack_coeff) * abs_sample;
            } else {
                // Release: envelope decays toward the signal.
                self.envelope = release_coeff * self.envelope + (1.0 - release_coeff) * abs_sample;
            }

            // Denormal protection.
            if self.envelope < 1e-30 {
                self.envelope = 0.0;
            }

            // Convert envelope to dB.
            let env_db = linear_to_db(self.envelope);

            // Compute gain reduction.
            let gain_db = if env_db > threshold_db {
                // Above threshold: reduce gain.
                let overshoot = env_db - threshold_db;
                let compressed_overshoot = overshoot / ratio;
                threshold_db + compressed_overshoot - env_db
            } else {
                0.0 // Below threshold: no gain change.
            };

            let gain = db_to_linear(gain_db) * makeup_linear;
            output[i] = (sample * gain) as f32;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.envelope = 0.0;
    }
}
