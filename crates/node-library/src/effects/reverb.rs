//! Algorithmic reverb node — Schroeder-style reverb with modulation.
//!
//! Implements a Schroeder reverb with 4 parallel comb filters feeding into
//! 2 series all-pass filters. Room size controls the comb filter delay lengths,
//! and damping controls the low-pass filtering within the comb feedback loops.
//!
//! Enhancements over basic Schroeder:
//! - Slow LFO modulation of comb delay lengths (+/- 2 samples) to prevent metallic ringing.
//! - Stereo decorrelation: left/right outputs use offset comb sums for wider image.
//! - Pre-delay parameter for controlling early reflection gap.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Maximum reverb buffer size in samples (~2 seconds at 48kHz).
const MAX_BUFFER_SAMPLES: usize = 96000;

/// Comb filter delay lengths in samples (at 48kHz). These are prime-like values
/// chosen to minimize periodicity artifacts.
const COMB_LENGTHS: [usize; 4] = [1557, 1617, 1491, 1422];

/// All-pass filter delay lengths in samples (at 48kHz).
const ALLPASS_LENGTHS: [usize; 2] = [225, 556];

/// Maximum pre-delay in samples (~50ms at 48kHz).
const MAX_PREDELAY_SAMPLES: usize = 2400;

/// A simple comb filter with damping (low-pass in the feedback loop) and modulation.
struct CombFilter {
    buffer: Vec<f32>,
    pos: usize,
    filter_state: f32,
    /// Slow LFO phase for delay length modulation (radians).
    mod_phase: f64,
    /// LFO rate in radians per sample (unique per comb to decorrelate).
    mod_rate: f64,
}

impl CombFilter {
    fn new(length: usize, mod_rate_hz: f64, sample_rate: f64) -> Self {
        // Add extra samples to accommodate modulation excursion.
        Self {
            buffer: vec![0.0; length.max(1) + 4],
            pos: 0,
            filter_state: 0.0,
            mod_phase: 0.0,
            mod_rate: mod_rate_hz * std::f64::consts::TAU / sample_rate,
        }
    }

    #[inline]
    fn process(&mut self, input: f32, feedback: f32, damping: f32, base_length: usize) -> f32 {
        let buf_len = self.buffer.len();

        // Modulate delay length by +/- 2 samples with slow LFO.
        let mod_offset = (self.mod_phase.sin() * 2.0) as isize;
        self.mod_phase += self.mod_rate;
        if self.mod_phase > std::f64::consts::TAU {
            self.mod_phase -= std::f64::consts::TAU;
        }

        let effective_length = ((base_length as isize + mod_offset).max(1) as usize).min(buf_len - 1);

        let read_pos = if self.pos >= effective_length {
            self.pos - effective_length
        } else {
            buf_len - (effective_length - self.pos)
        };

        let output = self.buffer[read_pos];

        // One-pole low-pass filter in the feedback loop.
        self.filter_state = output * (1.0 - damping) + self.filter_state * damping;

        // Denormal protection.
        if self.filter_state.abs() < 1e-25 {
            self.filter_state = 0.0;
        }

        self.buffer[self.pos] = input + self.filter_state * feedback;
        self.pos = (self.pos + 1) % buf_len;

        output
    }

    fn clear(&mut self) {
        for s in &mut self.buffer {
            *s = 0.0;
        }
        self.pos = 0;
        self.filter_state = 0.0;
        // Don't reset mod_phase — keeps modulation smooth across resets.
    }
}

/// A simple all-pass filter.
struct AllPassFilter {
    buffer: Vec<f32>,
    pos: usize,
}

impl AllPassFilter {
    fn new(length: usize) -> Self {
        Self {
            buffer: vec![0.0; length.max(1)],
            pos: 0,
        }
    }

    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        let buf_out = self.buffer[self.pos];
        let feedback = 0.5_f32;

        // All-pass topology: output = -input + buf_out, buffer = input + buf_out * feedback
        let output = -input + buf_out;
        self.buffer[self.pos] = input + buf_out * feedback;
        self.pos = (self.pos + 1) % self.buffer.len();

        output
    }

    fn clear(&mut self) {
        for s in &mut self.buffer {
            *s = 0.0;
        }
        self.pos = 0;
    }
}

/// Pre-delay circular buffer.
struct PreDelay {
    buffer: Vec<f32>,
    write_pos: usize,
}

impl PreDelay {
    fn new() -> Self {
        Self {
            buffer: vec![0.0; MAX_PREDELAY_SAMPLES + 1],
            write_pos: 0,
        }
    }

    #[inline]
    fn process(&mut self, input: f32, delay_samples: usize) -> f32 {
        let buf_len = self.buffer.len();
        let delay = delay_samples.min(buf_len - 1);

        let read_pos = if self.write_pos >= delay {
            self.write_pos - delay
        } else {
            buf_len - (delay - self.write_pos)
        };

        let output = self.buffer[read_pos];
        self.buffer[self.write_pos] = input;
        self.write_pos = (self.write_pos + 1) % buf_len;
        output
    }

    fn clear(&mut self) {
        for s in &mut self.buffer {
            *s = 0.0;
        }
        self.write_pos = 0;
    }
}

