//! Pitch Shifter node — simple pitch shifting via resampling.
//!
//! Shifts pitch by reading from a circular buffer at a different rate than writing.
//! Uses linear interpolation for smooth resampling.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Buffer size for the pitch shifter (~50ms at 48kHz).
const PITCH_BUFFER_SIZE: usize = 4096;

/// Pitch Shifter node.
///
/// ## Parameters
/// - `shift` — Pitch shift in semitones (default 0.0, range -24..+24).
/// - `mix` — Wet/dry mix 0..1 (default 1.0).
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` pitch-shifted audio output.
pub struct PitchShifter {
    /// Circular buffer for input audio.
    buffer: Vec<f32>,
    /// Write position (integer, wraps around).
    write_pos: usize,
    /// Read position (floating-point for sub-sample interpolation).
    read_pos: f64,
    /// Cross-fade window position for grain overlap.
    crossfade_pos: f64,
}

impl PitchShifter {
    pub fn new() -> Self {
        Self {
            buffer: vec![0.0; PITCH_BUFFER_SIZE],
            write_pos: 0,
            read_pos: 0.0,
            crossfade_pos: 0.0,
        }
    }
}

impl Default for PitchShifter {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for PitchShifter {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let shift_semitones = ctx.parameters.get("shift").unwrap_or(0.0).clamp(-24.0, 24.0) as f64;
        let mix = ctx.parameters.get("mix").unwrap_or(1.0).clamp(0.0, 1.0);

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];
        let buf_len = self.buffer.len();

        // Pitch ratio: 2^(semitones/12).
        let ratio = (2.0_f64).powf(shift_semitones / 12.0);

        // Half buffer for grain overlap.
        let half_buf = buf_len as f64 * 0.5;

        for i in 0..ctx.buffer_size {
            let dry = input[i];

            // Write input to circular buffer.
            self.buffer[self.write_pos] = dry;

            // Read from buffer at shifted rate (grain 1).
            let idx0 = self.read_pos.floor() as usize % buf_len;
            let idx1 = (idx0 + 1) % buf_len;
            let frac = self.read_pos.fract() as f32;
            let grain1 = self.buffer[idx0] * (1.0 - frac) + self.buffer[idx1] * frac;

            // Second grain offset by half buffer for overlap-add.
            let read_pos2 = self.read_pos + half_buf;
            let idx0b = read_pos2.floor() as usize % buf_len;
            let idx1b = (idx0b + 1) % buf_len;
            let frac2 = read_pos2.fract() as f32;
            let grain2 = self.buffer[idx0b] * (1.0 - frac2) + self.buffer[idx1b] * frac2;

            // Cross-fade window (Hann-like) between two grains.
            let window = (self.crossfade_pos * std::f64::consts::PI).sin();
            let w = (window * window) as f32;
            let wet = grain1 * w + grain2 * (1.0 - w);

            output[i] = dry * (1.0 - mix) + wet * mix;

            // Advance write position.
            self.write_pos = (self.write_pos + 1) % buf_len;

            // Advance read position at the pitch-shifted rate.
            self.read_pos += ratio;
            // Keep read_pos within buffer bounds.
            while self.read_pos >= buf_len as f64 {
                self.read_pos -= buf_len as f64;
            }
            while self.read_pos < 0.0 {
                self.read_pos += buf_len as f64;
            }

            // Advance crossfade position.
            self.crossfade_pos += 1.0 / half_buf;
            if self.crossfade_pos >= 1.0 {
                self.crossfade_pos -= 1.0;
            }
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        for s in &mut self.buffer {
            *s = 0.0;
        }
        self.write_pos = 0;
        self.read_pos = 0.0;
        self.crossfade_pos = 0.0;
    }
}
