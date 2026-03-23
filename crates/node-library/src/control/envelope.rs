//! ADSR envelope generator.
//!
//! Generates an Attack-Decay-Sustain-Release envelope in response to gate input.
//! Outputs a control signal (0.0 to 1.0).

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Envelope stage.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EnvelopeStage {
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

/// ADSR envelope generator node.
///
/// ## Parameters
/// - `attack` — Attack time in seconds (default 0.01).
/// - `decay` — Decay time in seconds (default 0.1).
/// - `sustain` — Sustain level 0..1 (default 0.7).
/// - `release` — Release time in seconds (default 0.3).
///
/// ## Inputs
/// - `[0]` gate input: >0.5 = gate on, <=0.5 = gate off.
///
/// ## Outputs
/// - `[0]` envelope output (0.0 to 1.0).
pub struct AdsrEnvelope {
    stage: EnvelopeStage,
    level: f64,
    gate_was_high: bool,
    /// Level at which release started (to release from current level, not 1.0).
    release_start_level: f64,
}

impl AdsrEnvelope {
    pub fn new() -> Self {
        Self {
            stage: EnvelopeStage::Idle,
            level: 0.0,
            gate_was_high: false,
            release_start_level: 0.0,
        }
    }
}

impl Default for AdsrEnvelope {
    fn default() -> Self {
        Self::new()
    }
}

/// Compute the per-sample linear increment for an envelope segment.
/// `time_seconds` is the segment duration, `sample_rate` is in Hz.
/// Returns a rate (fraction per sample). If time is near zero, returns a large value
/// to snap instantly.
#[inline]
fn rate_for_time(time_seconds: f64, sample_rate: f64) -> f64 {
    if time_seconds < 1e-6 {
        // Essentially instant.
        1.0
    } else {
        1.0 / (time_seconds * sample_rate)
    }
}

/// Compute the per-sample exponential coefficient for decay/release.
/// The coefficient is used as: level *= coeff each sample.
/// After `time_seconds`, the level will have decayed to approx 0.001 (-60 dB).
/// If time is near zero, returns 0.0 to snap instantly.
#[inline]
fn exp_coeff_for_time(time_seconds: f64, sample_rate: f64) -> f64 {
    if time_seconds < 1e-6 {
        0.0
    } else {
        // e^(-ln(1000) / (time * sr)) — reaches -60dB in `time` seconds.
        let n_samples = time_seconds * sample_rate;
        (-6.907755 / n_samples).exp() // ln(1000) ≈ 6.907755
    }
}

impl AudioNode for AdsrEnvelope {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let base_attack_time = (ctx.parameters.get("attack").unwrap_or(0.01) as f64).max(0.0);
        let base_decay_time = (ctx.parameters.get("decay").unwrap_or(0.1) as f64).max(0.0);
        let base_sustain_level = (ctx.parameters.get("sustain").unwrap_or(0.7) as f64).clamp(0.0, 1.0);
        let base_release_time = (ctx.parameters.get("release").unwrap_or(0.3) as f64).max(0.0);

        // Check for modulation inputs: attack_mod at [1], decay_mod at [2],
        // sustain_mod at [3], release_mod at [4]
        let has_attack_mod = ctx.inputs.len() > 1 && !ctx.inputs[1].is_empty();
        let has_decay_mod = ctx.inputs.len() > 2 && !ctx.inputs[2].is_empty();
        let has_sustain_mod = ctx.inputs.len() > 3 && !ctx.inputs[3].is_empty();
        let has_release_mod = ctx.inputs.len() > 4 && !ctx.inputs[4].is_empty();

        let sr = ctx.sample_rate;

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_gate = !ctx.inputs.is_empty();
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let gate = if has_gate { ctx.inputs[0][i] > 0.5 } else { false };

            // Per-sample modulation (time scale: mod * 2.0 seconds)
            let atk_mod = if has_attack_mod { ctx.inputs[1][i] as f64 } else { 0.0 };
            let dec_mod = if has_decay_mod { ctx.inputs[2][i] as f64 } else { 0.0 };
            let sus_mod = if has_sustain_mod { ctx.inputs[3][i] as f64 } else { 0.0 };
            let rel_mod = if has_release_mod { ctx.inputs[4][i] as f64 } else { 0.0 };
            let attack_time = (base_attack_time + atk_mod * 2.0).max(0.0);
            let decay_time = (base_decay_time + dec_mod * 2.0).max(0.0);
            let sustain_level = (base_sustain_level + sus_mod).clamp(0.0, 1.0);
            let release_time = (base_release_time + rel_mod * 2.0).max(0.0);

            // Detect gate transitions.
            if gate && !self.gate_was_high {
                // Gate on: start attack from current level.
                self.stage = EnvelopeStage::Attack;
            } else if !gate && self.gate_was_high {
                // Gate off: start release from current level.
                self.release_start_level = self.level;
                self.stage = EnvelopeStage::Release;
            }
            self.gate_was_high = gate;

            // Process the current stage.
            // Attack is linear (sounds punchy). Decay and release are exponential
            // (sounds natural — fast initial drop, slow tail).
            match self.stage {
                EnvelopeStage::Idle => {
                    self.level = 0.0;
                }
                EnvelopeStage::Attack => {
                    // Linear attack: rises from current level to 1.0.
                    let rate = rate_for_time(attack_time, sr);
                    self.level += rate;
                    if self.level >= 1.0 {
                        self.level = 1.0;
                        self.stage = EnvelopeStage::Decay;
                    }
                }
                EnvelopeStage::Decay => {
                    // Exponential decay: from 1.0 toward sustain level.
                    let coeff = exp_coeff_for_time(decay_time, sr);
                    // Exponential approach: level = sustain + (level - sustain) * coeff
                    self.level = sustain_level + (self.level - sustain_level) * coeff;
                    // Snap to sustain when close enough to avoid asymptotic tail.
                    if (self.level - sustain_level).abs() < 1e-6 {
                        self.level = sustain_level;
                        self.stage = EnvelopeStage::Sustain;
                    }
                }
                EnvelopeStage::Sustain => {
                    self.level = sustain_level;
                }
                EnvelopeStage::Release => {
                    // Exponential release: from release_start_level toward 0.
                    let coeff = exp_coeff_for_time(release_time, sr);
                    self.level *= coeff;
                    // Snap to zero when below audibility threshold.
                    if self.level < 1e-6 {
                        self.level = 0.0;
                        self.stage = EnvelopeStage::Idle;
                    }
                }
            }

            output[i] = self.level as f32;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.stage = EnvelopeStage::Idle;
        self.level = 0.0;
        self.gate_was_high = false;
        self.release_start_level = 0.0;
    }
}
