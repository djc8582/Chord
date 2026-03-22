//! Granular synthesis node — scatters incoming audio into tiny overlapping "grains."
//!
//! Takes audio input and breaks it into small windowed fragments (10-200ms) that can be
//! pitch-shifted, scattered in time, and overlapped at controllable density. Uses a
//! pre-allocated circular buffer (2 seconds) for zero-allocation audio-thread processing.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Maximum recording buffer duration in seconds.
const MAX_BUFFER_SECONDS: f64 = 2.0;

/// Default sample rate for initial buffer sizing.
const DEFAULT_SAMPLE_RATE: f64 = 48000.0;

/// Maximum number of simultaneously active grains.
/// Pre-allocated to avoid any heap allocation on the audio thread.
const MAX_GRAINS: usize = 64;

/// Denormal threshold — values below this are flushed to zero.
const DENORMAL_THRESHOLD: f32 = 1e-25;

/// State of a single grain.
#[derive(Clone, Copy)]
struct Grain {
    /// Whether this grain slot is currently active.
    active: bool,
    /// Read position in the circular buffer (fractional for pitch shifting).
    read_pos: f64,
    /// Playback rate (1.0 = original pitch, 2.0 = octave up, 0.5 = octave down).
    playback_rate: f64,
    /// Total length of this grain in samples.
    length_samples: usize,
    /// Current position within the grain (0..length_samples).
    position: usize,
}

impl Grain {
    /// Create an inactive (empty) grain.
    const fn inactive() -> Self {
        Self {
            active: false,
            read_pos: 0.0,
            playback_rate: 1.0,
            length_samples: 0,
            position: 0,
        }
    }
}

/// Compute a Hann window value for position `pos` within a grain of `length` samples.
/// Returns a value in [0, 1].
#[inline]
fn hann_window(pos: usize, length: usize) -> f32 {
    if length <= 1 {
        return 1.0;
    }
    let phase = pos as f64 / (length - 1) as f64;
    // Hann window: 0.5 * (1 - cos(2*pi*phase))
    (0.5 * (1.0 - (std::f64::consts::TAU * phase).cos())) as f32
}

/// Read a sample from a circular buffer with linear interpolation.
#[inline]
fn read_interpolated(buffer: &[f32], pos: f64) -> f32 {
    let buf_len = buffer.len();
    let idx0 = pos.floor() as isize;
    let frac = (pos - pos.floor()) as f32;

    let i0 = idx0.rem_euclid(buf_len as isize) as usize;
    let i1 = (i0 + 1) % buf_len;

    buffer[i0] * (1.0 - frac) + buffer[i1] * frac
}

/// Generate a pseudo-random f32 in [0, 1) from an LCG state.
#[inline]
fn lcg_next(state: &mut u32) -> f32 {
    *state = state.wrapping_mul(1664525).wrapping_add(1013904223);
    (*state >> 1) as f32 / (u32::MAX >> 1) as f32
}

/// Granular synthesis node.
///
/// ## Parameters
/// - `grain_size` — Size of each grain in seconds (default 0.05, range 0.01..0.2).
/// - `density` — Number of grains triggered per second (default 10.0, range 1.0..50.0).
/// - `pitch` — Pitch shift in semitones (default 0.0, range -24.0..24.0).
/// - `scatter` — Randomize grain read position within the buffer (default 0.0, range 0.0..1.0).
/// - `mix` — Wet/dry mix, 0 = fully dry, 1 = fully wet (default 1.0, range 0.0..1.0).
///
/// ## Inputs
/// - `[0]` audio input (recorded into circular buffer).
///
/// ## Outputs
/// - `[0]` audio output (granular synthesis result mixed with dry signal).
pub struct GranularNode {
    /// Circular buffer storing incoming audio.
    buffer: Vec<f32>,
    /// Current write position in the circular buffer.
    write_pos: usize,
    /// How many samples have been written total (saturates at buffer length).
    samples_written: usize,
    /// Pre-allocated grain pool — no allocation on the audio thread.
    grains: [Grain; MAX_GRAINS],
    /// Accumulator for grain spawning: counts down samples until next grain trigger.
    spawn_accumulator: f64,
    /// LCG random state for deterministic, allocation-free randomness.
    rng_state: u32,
    /// The sample rate the buffer was allocated for.
    allocated_sample_rate: f64,
}

impl GranularNode {
    pub fn new() -> Self {
        let buf_size = (MAX_BUFFER_SECONDS * DEFAULT_SAMPLE_RATE) as usize + 1;
        Self {
            buffer: vec![0.0; buf_size],
            write_pos: 0,
            samples_written: 0,
            grains: [Grain::inactive(); MAX_GRAINS],
            spawn_accumulator: 0.0,
            rng_state: 54321,
            allocated_sample_rate: DEFAULT_SAMPLE_RATE,
        }
    }

    /// Ensure the buffer is large enough for the given sample rate.
    fn ensure_buffer_size(&mut self, sample_rate: f64) {
        let required = (MAX_BUFFER_SECONDS * sample_rate) as usize + 1;
        if required > self.buffer.len() {
            self.buffer.resize(required, 0.0);
            self.allocated_sample_rate = sample_rate;
        }
    }

