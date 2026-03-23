//! Sound Analysis Engine — deep audio analysis for synthesis recreation.
//!
//! Analyzes audio buffers to extract: amplitude envelope, pitch tracking,
//! harmonic series, formants, spectral characteristics, modulation, and
//! temporal segmentation. Used by the synthesis planner to recreate sounds.

use std::f64::consts::PI;

/// Complete analysis of a sound
#[derive(Debug, Clone)]
pub struct SoundAnalysis {
    pub sample_rate: f64,
    pub duration: f64,

    // Temporal
    pub amplitude_envelope: Vec<f32>,
    pub attack_time: f64,
    pub decay_time: f64,
    pub sustain_level: f64,
    pub release_time: f64,
    pub is_percussive: bool,
    pub is_sustained: bool,

    // Spectral
    pub fundamental_freq: Option<f64>,
    pub is_pitched: bool,
    pub is_noisy: bool,
    pub noise_ratio: f64,
    pub spectral_centroid: f64,
    pub spectral_centroid_trajectory: Vec<f64>,
    pub harmonics: Vec<Harmonic>,
    pub formants: Vec<Formant>,

    // Modulation
    pub vibrato_rate: Option<f64>,
    pub vibrato_depth: Option<f64>,
    pub pitch_contour: Vec<f64>,

    // Texture
    pub inharmonicity: f64,
    pub roughness: f64,
    pub rms: f64,
    pub peak: f64,
}

#[derive(Debug, Clone)]
pub struct Harmonic {
    pub frequency: f64,
    pub amplitude: f64,
    pub harmonic_number: usize,
}

#[derive(Debug, Clone)]
pub struct Formant {
    pub center_freq: f64,
    pub bandwidth: f64,
    pub amplitude: f64,
}

impl Default for SoundAnalysis {
    fn default() -> Self {
        Self {
            sample_rate: 48000.0,
            duration: 0.0,
            amplitude_envelope: Vec::new(),
            attack_time: 0.01,
            decay_time: 0.1,
            sustain_level: 0.5,
            release_time: 0.1,
            is_percussive: false,
            is_sustained: false,
            fundamental_freq: None,
            is_pitched: false,
            is_noisy: false,
            noise_ratio: 0.0,
            spectral_centroid: 0.0,
            spectral_centroid_trajectory: Vec::new(),
            harmonics: Vec::new(),
            formants: Vec::new(),
            vibrato_rate: None,
            vibrato_depth: None,
            pitch_contour: Vec::new(),
            inharmonicity: 0.0,
            roughness: 0.0,
            rms: 0.0,
            peak: 0.0,
        }
    }
}

/// Analyze an audio buffer completely
pub fn analyze(audio: &[f32], sample_rate: f64) -> SoundAnalysis {
    if audio.is_empty() {
        return SoundAnalysis::default();
    }

    let mut a = SoundAnalysis::default();
    a.sample_rate = sample_rate;
    a.duration = audio.len() as f64 / sample_rate;

    // 1. Basic stats
    a.rms = rms(audio);
    a.peak = audio.iter().map(|s| s.abs()).fold(0.0f32, f32::max) as f64;

    // 2. Amplitude envelope (RMS in 20ms windows, 5ms hop)
    a.amplitude_envelope = extract_envelope(audio, sample_rate, 0.02, 0.005);

    // 3. ADSR detection from envelope
    let envelope = a.amplitude_envelope.clone();
    detect_adsr(&envelope, sample_rate, &mut a);

    // 4. Pitch tracking (autocorrelation method)
    a.fundamental_freq = detect_pitch(audio, sample_rate);
    a.is_pitched = a.fundamental_freq.is_some();
    a.pitch_contour = track_pitch_contour(audio, sample_rate, 0.02, 0.005);

    // 5. Spectral analysis via FFT
    let spectrum = compute_magnitude_spectrum(audio, sample_rate);
    a.spectral_centroid = compute_spectral_centroid(&spectrum, sample_rate);
    a.spectral_centroid_trajectory =
        track_spectral_centroid(audio, sample_rate, 0.02, 0.005);

    // 6. Harmonic extraction
    if let Some(f0) = a.fundamental_freq {
        a.harmonics = extract_harmonics(&spectrum, f0, sample_rate);
        a.inharmonicity = measure_inharmonicity(&a.harmonics);
    }

    // 7. Formant detection (simplified LPC approach)
    a.formants = detect_formants(&spectrum, sample_rate);

    // 8. Noise measurement
    a.noise_ratio = measure_noise_ratio(audio, &a.harmonics, sample_rate);
    a.is_noisy = a.noise_ratio > 0.3;

    // 9. Vibrato detection
    if a.pitch_contour.len() > 10 {
        let contour = a.pitch_contour.clone();
        detect_vibrato(&contour, sample_rate, &mut a);
    }

    a
}

