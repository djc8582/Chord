//! Noise generator node — white, pink, and brown noise.
//!
//! Uses a simple linear congruential generator (LCG) for deterministic, fast
//! pseudo-random number generation on the audio thread with zero allocations.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Noise color type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoiseColor {
    /// Flat spectrum — equal energy per frequency.
    White,
    /// -3dB/octave rolloff — equal energy per octave (natural sounding).
    Pink,
    /// -6dB/octave rolloff — deep, rumbling noise (Brownian / red noise).
    Brown,
}

impl NoiseColor {
    /// Parse from a float parameter: 0=white, 1=pink, 2=brown.
    fn from_param(v: f32) -> Self {
        match v as u32 {
            0 => Self::White,
            1 => Self::Pink,
            2 => Self::Brown,
            _ => Self::White,
        }
    }
}

/// Noise generator node.
///
/// ## Parameters
/// - `color` — 0=white, 1=pink, 2=brown (default 0).
/// - `amplitude` — Output amplitude (default 1.0, range 0..1).
///
/// ## Outputs
/// - `[0]` noise output.
pub struct NoiseNode {
    /// LCG state for random number generation.
    rng_state: u32,
    /// Pink noise filter state (Voss-McCartney approximation using 3 octave bands).
    pink_state: [f32; 3],
    /// Pink noise counter for octave band updates.
    pink_counter: u32,
    /// Brown noise state (integrated white noise).
    brown_state: f32,
}

impl NoiseNode {
    pub fn new() -> Self {
        Self {
            rng_state: 22222,
            pink_state: [0.0; 3],
            pink_counter: 0,
            brown_state: 0.0,
        }
    }

    /// Generate a white noise sample in [-1, 1] using LCG.
    #[inline]
    fn next_random(&mut self) -> f32 {
        // Linear congruential generator (Numerical Recipes parameters).
        self.rng_state = self.rng_state.wrapping_mul(1664525).wrapping_add(1013904223);
        // Convert to float in [-1, 1].
        (self.rng_state as i32 as f64 / i32::MAX as f64) as f32
    }
}

impl Default for NoiseNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for NoiseNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let color = NoiseColor::from_param(ctx.parameters.get("color").unwrap_or(0.0));
        let amplitude = (ctx.parameters.get("amplitude").unwrap_or(1.0)).clamp(0.0, 1.0);

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let output = &mut ctx.outputs[0];

        match color {
            NoiseColor::White => {
                for i in 0..ctx.buffer_size {
                    output[i] = self.next_random() * amplitude;
                }
            }
            NoiseColor::Pink => {
                // Voss-McCartney algorithm: update different octave bands at
                // different rates to approximate -3dB/octave rolloff.
                for i in 0..ctx.buffer_size {
                    let white = self.next_random();
                    self.pink_counter = self.pink_counter.wrapping_add(1);

                    // Update octave bands at decreasing rates.
                    if self.pink_counter.is_multiple_of(2) {
                        self.pink_state[0] = white;
                    }
                    if self.pink_counter.is_multiple_of(4) {
                        self.pink_state[1] = self.next_random();
                    }
                    if self.pink_counter.is_multiple_of(8) {
                        self.pink_state[2] = self.next_random();
                    }

                    // Sum all octave bands plus the current white noise.
                    let pink = (white + self.pink_state[0] + self.pink_state[1] + self.pink_state[2]) * 0.25;
                    output[i] = pink * amplitude;
                }
            }
            NoiseColor::Brown => {
                // Brown noise: integrate white noise with leaky integrator.
                for i in 0..ctx.buffer_size {
                    let white = self.next_random();
                    self.brown_state += white * 0.02;
                    // Clamp to prevent drift.
                    self.brown_state = self.brown_state.clamp(-1.0, 1.0);
                    // Denormal protection.
                    if self.brown_state.abs() < 1e-25 {
                        self.brown_state = 0.0;
                    }
                    output[i] = self.brown_state * amplitude;
                }
            }
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.rng_state = 22222;
        self.pink_state = [0.0; 3];
        self.pink_counter = 0;
        self.brown_state = 0.0;
    }
}
