//! CrossFader node — crossfade between two audio inputs (A/B).
//!
//! Uses a position parameter to blend between input A and input B.
//! 0 = fully A, 1 = fully B, 0.5 = equal mix.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus, SmoothedParam};

/// CrossFader node.
///
/// ## Parameters
/// - `position` — Crossfade position 0..1 (default 0.5). 0=A, 1=B, 0.5=equal mix.
///
/// ## Inputs
/// - `[0]` audio input A.
/// - `[1]` audio input B.
///
/// ## Outputs
/// - `[0]` crossfaded audio output.
pub struct CrossFader {
    smoothed_position: SmoothedParam,
}

impl CrossFader {
    pub fn new() -> Self {
        Self {
            smoothed_position: SmoothedParam::new(0.5),
        }
    }
}

impl Default for CrossFader {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for CrossFader {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let target_pos = ctx.parameters.get("position").unwrap_or(0.5).clamp(0.0, 1.0);

        if (self.smoothed_position.target() - target_pos).abs() > 1e-7 {
            self.smoothed_position.set_target(target_pos, 64);
        }

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_a = !ctx.inputs.is_empty();
        let has_b = ctx.inputs.len() > 1;
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let pos = self.smoothed_position.next_sample();
            let a = if has_a { ctx.inputs[0][i] } else { 0.0 };
            let b = if has_b { ctx.inputs[1][i] } else { 0.0 };

            // Equal-power crossfade approximation using linear interpolation.
            output[i] = a * (1.0 - pos) + b * pos;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.smoothed_position = SmoothedParam::new(0.5);
    }
}
