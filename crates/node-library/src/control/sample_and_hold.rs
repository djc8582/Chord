//! Sample-and-Hold node.
//!
//! Samples the signal input on the rising edge of a trigger, and holds
//! that value until the next trigger event.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Sample-and-Hold node.
///
/// ## Inputs
/// - `[0]` signal input (the value to sample).
/// - `[1]` trigger input: rising edge (crossing above 0.5) captures the signal value.
///
/// ## Outputs
/// - `[0]` held value output.
pub struct SampleAndHoldNode {
    /// The currently held value.
    held_value: f32,
    /// Whether the trigger was high on the previous sample (for edge detection).
    trigger_was_high: bool,
}

impl SampleAndHoldNode {
    pub fn new() -> Self {
        Self {
            held_value: 0.0,
            trigger_was_high: false,
        }
    }
}

impl Default for SampleAndHoldNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for SampleAndHoldNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_signal = !ctx.inputs.is_empty();
        let has_trigger = ctx.inputs.len() > 1;
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let signal = if has_signal { ctx.inputs[0][i] } else { 0.0 };
            let trigger = if has_trigger { ctx.inputs[1][i] > 0.5 } else { false };

            // Detect rising edge of trigger.
            if trigger && !self.trigger_was_high {
                self.held_value = signal;
            }
            self.trigger_was_high = trigger;

            output[i] = self.held_value;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.held_value = 0.0;
        self.trigger_was_high = false;
    }
}
