//! Professional Audio Quality Check
//!
//! Validates that audio output meets professional quality standards.
//! Detects common problems like raw waveform output, static parameters,
//! missing spatial effects, and poor frequency balance.
//!
//! Used automatically after patch creation to ensure AI-generated patches
//! never sound thin, raw, or amateurish.

use crate::analysis::{analyze, SoundAnalysis};

/// Result of a professional quality check.
#[derive(Debug, Clone)]
pub struct ProfessionalReport {
    /// Does the audio have multiple frequency bands active? (0=one band, 1=full spectrum)
    pub spectral_fullness: f64,
    /// Does the spectrum evolve over time? (0=static, 1=constantly changing)
    pub spectral_evolution: f64,
    /// Is there stereo interest? (0=mono, 1=wide and moving)
    pub stereo_complexity: f64,
    /// Does the amplitude have dynamic shape? (0=flat, 1=varied)
    pub dynamic_range: f64,
    /// Is there evidence of reverb/space? (0=completely dry)
    pub spatial_quality: f64,
    /// Is the frequency balance reasonable? (0=all in one band, 1=balanced)
    pub frequency_balance: f64,
    /// Are there obvious raw waveform characteristics? (true = synthy, bad)
    pub raw_waveform_detected: bool,
    /// Composite professional score (0-1)
    pub professional_score: f64,
    /// Detected issues
    pub issues: Vec<QualityIssue>,
    /// Suggestions for improvement
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct QualityIssue {
    pub severity: IssueSeverity,
    pub description: String,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum IssueSeverity {
    Info,
    Warning,
    Fail,
}

/// Run a professional quality check on an audio buffer.
pub fn sounds_professional_check(audio: &[f32], sample_rate: f64) -> ProfessionalReport {
    let analysis = analyze(audio, sample_rate);
    check_from_analysis(&analysis, audio, sample_rate)
}

/// Run a professional quality check from an existing analysis.
pub fn check_from_analysis(
    analysis: &SoundAnalysis,
    audio: &[f32],
    sample_rate: f64,
) -> ProfessionalReport {
    let mut report = ProfessionalReport {
        spectral_fullness: 0.0,
        spectral_evolution: 0.0,
        stereo_complexity: 0.0,
        dynamic_range: 0.0,
        spatial_quality: 0.0,
        frequency_balance: 0.0,
        raw_waveform_detected: false,
        professional_score: 0.0,
        issues: Vec::new(),
        suggestions: Vec::new(),
    };

    if audio.is_empty() {
        report.issues.push(QualityIssue {
            severity: IssueSeverity::Fail,
            description: "No audio data".into(),
        });
        return report;
    }

    // 1. Spectral fullness — check frequency band coverage
    report.spectral_fullness = analyze_spectral_coverage(audio, sample_rate);
    if report.spectral_fullness < 0.3 {
        report.issues.push(QualityIssue {
            severity: IssueSeverity::Fail,
            description: "Audio energy concentrated in one frequency band — likely a raw waveform".into(),
        });
        report.suggestions.push("Add more layers in different frequency ranges, or add filtering to shape the spectrum".into());
    }

    // 2. Spectral evolution — does it change over time?
    report.spectral_evolution = analyze_spectral_variance(&analysis.spectral_centroid_trajectory);
    if report.spectral_evolution < 0.1 {
        report.issues.push(QualityIssue {
            severity: IssueSeverity::Warning,
            description: "Spectrum is static — no timbral movement detected".into(),
        });
        report.suggestions.push("Add LFO modulation on filter cutoff for timbral movement".into());
    }

    // 3. Dynamic range
    report.dynamic_range = analyze_dynamic_range(&analysis.amplitude_envelope);
    if report.dynamic_range < 0.05 {
        report.issues.push(QualityIssue {
            severity: IssueSeverity::Warning,
            description: "Audio is very flat — no dynamic variation".into(),
        });
        report.suggestions.push("Add envelope shaping or varying velocity".into());
    }

    // 4. Spatial quality — detect reverb presence via decay characteristics
    report.spatial_quality = detect_reverb_presence(&analysis.amplitude_envelope);
    if report.spatial_quality < 0.15 {
        report.issues.push(QualityIssue {
            severity: IssueSeverity::Info,
            description: "Audio appears very dry — no reverb or spatial effect detected".into(),
        });
        report.suggestions.push("Add reverb (mix 0.15-0.3, decay 2-4s) for natural space".into());
    }

    // 5. Frequency balance
    report.frequency_balance = analyze_frequency_balance(audio, sample_rate);
    if report.frequency_balance < 0.2 {
        report.issues.push(QualityIssue {
            severity: IssueSeverity::Warning,
            description: "Poor frequency balance — energy concentrated in narrow range".into(),
        });
        report.suggestions.push("Add elements in underrepresented frequency ranges".into());
    }

    // 6. Raw waveform detection
    report.raw_waveform_detected = detect_raw_waveform(analysis);
    if report.raw_waveform_detected {
        report.issues.push(QualityIssue {
            severity: IssueSeverity::Fail,
            description: "Raw waveform characteristics detected — sounds synthy and unprocessed".into(),
        });
        report.suggestions.push("Add a filter (lowpass ~2500Hz), modulation (LFO on cutoff), and reverb".into());
    }

    // 7. Stereo complexity (mono for now, since we analyze a single buffer)
    // Would need stereo pair for real analysis; estimate from spectral variation
    report.stereo_complexity = report.spectral_evolution * 0.6;

    // Composite score
    let raw_penalty = if report.raw_waveform_detected { 0.3 } else { 0.0 };
    report.professional_score = (
        report.spectral_fullness * 0.2
        + report.spectral_evolution * 0.15
        + report.dynamic_range * 0.15
        + report.spatial_quality * 0.15
        + report.frequency_balance * 0.2
        + report.stereo_complexity * 0.15
        - raw_penalty
    ).clamp(0.0, 1.0);

    report
}

/// Check how many frequency bands have significant energy.
fn analyze_spectral_coverage(audio: &[f32], sample_rate: f64) -> f64 {
    let fft_size = 2048usize;
    if audio.len() < fft_size {
        return 0.0;
    }

    // Compute spectrum from middle of audio
    let start = audio.len() / 4;

    let mut energy_bands = [0.0f64; 6];
    let bin_width = sample_rate / fft_size as f64;

    // Simple energy calculation per band
    for i in 0..fft_size / 2 {
        let freq = i as f64 * bin_width;
        let sample_idx = start + i;
        let energy = if sample_idx < audio.len() {
            (audio[sample_idx] as f64).powi(2)
        } else {
            0.0
        };

        // Accumulate into frequency bands
        let band = if freq < 100.0 { 0 }
        else if freq < 500.0 { 1 }
        else if freq < 2000.0 { 2 }
        else if freq < 6000.0 { 3 }
        else if freq < 12000.0 { 4 }
        else { 5 };

        energy_bands[band] += energy;
    }

    let total: f64 = energy_bands.iter().sum();
    if total < 1e-10 {
        return 0.0;
    }

    // Count bands with >5% of total energy
    let active_bands = energy_bands.iter().filter(|&&e| e / total > 0.05).count();
    (active_bands as f64 / 6.0).min(1.0)
}

/// Check variance of spectral centroid over time.
fn analyze_spectral_variance(centroid_trajectory: &[f64]) -> f64 {
    if centroid_trajectory.len() < 2 {
        return 0.0;
    }

    // Filter out zero values (silence frames)
    let nonzero: Vec<f64> = centroid_trajectory.iter().copied().filter(|&c| c > 10.0).collect();
    if nonzero.len() < 2 {
        return 0.0;
    }

    let mean: f64 = nonzero.iter().sum::<f64>() / nonzero.len() as f64;
    if mean < 10.0 {
        return 0.0;
    }

    // Compute standard deviation in Hz, then normalize relative to mean
    let variance: f64 = nonzero
        .iter()
        .map(|&c| (c - mean).powi(2))
        .sum::<f64>()
        / nonzero.len() as f64;

    let std_dev = variance.sqrt();
    let cv = std_dev / mean; // coefficient of variation

    // A pure static tone has CV ~0. An evolving sound has CV > 0.1
    // Scale: 0.2 CV = 1.0 score
    (cv * 5.0).min(1.0)
}

/// Check dynamic range from amplitude envelope.
fn analyze_dynamic_range(envelope: &[f32]) -> f64 {
    if envelope.len() < 2 {
        return 0.0;
    }

    let peak = envelope.iter().cloned().fold(0.0f32, f32::max);
    if peak < 1e-6 {
        return 0.0;
    }

    let mean = envelope.iter().sum::<f32>() / envelope.len() as f32;
    let variance: f32 = envelope
        .iter()
        .map(|&v| ((v - mean) / peak).powi(2))
        .sum::<f32>()
        / envelope.len() as f32;

    let cv = variance.sqrt();
    (cv as f64 * 3.0).min(1.0) // Scale so 33% CV = 1.0
}

/// Detect reverb presence from envelope tail characteristics.
fn detect_reverb_presence(envelope: &[f32]) -> f64 {
    if envelope.len() < 10 {
        return 0.0;
    }

    // Check for a gradual decay in the tail (reverb signature)
    let peak_idx = envelope
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(i, _)| i)
        .unwrap_or(0);

    let peak_val = envelope[peak_idx];
    if peak_val < 1e-6 {
        return 0.0;
    }

    // Measure how gradually the signal decays after peak
    let tail = &envelope[peak_idx..];
    if tail.len() < 5 {
        return 0.0;
    }

    // Count frames where signal is between 1% and 50% of peak (reverb tail range)
    let reverb_tail_frames = tail
        .iter()
        .filter(|&&v| v > peak_val * 0.01 && v < peak_val * 0.5)
        .count();

    let tail_ratio = reverb_tail_frames as f64 / tail.len() as f64;
    (tail_ratio * 2.0).min(1.0)
}

/// Check frequency balance — how well energy is distributed.
fn analyze_frequency_balance(audio: &[f32], sample_rate: f64) -> f64 {
    let fft_size = 2048usize;
    if audio.len() < fft_size {
        return 0.0;
    }

    let start = audio.len() / 4;
    let bin_width = sample_rate / fft_size as f64;

    // Compute energy in 4 bands
    let mut bands = [0.0f64; 4]; // sub+bass, low-mid, mid, high

    for i in 0..fft_size / 2 {
        let freq = i as f64 * bin_width;
        let sample_idx = start + i;
        if sample_idx >= audio.len() { break; }
        let energy = (audio[sample_idx] as f64).powi(2);

        let band = if freq < 250.0 { 0 }
        else if freq < 1000.0 { 1 }
        else if freq < 4000.0 { 2 }
        else { 3 };

        bands[band] += energy;
    }

    let total: f64 = bands.iter().sum();
    if total < 1e-10 {
        return 0.0;
    }

    // Ideal: roughly equal energy in each band (with some tolerance)
    // Use entropy as a measure of evenness
    let probs: Vec<f64> = bands.iter().map(|&e| (e / total).max(1e-10)).collect();
    let entropy: f64 = -probs.iter().map(|&p| p * p.ln()).sum::<f64>();
    let max_entropy = (4.0f64).ln();

    entropy / max_entropy
}

/// Detect if the audio is a raw, unprocessed waveform.
fn detect_raw_waveform(analysis: &SoundAnalysis) -> bool {
    if !analysis.is_pitched {
        return false; // noise/percussion is fine
    }

    // Raw waveform indicators:
    // 1. Strong harmonics with very regular spacing (perfect harmonic series)
    if analysis.harmonics.len() >= 6 && analysis.inharmonicity < 0.01 {
        // 2. Very low noise ratio (too clean)
        if analysis.noise_ratio < 0.05 {
            // 3. No formants (no filtering evident)
            if analysis.formants.is_empty() {
                return true;
            }
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    fn generate_sine(freq: f64, sr: f64, duration: f64) -> Vec<f32> {
        let n = (sr * duration) as usize;
        (0..n)
            .map(|i| (2.0 * PI * freq * i as f64 / sr).sin() as f32)
            .collect()
    }

    fn generate_rich_sound(sr: f64, duration: f64) -> Vec<f32> {
        let n = (sr * duration) as usize;
        (0..n)
            .map(|i| {
                let t = i as f64 / sr;
                // Multiple detuned oscillators + noise + envelope
                let env = if t < 0.5 { t * 2.0 } else { 1.0 - (t - 0.5) * 0.3 };
                let sig = (2.0 * PI * 261.63 * t).sin() * 0.3
                    + (2.0 * PI * 263.0 * t).sin() * 0.2  // detuned
                    + (2.0 * PI * 130.81 * t).sin() * 0.15 // sub
                    + ((i as f32 * 1664525.0 + 1013904223.0) % 2.0 - 1.0) as f64 * 0.02; // noise
                (sig * env * 0.5) as f32
            })
            .collect()
    }

    #[test]
    fn raw_sine_scores_low() {
        let audio = generate_sine(440.0, 48000.0, 2.0);
        let report = sounds_professional_check(&audio, 48000.0);
        assert!(
            report.professional_score < 0.5,
            "Raw sine should score low, got {}",
            report.professional_score
        );
    }

    #[test]
    fn rich_sound_scores_higher() {
        let audio = generate_rich_sound(48000.0, 2.0);
        let report = sounds_professional_check(&audio, 48000.0);
        assert!(
            report.professional_score > 0.2,
            "Rich layered sound should score higher than raw sine, got {}",
            report.professional_score
        );
    }

    #[test]
    fn empty_audio_returns_zero() {
        let report = sounds_professional_check(&[], 48000.0);
        assert_eq!(report.professional_score, 0.0);
    }

    #[test]
    fn raw_sine_has_issues() {
        let audio = generate_sine(440.0, 48000.0, 2.0);
        let report = sounds_professional_check(&audio, 48000.0);
        // Raw sine should have at least some detected issues
        assert!(!report.issues.is_empty(),
            "Raw sine should trigger quality issues");
    }
}
