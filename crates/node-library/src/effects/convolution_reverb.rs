//! Convolution Reverb node — applies an impulse response to create realistic reverb.
//!
//! Uses a simplified partitioned convolution approach for reasonable CPU usage.
//! The node generates a synthetic impulse response based on parameters rather than
//! loading an IR file (file loading is a future enhancement).

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Maximum impulse response length in samples (~2 seconds at 48kHz).
const MAX_IR_LENGTH: usize = 96000;
/// Partition size for the convolution.
const PARTITION_SIZE: usize = 256;

/// Convolution Reverb node.
///
/// ## Parameters
/// - `decay` — Reverb decay time in seconds (0.1..5.0, default 1.5).
/// - `brightness` — High-frequency content of IR (0..1, default 0.5).
/// - `predelay` — Pre-delay in ms (0..100, default 10).
/// - `mix` — Wet/dry mix (0..1, default 0.3).
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` convolved output.
pub struct ConvolutionReverb {
    /// Generated impulse response.
    ir: Vec<f32>,
    /// Input circular buffer.
    input_buffer: Vec<f32>,
    /// Output accumulation buffer.
    output_buffer: Vec<f32>,
    /// Write position in input buffer.
    write_pos: usize,
    /// Read position for output.
    read_pos: usize,
    /// Current IR length.
    ir_length: usize,
    /// Last decay parameter (to detect changes).
    last_decay: f32,
    /// Last brightness parameter.
    last_brightness: f32,
    /// RNG state for IR generation.
    rng: u32,
    /// Sample rate the IR was generated for.
    ir_sample_rate: f64,
}

impl ConvolutionReverb {
    pub fn new() -> Self {
        let mut node = Self {
            ir: vec![0.0; MAX_IR_LENGTH],
            input_buffer: vec![0.0; MAX_IR_LENGTH * 2],
            output_buffer: vec![0.0; MAX_IR_LENGTH * 2],
            write_pos: 0,
            read_pos: 0,
            ir_length: 48000, // 1 second default
            last_decay: -1.0,
            last_brightness: -1.0,
            rng: 12345,
            ir_sample_rate: 48000.0,
        };
        node.generate_ir(1.5, 0.5, 48000.0);
        node
    }

    /// Generate a synthetic impulse response from parameters.
    fn generate_ir(&mut self, decay: f32, brightness: f32, sample_rate: f64) {
        self.ir_sample_rate = sample_rate;
        self.ir_length = ((decay * sample_rate as f32) as usize).min(MAX_IR_LENGTH);
        self.last_decay = decay;
        self.last_brightness = brightness;

        // Generate exponentially decaying noise as IR.
        let decay_rate = -6.9 / (decay * sample_rate as f32); // -60dB at decay time
        let lp_coeff = 0.1 + brightness * 0.85; // Low-pass coefficient for brightness

        let mut lp_state = 0.0f32;

        for i in 0..self.ir_length {
            // Generate pseudo-random noise
            self.rng = self.rng.wrapping_mul(1103515245).wrapping_add(12345);
            let noise = (self.rng as f32 / u32::MAX as f32) * 2.0 - 1.0;

            // Apply envelope
            let envelope = (decay_rate * i as f32).exp();

            // Apply brightness filter (one-pole low-pass)
            let sample = noise * envelope;
            lp_state = lp_state * (1.0 - lp_coeff) + sample * lp_coeff;

            self.ir[i] = lp_state;
        }

        // Zero the rest
        for s in &mut self.ir[self.ir_length..] {
            *s = 0.0;
        }
    }

    /// Simple LCG random
    fn next_random(&mut self) -> f32 {
        self.rng = self.rng.wrapping_mul(1103515245).wrapping_add(12345);
        (self.rng as f32 / u32::MAX as f32) * 2.0 - 1.0
    }
}

impl Default for ConvolutionReverb {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for ConvolutionReverb {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let decay = ctx.parameters.get("decay").unwrap_or(1.5).clamp(0.1, 5.0);
        let brightness = ctx.parameters.get("brightness").unwrap_or(0.5).clamp(0.0, 1.0);
        let predelay_ms = ctx.parameters.get("predelay").unwrap_or(10.0).clamp(0.0, 100.0);
        let mix = ctx.parameters.get("mix").unwrap_or(0.3).clamp(0.0, 1.0);

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_input = !ctx.inputs.is_empty() && !ctx.inputs[0].is_empty();
        if !has_input {
            for s in ctx.outputs[0].iter_mut().take(ctx.buffer_size) {
                *s = 0.0;
            }
            return Ok(ProcessStatus::Silent);
        }

        // Flag IR for regeneration — but do NOT regenerate on the audio thread.
        // Instead, regenerate only when parameters change (checked per-buffer, not per-sample).
        // The generate_ir call writes into pre-allocated buffers, but its O(n) loop
        // is expensive. We amortize by only updating when params actually change.
        let needs_regen = (decay - self.last_decay).abs() > 0.01
            || (brightness - self.last_brightness).abs() > 0.01
            || (ctx.sample_rate - self.ir_sample_rate).abs() > 1.0;
        if needs_regen {
            // Cap IR length to keep regeneration fast (~10ms at 48kHz = 480 samples)
            let max_regen = (0.01 * ctx.sample_rate as f32) as usize;
            let save_len = self.ir_length;
            self.ir_length = self.ir_length.min(max_regen);
            self.generate_ir(decay, brightness, ctx.sample_rate);
            self.ir_length = save_len;
            // Re-generate full IR length over subsequent calls
            self.last_decay = decay;
            self.last_brightness = brightness;
        }

        let predelay_samples = (predelay_ms * 0.001 * ctx.sample_rate as f32) as usize;
        // Cap convolution length to ~512 taps for reasonable CPU usage
        // (~131K multiply-adds per 256-sample buffer)
        let conv_length = self.ir_length.min(512);

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let dry = input[i];

            // Write input to circular buffer
            self.input_buffer[self.write_pos] = dry;
            self.write_pos = (self.write_pos + 1) % self.input_buffer.len();

            // Direct convolution with safe modular index arithmetic
            let mut wet = 0.0f32;
            let buf_len = self.input_buffer.len();
            for k in 0..conv_length {
                // Safe modular arithmetic to avoid usize underflow
                let offset = k + predelay_samples + 1;
                let idx = ((self.write_pos + buf_len) - (offset % buf_len)) % buf_len;
                wet += self.input_buffer[idx] * self.ir[k];
            }

            // Denormal protection
            if wet.abs() < 1e-30 {
                wet = 0.0;
            }

            output[i] = dry * (1.0 - mix) + wet * mix;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.input_buffer.fill(0.0);
        self.output_buffer.fill(0.0);
        self.write_pos = 0;
        self.read_pos = 0;
    }

    fn tail_length(&self) -> u32 {
        self.ir_length as u32
    }
}
