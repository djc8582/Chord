//! Phaser node — all-pass filter chain with LFO modulation.
//!
//! Creates a sweeping phase-shift effect by modulating a chain of all-pass
//! filters with a low-frequency oscillator. The number of stages controls
//! the number of notches in the frequency response.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Maximum number of all-pass stages.
const MAX_STAGES: usize = 12;

/// A single first-order all-pass filter.
///
/// Transfer function: H(z) = (a + z^-1) / (1 + a*z^-1)
/// where `a` is the coefficient controlling the break frequency.
struct AllPassStage {
    /// Previous input sample.
    x1: f64,
    /// Previous output sample.
    y1: f64,
}

impl AllPassStage {
    fn new() -> Self {
        Self { x1: 0.0, y1: 0.0 }
    }

    #[inline]
    fn process(&mut self, input: f64, coeff: f64) -> f64 {
        let output = coeff * input + self.x1 - coeff * self.y1;
        self.x1 = input;
        self.y1 = output;

        // Denormal protection.
        if self.y1.abs() < 1e-30 {
            self.y1 = 0.0;
        }

        output
    }

    fn clear(&mut self) {
        self.x1 = 0.0;
        self.y1 = 0.0;
    }
}

/// Phaser node.
///
/// ## Parameters
/// - `rate` — LFO rate in Hz (default 0.5, range 0.01..10).
/// - `depth` — Modulation depth 0..1 (default 0.7). Controls sweep range.
/// - `stages` — Number of all-pass stages 2..12 (default 4). More stages = more notches.
/// - `feedback` — Feedback amount -0.95..0.95 (default 0.3). Adds resonance to notches.
/// - `mix` — Wet/dry mix 0..1 (default 0.5).
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` phased audio output.
pub struct Phaser {
    stages: [AllPassStage; MAX_STAGES],
    lfo_phase: f64,
    feedback_sample: f64,
}

impl Phaser {
    pub fn new() -> Self {
        Self {
            stages: std::array::from_fn(|_| AllPassStage::new()),
            lfo_phase: 0.0,
            feedback_sample: 0.0,
        }
    }
}

impl Default for Phaser {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for Phaser {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let rate = (ctx.parameters.get("rate").unwrap_or(0.5) as f64).clamp(0.01, 10.0);
        let depth = (ctx.parameters.get("depth").unwrap_or(0.7) as f64).clamp(0.0, 1.0);
        let num_stages = (ctx.parameters.get("stages").unwrap_or(4.0) as usize).clamp(2, MAX_STAGES);
        let feedback = (ctx.parameters.get("feedback").unwrap_or(0.3) as f64).clamp(-0.95, 0.95);
        let mix = ctx.parameters.get("mix").unwrap_or(0.5).clamp(0.0, 1.0);

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];
        let sr = ctx.sample_rate;

        // Frequency range for the all-pass sweep (in Hz).
        let min_freq = 200.0_f64;
        let max_freq = 4000.0_f64;

        for i in 0..ctx.buffer_size {
            // LFO produces a unipolar 0..1 value.
            let lfo = ((self.lfo_phase * std::f64::consts::TAU).sin() + 1.0) * 0.5;
            let sweep = lfo * depth;

            // Map sweep to frequency using exponential interpolation.
            let freq = min_freq * (max_freq / min_freq).powf(sweep);

            // Convert frequency to all-pass coefficient.
            // a = (tan(pi*f/sr) - 1) / (tan(pi*f/sr) + 1)
            let tan_val = (std::f64::consts::PI * freq / sr).tan();
            let coeff = (tan_val - 1.0) / (tan_val + 1.0);

            // Input with feedback.
            let dry = input[i] as f64;
            let ap_input = dry + self.feedback_sample * feedback;

            // Process through all-pass chain.
            let mut signal = ap_input;
            for stage in self.stages.iter_mut().take(num_stages) {
                signal = stage.process(signal, coeff);
            }

            self.feedback_sample = signal;

            // Denormal protection on feedback.
            if self.feedback_sample.abs() < 1e-30 {
                self.feedback_sample = 0.0;
            }

            // Mix dry and wet.
            let out = dry * (1.0 - mix as f64) + signal * mix as f64;
            output[i] = out as f32;

            // Advance LFO phase.
            self.lfo_phase += rate / sr;
            self.lfo_phase -= self.lfo_phase.floor();
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        for stage in &mut self.stages {
            stage.clear();
        }
        self.lfo_phase = 0.0;
        self.feedback_sample = 0.0;
    }
}
