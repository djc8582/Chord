//! Simple DFT and Goertzel algorithm for frequency analysis in tests.
//!
//! These are intentionally simple implementations for use in test assertions.
//! They are not optimized for real-time use.

use std::f64::consts::TAU;

/// Compute the magnitude of a single frequency bin using the Goertzel algorithm.
///
/// This is efficient for checking whether a specific frequency is present in a signal,
/// without computing the full DFT.
///
/// Returns the magnitude (not power) at the target frequency.
pub fn goertzel_magnitude(samples: &[f32], sample_rate: f64, target_freq: f64) -> f64 {
    let n = samples.len();
    if n == 0 {
        return 0.0;
    }

    let k = (target_freq * n as f64 / sample_rate).round();
    let omega = TAU * k / n as f64;
    let coeff = 2.0 * omega.cos();

    let mut s0: f64 = 0.0;
    let mut s1: f64 = 0.0;
    let mut s2: f64;

    for &sample in samples {
        s2 = s1;
        s1 = s0;
        s0 = sample as f64 + coeff * s1 - s2;
    }

    // Compute magnitude from the final state.
    let power = s0 * s0 + s1 * s1 - coeff * s0 * s1;
    let magnitude = power.abs().sqrt();

    // Normalize by N/2 so a pure sine at amplitude 1.0 gives magnitude ~1.0.
    magnitude * 2.0 / n as f64
}

/// Compute a simple DFT and return magnitude spectrum.
///
/// Returns a Vec of magnitudes, one per frequency bin. Bin `k` corresponds to
/// frequency `k * sample_rate / N`.
///
/// This is O(N^2) and only suitable for small buffers in tests.
pub fn simple_dft_magnitudes(samples: &[f32], sample_rate: f64) -> Vec<(f64, f64)> {
    let n = samples.len();
    if n == 0 {
        return Vec::new();
    }

    let num_bins = n / 2 + 1;
    let mut result = Vec::with_capacity(num_bins);

    for k in 0..num_bins {
        let freq = k as f64 * sample_rate / n as f64;
        let mut real = 0.0f64;
        let mut imag = 0.0f64;

        for (i, &sample) in samples.iter().enumerate() {
            let angle = TAU * k as f64 * i as f64 / n as f64;
            real += sample as f64 * angle.cos();
            imag -= sample as f64 * angle.sin();
        }

        let magnitude = (real * real + imag * imag).sqrt() * 2.0 / n as f64;
        result.push((freq, magnitude));
    }

    result
}

/// Find the frequency with the highest magnitude in a DFT result.
pub fn peak_frequency(samples: &[f32], sample_rate: f64) -> Option<(f64, f64)> {
    let spectrum = simple_dft_magnitudes(samples, sample_rate);
    // Skip DC bin (index 0).
    spectrum
        .into_iter()
        .skip(1)
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
}
