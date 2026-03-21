//! Mixer node — sums multiple audio inputs into one output.
//!
//! Accepts any number of inputs and sums them into a single output.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Mixer node.
///
/// ## Inputs
/// - `[0..N]` audio inputs (all summed together).
///
/// ## Outputs
/// - `[0]` summed audio output.
pub struct MixerNode;

impl MixerNode {
    pub fn new() -> Self {
        Self
    }
}

impl Default for MixerNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for MixerNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let output = &mut ctx.outputs[0];

        // Clear output buffer first.
        for sample in output.iter_mut().take(ctx.buffer_size) {
            *sample = 0.0;
        }

        // Sum all inputs.
        for input in ctx.inputs.iter() {
            for i in 0..ctx.buffer_size {
                output[i] += input[i];
            }
        }

        if ctx.inputs.is_empty() {
            Ok(ProcessStatus::Silent)
        } else {
            Ok(ProcessStatus::Ok)
        }
    }

    fn reset(&mut self) {
        // Stateless node — nothing to reset.
    }
}
