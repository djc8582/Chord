//! Stereo delay node — circular buffer implementation with time, feedback, and wet/dry mix.
//!
//! Uses a pre-allocated circular buffer for zero-allocation processing on the audio thread.
//! Features linear interpolation for click-free delay time changes and a one-pole lowpass
//! filter in the feedback path for musically darkening repeats (tape delay character).

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Maximum delay time in seconds. Determines the buffer size at creation.
const MAX_DELAY_SECONDS: f64 = 2.0;

/// Default sample rate used for initial buffer sizing.
/// The buffer is resized if a different sample rate is encountered.
const DEFAULT_SAMPLE_RATE: f64 = 48000.0;

/// Feedback filter damping coefficient.  Higher values = more damping per repeat.
/// 0.7 keeps 70% of the previous filter state, cutting highs progressively.
const FB_FILTER_DAMP: f32 = 0.3;

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
/// ## Modulation Inputs
/// - `[2]` time_mod — bipolar modulation of delay time.
/// - `[3]` feedback_mod — bipolar modulation of feedback amount.
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
    /// One-pole lowpass filter state for left feedback path.
    fb_filter_l: f32,
    /// One-pole lowpass filter state for right feedback path.
    fb_filter_r: f32,
}

impl DelayNode {
    pub fn new() -> Self {
        let buf_size = (MAX_DELAY_SECONDS * DEFAULT_SAMPLE_RATE) as usize + 1;
        Self {
            buffer_l: vec![0.0; buf_size],
            buffer_r: vec![0.0; buf_size],
            write_pos: 0,
            allocated_sample_rate: DEFAULT_SAMPLE_RATE,
            fb_filter_l: 0.0,
            fb_filter_r: 0.0,
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

    /// Read from a circular buffer with linear interpolation at a fractional position.
    #[inline]
    fn read_interpolated(buffer: &[f32], write_pos: usize, delay_samples: f64, buf_len: usize) -> f32 {
        let delay_floor = delay_samples as usize;
        let frac = (delay_samples - delay_floor as f64) as f32;

        let pos0 = if write_pos >= delay_floor {
            write_pos - delay_floor
        } else {
            buf_len - (delay_floor - write_pos)
        };

        let pos1 = if pos0 == 0 { buf_len - 1 } else { pos0 - 1 };

        // Linear interpolation between the two adjacent samples.
        buffer[pos0] * (1.0 - frac) + buffer[pos1] * frac
    }
}

impl Default for DelayNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for DelayNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let base_delay_time = (ctx.parameters.get("time").unwrap_or(0.5) as f64)
            .clamp(0.001, MAX_DELAY_SECONDS);
        let base_feedback = (ctx.parameters.get("feedback").unwrap_or(0.3) as f64).clamp(0.0, 0.99);
        let mix = (ctx.parameters.get("mix").unwrap_or(0.5) as f64).clamp(0.0, 1.0);

        // Check for modulation inputs: time_mod at [2], feedback_mod at [3]
        // (inputs [0] and [1] are left/right audio)
        let has_time_mod = ctx.inputs.len() > 2 && !ctx.inputs[2].is_empty();
        let has_feedback_mod = ctx.inputs.len() > 3 && !ctx.inputs[3].is_empty();

        // Ensure buffers are large enough for the current sample rate.
        // This only reallocates if the sample rate increased significantly.
        self.ensure_buffer_size(ctx.sample_rate);

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let buf_len = self.buffer_l.len();

        let has_left_input = !ctx.inputs.is_empty();
        let has_right_input = ctx.inputs.len() > 1 && !ctx.inputs[1].is_empty();

        for i in 0..ctx.buffer_size {
            let dry_l = if has_left_input { ctx.inputs[0][i] } else { 0.0 };
            let dry_r = if has_right_input { ctx.inputs[1][i] } else { dry_l };

            // Per-sample modulation
            let time_mod = if has_time_mod { ctx.inputs[2][i] as f64 } else { 0.0 };
            let fb_mod = if has_feedback_mod { ctx.inputs[3][i] as f64 } else { 0.0 };
            let delay_time = (base_delay_time + time_mod * 2.0).clamp(0.001, MAX_DELAY_SECONDS);
            let feedback = (base_feedback + fb_mod).clamp(0.0, 0.99) as f32;

            let delay_samples = (delay_time * ctx.sample_rate).clamp(1.0, (buf_len - 1) as f64);

            // Read from delay buffers with linear interpolation (click-free).
            let wet_l = Self::read_interpolated(&self.buffer_l, self.write_pos, delay_samples, buf_len);
            let wet_r = Self::read_interpolated(&self.buffer_r, self.write_pos, delay_samples, buf_len);

            // Apply one-pole lowpass filter in the feedback path.
            // This darkens each repeat, simulating tape delay character.
            let fb_sample_l = wet_l * feedback;
            self.fb_filter_l = self.fb_filter_l * FB_FILTER_DAMP + fb_sample_l * (1.0 - FB_FILTER_DAMP);
            // Denormal protection
            if self.fb_filter_l.abs() < 1e-25 {
                self.fb_filter_l = 0.0;
            }

            let fb_sample_r = wet_r * feedback;
            self.fb_filter_r = self.fb_filter_r * FB_FILTER_DAMP + fb_sample_r * (1.0 - FB_FILTER_DAMP);
            if self.fb_filter_r.abs() < 1e-25 {
                self.fb_filter_r = 0.0;
            }

            // Write new samples with filtered feedback.
            self.buffer_l[self.write_pos] = dry_l + self.fb_filter_l;
            self.buffer_r[self.write_pos] = dry_r + self.fb_filter_r;

            // Advance write position.
            self.write_pos = (self.write_pos + 1) % buf_len;

            // Mix dry and wet signals.
            let mix_f = mix as f32;
            ctx.outputs[0][i] = dry_l * (1.0 - mix_f) + wet_l * mix_f;
            if ctx.outputs.len() > 1 {
                ctx.outputs[1][i] = dry_r * (1.0 - mix_f) + wet_r * mix_f;
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
        self.fb_filter_l = 0.0;
        self.fb_filter_r = 0.0;
    }

    fn tail_length(&self) -> u32 {
        // Tail is the maximum delay time in samples.
        (MAX_DELAY_SECONDS * self.allocated_sample_rate) as u32
    }
}
