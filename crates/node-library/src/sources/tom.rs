//! Tom drum synthesis node — pitched drum.
//!
//! Self-contained drum sound: trigger in, complete tom sound out.
//! Uses a sine oscillator with slight downward pitch sweep, amplitude
//! envelope, and harmonic content controlled by the tone parameter.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Tom drum synthesizer with pitch sweep and harmonic control.
///
/// ## Parameters
/// - `pitch` — Base frequency (default 120 Hz, range 40-400).
/// - `decay` — Amplitude envelope decay time (default 0.25 s, range 0.05-1.0).
/// - `sweep` — Pitch sweep amount (default 0.3, range 0-1). How far above pitch the sweep starts.
/// - `tone` — Sine purity vs harmonics (default 0.7, range 0-1). 1=pure sine, 0=more harmonics.
///
/// ## Inputs
/// - `[0]` trigger — rising edge triggers the hit.
///
/// ## Outputs
/// - `[0]` complete tom drum sound.
pub struct Tom {
    /// Main oscillator phase [0, 1).
    phase: f64,
    /// Second harmonic phase (for tone control).
    phase2: f64,
    /// Amplitude envelope.
    amp_env: f32,
    /// Pitch envelope (1.0 at trigger, decays toward 0).
    pitch_env: f32,
    /// Previous trigger value for edge detection.
    prev_trigger: f32,
}

impl Tom {
    pub fn new() -> Self {
        Self {
            phase: 0.0,
            phase2: 0.0,
            amp_env: 0.0,
            pitch_env: 0.0,
            prev_trigger: 0.0,
        }
    }
}

impl Default for Tom {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for Tom {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let base_pitch = ctx.parameters.get("pitch").unwrap_or(120.0).clamp(40.0, 400.0);
        let decay_param = ctx.parameters.get("decay").unwrap_or(0.25).clamp(0.05, 1.0);
        let sweep = ctx.parameters.get("sweep").unwrap_or(0.3).clamp(0.0, 1.0);
        let tone = ctx.parameters.get("tone").unwrap_or(0.7).clamp(0.0, 1.0);

        let sr = ctx.sample_rate as f32;

        let amp_decay_rate = 1.0 - (-1.0 / (decay_param * sr)).exp();
        // Pitch sweep decays in about 1/4 of the amplitude decay time.
        let pitch_decay_rate = 1.0 - (-1.0 / ((decay_param * 0.15) * sr)).exp();

        // Sweep range: the pitch starts this many Hz above base_pitch.
        let sweep_range = base_pitch * sweep * 1.5;

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_trigger = !ctx.inputs.is_empty() && !ctx.inputs[0].is_empty();
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            // Trigger detection.
            if has_trigger {
                let trig = ctx.inputs[0][i];
                if self.prev_trigger < 0.5 && trig >= 0.5 {
                    self.phase = 0.0;
                    self.phase2 = 0.0;
                    self.amp_env = 1.0;
                    self.pitch_env = 1.0;
                }
                self.prev_trigger = trig;
            }

            // Pitch with sweep.
            let freq = base_pitch + sweep_range * self.pitch_env;
            self.pitch_env *= 1.0 - pitch_decay_rate;

            // Fundamental sine.
            let fundamental = (self.phase * std::f64::consts::TAU).sin() as f32;
            self.phase += freq as f64 / ctx.sample_rate;
            self.phase -= self.phase.floor();

            // Second harmonic for tonal variation.
            let harmonic = (self.phase2 * std::f64::consts::TAU).sin() as f32;
            self.phase2 += (freq * 1.5) as f64 / ctx.sample_rate;
            self.phase2 -= self.phase2.floor();

            // Mix fundamental and harmonic based on tone parameter.
            // tone=1.0 -> pure sine, tone=0.0 -> more harmonics.
            let osc = fundamental * tone + (fundamental * 0.6 + harmonic * 0.4) * (1.0 - tone);

            // Apply amplitude envelope.
            let out = osc * self.amp_env;
            self.amp_env *= 1.0 - amp_decay_rate;

            // Gentle soft clip to prevent harsh peaks.
            output[i] = (out * 1.2).tanh();

            // Denormal protection.
            if self.amp_env.abs() < 1e-10 {
                self.amp_env = 0.0;
            }
            if self.pitch_env.abs() < 1e-10 {
                self.pitch_env = 0.0;
            }
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.phase = 0.0;
        self.phase2 = 0.0;
        self.amp_env = 0.0;
        self.pitch_env = 0.0;
        self.prev_trigger = 0.0;
    }
}
