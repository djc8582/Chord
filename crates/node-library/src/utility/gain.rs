//! Gain node — simple volume control with parameter smoothing.
//!
//! Uses the SmoothedParam from dsp-runtime for click-free gain changes.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus, SmoothedParam};

/// Simple gain (volume) node.
///
/// ## Parameters
/// - `gain` — Linear gain multiplier (default 1.0).
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` audio output (input * gain).
pub struct GainNode {
    smoothed_gain: SmoothedParam,
}

impl GainNode {
    pub fn new() -> Self {
        Self {
            smoothed_gain: SmoothedParam::new(1.0),
        }
    }
}

impl Default for GainNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for GainNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let target_gain = ctx.parameters.get("gain").unwrap_or(1.0);

        // Update smoothed gain target. Use 64-sample smoothing to prevent clicks.
        if (self.smoothed_gain.target() - target_gain).abs() > 1e-7 {
            self.smoothed_gain.set_target(target_gain, 64);
        }

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let g = self.smoothed_gain.next_sample();
            output[i] = input[i] * g;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.smoothed_gain = SmoothedParam::new(1.0);
    }
}
