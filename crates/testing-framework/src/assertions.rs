//! Audio assertions for testing.
//!
//! Each assertion panics with a descriptive message on failure, suitable for use
//! in `#[test]` functions.

use chord_dsp_runtime::AudioBuffer;

use crate::dft::goertzel_magnitude;

/// Default threshold for "near zero" comparisons.
const SILENCE_THRESHOLD: f32 = 1e-6;

/// Assert that all samples in the buffer are near zero (silent).
///
/// Panics if any sample has absolute value greater than `SILENCE_THRESHOLD`.
pub fn assert_silent(buffer: &AudioBuffer) {
    for ch in 0..buffer.num_channels() {
        let samples = buffer.channel(ch);
        for (i, &s) in samples.iter().enumerate() {
            assert!(
                s.abs() <= SILENCE_THRESHOLD,
                "assert_silent failed: channel {ch}, sample {i} = {s} (threshold {SILENCE_THRESHOLD})"
            );
        }
    }
}

/// Assert that the buffer contains at least some non-zero samples.
///
/// Panics if all samples across all channels have absolute value less than `SILENCE_THRESHOLD`.
pub fn assert_not_silent(buffer: &AudioBuffer) {
    for ch in 0..buffer.num_channels() {
        let samples = buffer.channel(ch);
        for &s in samples {
            if s.abs() > SILENCE_THRESHOLD {
                return; // Found a non-silent sample.
            }
        }
    }
    panic!(
        "assert_not_silent failed: all samples are within silence threshold ({SILENCE_THRESHOLD})"
    );
}

/// Assert that the peak absolute sample value is below the given threshold.
///
/// Checks all channels.
pub fn assert_peak_below(buffer: &AudioBuffer, threshold: f32) {
    let peak = buffer_peak(buffer);
    assert!(
        peak < threshold,
        "assert_peak_below failed: peak {peak} >= threshold {threshold}"
    );
}

/// Assert that the peak absolute sample value is above the given threshold.
///
/// Checks all channels.
pub fn assert_peak_above(buffer: &AudioBuffer, threshold: f32) {
    let peak = buffer_peak(buffer);
    assert!(
        peak > threshold,
        "assert_peak_above failed: peak {peak} <= threshold {threshold}"
    );
}

/// Assert that the RMS level of the buffer is within the given range `[min, max]`.
///
/// Computes RMS across all channels combined.
pub fn assert_rms_in_range(buffer: &AudioBuffer, min: f32, max: f32) {
    let rms = buffer_rms(buffer);
    assert!(
        rms >= min && rms <= max,
        "assert_rms_in_range failed: RMS {rms} not in [{min}, {max}]"
    );
}

/// Assert that a specific frequency is present in the buffer.
///
/// Uses the Goertzel algorithm to check the magnitude at the target frequency.
/// The frequency is considered "present" if its magnitude exceeds `tolerance`.
///
/// Only analyzes channel 0. For multi-channel analysis, call with individual channel data.
pub fn assert_frequency_present(
    buffer: &AudioBuffer,
    sample_rate: f64,
    freq: f64,
    tolerance: f64,
) {
    assert!(
        buffer.num_channels() > 0 && buffer.buffer_size() > 0,
        "assert_frequency_present: buffer is empty"
    );

    let samples = buffer.channel(0);
    let magnitude = goertzel_magnitude(samples, sample_rate, freq);

    assert!(
        magnitude > tolerance,
        "assert_frequency_present failed: magnitude of {freq} Hz = {magnitude}, threshold = {tolerance}"
    );
}

/// Assert that no samples exceed +/-1.0 (no clipping).
///
/// Checks all channels.
pub fn assert_no_clipping(buffer: &AudioBuffer) {
    for ch in 0..buffer.num_channels() {
        let samples = buffer.channel(ch);
        for (i, &s) in samples.iter().enumerate() {
            assert!(
                s.abs() <= 1.0,
                "assert_no_clipping failed: channel {ch}, sample {i} = {s} (exceeds +/-1.0)"
            );
        }
    }
}

/// Assert that no samples are NaN.
///
/// Checks all channels.
pub fn assert_no_nan(buffer: &AudioBuffer) {
    for ch in 0..buffer.num_channels() {
        let samples = buffer.channel(ch);
        for (i, &s) in samples.iter().enumerate() {
            assert!(
                !s.is_nan(),
                "assert_no_nan failed: channel {ch}, sample {i} is NaN"
            );
        }
    }
}

/// Assert that the buffer has no significant DC offset.
///
/// The mean of all samples across all channels must be within `threshold` of zero.
pub fn assert_no_dc_offset(buffer: &AudioBuffer, threshold: f32) {
    let mean = buffer_mean(buffer);
    assert!(
        mean.abs() <= threshold,
        "assert_no_dc_offset failed: mean = {mean}, threshold = {threshold}"
    );
}

/// Assert that two buffers are equal within a per-sample tolerance.
///
/// Panics if the buffers have different dimensions or if any corresponding
/// samples differ by more than `tolerance`.
pub fn assert_buffers_equal(a: &AudioBuffer, b: &AudioBuffer, tolerance: f32) {
    assert_eq!(
        a.num_channels(),
        b.num_channels(),
        "assert_buffers_equal failed: channel count mismatch ({} vs {})",
        a.num_channels(),
        b.num_channels()
    );
    assert_eq!(
        a.buffer_size(),
        b.buffer_size(),
        "assert_buffers_equal failed: buffer size mismatch ({} vs {})",
        a.buffer_size(),
        b.buffer_size()
    );

    for ch in 0..a.num_channels() {
        let sa = a.channel(ch);
        let sb = b.channel(ch);
        for (i, (&va, &vb)) in sa.iter().zip(sb.iter()).enumerate() {
            let diff = (va - vb).abs();
            assert!(
                diff <= tolerance,
                "assert_buffers_equal failed: channel {ch}, sample {i}: {va} vs {vb} (diff {diff} > tolerance {tolerance})"
            );
        }
    }
}

// ---- Helper functions ----

/// Compute the peak absolute sample value across all channels.
fn buffer_peak(buffer: &AudioBuffer) -> f32 {
    let mut peak: f32 = 0.0;
    for ch in 0..buffer.num_channels() {
        for &s in buffer.channel(ch) {
            let abs = s.abs();
            if abs > peak {
                peak = abs;
            }
        }
    }
    peak
}

/// Compute the RMS level across all channels combined.
fn buffer_rms(buffer: &AudioBuffer) -> f32 {
    let mut sum_sq: f64 = 0.0;
    let mut count: u64 = 0;
    for ch in 0..buffer.num_channels() {
        for &s in buffer.channel(ch) {
            sum_sq += (s as f64) * (s as f64);
            count += 1;
        }
    }
    if count == 0 {
        return 0.0;
    }
    (sum_sq / count as f64).sqrt() as f32
}

/// Compute the mean sample value across all channels.
fn buffer_mean(buffer: &AudioBuffer) -> f32 {
    let mut sum: f64 = 0.0;
    let mut count: u64 = 0;
    for ch in 0..buffer.num_channels() {
        for &s in buffer.channel(ch) {
            sum += s as f64;
            count += 1;
        }
    }
    if count == 0 {
        return 0.0;
    }
    (sum / count as f64) as f32
}
