//! Low-Frequency Oscillator (LFO) node.
//!
//! Outputs a control signal (bipolar -1..+1 or unipolar 0..+1)
//! at sub-audio rates. Supports sine, saw, square, and triangle shapes.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// LFO node.
///
/// ## Parameters
/// - `rate` — Rate in Hz (default 1.0, range 0.01..100).
/// - `depth` — Output amplitude multiplier (default 1.0, range 0..1).
/// - `waveform` — 0=sine, 1=saw, 2=square, 3=triangle (default 0).
///
/// ## Outputs
/// - `[0]` control signal output (-depth..+depth for bipolar waveforms).
pub struct Lfo {
    phase: f64,
}

impl Lfo {
    pub fn new() -> Self {
        Self { phase: 0.0 }
    }
}

impl Default for Lfo {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for Lfo {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let rate = (ctx.parameters.get("rate").unwrap_or(1.0) as f64).max(0.001);
        let depth = ctx.parameters.get("depth").unwrap_or(1.0) as f64;
        let waveform = ctx.parameters.get("waveform").unwrap_or(0.0) as u32;

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let sr = ctx.sample_rate;
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let sample = match waveform {
                0 => {
                    // Sine.
                    (self.phase * std::f64::consts::TAU).sin()
                }
                1 => {
                    // Saw (rising, -1 to +1).
                    2.0 * self.phase - 1.0
                }
                2 => {
                    // Square.
                    if self.phase < 0.5 { 1.0 } else { -1.0 }
                }
                _ => {
                    // Triangle.
                    if self.phase < 0.5 {
                        4.0 * self.phase - 1.0
                    } else {
                        3.0 - 4.0 * self.phase
                    }
                }
            };

            output[i] = (sample * depth) as f32;

            // Advance phase.
            self.phase += rate / sr;
            self.phase -= self.phase.floor();
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.phase = 0.0;
    }
}
