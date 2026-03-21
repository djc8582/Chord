//! DC Blocker node — removes DC offset from signal.
//!
//! Implements a simple first-order high-pass filter tuned to approximately 5 Hz.
//! This removes any constant (DC) component from the signal without
//! significantly affecting audible content.
//!
//! Transfer function: H(z) = (1 - z^-1) / (1 - R*z^-1)
//! where R is close to 1 (higher R = lower cutoff frequency).

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// DC Blocker node.
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` DC-blocked audio output.
pub struct DCBlocker {
    /// Previous input sample.
    x1: f64,
    /// Previous output sample.
    y1: f64,
}

impl DCBlocker {
    pub fn new() -> Self {
        Self { x1: 0.0, y1: 0.0 }
    }

    /// Compute the filter coefficient R for a given sample rate.
    /// R = 1 - (2 * pi * cutoff_freq / sample_rate)
    /// For ~5 Hz cutoff, this gives R very close to 1.
    #[inline]
    fn coefficient(sample_rate: f64) -> f64 {
        let cutoff_hz = 5.0;
        let r = 1.0 - (2.0 * std::f64::consts::PI * cutoff_hz / sample_rate);
        r.clamp(0.9, 0.9999)
    }
}

impl Default for DCBlocker {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for DCBlocker {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let r = Self::coefficient(ctx.sample_rate);
        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let x = input[i] as f64;

            // First-order DC blocker: y[n] = x[n] - x[n-1] + R * y[n-1]
            let y = x - self.x1 + r * self.y1;

            self.x1 = x;
            self.y1 = y;

            // Denormal protection.
            if self.y1.abs() < 1e-30 {
                self.y1 = 0.0;
            }

            output[i] = y as f32;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.x1 = 0.0;
        self.y1 = 0.0;
    }
}
