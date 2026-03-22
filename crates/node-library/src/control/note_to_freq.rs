//! Note-to-frequency converter node.
//!
//! Converts MIDI note numbers (as f32 audio-rate signal) to frequency in Hz.
//! Supports fractional note numbers for pitch glides and microtonal tuning.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Converts MIDI note numbers to frequency in Hz.
///
/// ## Parameters
/// - `a4_freq` — Concert pitch reference (default 440.0 Hz).
///
/// ## Inputs
/// - `[0]` MIDI note number as f32 (e.g., 60.0 = middle C).
///
/// ## Outputs
/// - `[0]` Frequency in Hz (e.g., 261.63 for note 60).
pub struct NoteToFreq;

impl NoteToFreq {
    pub fn new() -> Self {
        Self
    }
}

impl Default for NoteToFreq {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for NoteToFreq {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let a4_freq = ctx.parameters.get("a4_freq").unwrap_or(440.0) as f64;

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let note = input[i] as f64;
            let freq = a4_freq * (2.0_f64).powf((note - 69.0) / 12.0);
            output[i] = freq as f32;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        // Stateless — nothing to reset.
    }
}
