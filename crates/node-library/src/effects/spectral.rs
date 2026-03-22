//! Spectral processing node — frequency-domain effects.
//!
//! Applies spectral transformations via a simplified FFT-based pipeline.
//! Uses overlapping windowed blocks for artifact-free processing.
//! Supports spectral freeze, blur, and shift effects.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// FFT size for spectral processing (must be power of 2).
const FFT_SIZE: usize = 1024;
/// Hop size (overlap factor of 4).
const HOP_SIZE: usize = FFT_SIZE / 4;

/// Spectral processing node.
///
/// ## Parameters
/// - `freeze` — Freeze the spectrum (0=off, 1=on, default 0).
/// - `blur` — Spectral smearing amount (0..1, default 0).
/// - `shift` — Spectral shift in bins (−512..512, default 0).
/// - `mix` — Wet/dry mix (0..1, default 1.0).
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` spectrally processed output.
pub struct SpectralNode {
    /// Input accumulation buffer.
    input_buf: Vec<f32>,
    /// Output overlap-add buffer.
    output_buf: Vec<f32>,
    /// Position in the input buffer.
    input_pos: usize,
    /// Frozen magnitude spectrum.
    frozen_mags: Vec<f32>,
    /// Previous magnitude spectrum (for blur).
    prev_mags: Vec<f32>,
    /// Hann window.
    window: Vec<f32>,
    /// Whether freeze was active on the last block.
    was_frozen: bool,
    /// Hop counter.
    hop_count: usize,
}

impl SpectralNode {
    pub fn new() -> Self {
        // Pre-compute Hann window.
        let mut window = vec![0.0f32; FFT_SIZE];
        for i in 0..FFT_SIZE {
            let t = i as f32 / FFT_SIZE as f32;
            window[i] = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * t).cos());
        }

        Self {
            input_buf: vec![0.0; FFT_SIZE * 2],
            output_buf: vec![0.0; FFT_SIZE * 2],
            input_pos: 0,
            frozen_mags: vec![0.0; FFT_SIZE / 2 + 1],
            prev_mags: vec![0.0; FFT_SIZE / 2 + 1],
            window,
            was_frozen: false,
            hop_count: 0,
        }
    }

    /// Process one FFT block: window → analyze → transform → resynthesize.
    fn process_block(&mut self, freeze: bool, blur: f32, shift: i32) {
        let half = FFT_SIZE / 2;

        // Extract windowed block from input buffer.
        let mut real = vec![0.0f32; FFT_SIZE];
        let mut imag = vec![0.0f32; FFT_SIZE];
        let buf_len = self.input_buf.len();
        for i in 0..FFT_SIZE {
            let idx = (self.input_pos + buf_len - FFT_SIZE + i) % buf_len;
            real[i] = self.input_buf[idx] * self.window[i];
        }

        // Forward FFT (Cooley-Tukey radix-2 DIT).
        fft_in_place(&mut real, &mut imag, false);

        // Compute magnitudes and phases.
        let mut mags = vec![0.0f32; half + 1];
        let mut phases = vec![0.0f32; half + 1];
        for i in 0..=half {
            mags[i] = (real[i] * real[i] + imag[i] * imag[i]).sqrt();
            phases[i] = imag[i].atan2(real[i]);
        }

        // Apply spectral transformations.
        // 1. Freeze: lock the magnitude spectrum.
        if freeze {
            if !self.was_frozen {
                self.frozen_mags.copy_from_slice(&mags);
            }
            mags.copy_from_slice(&self.frozen_mags);
        }
        self.was_frozen = freeze;

        // 2. Blur: smooth magnitudes over time.
        if blur > 0.001 {
            for i in 0..=half {
                mags[i] = mags[i] * (1.0 - blur) + self.prev_mags[i] * blur;
            }
        }
        self.prev_mags.copy_from_slice(&mags);

        // 3. Shift: move spectral bins up or down.
        if shift != 0 {
            let mut shifted = vec![0.0f32; half + 1];
            for i in 0..=half {
                let src = i as i32 - shift;
                if src >= 0 && src <= half as i32 {
                    shifted[i] = mags[src as usize];
                }
            }
            mags.copy_from_slice(&shifted);
        }

        // Reconstruct complex spectrum from modified magnitudes and original phases.
        for i in 0..=half {
            real[i] = mags[i] * phases[i].cos();
            imag[i] = mags[i] * phases[i].sin();
        }
        // Mirror for negative frequencies.
        for i in 1..half {
            real[FFT_SIZE - i] = real[i];
            imag[FFT_SIZE - i] = -imag[i];
        }

        // Inverse FFT.
        fft_in_place(&mut real, &mut imag, true);

        // Overlap-add into output buffer.
        let out_len = self.output_buf.len();
        for i in 0..FFT_SIZE {
            let idx = (self.input_pos + out_len - FFT_SIZE + i) % out_len;
            self.output_buf[idx] += real[i] * self.window[i] * (2.0 / 3.0);
        }
    }
}

impl Default for SpectralNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for SpectralNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let freeze = ctx.parameters.get("freeze").unwrap_or(0.0) > 0.5;
        let blur = ctx.parameters.get("blur").unwrap_or(0.0).clamp(0.0, 1.0);
        let shift = ctx.parameters.get("shift").unwrap_or(0.0) as i32;
        let mix = ctx.parameters.get("mix").unwrap_or(1.0).clamp(0.0, 1.0);

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

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];
        let buf_len = self.input_buf.len();

        for i in 0..ctx.buffer_size {
            let dry = input[i];

            // Write to input buffer.
            self.input_buf[self.input_pos] = dry;

            // Read from output buffer and clear.
            let wet = self.output_buf[self.input_pos];
            self.output_buf[self.input_pos] = 0.0;

            // Advance position.
            self.input_pos = (self.input_pos + 1) % buf_len;
            self.hop_count += 1;

            // Process an FFT block every HOP_SIZE samples.
            if self.hop_count >= HOP_SIZE {
                self.hop_count = 0;
                self.process_block(freeze, blur, shift);
            }

            // Denormal protection.
            let wet_clean = if wet.abs() < 1e-30 { 0.0 } else { wet };
            output[i] = dry * (1.0 - mix) + wet_clean * mix;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.input_buf.fill(0.0);
        self.output_buf.fill(0.0);
        self.input_pos = 0;
        self.hop_count = 0;
        self.was_frozen = false;
        self.frozen_mags.fill(0.0);
        self.prev_mags.fill(0.0);
    }
}

// ---------------------------------------------------------------------------
// Minimal in-place FFT (Cooley-Tukey radix-2 DIT)
// ---------------------------------------------------------------------------

fn fft_in_place(real: &mut [f32], imag: &mut [f32], inverse: bool) {
    let n = real.len();
    debug_assert!(n.is_power_of_two());
    debug_assert_eq!(n, imag.len());

    // Bit-reversal permutation.
    let mut j = 0usize;
    for i in 0..n {
        if i < j {
            real.swap(i, j);
            imag.swap(i, j);
        }
        let mut m = n >> 1;
        while m >= 1 && j >= m {
            j -= m;
            m >>= 1;
        }
        j += m;
    }

    // Butterfly stages.
    let sign = if inverse { 1.0f32 } else { -1.0 };
    let mut len = 2;
    while len <= n {
        let half = len / 2;
        let angle_step = sign * std::f32::consts::PI / half as f32;
        for start in (0..n).step_by(len) {
            for k in 0..half {
                let angle = angle_step * k as f32;
                let wr = angle.cos();
                let wi = angle.sin();

                let a = start + k;
                let b = start + k + half;

                let tr = real[b] * wr - imag[b] * wi;
                let ti = real[b] * wi + imag[b] * wr;

                real[b] = real[a] - tr;
                imag[b] = imag[a] - ti;
                real[a] += tr;
                imag[a] += ti;
            }
        }
        len <<= 1;
    }

    // Scale for inverse FFT.
    if inverse {
        let scale = 1.0 / n as f32;
        for i in 0..n {
            real[i] *= scale;
            imag[i] *= scale;
        }
    }
}