// ─── RMS ───
fn rms(audio: &[f32]) -> f64 {
    if audio.is_empty() {
        return 0.0;
    }
    let sum: f64 = audio.iter().map(|&s| (s as f64) * (s as f64)).sum();
    (sum / audio.len() as f64).sqrt()
}

// ─── Envelope Extraction ───
fn extract_envelope(audio: &[f32], sr: f64, window_s: f64, hop_s: f64) -> Vec<f32> {
    let window = (window_s * sr) as usize;
    let hop = (hop_s * sr) as usize;
    let mut envelope = Vec::new();

    let mut pos = 0;
    while pos + window <= audio.len() {
        let chunk = &audio[pos..pos + window];
        let rms_val: f32 =
            (chunk.iter().map(|&s| s * s).sum::<f32>() / window as f32).sqrt();
        envelope.push(rms_val);
        pos += hop;
    }
    envelope
}

// ─── ADSR Detection ───
fn detect_adsr(envelope: &[f32], _sr: f64, analysis: &mut SoundAnalysis) {
    if envelope.is_empty() {
        return;
    }

    let peak_val = envelope.iter().cloned().fold(0.0f32, f32::max);
    if peak_val < 1e-6 {
        return;
    }

    // Find peak position
    let peak_idx = envelope
        .iter()
        .position(|&v| v >= peak_val * 0.99)
        .unwrap_or(0);

    // Attack = time to reach peak
    let hop_time = 0.005; // matches the hop in extract_envelope
    analysis.attack_time = (peak_idx as f64 * hop_time).max(0.001);

    // Find sustain level (average of middle 50% of the sound)
    let mid_start = envelope.len() / 4;
    let mid_end = 3 * envelope.len() / 4;
    if mid_end > mid_start {
        let mid_avg: f32 = envelope[mid_start..mid_end].iter().sum::<f32>()
            / (mid_end - mid_start) as f32;
        analysis.sustain_level = (mid_avg / peak_val) as f64;
    }

    // Decay = time from peak to sustain level
    let sustain_thresh = peak_val * analysis.sustain_level as f32;
    let decay_end = envelope[peak_idx..]
        .iter()
        .position(|&v| v <= sustain_thresh * 1.1)
        .unwrap_or(envelope.len() - peak_idx);
    analysis.decay_time = (decay_end as f64 * hop_time).max(0.001);

    // Release = time from last above-threshold to end
    let release_thresh = peak_val * 0.01;
    let last_above = envelope
        .iter()
        .rposition(|&v| v > release_thresh)
        .unwrap_or(0);
    analysis.release_time =
        ((envelope.len() - last_above) as f64 * hop_time).max(0.001);

    // Classify
    analysis.is_percussive = analysis.attack_time < 0.015 && analysis.decay_time < 0.3;
    analysis.is_sustained = analysis.sustain_level > 0.3 && analysis.duration > 0.5;
}

// ─── Pitch Detection (Autocorrelation) ───
fn detect_pitch(audio: &[f32], sr: f64) -> Option<f64> {
    // Use a chunk from the middle of the audio (avoid attack transient)
    let chunk_size = (0.05 * sr) as usize; // 50ms
    let start = audio.len() / 4;
    if start + chunk_size > audio.len() {
        return None;
    }
    let chunk = &audio[start..start + chunk_size];

    autocorrelation_pitch(chunk, sr)
}

fn autocorrelation_pitch(chunk: &[f32], sr: f64) -> Option<f64> {
    let n = chunk.len();
    let min_lag = (sr / 2000.0) as usize; // max 2000 Hz
    let max_lag = (sr / 50.0) as usize; // min 50 Hz

    if max_lag >= n {
        return None;
    }

    // Compute autocorrelation
    let mut best_lag = 0;
    let mut best_corr = 0.0f64;
    let energy: f64 = chunk.iter().map(|&s| (s as f64) * (s as f64)).sum();
    if energy < 1e-10 {
        return None;
    }

    for lag in min_lag..max_lag.min(n / 2) {
        let mut corr = 0.0f64;
        for i in 0..n - lag {
            corr += chunk[i] as f64 * chunk[i + lag] as f64;
        }
        corr /= energy;

        if corr > best_corr {
            best_corr = corr;
            best_lag = lag;
        }
    }

    // Threshold: autocorrelation must be strong enough to be a real pitch
    if best_corr > 0.5 && best_lag > 0 {
        Some(sr / best_lag as f64)
    } else {
        None
    }
}

