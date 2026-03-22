//! Vocoder node — classic channel vocoder effect.
//!
//! Analyzes the spectral envelope of the modulator input (voice/speech)
//! and applies it to the carrier input (synth/noise), creating the iconic
//! "talking synthesizer" effect.
//!
//! Uses a bank of band-pass filters to split both signals into frequency bands,
//! envelope-follows each modulator band, and applies those envelopes to the
//! corresponding carrier bands.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Number of frequency bands in the vocoder.
const NUM_BANDS: usize = 16;

/// A simple one-pole envelope follower.
#[derive(Clone, Copy)]
struct EnvelopeFollower {
    value: f32,
    attack_coeff: f32,
    release_coeff: f32,
}

impl EnvelopeFollower {
    fn new(attack_ms: f32, release_ms: f32, sample_rate: f32) -> Self {
        Self {
            value: 0.0,
            attack_coeff: (-1.0 / (attack_ms * 0.001 * sample_rate)).exp(),
            release_coeff: (-1.0 / (release_ms * 0.001 * sample_rate)).exp(),
        }
    }

    fn process(&mut self, input: f32) -> f32 {
        let rect = input.abs();
        let coeff = if rect > self.value {
            self.attack_coeff
        } else {
            self.release_coeff
        };
        self.value = coeff * self.value + (1.0 - coeff) * rect;
        // Denormal protection
        if self.value.abs() < 1e-30 {
            self.value = 0.0;
        }
        self.value
    }

    fn reset(&mut self) {
        self.value = 0.0;
    }
}

/// A 2nd-order band-pass filter (biquad).
#[derive(Clone, Copy)]
struct BandPassFilter {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl BandPassFilter {
    fn new(center_freq: f32, q: f32, sample_rate: f32) -> Self {
        let omega = 2.0 * std::f32::consts::PI * center_freq / sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);

        let a0 = 1.0 + alpha;
        Self {
            b0: alpha / a0,
            b1: 0.0,
            b2: -alpha / a0,
            a1: -2.0 * cos_omega / a0,
            a2: (1.0 - alpha) / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    fn process(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;

        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = output;

        // Denormal protection
        if self.y1.abs() < 1e-30 {
            self.y1 = 0.0;
        }
        if self.y2.abs() < 1e-30 {
            self.y2 = 0.0;
        }

        output
    }

    fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }
}

/// Vocoder node.
///
/// ## Parameters
/// - `bands` — Number of active bands (1..16, default 16).
/// - `attack` — Envelope attack time in ms (1..100, default 5).
/// - `release` — Envelope release time in ms (10..500, default 50).
/// - `mix` — Wet/dry mix (0..1, default 1.0).
///
/// ## Inputs
/// - `[0]` carrier input (synth/noise signal).
/// - `[1]` modulator input (voice/speech signal).
///
/// ## Outputs
/// - `[0]` vocoded output.
pub struct Vocoder {
    /// Band-pass filters for the carrier signal.
    carrier_filters: [BandPassFilter; NUM_BANDS],
    /// Band-pass filters for the modulator signal.
    modulator_filters: [BandPassFilter; NUM_BANDS],
    /// Envelope followers for each modulator band.
    envelope_followers: [EnvelopeFollower; NUM_BANDS],
    /// Whether filters have been initialized for the current sample rate.
    initialized_sr: f32,
}

impl Vocoder {
    pub fn new() -> Self {
        let sr = 48000.0f32;
        let mut vocoder = Self {
            carrier_filters: [BandPassFilter::new(100.0, 4.0, sr); NUM_BANDS],
            modulator_filters: [BandPassFilter::new(100.0, 4.0, sr); NUM_BANDS],
            envelope_followers: [EnvelopeFollower::new(5.0, 50.0, sr); NUM_BANDS],
            initialized_sr: sr,
        };
        vocoder.init_bands(sr, 5.0, 50.0);
        vocoder
    }

    /// Initialize (or reinitialize) filter bands in-place — no allocation.
    fn init_bands(&mut self, sample_rate: f32, attack_ms: f32, release_ms: f32) {
        // Logarithmically-spaced center frequencies from ~100 Hz to ~8000 Hz.
        let min_freq = 100.0f32;
        let max_freq = 8000.0f32;
        let q = 4.0; // Bandwidth control

        for i in 0..NUM_BANDS {
            let t = i as f32 / (NUM_BANDS - 1) as f32;
            let freq = min_freq * (max_freq / min_freq).powf(t);
            self.carrier_filters[i] = BandPassFilter::new(freq, q, sample_rate);
            self.modulator_filters[i] = BandPassFilter::new(freq, q, sample_rate);
            self.envelope_followers[i] = EnvelopeFollower::new(attack_ms, release_ms, sample_rate);
        }
    }
}

impl Default for Vocoder {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for Vocoder {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let bands = (ctx.parameters.get("bands").unwrap_or(16.0) as usize).clamp(1, NUM_BANDS);
        let attack = ctx.parameters.get("attack").unwrap_or(5.0).clamp(1.0, 100.0);
        let release = ctx.parameters.get("release").unwrap_or(50.0).clamp(10.0, 500.0);
        let mix = ctx.parameters.get("mix").unwrap_or(1.0).clamp(0.0, 1.0);

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_carrier = !ctx.inputs.is_empty() && !ctx.inputs[0].is_empty();
        let has_modulator = ctx.inputs.len() > 1 && !ctx.inputs[1].is_empty();

        if !has_carrier || !has_modulator {
            // Need both inputs
            for s in ctx.outputs[0].iter_mut().take(ctx.buffer_size) {
                *s = 0.0;
            }
            return Ok(ProcessStatus::Silent);
        }

        // Re-initialize filters in-place if sample rate changed — no allocation.
        let sr = ctx.sample_rate as f32;
        if (sr - self.initialized_sr).abs() > 1.0 {
            self.init_bands(sr, attack, release);
            self.initialized_sr = sr;
        }

        let carrier_in = ctx.inputs[0];
        let modulator_in = ctx.inputs[1];
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let carrier_sample = carrier_in[i];
            let modulator_sample = modulator_in[i];
            let mut sum = 0.0f32;

            for band in 0..bands {
                // Filter both carrier and modulator through the same band
                let carrier_band = self.carrier_filters[band].process(carrier_sample);
                let modulator_band = self.modulator_filters[band].process(modulator_sample);

                // Follow the modulator envelope
                let envelope = self.envelope_followers[band].process(modulator_band);

                // Apply modulator envelope to carrier band
                sum += carrier_band * envelope;
            }

            // Apply mix
            output[i] = carrier_sample * (1.0 - mix) + sum * mix;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        for f in &mut self.carrier_filters {
            f.reset();
        }
        for f in &mut self.modulator_filters {
            f.reset();
        }
        for e in &mut self.envelope_followers {
            e.reset();
        }
    }
}
