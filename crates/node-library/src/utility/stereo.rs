//! Stereo width control node.
//!
//! Controls the stereo width from mono (0%) through normal (100%) to wide (200%).
//! Uses mid-side processing to adjust the stereo image.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus, SmoothedParam};

/// Stereo width control node.
///
/// ## Parameters
/// - `width` — Stereo width in percent (default 100.0, range 0..200).
///   - 0% = mono (L and R are identical, both equal to mid signal).
///   - 100% = passthrough (no change).
///   - 200% = exaggerated stereo (side signal doubled).
///
/// ## Inputs
/// - `[0]` left audio input.
/// - `[1]` right audio input.
///
/// ## Outputs
/// - `[0]` left audio output.
/// - `[1]` right audio output.
pub struct Stereo {
    smoothed_width: SmoothedParam,
}

impl Stereo {
    pub fn new() -> Self {
        Self {
            smoothed_width: SmoothedParam::new(100.0),
        }
    }
}

impl Default for Stereo {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for Stereo {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let target_width = ctx.parameters.get("width").unwrap_or(100.0).clamp(0.0, 200.0);

        if (self.smoothed_width.target() - target_width).abs() > 1e-7 {
            self.smoothed_width.set_target(target_width, 64);
        }

        // Check for modulation input: width_mod at [1]
        let has_width_mod = ctx.inputs.len() > 1 && !ctx.inputs[1].is_empty();

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_left = !ctx.inputs.is_empty();
        let has_right_output = ctx.outputs.len() > 1;

        for i in 0..ctx.buffer_size {
            let base_width = self.smoothed_width.next_sample() / 100.0; // Normalize to 0..2 range.
            let width_mod = if has_width_mod { ctx.inputs[1][i] } else { 0.0 };
            let width = (base_width + width_mod * 2.0).clamp(0.0, 2.0);

            let left = if has_left { ctx.inputs[0][i] } else { 0.0 };
            let right = left; // Mono input (single "in" port).

            // Mid-side encoding.
            let mid = (left + right) * 0.5;
            let side = (left - right) * 0.5;

            // Apply width to side signal.
            let adjusted_side = side * width;

            // Mid-side decoding.
            let out_left = mid + adjusted_side;
            let out_right = mid - adjusted_side;

            ctx.outputs[0][i] = out_left;
            if has_right_output {
                ctx.outputs[1][i] = out_right;
            }
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.smoothed_width = SmoothedParam::new(100.0);
    }
}