fn track_pitch_contour(
    audio: &[f32],
    sr: f64,
    window_s: f64,
    hop_s: f64,
) -> Vec<f64> {
    let window = (window_s * sr) as usize;
    let hop = (hop_s * sr) as usize;
    let mut contour = Vec::new();

    let mut pos = 0;
    while pos + window <= audio.len() {
        let chunk = &audio[pos..pos + window];
        let pitch = autocorrelation_pitch(chunk, sr).unwrap_or(0.0);
        contour.push(pitch);
        pos += hop;
    }
    contour
}

// ─── FFT (simple radix-2 DIT) ───
fn compute_magnitude_spectrum(audio: &[f32], _sr: f64) -> Vec<f64> {
    // Use a window from the middle for steady-state analysis
    let fft_size = 2048;
    let start = if audio.len() > fft_size {
        audio.len() / 4
    } else {
        0
    };
    let end = (start + fft_size).min(audio.len());

    let mut real = vec![0.0f64; fft_size];
    let mut imag = vec![0.0f64; fft_size];

    // Apply Hann window
    for i in 0..end - start {
        let w = 0.5 * (1.0 - (2.0 * PI * i as f64 / (fft_size - 1) as f64).cos());
        real[i] = audio[start + i] as f64 * w;
    }

    // In-place FFT
    fft_radix2(&mut real, &mut imag);

    // Magnitude spectrum (first half)
    let half = fft_size / 2;
    let mut mags = vec![0.0f64; half];
    for i in 0..half {
        mags[i] = (real[i] * real[i] + imag[i] * imag[i]).sqrt();
    }
    mags
}

