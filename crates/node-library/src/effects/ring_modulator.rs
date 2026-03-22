//! Ring Modulator node — multiplies two audio signals.
//!
//! Classic ring modulation: output = carrier * modulator.
//! Creates sum and difference frequencies for metallic/bell-like tones.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Ring Modulator node.
///
/// ## Parameters
/// - `mix` — Wet/dry mix 0..1 (default 1.0). 0=dry carrier, 1=fully modulated.
///
/// ## Inputs
/// - `[0]` carrier audio input.
/// - `[1]` modulator audio input.
///
/// ## Outputs
/// - `[0]` ring-modulated audio output.
pub struct RingModulator;

impl RingModulator {
    pub fn new() -> Self {
        Self
    }
}

impl Default for RingModulator {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for RingModulator {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let base_mix = ctx.parameters.get("mix").unwrap_or(1.0).clamp(0.0, 1.0);

        // Check for modulation input: mix_mod at [2] (after in=0, mod=1)
        let has_mix_mod = ctx.inputs.len() > 2 && !ctx.inputs[2].is_empty();

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_carrier = !ctx.inputs.is_empty();
        let has_modulator = ctx.inputs.len() > 1;
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let carrier = if has_carrier { ctx.inputs[0][i] } else { 0.0 };
            let modulator = if has_modulator { ctx.inputs[1][i] } else { 0.0 };

            let mix_mod = if has_mix_mod { ctx.inputs[2][i] } else { 0.0 };
            let mix = (base_mix + mix_mod).clamp(0.0, 1.0);

            let wet = carrier * modulator;
            output[i] = carrier * (1.0 - mix) + wet * mix;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        // Stateless node — nothing to reset.
    }
}
