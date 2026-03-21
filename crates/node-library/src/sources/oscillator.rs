//! Oscillator node — sine, saw, square, triangle waveforms.
//!
//! Anti-aliased using PolyBLEP for saw and square waveforms.
//! Frequency and detune controlled via parameters or input ports.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Available waveform shapes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Waveform {
    Sine,
    Saw,
    Square,
    Triangle,
}

impl Waveform {
    /// Parse from a float parameter: 0=sine, 1=saw, 2=square, 3=triangle.
    fn from_param(v: f32) -> Self {
        match v as u32 {
            0 => Self::Sine,
            1 => Self::Saw,
            2 => Self::Square,
            3 => Self::Triangle,
            _ => Self::Sine,
        }
    }
}

/// Band-limited oscillator node.
///
/// ## Parameters
/// - `frequency` — Base frequency in Hz (default 440.0).
/// - `detune` — Detune in cents (default 0.0).
/// - `waveform` — 0=sine, 1=saw, 2=square, 3=triangle (default 0).
///
/// ## Inputs
/// - `[0]` frequency modulation (optional, added to base frequency).
///
/// ## Outputs
/// - `[0]` audio output.
pub struct Oscillator {
    phase: f64,
    last_phase_increment: f64,
}

impl Oscillator {
    pub fn new() -> Self {
        Self {
            phase: 0.0,
            last_phase_increment: 0.0,
        }
    }
}

impl Default for Oscillator {
    fn default() -> Self {
        Self::new()
    }
}

/// PolyBLEP correction for band-limited waveforms.
/// `t` is the phase position (0..1), `dt` is the phase increment per sample.
#[inline]
fn poly_blep(t: f64, dt: f64) -> f64 {
    if dt <= 0.0 {
        return 0.0;
    }
    if t < dt {
        // Near the start of the period (just after a discontinuity).
        let t_norm = t / dt;
        // 2*t_norm - t_norm^2 - 1
        2.0 * t_norm - t_norm * t_norm - 1.0
    } else if t > 1.0 - dt {
        // Near the end of the period (just before a discontinuity).
        let t_norm = (t - 1.0) / dt;
        // t_norm^2 + 2*t_norm + 1
        t_norm * t_norm + 2.0 * t_norm + 1.0
    } else {
        0.0
    }
}

impl AudioNode for Oscillator {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let base_freq = ctx.parameters.get("frequency").unwrap_or(440.0) as f64;
        let detune_cents = ctx.parameters.get("detune").unwrap_or(0.0) as f64;
        let waveform = Waveform::from_param(ctx.parameters.get("waveform").unwrap_or(0.0));

        // Apply detune: cents -> frequency multiplier
        let detune_mult = (2.0_f64).powf(detune_cents / 1200.0);

        let sr = ctx.sample_rate;
        let has_fm_input = !ctx.inputs.is_empty();

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Ok);
        }

        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            // Frequency modulation from input port 0 (additive Hz).
            let fm = if has_fm_input { ctx.inputs[0][i] as f64 } else { 0.0 };
            let freq = (base_freq * detune_mult + fm).max(0.0);

            let phase_inc = freq / sr;
            self.last_phase_increment = phase_inc;

            // Generate sample based on waveform.
            let sample = match waveform {
                Waveform::Sine => {
                    (self.phase * std::f64::consts::TAU).sin()
                }
                Waveform::Saw => {
                    // Naive saw: goes from -1 to +1 over the period.
                    let naive = 2.0 * self.phase - 1.0;
                    // Apply PolyBLEP anti-aliasing.
                    naive - poly_blep(self.phase, phase_inc)
                }
                Waveform::Square => {
                    // Naive square.
                    let naive = if self.phase < 0.5 { 1.0 } else { -1.0 };
                    // Apply PolyBLEP at both edges.
                    let mut out = naive;
                    out += poly_blep(self.phase, phase_inc);
                    // Second edge at phase 0.5
                    let shifted = (self.phase + 0.5) % 1.0;
                    out -= poly_blep(shifted, phase_inc);
                    out
                }
                Waveform::Triangle => {
                    // Integrate a PolyBLEP square wave to get a band-limited triangle.
                    // Use the direct formula: triangle from phase.
                    // Triangle: rises from -1 to +1 in first half, falls from +1 to -1 in second half.
                    let t = self.phase;
                    if t < 0.5 {
                        4.0 * t - 1.0
                    } else {
                        3.0 - 4.0 * t
                    }
                }
            };

            output[i] = sample as f32;

            // Advance phase.
            self.phase += phase_inc;
            // Wrap phase to [0, 1).
            self.phase -= self.phase.floor();
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.phase = 0.0;
        self.last_phase_increment = 0.0;
    }
}
