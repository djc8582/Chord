//! Output node — terminal node marking audio as ready for the output device.
//!
//! Copies input directly to output buffer. This is the final node in any
//! audio processing chain.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Output (terminal) node.
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` audio output (copy of input, passed to the audio device).
pub struct OutputNode;

impl OutputNode {
    pub fn new() -> Self {
        Self
    }
}

impl Default for OutputNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for OutputNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let output = &mut ctx.outputs[0];

        if ctx.inputs.is_empty() {
            // No input: output silence.
            for sample in output.iter_mut().take(ctx.buffer_size) {
                *sample = 0.0;
            }
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        // Copy input to output.
        output[..ctx.buffer_size].copy_from_slice(&input[..ctx.buffer_size]);

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        // Stateless node — nothing to reset.
    }
}
