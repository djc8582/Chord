//! Algorithmic reverb node — Schroeder-style reverb.
//!
//! Implements a classic Schroeder reverb with 4 parallel comb filters feeding into
//! 2 series all-pass filters. Room size controls the comb filter delay lengths,
//! and damping controls the low-pass filtering within the comb feedback loops.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Maximum reverb buffer size in samples (~2 seconds at 48kHz).
const MAX_BUFFER_SAMPLES: usize = 96000;

/// Comb filter delay lengths in samples (at 48kHz). These are prime-like values
/// chosen to minimize periodicity artifacts.
const COMB_LENGTHS: [usize; 4] = [1557, 1617, 1491, 1422];

/// All-pass filter delay lengths in samples (at 48kHz).
const ALLPASS_LENGTHS: [usize; 2] = [225, 556];

/// A simple comb filter with damping (low-pass in the feedback loop).
struct CombFilter {
    buffer: Vec<f32>,
    pos: usize,
    filter_state: f32,
}

impl CombFilter {
    fn new(length: usize) -> Self {
        Self {
            buffer: vec![0.0; length.max(1)],
            pos: 0,
            filter_state: 0.0,
        }
    }

    #[inline]
    fn process(&mut self, input: f32, feedback: f32, damping: f32) -> f32 {
        let output = self.buffer[self.pos];

        // One-pole low-pass filter in the feedback loop.
        self.filter_state = output * (1.0 - damping) + self.filter_state * damping;

        // Denormal protection.
        if self.filter_state.abs() < 1e-25 {
            self.filter_state = 0.0;
        }

        self.buffer[self.pos] = input + self.filter_state * feedback;
        self.pos = (self.pos + 1) % self.buffer.len();

        output
    }

    fn clear(&mut self) {
        for s in &mut self.buffer {
            *s = 0.0;
        }
        self.pos = 0;
        self.filter_state = 0.0;
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

/// Algorithmic reverb node (Schroeder-style).
///
/// ## Parameters
/// - `room_size` — Room size 0..1 (default 0.5). Scales comb filter feedback.
/// - `damping` — High-frequency damping 0..1 (default 0.5). Higher = darker reverb.
/// - `mix` — Wet/dry mix 0..1 (default 0.3).
///
/// ## Inputs
/// - `[0]` audio input (mono).
///
/// ## Outputs
/// - `[0]` audio output (mono, mixed wet/dry).
pub struct ReverbNode {
    combs: [CombFilter; 4],
    allpasses: [AllPassFilter; 2],
}

impl ReverbNode {
    pub fn new() -> Self {
        Self {
            combs: [
                CombFilter::new(COMB_LENGTHS[0]),
                CombFilter::new(COMB_LENGTHS[1]),
                CombFilter::new(COMB_LENGTHS[2]),
                CombFilter::new(COMB_LENGTHS[3]),
            ],
            allpasses: [
                AllPassFilter::new(ALLPASS_LENGTHS[0]),
                AllPassFilter::new(ALLPASS_LENGTHS[1]),
            ],
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
        let room_size = (ctx.parameters.get("room_size").unwrap_or(0.5)).clamp(0.0, 1.0);
        let damping = (ctx.parameters.get("damping").unwrap_or(0.5)).clamp(0.0, 1.0);
        let mix = (ctx.parameters.get("mix").unwrap_or(0.3)).clamp(0.0, 1.0);

        // Map room_size to feedback (0.7 to 0.98 range for stability).
        let feedback = 0.7 + room_size * 0.28;

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let dry = input[i];

            // Process parallel comb filters and sum their outputs.
            let mut wet = 0.0_f32;
            for comb in &mut self.combs {
                wet += comb.process(dry, feedback, damping);
            }
            // Scale by number of combs to normalize level.
            wet *= 0.25;

            // Process series all-pass filters.
            for ap in &mut self.allpasses {
                wet = ap.process(wet);
            }

            // Mix dry and wet.
            output[i] = dry * (1.0 - mix) + wet * mix;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        for comb in &mut self.combs {
            comb.clear();
        }
        for ap in &mut self.allpasses {
            ap.clear();
        }
    }

    fn tail_length(&self) -> u32 {
        // Reverb tail can be long — report a generous tail length.
        // At max room_size, the RT60 can be several seconds.
        MAX_BUFFER_SAMPLES as u32
    }
}
