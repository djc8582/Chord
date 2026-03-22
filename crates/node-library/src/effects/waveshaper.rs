//! Waveshaper node — distortion/saturation via transfer function.
//!
//! Applies a nonlinear transfer function to the audio signal for distortion effects.
//! Supports soft clip, hard clip, tanh saturation, and sine fold modes.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Waveshaper transfer function mode.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum WaveshaperMode {
    /// Soft clipping via cubic polynomial.
    SoftClip = 0,
    /// Hard clipping (brick-wall).
    HardClip = 1,
    /// Hyperbolic tangent saturation.
    Tanh = 2,
    /// Sine fold (wavefolder).
    SineFold = 3,
}

impl From<u32> for WaveshaperMode {
    fn from(v: u32) -> Self {
        match v {
            0 => Self::SoftClip,
            1 => Self::HardClip,
            2 => Self::Tanh,
            _ => Self::SineFold,
        }
    }
}

/// Waveshaper node.
///
/// ## Parameters
/// - `drive` — Drive amount 1..100 (default 1.0). Multiplies input before shaping.
/// - `mix` — Wet/dry mix 0..1 (default 1.0).
/// - `mode` — Transfer function: 0=soft clip, 1=hard clip, 2=tanh, 3=sine fold (default 0).
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` shaped audio output.
pub struct Waveshaper;

impl Waveshaper {
    pub fn new() -> Self {
        Self
    }
}

impl Default for Waveshaper {
    fn default() -> Self {
        Self::new()
    }
}

#[inline]
fn soft_clip(x: f32) -> f32 {
    // Cubic soft clip: 1.5x - 0.5x^3 for |x| <= 1, else clamp.
    if x > 1.0 {
        1.0
    } else if x < -1.0 {
        -1.0
    } else {
        1.5 * x - 0.5 * x * x * x
    }
}

#[inline]
fn hard_clip(x: f32) -> f32 {
    x.clamp(-1.0, 1.0)
}

#[inline]
fn tanh_shape(x: f32) -> f32 {
    (x as f64).tanh() as f32
}

#[inline]
fn sine_fold(x: f32) -> f32 {
    (x * std::f32::consts::FRAC_PI_2).sin()
}

impl AudioNode for Waveshaper {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let base_drive = ctx.parameters.get("drive").unwrap_or(1.0).max(0.01);
        let mix = ctx.parameters.get("mix").unwrap_or(1.0).clamp(0.0, 1.0);
        let mode = WaveshaperMode::from(ctx.parameters.get("mode").unwrap_or(0.0) as u32);

        // Check for modulation input: drive_mod at [1]
        let has_drive_mod = ctx.inputs.len() > 1 && !ctx.inputs[1].is_empty();

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let dry = input[i];
            let drive_mod = if has_drive_mod { ctx.inputs[1][i] } else { 0.0 };
            let drive = (base_drive + drive_mod * 10.0).max(0.01);
            let driven = dry * drive;

            let wet = match mode {
                WaveshaperMode::SoftClip => soft_clip(driven),
                WaveshaperMode::HardClip => hard_clip(driven),
                WaveshaperMode::Tanh => tanh_shape(driven),
                WaveshaperMode::SineFold => sine_fold(driven),
            };

            output[i] = dry * (1.0 - mix) + wet * mix;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        // Stateless node — nothing to reset.
    }
}