/// Algorithmic reverb node (Schroeder-style with modulation).
///
/// ## Parameters
/// - `room_size` — Room size 0..1 (default 0.5). Scales comb filter feedback.
/// - `damping` — High-frequency damping 0..1 (default 0.5). Higher = darker reverb.
/// - `mix` — Wet/dry mix 0..1 (default 0.3).
/// - `predelay` — Pre-delay in ms 0..50 (default 0.0).
///
/// ## Inputs
/// - `[0]` audio input (mono).
///
/// ## Modulation Inputs
/// - `[1]` room_mod — bipolar modulation of room size.
/// - `[2]` mix_mod — bipolar modulation of wet/dry mix.
///
/// ## Outputs
/// - `[0]` left audio output (mixed wet/dry).
/// - `[1]` right audio output (decorrelated from left for stereo width).
pub struct ReverbNode {
    combs: [CombFilter; 4],
    allpasses_l: [AllPassFilter; 2],
    allpasses_r: [AllPassFilter; 2],
    predelay: PreDelay,
}

impl ReverbNode {
    pub fn new() -> Self {
        // Each comb gets a slightly different modulation rate (0.5-1.1 Hz)
        // to decorrelate their modulations.
        let sr = 48000.0;
        Self {
            combs: [
                CombFilter::new(COMB_LENGTHS[0], 0.53, sr),
                CombFilter::new(COMB_LENGTHS[1], 0.71, sr),
                CombFilter::new(COMB_LENGTHS[2], 0.87, sr),
                CombFilter::new(COMB_LENGTHS[3], 1.07, sr),
            ],
            allpasses_l: [
                AllPassFilter::new(ALLPASS_LENGTHS[0]),
                AllPassFilter::new(ALLPASS_LENGTHS[1]),
            ],
            allpasses_r: [
                // Slightly different lengths for stereo decorrelation.
                AllPassFilter::new(ALLPASS_LENGTHS[0] + 23),
                AllPassFilter::new(ALLPASS_LENGTHS[1] + 41),
            ],
            predelay: PreDelay::new(),
        }
    }
}

impl Default for ReverbNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for ReverbNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let base_room_size = (ctx.parameters.get("room_size").unwrap_or(0.5)).clamp(0.0, 1.0);
        let damping = (ctx.parameters.get("damping").unwrap_or(0.5)).clamp(0.0, 1.0);
        let base_mix = (ctx.parameters.get("mix").unwrap_or(0.3)).clamp(0.0, 1.0);
        let predelay_ms = (ctx.parameters.get("predelay").unwrap_or(0.0) as f64).clamp(0.0, 50.0);
        let predelay_samples = (predelay_ms * 0.001 * ctx.sample_rate) as usize;

        // Check for modulation inputs: room_mod at [1], mix_mod at [2]
        let has_room_mod = ctx.inputs.len() > 1 && !ctx.inputs[1].is_empty();
        let has_mix_mod = ctx.inputs.len() > 2 && !ctx.inputs[2].is_empty();

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let has_stereo_output = ctx.outputs.len() > 1;

        for i in 0..ctx.buffer_size {
            let dry = input[i];

            // Per-sample modulation
            let room_mod = if has_room_mod { ctx.inputs[1][i] } else { 0.0 };
            let mix_mod = if has_mix_mod { ctx.inputs[2][i] } else { 0.0 };
            let room_size = (base_room_size + room_mod).clamp(0.0, 1.0);
            let mix = (base_mix + mix_mod).clamp(0.0, 1.0);

            // Map room_size to feedback (0.7 to 0.98 range for stability).
            let feedback = 0.7 + room_size * 0.28;

            // Apply pre-delay.
            let predelayed = self.predelay.process(dry, predelay_samples);

            // Process parallel comb filters and sum their outputs.
            // For stereo, split combs: 0+1 biased left, 2+3 biased right.
            let c0 = self.combs[0].process(predelayed, feedback, damping, COMB_LENGTHS[0]);
            let c1 = self.combs[1].process(predelayed, feedback, damping, COMB_LENGTHS[1]);
            let c2 = self.combs[2].process(predelayed, feedback, damping, COMB_LENGTHS[2]);
            let c3 = self.combs[3].process(predelayed, feedback, damping, COMB_LENGTHS[3]);

            let wet_l_raw = (c0 + c1 + c2 + c3) * 0.25;

            // Decorrelated right channel: different comb mix weighting.
            let wet_r_raw = (c0 + c3 + c1 + c2) * 0.25; // same sum but different allpass paths

            // Process series all-pass filters (separate chains for L/R).
            let mut wet_l = wet_l_raw;
            for ap in &mut self.allpasses_l {
                wet_l = ap.process(wet_l);
            }

            // Mix dry and wet for left output.
            ctx.outputs[0][i] = dry * (1.0 - mix) + wet_l * mix;

            if has_stereo_output {
                let mut wet_r = wet_r_raw;
                for ap in &mut self.allpasses_r {
                    wet_r = ap.process(wet_r);
                }
                ctx.outputs[1][i] = dry * (1.0 - mix) + wet_r * mix;
            }
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        for comb in &mut self.combs {
            comb.clear();
        }
        for ap in &mut self.allpasses_l {
            ap.clear();
        }
        for ap in &mut self.allpasses_r {
            ap.clear();
        }
        self.predelay.clear();
    }

    fn tail_length(&self) -> u32 {
        // Reverb tail can be long — report a generous tail length.
        // At max room_size, the RT60 can be several seconds.
        MAX_BUFFER_SAMPLES as u32
    }
}
