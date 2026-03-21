//! Test node helpers — convenience functions to create common test nodes.
//!
//! These lightweight AudioNode implementations are designed for use in tests
//! and do not depend on the full node-library.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// A sine wave source node for testing.
///
/// Generates a sine wave at a fixed frequency. Does not read parameters;
/// frequency and amplitude are set at construction time for simplicity in tests.
pub struct SineSource {
    frequency: f64,
    amplitude: f32,
    phase: f64,
}

impl SineSource {
    /// Create a new sine source with the given frequency (Hz) and amplitude.
    pub fn new(frequency: f64, amplitude: f32) -> Self {
        Self {
            frequency,
            amplitude,
            phase: 0.0,
        }
    }
}

impl AudioNode for SineSource {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let output = &mut ctx.outputs[0];
        let phase_inc = self.frequency / ctx.sample_rate;

        for i in 0..ctx.buffer_size {
            let sample = (self.phase * std::f64::consts::TAU).sin() as f32 * self.amplitude;
            output[i] = sample;
            self.phase += phase_inc;
            self.phase -= self.phase.floor();
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.phase = 0.0;
    }
}

/// A silence source node for testing.
///
/// Outputs all zeros. Useful as a baseline or for testing downstream nodes
/// that need a silent input.
pub struct SilenceSource;

impl SilenceSource {
    pub fn new() -> Self {
        Self
    }
}

impl Default for SilenceSource {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for SilenceSource {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        for output in ctx.outputs.iter_mut() {
            for sample in output.iter_mut().take(ctx.buffer_size) {
                *sample = 0.0;
            }
        }
        Ok(ProcessStatus::Silent)
    }

    fn reset(&mut self) {}
}

/// A passthrough node for testing.
///
/// Copies input[0] to output[0] without modification. If there is no input,
/// outputs silence.
pub struct Passthrough;

impl Passthrough {
    pub fn new() -> Self {
        Self
    }
}

impl Default for Passthrough {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for Passthrough {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let output = &mut ctx.outputs[0];

        if ctx.inputs.is_empty() || ctx.inputs[0].is_empty() {
            for sample in output.iter_mut().take(ctx.buffer_size) {
                *sample = 0.0;
            }
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        output[..ctx.buffer_size].copy_from_slice(&input[..ctx.buffer_size]);

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {}
}

/// A null output node for testing.
///
/// Reads input but produces no meaningful output. Useful as a terminal node
/// in test graphs where output is captured elsewhere.
pub struct NullOutput;

impl NullOutput {
    pub fn new() -> Self {
        Self
    }
}

impl Default for NullOutput {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for NullOutput {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        // Clear outputs if any exist.
        for output in ctx.outputs.iter_mut() {
            for sample in output.iter_mut().take(ctx.buffer_size) {
                *sample = 0.0;
            }
        }
        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {}
}

/// A constant DC source for testing.
///
/// Outputs a constant value on every sample. Useful for testing DC offset detection.
pub struct DcSource {
    value: f32,
}

impl DcSource {
    /// Create a new DC source with the given constant output value.
    pub fn new(value: f32) -> Self {
        Self { value }
    }
}

impl AudioNode for DcSource {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let output = &mut ctx.outputs[0];
        for sample in output.iter_mut().take(ctx.buffer_size) {
            *sample = self.value;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {}
}

/// Generate a sine wave buffer directly (not using an AudioNode).
///
/// Returns an `AudioBuffer` with `num_channels` channels, each containing
/// `buffer_size` samples of a sine wave at the given frequency and amplitude.
pub fn generate_sine_buffer(
    frequency: f64,
    amplitude: f32,
    sample_rate: f64,
    num_channels: usize,
    buffer_size: usize,
) -> chord_dsp_runtime::AudioBuffer {
    let mut buffer = chord_dsp_runtime::AudioBuffer::new(num_channels, buffer_size);
    let phase_inc = frequency / sample_rate;

    for ch in 0..num_channels {
        let channel = buffer.channel_mut(ch);
        for (i, sample) in channel.iter_mut().enumerate().take(buffer_size) {
            let phase = i as f64 * phase_inc;
            *sample = (phase * std::f64::consts::TAU).sin() as f32 * amplitude;
        }
    }

    buffer
}

/// Generate a silent buffer.
///
/// Returns an `AudioBuffer` filled with zeros.
pub fn generate_silent_buffer(
    num_channels: usize,
    buffer_size: usize,
) -> chord_dsp_runtime::AudioBuffer {
    chord_dsp_runtime::AudioBuffer::new(num_channels, buffer_size)
}
