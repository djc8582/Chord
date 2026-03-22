//! Snare drum synthesis node — noise + tone hybrid.
//!
//! Self-contained drum sound: trigger in, complete snare sound out.
//! Combines a sine tone body with high-pass filtered noise, snap transient,
//! and snappy wire/ring character.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Snare drum synthesizer with tone + noise layering.
///
/// ## Parameters
/// - `tone_freq` — Tone body frequency (default 180 Hz, range 80-400).
/// - `noise_color` — High-pass filter cutoff for noise (default 2000 Hz, range 500-8000).
/// - `tone_mix` — Tone vs noise balance (default 0.5, range 0-1). 0=all noise, 1=all tone.
/// - `decay` — Overall envelope decay time (default 0.15 s, range 0.03-1.0).
/// - `snap` — Initial transient sharpness (default 0.7, range 0-1).
/// - `snappy` — Wire/ring sound amount (default 0.3, range 0-1).
///
/// ## Inputs
/// - `[0]` trigger — rising edge triggers the hit.
///
/// ## Outputs
/// - `[0]` complete snare drum sound.
pub struct SnareDrum {
    /// Tone oscillator phase [0, 1).
    phase: f64,
    /// Overall amplitude envelope.
    amp_env: f32,
    /// Tone-specific envelope (decays faster than overall).
    tone_env: f32,
    /// Snap transient envelope (very fast decay).
    snap_env: f32,
    /// High-pass filter state for noise coloring.
    hp_state: f32,
    /// Previous trigger input value for edge detection.
    prev_trigger: f32,
    /// LCG random state for noise.
    rng_state: u32,
    /// Snappy resonance state (simple comb-like delay).
    snappy_state: f32,
}

impl SnareDrum {
    pub fn new() -> Self {
        Self {
            phase: 0.0,
            amp_env: 0.0,
            tone_env: 0.0,
            snap_env: 0.0,
            hp_state: 0.0,
            prev_trigger: 0.0,
            rng_state: 67890,
            snappy_state: 0.0,
        }
    }

    #[inline]
    fn next_random(&mut self) -> f32 {
        self.rng_state = self.rng_state.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.rng_state as i32 as f64 / i32::MAX as f64) as f32
    }
}

impl Default for SnareDrum {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for SnareDrum {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let tone_freq = ctx.parameters.get("tone_freq").unwrap_or(180.0).clamp(80.0, 400.0);
        let noise_color = ctx.parameters.get("noise_color").unwrap_or(2000.0).clamp(500.0, 8000.0);
        let tone_mix = ctx.parameters.get("tone_mix").unwrap_or(0.5).clamp(0.0, 1.0);
        let decay_param = ctx.parameters.get("decay").unwrap_or(0.15).clamp(0.03, 1.0);
        let snap = ctx.parameters.get("snap").unwrap_or(0.7).clamp(0.0, 1.0);
        let snappy = ctx.parameters.get("snappy").unwrap_or(0.3).clamp(0.0, 1.0);

        let sr = ctx.sample_rate as f32;

        let amp_decay_rate = 1.0 - (-1.0 / (decay_param * sr)).exp();
        // Tone decays about 2x faster than the overall envelope.
        let tone_decay_rate = 1.0 - (-1.0 / ((decay_param * 0.5) * sr)).exp();

        // High-pass filter coefficient: simple one-pole HP.
        // coeff ≈ 1 / (1 + 2*pi*fc/sr), higher = more HP.
        let hp_coeff = 1.0 / (1.0 + (2.0 * std::f32::consts::PI * noise_color / sr));

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
                    self.amp_env = 1.0;
                    self.tone_env = 1.0;
                    self.snap_env = 1.0;
                    self.snappy_state = 0.0;
                }
                self.prev_trigger = trig;
            }

            // Tone component (sine).
            let tone = (self.phase * std::f64::consts::TAU).sin() as f32 * self.tone_env;
            self.phase += tone_freq as f64 / ctx.sample_rate;
            self.phase -= self.phase.floor();
            self.tone_env *= 1.0 - tone_decay_rate;

            // Noise component with HP filter.
            let white = self.next_random();
            // One-pole high-pass: out = input - lp_state; lp_state += coeff * (input - lp_state).
            let lp = self.hp_state + hp_coeff * (white - self.hp_state);
            self.hp_state = lp;
            let noise_hp = white - lp;

            // Snappy wire resonance (feedback comb-like character).
            self.snappy_state = self.snappy_state * 0.7 + noise_hp * 0.3;
            let snappy_out = self.snappy_state * snappy;

            // Mix tone and noise.
            let body = tone * tone_mix + (noise_hp + snappy_out) * (1.0 - tone_mix);

            // Snap transient (short burst).
            let snap_burst = white * self.snap_env * snap;
            self.snap_env *= 0.92;

            // Apply overall amplitude envelope.
            let out = (body + snap_burst) * self.amp_env;
            self.amp_env *= 1.0 - amp_decay_rate;

            output[i] = out.clamp(-1.0, 1.0);

            // Denormal protection.
            if self.amp_env.abs() < 1e-10 {
                self.amp_env = 0.0;
            }
            if self.tone_env.abs() < 1e-10 {
                self.tone_env = 0.0;
            }
            if self.snap_env.abs() < 1e-10 {
                self.snap_env = 0.0;
            }
            if self.hp_state.abs() < 1e-10 {
                self.hp_state = 0.0;
            }
            if self.snappy_state.abs() < 1e-10 {
                self.snappy_state = 0.0;
            }
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.phase = 0.0;
        self.amp_env = 0.0;
        self.tone_env = 0.0;
        self.snap_env = 0.0;
        self.hp_state = 0.0;
        self.prev_trigger = 0.0;
        self.rng_state = 67890;
        self.snappy_state = 0.0;
    }
}