    /// Try to spawn a new grain. Finds an inactive slot and initializes it.
    fn spawn_grain(&mut self, grain_size_samples: usize, playback_rate: f64, scatter: f32) {
        let buf_len = self.buffer.len();
        let available = self.samples_written.min(buf_len);

        // Generate random value before borrowing grains mutably.
        let random_val = lcg_next(&mut self.rng_state);

        // Find an inactive grain slot.
        let slot = match self.grains.iter_mut().find(|g| !g.active) {
            Some(s) => s,
            None => return, // All slots full, skip this grain.
        };

        // Base read position: start reading from where we wrote `grain_size_samples` ago.
        let base_offset = grain_size_samples.min(available);
        let base_read_pos = if self.write_pos >= base_offset {
            self.write_pos - base_offset
        } else {
            buf_len - (base_offset - self.write_pos)
        };

        // Apply scatter: randomize the read position within the available buffer.
        let scatter_range = (available as f64 * scatter as f64) as usize;
        let scatter_offset = if scatter_range > 0 {
            (random_val * scatter_range as f32) as usize
        } else {
            0
        };
        let read_pos = if base_read_pos >= scatter_offset {
            base_read_pos - scatter_offset
        } else {
            buf_len - (scatter_offset - base_read_pos)
        };

        slot.active = true;
        slot.read_pos = read_pos as f64;
        slot.playback_rate = playback_rate;
        slot.length_samples = grain_size_samples;
        slot.position = 0;
    }
}

impl Default for GranularNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for GranularNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let grain_size = (ctx.parameters.get("grain_size").unwrap_or(0.05) as f64)
            .clamp(0.01, 0.2);
        let density = (ctx.parameters.get("density").unwrap_or(10.0) as f64)
            .clamp(1.0, 50.0);
        let pitch_semitones = (ctx.parameters.get("pitch").unwrap_or(0.0) as f64)
            .clamp(-24.0, 24.0);
        let scatter = (ctx.parameters.get("scatter").unwrap_or(0.0))
            .clamp(0.0, 1.0);
        let mix = (ctx.parameters.get("mix").unwrap_or(1.0))
            .clamp(0.0, 1.0);

        // Ensure buffers are large enough for the current sample rate.
        self.ensure_buffer_size(ctx.sample_rate);

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let sr = ctx.sample_rate;
        let buf_len = self.buffer.len();
        let has_input = !ctx.inputs.is_empty() && !ctx.inputs[0].is_empty();

        // Pitch shift via playback rate: semitones -> rate multiplier.
        let playback_rate = (2.0_f64).powf(pitch_semitones / 12.0);

        // Grain size in samples.
        let grain_size_samples = ((grain_size * sr) as usize).max(1);

        // Samples between grain triggers.
        let spawn_interval = sr / density;

        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            // 1. Record incoming audio into circular buffer.
            let dry = if has_input { ctx.inputs[0][i] } else { 0.0 };
            self.buffer[self.write_pos] = dry;
            self.write_pos = (self.write_pos + 1) % buf_len;
            self.samples_written = self.samples_written.saturating_add(1);

            // 2. Check if we should spawn a new grain.
            self.spawn_accumulator += 1.0;
            if self.spawn_accumulator >= spawn_interval {
                self.spawn_accumulator -= spawn_interval;
                // Add jitter: randomize timing slightly (up to +/- 20% of interval).
                let jitter = (lcg_next(&mut self.rng_state) - 0.5) * 0.4 * spawn_interval as f32;
                self.spawn_accumulator += jitter as f64;

                self.spawn_grain(grain_size_samples, playback_rate, scatter);
            }

            // 3. Sum all active grains.
            // Borrow buffer and grains separately to satisfy the borrow checker.
            let mut wet = 0.0f32;
            let buffer = &self.buffer;
            for grain in &mut self.grains {
                if !grain.active {
                    continue;
                }

                // Apply Hann window envelope.
                let window = hann_window(grain.position, grain.length_samples);

                // Read sample from buffer with interpolation.
                let sample = read_interpolated(buffer, grain.read_pos);

                wet += sample * window;

                // Advance grain read position by playback rate.
                grain.read_pos += grain.playback_rate;
                // Wrap read position within buffer.
                if grain.read_pos >= buf_len as f64 {
                    grain.read_pos -= buf_len as f64;
                } else if grain.read_pos < 0.0 {
                    grain.read_pos += buf_len as f64;
                }

                // Advance grain position.
                grain.position += 1;
                if grain.position >= grain.length_samples {
                    grain.active = false;
                }
            }

            // Denormal protection.
            if wet.abs() < DENORMAL_THRESHOLD {
                wet = 0.0;
            }

            // 4. Mix wet and dry.
            output[i] = dry * (1.0 - mix) + wet * mix;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        for s in &mut self.buffer {
            *s = 0.0;
        }
        self.write_pos = 0;
        self.samples_written = 0;
        for grain in &mut self.grains {
            *grain = Grain::inactive();
        }
        self.spawn_accumulator = 0.0;
        self.rng_state = 54321;
    }

    fn tail_length(&self) -> u32 {
        // Tail is the maximum grain size (0.2s) at the allocated sample rate.
        (0.2 * self.allocated_sample_rate) as u32
    }
}
