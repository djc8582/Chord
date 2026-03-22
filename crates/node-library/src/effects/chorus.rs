//! Chorus node — multi-voice chorus using modulated delay lines.
//!
//! Creates a thickened sound by mixing the dry signal with several slightly
//! delayed and pitch-modulated copies. Each voice has its own LFO phase offset
//! for a rich, detuned effect.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Maximum delay for chorus modulation in seconds.
const MAX_CHORUS_DELAY_SEC: f64 = 0.05;

/// Default sample rate for initial buffer allocation.
const DEFAULT_SAMPLE_RATE: f64 = 48000.0;

/// Maximum number of chorus voices.
const MAX_VOICES: usize = 8;

/// Chorus node.
///
/// ## Parameters
/// - `rate` — LFO rate in Hz (default 1.0, range 0.01..10).
/// - `depth` — Modulation depth 0..1 (default 0.5). Controls delay sweep range.
/// - `voices` — Number of chorus voices 1..8 (default 3).
/// - `mix` — Wet/dry mix 0..1 (default 0.5).
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` chorused audio output.
pub struct Chorus {
    /// Circular delay buffer.
    buffer: Vec<f32>,
    /// Write position in the circular buffer.
    write_pos: usize,
    /// LFO phase for each voice (0..1).
    phases: [f64; MAX_VOICES],
}

impl Chorus {
    pub fn new() -> Self {
        let buf_size = (MAX_CHORUS_DELAY_SEC * DEFAULT_SAMPLE_RATE * 2.0) as usize + 1;
        let mut phases = [0.0_f64; MAX_VOICES];
        // Spread initial phases evenly across voices.
        for (i, phase) in phases.iter_mut().enumerate() {
            *phase = i as f64 / MAX_VOICES as f64;
        }
        Self {
            buffer: vec![0.0; buf_size],
            write_pos: 0,
            phases,
        }
    }

    fn ensure_buffer_size(&mut self, sample_rate: f64) {
        let required = (MAX_CHORUS_DELAY_SEC * sample_rate * 2.0) as usize + 1;
        if required > self.buffer.len() {
            self.buffer.resize(required, 0.0);
        }
    }
}

impl Default for Chorus {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for Chorus {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let base_rate = (ctx.parameters.get("rate").unwrap_or(1.0) as f64).clamp(0.01, 10.0);
        let base_depth = (ctx.parameters.get("depth").unwrap_or(0.5) as f64).clamp(0.0, 1.0);
        let num_voices = (ctx.parameters.get("voices").unwrap_or(3.0) as usize).clamp(1, MAX_VOICES);
        let mix = ctx.parameters.get("mix").unwrap_or(0.5).clamp(0.0, 1.0);

        // Check for modulation inputs: rate_mod at [1], depth_mod at [2]
        let has_rate_mod = ctx.inputs.len() > 1 && !ctx.inputs[1].is_empty();
        let has_depth_mod = ctx.inputs.len() > 2 && !ctx.inputs[2].is_empty();

        self.ensure_buffer_size(ctx.sample_rate);

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];
        let buf_len = self.buffer.len();
        let sr = ctx.sample_rate;

        // Base delay in samples (center of modulation range).
        let base_delay = MAX_CHORUS_DELAY_SEC * sr * 0.5;

        for i in 0..ctx.buffer_size {
            let dry = input[i];

            // Per-sample modulation
            let rate_mod = if has_rate_mod { ctx.inputs[1][i] as f64 } else { 0.0 };
            let depth_mod = if has_depth_mod { ctx.inputs[2][i] as f64 } else { 0.0 };
            let rate = (base_rate + rate_mod * 10.0).clamp(0.01, 20.0);
            let depth = (base_depth + depth_mod).clamp(0.0, 1.0);

            // Maximum modulation excursion in samples.
            let mod_depth = base_delay * depth;

            // Write dry input into the delay buffer.
            self.buffer[self.write_pos] = dry;

            // Sum wet signal from all voices.
            let mut wet = 0.0_f32;
            for v in 0..num_voices {
                // Each voice has its own LFO phase.
                let lfo = (self.phases[v] * std::f64::consts::TAU).sin();
                let delay_samples = base_delay + lfo * mod_depth;

                // Read from the delay buffer with linear interpolation.
                let read_pos_f = self.write_pos as f64 - delay_samples;
                let read_pos_f = if read_pos_f < 0.0 {
                    read_pos_f + buf_len as f64
                } else {
                    read_pos_f
                };

                let idx0 = read_pos_f.floor() as usize % buf_len;
                let idx1 = (idx0 + 1) % buf_len;
                let frac = read_pos_f.fract() as f32;

                let sample = self.buffer[idx0] * (1.0 - frac) + self.buffer[idx1] * frac;
                wet += sample;

                // Advance this voice's LFO phase.
                self.phases[v] += rate / sr;
                self.phases[v] -= self.phases[v].floor();
            }

            // Normalize wet signal by number of voices.
            wet /= num_voices as f32;

            output[i] = dry * (1.0 - mix) + wet * mix;

            self.write_pos = (self.write_pos + 1) % buf_len;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        for s in &mut self.buffer {
            *s = 0.0;
        }
        self.write_pos = 0;
        for (i, phase) in self.phases.iter_mut().enumerate() {
            *phase = i as f64 / MAX_VOICES as f64;
        }
    }

    fn tail_length(&self) -> u32 {
        (MAX_CHORUS_DELAY_SEC * DEFAULT_SAMPLE_RATE) as u32
    }
}
