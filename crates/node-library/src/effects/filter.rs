//! Biquad filter node — low-pass, high-pass, band-pass.
//!
//! Implements a standard biquad (second-order IIR) filter with cutoff and resonance parameters.
//! Includes denormal protection on filter state variables.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Filter mode (type).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilterMode {
    LowPass,
    HighPass,
    BandPass,
}

impl FilterMode {
    /// Parse from a float parameter: 0=low-pass, 1=high-pass, 2=band-pass.
    fn from_param(v: f32) -> Self {
        match v as u32 {
            0 => Self::LowPass,
            1 => Self::HighPass,
            2 => Self::BandPass,
            _ => Self::LowPass,
        }
    }
}

/// Biquad filter coefficients.
#[derive(Debug, Clone, Copy)]
struct BiquadCoeffs {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
}

impl BiquadCoeffs {
    /// Compute biquad coefficients for the given mode, cutoff frequency, resonance (Q), and sample rate.
    fn compute(mode: FilterMode, cutoff_hz: f64, q: f64, sample_rate: f64) -> Self {
        // Clamp cutoff to valid range to prevent instability.
        let cutoff = cutoff_hz.clamp(20.0, sample_rate * 0.499);
        let q = q.max(0.1); // Prevent zero/negative Q.

        let omega = std::f64::consts::TAU * cutoff / sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);

        let (b0, b1, b2, a0, a1, a2) = match mode {
            FilterMode::LowPass => {
                let b1 = 1.0 - cos_omega;
                let b0 = b1 / 2.0;
                let b2 = b0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_omega;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterMode::HighPass => {
                let b1_raw = 1.0 + cos_omega;
                let b0 = b1_raw / 2.0;
                let b1 = -(1.0 + cos_omega);
                let b2 = b0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_omega;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterMode::BandPass => {
                let b0 = alpha;
                let b1 = 0.0;
                let b2 = -alpha;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_omega;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
        };

        // Normalize by a0.
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }
}

/// Biquad filter node.
///
/// ## Parameters
/// - `cutoff` — Cutoff frequency in Hz (default 1000.0, range 20..20000).
/// - `resonance` — Resonance / Q factor (default 0.707, range 0.1..30.0).
/// - `mode` — 0=low-pass, 1=high-pass, 2=band-pass (default 0).
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` filtered audio output.
pub struct BiquadFilter {
    // Filter state (Direct Form II Transposed).
    z1: f64,
    z2: f64,
    // Cached coefficients for efficient processing.
    coeffs: BiquadCoeffs,
    cached_cutoff: f64,
    cached_resonance: f64,
    cached_mode: FilterMode,
    cached_sample_rate: f64,
}

impl BiquadFilter {
    pub fn new() -> Self {
        Self {
            z1: 0.0,
            z2: 0.0,
            coeffs: BiquadCoeffs {
                b0: 1.0,
                b1: 0.0,
                b2: 0.0,
                a1: 0.0,
                a2: 0.0,
            },
            cached_cutoff: 0.0,
            cached_resonance: 0.0,
            cached_mode: FilterMode::LowPass,
            cached_sample_rate: 0.0,
        }
    }

    /// Flush denormals from filter state.
    #[inline]
    fn flush_state(&mut self) {
        const TINY: f64 = 1e-25;
        if self.z1.abs() < 1e-30 {
            self.z1 = 0.0;
        } else {
            // Add tiny DC offset to prevent denormals in feedback.
            self.z1 += TINY;
            self.z1 -= TINY;
        }
        if self.z2.abs() < 1e-30 {
            self.z2 = 0.0;
        }
    }
}

impl Default for BiquadFilter {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for BiquadFilter {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let cutoff = ctx.parameters.get("cutoff").unwrap_or(1000.0) as f64;
        let resonance = ctx.parameters.get("resonance").unwrap_or(0.707) as f64;
        let mode = FilterMode::from_param(ctx.parameters.get("mode").unwrap_or(0.0));

        // Recompute coefficients only if parameters changed.
        if cutoff != self.cached_cutoff
            || resonance != self.cached_resonance
            || mode != self.cached_mode
            || ctx.sample_rate != self.cached_sample_rate
        {
            self.coeffs = BiquadCoeffs::compute(mode, cutoff, resonance, ctx.sample_rate);
            self.cached_cutoff = cutoff;
            self.cached_resonance = resonance;
            self.cached_mode = mode;
            self.cached_sample_rate = ctx.sample_rate;
        }

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];
        let c = &self.coeffs;

        for i in 0..ctx.buffer_size {
            let x = input[i] as f64;

            // Direct Form II Transposed.
            let y = c.b0 * x + self.z1;
            self.z1 = c.b1 * x - c.a1 * y + self.z2;
            self.z2 = c.b2 * x - c.a2 * y;

            output[i] = y as f32;
        }

        // Denormal protection.
        self.flush_state();

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
        self.cached_cutoff = 0.0;
        self.cached_resonance = 0.0;
        self.cached_sample_rate = 0.0;
    }
}
