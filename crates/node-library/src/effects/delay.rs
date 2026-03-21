//! Stereo delay node — circular buffer implementation with time, feedback, and wet/dry mix.
//!
//! Uses a pre-allocated circular buffer for zero-allocation processing on the audio thread.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Maximum delay time in seconds. Determines the buffer size at creation.
const MAX_DELAY_SECONDS: f64 = 2.0;

/// Default sample rate used for initial buffer sizing.
/// The buffer is resized if a different sample rate is encountered.
const DEFAULT_SAMPLE_RATE: f64 = 48000.0;

/// Stereo delay node with circular buffer.
///
/// ## Parameters
/// - `time` — Delay time in seconds (default 0.5, range 0.001..2.0).
/// - `feedback` — Feedback amount 0..1 (default 0.3).
/// - `mix` — Wet/dry mix 0..1, where 0=fully dry, 1=fully wet (default 0.5).
///
/// ## Inputs
/// - `[0]` left audio input.
/// - `[1]` right audio input (optional, copies left if absent).
///
/// ## Outputs
/// - `[0]` left audio output.
/// - `[1]` right audio output.
pub struct DelayNode {
    /// Circular buffer for left channel.
    buffer_l: Vec<f32>,
    /// Circular buffer for right channel.
    buffer_r: Vec<f32>,
    /// Current write position in the circular buffer.
    write_pos: usize,
    /// The sample rate the buffers were allocated for.
    allocated_sample_rate: f64,
}

impl DelayNode {
    pub fn new() -> Self {
        let buf_size = (MAX_DELAY_SECONDS * DEFAULT_SAMPLE_RATE) as usize + 1;
        Self {
            buffer_l: vec![0.0; buf_size],
            buffer_r: vec![0.0; buf_size],
            write_pos: 0,
            allocated_sample_rate: DEFAULT_SAMPLE_RATE,
        }
    }

    /// Ensure the buffer is large enough for the given sample rate.
    fn ensure_buffer_size(&mut self, sample_rate: f64) {
        let required = (MAX_DELAY_SECONDS * sample_rate) as usize + 1;
        if required > self.buffer_l.len() {
            self.buffer_l.resize(required, 0.0);
            self.buffer_r.resize(required, 0.0);
            self.allocated_sample_rate = sample_rate;
        }
    }
}

impl Default for DelayNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for DelayNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let delay_time = (ctx.parameters.get("time").unwrap_or(0.5) as f64)
            .clamp(0.001, MAX_DELAY_SECONDS);
        let feedback = (ctx.parameters.get("feedback").unwrap_or(0.3) as f64).clamp(0.0, 0.99);
        let mix = (ctx.parameters.get("mix").unwrap_or(0.5) as f64).clamp(0.0, 1.0);

        // Ensure buffers are large enough for the current sample rate.
        // This only reallocates if the sample rate increased significantly.
        self.ensure_buffer_size(ctx.sample_rate);

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let delay_samples = (delay_time * ctx.sample_rate) as usize;
        let buf_len = self.buffer_l.len();

        let has_left_input = !ctx.inputs.is_empty();
        let has_right_input = ctx.inputs.len() > 1;
        let has_right_output = ctx.outputs.len() > 1;

        // We need to split outputs to write to two ports simultaneously.
        // Process left and right in separate passes to avoid borrow conflicts.
        // First pass: compute into local temp storage.
        // Since we can't allocate, we process sample-by-sample.

        for i in 0..ctx.buffer_size {
            let dry_l = if has_left_input { ctx.inputs[0][i] } else { 0.0 };
            let dry_r = if has_right_input {
                ctx.inputs[1][i]
            } else {
                dry_l
            };

            // Read from delay buffer.
            let read_pos = if self.write_pos >= delay_samples {
                self.write_pos - delay_samples
            } else {
                buf_len - (delay_samples - self.write_pos)
            };

            let wet_l = self.buffer_l[read_pos];
            let wet_r = self.buffer_r[read_pos];

            // Write new samples with feedback into buffer.
            self.buffer_l[self.write_pos] = dry_l + wet_l * feedback as f32;
            self.buffer_r[self.write_pos] = dry_r + wet_r * feedback as f32;

            // Advance write position.
            self.write_pos = (self.write_pos + 1) % buf_len;

            // Mix dry and wet signals.
            let out_l = dry_l * (1.0 - mix as f32) + wet_l * mix as f32;

            ctx.outputs[0][i] = out_l;
        }

        // Second pass for right channel output (if available).
        if has_right_output {
            // We need to re-read from the buffer for right channel output.
            // Since we already advanced write_pos, compute read positions relative to
            // the current write_pos going backwards.
            let current_wp = self.write_pos;
            for i in 0..ctx.buffer_size {
                let dry_r = if has_right_input {
                    ctx.inputs[1][i]
                } else if has_left_input {
                    ctx.inputs[0][i]
                } else {
                    0.0
                };

                // The sample at index i was written at write_pos - buffer_size + i.
                let sample_wp = if current_wp >= ctx.buffer_size {
                    current_wp - ctx.buffer_size + i
                } else {
                    buf_len - (ctx.buffer_size - current_wp) + i
                };
                let read_pos = if sample_wp >= delay_samples {
                    sample_wp - delay_samples
                } else {
                    buf_len - (delay_samples - sample_wp)
                };

                // Read the wet signal that was used for this sample.
                let wet_r = self.buffer_r[read_pos];
                let out_r = dry_r * (1.0 - mix as f32) + wet_r * mix as f32;
                ctx.outputs[1][i] = out_r;
            }
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        for s in &mut self.buffer_l {
            *s = 0.0;
        }
        for s in &mut self.buffer_r {
            *s = 0.0;
        }
        self.write_pos = 0;
    }

    fn tail_length(&self) -> u32 {
        // Tail is the maximum delay time in samples.
        (MAX_DELAY_SECONDS * self.allocated_sample_rate) as u32
    }
}