fn fft_radix2(real: &mut [f64], imag: &mut [f64]) {
    let n = real.len();
    if !n.is_power_of_two() || n < 2 {
        return;
    }

    // Bit-reversal permutation
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

    // Butterfly stages
    let mut len = 2;
    while len <= n {
        let half = len / 2;
        let angle_step = -PI / half as f64;
        for start in (0..n).step_by(len) {
            for k in 0..half {
                let angle = angle_step * k as f64;
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
}

// ─── Spectral Centroid ───
fn compute_spectral_centroid(spectrum: &[f64], sr: f64) -> f64 {
    let bin_width = sr / (spectrum.len() as f64 * 2.0);
    let mut weighted_sum = 0.0;
    let mut total_energy = 0.0;
    for (i, &mag) in spectrum.iter().enumerate() {
        let freq = i as f64 * bin_width;
        weighted_sum += freq * mag;
        total_energy += mag;
    }
    if total_energy > 1e-10 {
        weighted_sum / total_energy
    } else {
        0.0
    }
}

fn track_spectral_centroid(
    audio: &[f32],
    sr: f64,
    window_s: f64,
    hop_s: f64,
) -> Vec<f64> {
    let window = (window_s * sr) as usize;
    let hop = (hop_s * sr) as usize;
    let mut trajectory = Vec::new();
    let mut pos = 0;
    while pos + window <= audio.len() {
        let chunk = &audio[pos..pos + window];
        let spectrum = compute_magnitude_spectrum(chunk, sr);
        trajectory.push(compute_spectral_centroid(&spectrum, sr));
        pos += hop;
    }
    trajectory
}

// ─── Harmonic Extraction ───
fn extract_harmonics(spectrum: &[f64], f0: f64, sr: f64) -> Vec<Harmonic> {
    let bin_width = sr / (spectrum.len() as f64 * 2.0);
    let mut harmonics = Vec::new();

    let fundamental_amp = spectrum
        .get((f0 / bin_width) as usize)
        .copied()
        .unwrap_or(0.0);
    if fundamental_amp < 1e-10 {
        return harmonics;
    }

    for n in 1..=16 {
        let target_freq = f0 * n as f64;
        let target_bin = (target_freq / bin_width) as usize;
        if target_bin >= spectrum.len() {
            break;
        }

        // Search +/-3 bins around target for actual peak
        let search_start = target_bin.saturating_sub(3);
        let search_end = (target_bin + 4).min(spectrum.len());

        let mut best_bin = target_bin;
        let mut best_amp = 0.0;
        for bin in search_start..search_end {
            if spectrum[bin] > best_amp {
                best_amp = spectrum[bin];
                best_bin = bin;
            }
        }

        if best_amp > fundamental_amp * 0.01 {
            // at least 1% of fundamental
            harmonics.push(Harmonic {
                frequency: best_bin as f64 * bin_width,
                amplitude: best_amp / fundamental_amp, // relative
                harmonic_number: n,
            });
        }
    }
    harmonics
}

fn measure_inharmonicity(harmonics: &[Harmonic]) -> f64 {
    if harmonics.len() < 2 {
        return 0.0;
    }
    let f0 = harmonics.first().map(|h| h.frequency).unwrap_or(1.0);
    let mut total_deviation = 0.0;
    let mut count = 0;
    for h in harmonics.iter().skip(1) {
        let expected = f0 * h.harmonic_number as f64;
        let deviation = (h.frequency - expected).abs() / expected;
        total_deviation += deviation;
        count += 1;
    }
    if count > 0 {
        total_deviation / count as f64
    } else {
        0.0
    }
}

// ─── Formant Detection (simplified peak picking on smoothed spectrum) ───
fn detect_formants(spectrum: &[f64], sr: f64) -> Vec<Formant> {
    let bin_width = sr / (spectrum.len() as f64 * 2.0);
    let mut formants = Vec::new();

    // Smooth the spectrum (simple moving average, width ~200Hz)
    let smooth_bins = (200.0 / bin_width) as usize;
    let smoothed = smooth_spectrum(spectrum, smooth_bins.max(3));

    // Find peaks in the smoothed spectrum (formant candidates)
    let max_val = smoothed.iter().cloned().fold(0.0f64, f64::max);
    if max_val < 1e-10 {
        return formants;
    }

    for i in 2..smoothed.len() - 2 {
        let freq = i as f64 * bin_width;
        if freq < 200.0 || freq > 8000.0 {
            continue;
        } // formant range

        // Is this a local maximum?
        if smoothed[i] > smoothed[i - 1]
            && smoothed[i] > smoothed[i + 1]
            && smoothed[i] > smoothed[i - 2]
            && smoothed[i] > smoothed[i + 2]
            && smoothed[i] > max_val * 0.1
        // at least 10% of max
        {
            // Estimate bandwidth (find -3dB points)
            let thresh = smoothed[i] * 0.707;
            let mut low = i;
            while low > 0 && smoothed[low] > thresh {
                low -= 1;
            }
            let mut high = i;
            while high < smoothed.len() - 1 && smoothed[high] > thresh {
                high += 1;
            }

            formants.push(Formant {
                center_freq: freq,
                bandwidth: (high - low) as f64 * bin_width,
                amplitude: smoothed[i] / max_val,
            });

            if formants.len() >= 5 {
                break;
            } // max 5 formants
        }
    }
    formants
}

fn smooth_spectrum(spectrum: &[f64], width: usize) -> Vec<f64> {
    let half = width / 2;
    let mut smoothed = vec![0.0; spectrum.len()];
    for i in 0..spectrum.len() {
        let start = i.saturating_sub(half);
        let end = (i + half + 1).min(spectrum.len());
        let sum: f64 = spectrum[start..end].iter().sum();
        smoothed[i] = sum / (end - start) as f64;
    }
    smoothed
}

// ─── Noise Measurement ───
fn measure_noise_ratio(audio: &[f32], harmonics: &[Harmonic], sr: f64) -> f64 {
    if harmonics.is_empty() {
        return 1.0;
    } // all noise

    let spectrum = compute_magnitude_spectrum(audio, sr);
    let bin_width = sr / (spectrum.len() as f64 * 2.0);

    let mut harmonic_energy = 0.0;
    let total_energy: f64 = spectrum.iter().map(|&m| m * m).sum();
    if total_energy < 1e-10 {
        return 0.0;
    }

    // Sum energy around harmonic peaks (+/-2 bins)
    for h in harmonics {
        let bin = (h.frequency / bin_width) as usize;
        for b in bin.saturating_sub(2)..=(bin + 2).min(spectrum.len() - 1) {
            harmonic_energy += spectrum[b] * spectrum[b];
        }
    }

    let noise_energy = total_energy - harmonic_energy;
    (noise_energy / total_energy).clamp(0.0, 1.0)
}

// ─── Vibrato Detection ───
fn detect_vibrato(pitch_contour: &[f64], sr: f64, analysis: &mut SoundAnalysis) {
    // Filter out zero-pitch frames
    let pitched: Vec<f64> = pitch_contour
        .iter()
        .copied()
        .filter(|&p| p > 20.0)
        .collect();
    if pitched.len() < 20 {
        return;
    }

    let mean_pitch: f64 = pitched.iter().sum::<f64>() / pitched.len() as f64;
    let deviations: Vec<f64> = pitched.iter().map(|&p| p - mean_pitch).collect();

    // Autocorrelation of pitch deviation to find periodicity
    let hop_rate = sr / (0.005 * sr); // hop was 5ms
    let _ = hop_rate; // hop_rate = 1/0.005 = 200 frames/sec
    let frames_per_sec = 1.0 / 0.005;
    let min_lag = (frames_per_sec / 10.0) as usize; // max 10Hz vibrato
    let max_lag = (frames_per_sec / 2.0) as usize; // min 2Hz vibrato

    if max_lag >= deviations.len() / 2 {
        return;
    }

    let energy: f64 = deviations.iter().map(|&d| d * d).sum();
    if energy < 1e-6 {
        return;
    }

    let mut best_lag = 0;
    let mut best_corr = 0.0;
    for lag in min_lag..max_lag.min(deviations.len() / 2) {
        let mut corr = 0.0;
        for i in 0..deviations.len() - lag {
            corr += deviations[i] * deviations[i + lag];
        }
        corr /= energy;
        if corr > best_corr {
            best_corr = corr;
            best_lag = lag;
        }
    }

    if best_corr > 0.3 && best_lag > 0 {
        let vibrato_freq = frames_per_sec / best_lag as f64;
        if vibrato_freq > 2.0 && vibrato_freq < 12.0 {
            analysis.vibrato_rate = Some(vibrato_freq);
            // Depth: RMS of pitch deviations
            let rms_dev = (deviations.iter().map(|&d| d * d).sum::<f64>()
                / deviations.len() as f64)
                .sqrt();
            analysis.vibrato_depth = Some(rms_dev / mean_pitch * 1200.0); // cents
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generate_sine(freq: f64, sr: f64, duration: f64) -> Vec<f32> {
        let n = (sr * duration) as usize;
        (0..n)
            .map(|i| (2.0 * PI * freq * i as f64 / sr).sin() as f32)
            .collect()
    }

    fn generate_noise(sr: f64, duration: f64) -> Vec<f32> {
        let n = (sr * duration) as usize;
        let mut rng = 12345u32;
        (0..n)
            .map(|_| {
                rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
                (rng as f32 / u32::MAX as f32) * 2.0 - 1.0
            })
            .collect()
    }

    #[test]
    fn test_analyze_sine() {
        let audio = generate_sine(440.0, 48000.0, 1.0);
        let a = analyze(&audio, 48000.0);

        assert!(a.is_pitched, "440Hz sine should be detected as pitched");
        assert!(!a.is_noisy, "Pure sine should not be noisy");

        if let Some(f0) = a.fundamental_freq {
            assert!(
                (f0 - 440.0).abs() < 20.0,
                "Fundamental should be ~440Hz, got {f0}"
            );
        } else {
            panic!("Should detect fundamental frequency");
        }

        assert!(a.rms > 0.5, "Sine RMS should be ~0.707");
        assert!(a.duration > 0.9, "Duration should be ~1.0s");
    }

    #[test]
    fn test_analyze_noise() {
        let audio = generate_noise(48000.0, 1.0);
        let a = analyze(&audio, 48000.0);

        assert!(
            a.is_noisy || !a.is_pitched,
            "Noise should be detected as noisy or unpitched"
        );
        assert!(a.rms > 0.1, "Noise should have non-zero RMS");
    }

    #[test]
    fn test_analyze_percussive() {
        // Short burst of sine with fast decay
        let sr = 48000.0;
        let n = (sr * 0.5) as usize;
        let audio: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f64 / sr;
                let env = (-t * 20.0).exp() as f32; // fast decay
                (2.0 * PI * 200.0 * t).sin() as f32 * env
            })
            .collect();

        let a = analyze(&audio, sr);
        assert!(a.is_percussive, "Fast-decay sound should be percussive");
        assert!(a.attack_time < 0.02, "Attack should be very fast");
    }

    #[test]
    fn test_harmonic_extraction() {
        // Generate a signal with known harmonics (fundamental + 3rd + 5th)
        let sr = 48000.0;
        let n = (sr * 1.0) as usize;
        let f0 = 200.0;
        let audio: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f64 / sr;
                let s = (2.0 * PI * f0 * t).sin() * 1.0
                    + (2.0 * PI * f0 * 3.0 * t).sin() * 0.5
                    + (2.0 * PI * f0 * 5.0 * t).sin() * 0.25;
                s as f32 * 0.5
            })
            .collect();

        let a = analyze(&audio, sr);
        assert!(
            a.harmonics.len() >= 3,
            "Should detect at least 3 harmonics, got {}",
            a.harmonics.len()
        );
    }
}
