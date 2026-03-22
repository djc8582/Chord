//! Parametric EQ node — 3-band (low, mid, high) parametric equalizer.
//!
//! Each band is an independent biquad peaking EQ filter. The bands are processed
//! in series: low -> mid -> high.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Biquad filter coefficients for a peaking EQ band.
#[derive(Debug, Clone, Copy)]
struct PeakingEqCoeffs {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
}

impl PeakingEqCoeffs {
    /// Compute peaking EQ biquad coefficients.
    /// `freq_hz` — center frequency, `gain_db` — boost/cut in dB, `q` — bandwidth.
    fn compute(freq_hz: f64, gain_db: f64, q: f64, sample_rate: f64) -> Self {
        let freq = freq_hz.clamp(20.0, sample_rate * 0.499);
        let q = q.max(0.1);
        let a = 10.0_f64.powf(gain_db / 40.0); // sqrt of dB gain
        let omega = std::f64::consts::TAU * freq / sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);

        let b0 = 1.0 + alpha * a;
        let b1 = -2.0 * cos_omega;
        let b2 = 1.0 - alpha * a;
        let a0 = 1.0 + alpha / a;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha / a;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }

    /// Unity (pass-through) coefficients.
    fn unity() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        }
    }
}

/// State for a single biquad EQ band (Direct Form II Transposed).
#[derive(Debug, Clone)]
struct EqBand {
    z1: f64,
    z2: f64,
    coeffs: PeakingEqCoeffs,
    cached_freq: f64,
    cached_gain: f64,
    cached_q: f64,
    cached_sr: f64,
}

impl EqBand {
    fn new() -> Self {
        Self {
            z1: 0.0,
            z2: 0.0,
            coeffs: PeakingEqCoeffs::unity(),
            cached_freq: 0.0,
            cached_gain: 0.0,
            cached_q: 0.0,
            cached_sr: 0.0,
        }
    }

    /// Update coefficients if parameters changed.
    fn update(&mut self, freq: f64, gain_db: f64, q: f64, sample_rate: f64) {
        if freq != self.cached_freq
            || gain_db != self.cached_gain
            || q != self.cached_q
            || sample_rate != self.cached_sr
        {
            self.coeffs = PeakingEqCoeffs::compute(freq, gain_db, q, sample_rate);
            self.cached_freq = freq;
            self.cached_gain = gain_db;
            self.cached_q = q;
            self.cached_sr = sample_rate;
        }
    }

    /// Process a single sample through this band.
    #[inline]
    fn process_sample(&mut self, x: f64) -> f64 {
        let c = &self.coeffs;
        let y = c.b0 * x + self.z1;
        self.z1 = c.b1 * x - c.a1 * y + self.z2;
        self.z2 = c.b2 * x - c.a2 * y;
        y
    }

    /// Flush denormals from filter state.
    fn flush_state(&mut self) {
        if self.z1.abs() < 1e-30 {
            self.z1 = 0.0;
        }
        if self.z2.abs() < 1e-30 {
            self.z2 = 0.0;
        }
    }

    fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
        self.cached_freq = 0.0;
        self.cached_gain = 0.0;
        self.cached_q = 0.0;
        self.cached_sr = 0.0;
    }
}

/// 3-band parametric EQ node.
///
/// ## Parameters
/// - `low_freq` — Low band center frequency in Hz (default 200.0).
/// - `low_gain` — Low band gain in dB (default 0.0, range -24..24).
/// - `low_q` — Low band Q (default 1.0).
/// - `mid_freq` — Mid band center frequency in Hz (default 1000.0).
/// - `mid_gain` — Mid band gain in dB (default 0.0, range -24..24).
/// - `mid_q` — Mid band Q (default 1.0).
/// - `high_freq` — High band center frequency in Hz (default 5000.0).
/// - `high_gain` — High band gain in dB (default 0.0, range -24..24).
/// - `high_q` — High band Q (default 1.0).
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` EQ'd audio output.
pub struct EqNode {
    low: EqBand,
    mid: EqBand,
    high: EqBand,
}

impl EqNode {
    pub fn new() -> Self {
        Self {
            low: EqBand::new(),
            mid: EqBand::new(),
            high: EqBand::new(),
        }
    }
}

impl Default for EqNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for EqNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let low_freq = (ctx.parameters.get("low_freq").unwrap_or(200.0) as f64).clamp(20.0, 20000.0);
        let base_low_gain = (ctx.parameters.get("low_gain").unwrap_or(0.0) as f64).clamp(-24.0, 24.0);
        let low_q = (ctx.parameters.get("low_q").unwrap_or(1.0) as f64).max(0.1);

        let mid_freq = (ctx.parameters.get("mid_freq").unwrap_or(1000.0) as f64).clamp(20.0, 20000.0);
        let base_mid_gain = (ctx.parameters.get("mid_gain").unwrap_or(0.0) as f64).clamp(-24.0, 24.0);
        let mid_q = (ctx.parameters.get("mid_q").unwrap_or(1.0) as f64).max(0.1);

        let high_freq = (ctx.parameters.get("high_freq").unwrap_or(5000.0) as f64).clamp(20.0, 20000.0);
        let base_high_gain = (ctx.parameters.get("high_gain").unwrap_or(0.0) as f64).clamp(-24.0, 24.0);
        let high_q = (ctx.parameters.get("high_q").unwrap_or(1.0) as f64).max(0.1);

        // Check for modulation inputs: low_mod at [1], mid_mod at [2], high_mod at [3]
        let has_low_mod = ctx.inputs.len() > 1 && !ctx.inputs[1].is_empty();
        let has_mid_mod = ctx.inputs.len() > 2 && !ctx.inputs[2].is_empty();
        let has_high_mod = ctx.inputs.len() > 3 && !ctx.inputs[3].is_empty();
        let has_any_mod = has_low_mod || has_mid_mod || has_high_mod;

        if !has_any_mod {
            self.low.update(low_freq, base_low_gain, low_q, ctx.sample_rate);
            self.mid.update(mid_freq, base_mid_gain, mid_q, ctx.sample_rate);
            self.high.update(high_freq, base_high_gain, high_q, ctx.sample_rate);
        }

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            // Per-sample modulation of band gains (dB scale: mod * 24.0)
            if has_any_mod {
                let low_mod = if has_low_mod { ctx.inputs[1][i] as f64 } else { 0.0 };
                let mid_mod = if has_mid_mod { ctx.inputs[2][i] as f64 } else { 0.0 };
                let high_mod = if has_high_mod { ctx.inputs[3][i] as f64 } else { 0.0 };
                let low_gain = (base_low_gain + low_mod * 24.0).clamp(-24.0, 24.0);
                let mid_gain = (base_mid_gain + mid_mod * 24.0).clamp(-24.0, 24.0);
                let high_gain = (base_high_gain + high_mod * 24.0).clamp(-24.0, 24.0);
                self.low.update(low_freq, low_gain, low_q, ctx.sample_rate);
                self.mid.update(mid_freq, mid_gain, mid_q, ctx.sample_rate);
                self.high.update(high_freq, high_gain, high_q, ctx.sample_rate);
            }

            let x = input[i] as f64;
            // Process through 3 bands in series.
            let y = self.low.process_sample(x);
            let y = self.mid.process_sample(y);
            let y = self.high.process_sample(y);
            output[i] = y as f32;
        }

        // Denormal protection.
        self.low.flush_state();
        self.mid.flush_state();
        self.high.flush_state();

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.low.reset();
        self.mid.reset();
        self.high.reset();
    }
}
