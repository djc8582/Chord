//! Per-node signal statistics.
//!
//! [`SignalStats`] holds the computed signal metrics for a single node/port combination.
//! Matches the `BridgeCommands::getSignalStats` interface defined in the root CLAUDE.md.

use serde::{Deserialize, Serialize};

/// Per-node signal statistics computed from audio buffers.
///
/// These stats are continuously updated as audio flows through the graph,
/// providing real-time insight into the signal at each connection point.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalStats {
    /// Peak absolute sample value (0.0..inf, 1.0 = 0 dBFS).
    pub peak: f32,
    /// RMS (root mean square) level — represents average signal power.
    pub rms: f32,
    /// DC offset — the mean value of the signal. Ideally 0.0.
    pub dc_offset: f32,
    /// Crest factor — peak / RMS ratio. High values suggest transients/clicks.
    pub crest_factor: f32,
    /// Zero crossing rate — proportion of adjacent samples that cross zero.
    /// Useful for frequency estimation and noise detection.
    pub zero_crossing_rate: f32,
    /// Whether any NaN values were detected.
    pub has_nan: bool,
    /// Whether any Infinity values were detected.
    pub has_inf: bool,
    /// Number of clicks/discontinuities detected.
    pub click_count: u32,
    /// Number of samples analyzed to produce these stats.
    pub sample_count: u64,
    /// Number of clipped samples (|sample| > 1.0).
    pub clip_count: u32,
    /// Number of consecutive silent buffers (all zeros).
    pub silent_buffer_count: u32,
}

impl SignalStats {
    /// Create a new stats struct with all values zeroed.
    pub fn new() -> Self {
        Self {
            peak: 0.0,
            rms: 0.0,
            dc_offset: 0.0,
            crest_factor: 0.0,
            zero_crossing_rate: 0.0,
            has_nan: false,
            has_inf: false,
            click_count: 0,
            sample_count: 0,
            clip_count: 0,
            silent_buffer_count: 0,
        }
    }

    /// Reset all stats to their initial state.
    pub fn reset(&mut self) {
        *self = Self::new();
    }

    /// Peak level in decibels (dBFS). Returns -inf for silence.
    pub fn peak_db(&self) -> f32 {
        if self.peak <= 0.0 {
            f32::NEG_INFINITY
        } else {
            20.0 * self.peak.log10()
        }
    }

    /// RMS level in decibels (dBFS). Returns -inf for silence.
    pub fn rms_db(&self) -> f32 {
        if self.rms <= 0.0 {
            f32::NEG_INFINITY
        } else {
            20.0 * self.rms.log10()
        }
    }
}

impl Default for SignalStats {
    fn default() -> Self {
        Self::new()
    }
}

/// Accumulator for computing signal stats from streaming audio data.
///
/// This is used internally by [`SignalMonitor`](crate::SignalMonitor) to accumulate
/// statistics across multiple buffers, then produce a [`SignalStats`] snapshot.
#[derive(Debug, Clone)]
pub struct StatsAccumulator {
    /// Running peak value.
    peak: f32,
    /// Running sum of squares (for RMS).
    sum_of_squares: f64,
    /// Running sum (for DC offset / mean).
    sum: f64,
    /// Total samples accumulated.
    sample_count: u64,
    /// Zero crossings counted.
    zero_crossings: u64,
    /// NaN detected flag.
    has_nan: bool,
    /// Inf detected flag.
    has_inf: bool,
    /// Click count.
    click_count: u32,
    /// Clip count.
    clip_count: u32,
    /// Consecutive silent buffer count.
    silent_buffer_count: u32,
    /// Last sample from previous buffer (for click/zero-crossing detection across boundaries).
    last_sample: f32,
    /// Whether we have a valid last_sample.
    has_last_sample: bool,
}

impl StatsAccumulator {
    /// Create a new empty accumulator.
    pub fn new() -> Self {
        Self {
            peak: 0.0,
            sum_of_squares: 0.0,
            sum: 0.0,
            sample_count: 0,
            zero_crossings: 0,
            has_nan: false,
            has_inf: false,
            click_count: 0,
            clip_count: 0,
            silent_buffer_count: 0,
            last_sample: 0.0,
            has_last_sample: false,
        }
    }

    /// The threshold for detecting a click (sudden discontinuity).
    /// A sample-to-sample delta larger than this is considered a click.
    const CLICK_THRESHOLD: f32 = 0.5;

    /// Process a buffer of samples, updating all accumulated statistics.
    ///
    /// This is designed to be called once per buffer on the audio thread.
    /// It does a single pass through the buffer to minimize CPU overhead.
    pub fn process_buffer(&mut self, samples: &[f32]) {
        if samples.is_empty() {
            return;
        }

        let mut local_peak = self.peak;
        let mut local_sum_sq = 0.0f64;
        let mut local_sum = 0.0f64;
        let mut local_zero_crossings = 0u64;
        let mut local_click_count = 0u32;
        let mut local_clip_count = 0u32;
        let mut all_silent = true;

        let mut prev = if self.has_last_sample {
            self.last_sample
        } else {
            samples[0]
        };

        let start_idx = if self.has_last_sample { 0 } else { 1 };

        // Process first sample separately if we don't have a previous sample.
        if !self.has_last_sample && !samples.is_empty() {
            let s = samples[0];
            if s.is_nan() {
                self.has_nan = true;
            } else if s.is_infinite() {
                self.has_inf = true;
            } else {
                let abs = s.abs();
                if abs > local_peak {
                    local_peak = abs;
                }
                if abs > 1.0 {
                    local_clip_count += 1;
                }
                if abs > 1e-10 {
                    all_silent = false;
                }
                local_sum_sq += (s as f64) * (s as f64);
                local_sum += s as f64;
            }
        }

        // Single-pass analysis of remaining samples.
        for &s in &samples[start_idx..] {
            // NaN/Inf detection.
            if s.is_nan() {
                self.has_nan = true;
                prev = s;
                continue;
            }
            if s.is_infinite() {
                self.has_inf = true;
                prev = s;
                continue;
            }

            let abs = s.abs();

            // Peak tracking.
            if abs > local_peak {
                local_peak = abs;
            }

            // Clipping detection.
            if abs > 1.0 {
                local_clip_count += 1;
            }

            // Silence detection.
            if abs > 1e-10 {
                all_silent = false;
            }

            // Accumulate for RMS and DC offset.
            local_sum_sq += (s as f64) * (s as f64);
            local_sum += s as f64;

            // Zero crossing detection.
            if prev.is_finite() && ((prev > 0.0 && s <= 0.0) || (prev <= 0.0 && s > 0.0)) {
                local_zero_crossings += 1;
            }

            // Click detection (large sample-to-sample delta).
            if prev.is_finite() {
                let delta = (s - prev).abs();
                if delta > Self::CLICK_THRESHOLD {
                    local_click_count += 1;
                }
            }

            prev = s;
        }

        // Update accumulated state.
        self.peak = local_peak;
        self.sum_of_squares += local_sum_sq;
        self.sum += local_sum;
        self.sample_count += samples.len() as u64;
        self.zero_crossings += local_zero_crossings;
        self.click_count += local_click_count;
        self.clip_count += local_clip_count;
        self.last_sample = prev;
        self.has_last_sample = true;

        if all_silent {
            self.silent_buffer_count += 1;
        } else {
            self.silent_buffer_count = 0;
        }
    }

    /// Compute a [`SignalStats`] snapshot from the accumulated data.
    pub fn snapshot(&self) -> SignalStats {
        let sample_count = self.sample_count;
        let rms = if sample_count > 0 {
            (self.sum_of_squares / sample_count as f64).sqrt() as f32
        } else {
            0.0
        };
        let dc_offset = if sample_count > 0 {
            (self.sum / sample_count as f64) as f32
        } else {
            0.0
        };
        let crest_factor = if rms > 1e-10 {
            self.peak / rms
        } else {
            0.0
        };
        let zero_crossing_rate = if sample_count > 1 {
            self.zero_crossings as f32 / (sample_count - 1) as f32
        } else {
            0.0
        };

        SignalStats {
            peak: self.peak,
            rms,
            dc_offset,
            crest_factor,
            zero_crossing_rate,
            has_nan: self.has_nan,
            has_inf: self.has_inf,
            click_count: self.click_count,
            sample_count,
            clip_count: self.clip_count,
            silent_buffer_count: self.silent_buffer_count,
        }
    }

    /// Reset the accumulator to start fresh.
    pub fn reset(&mut self) {
        *self = Self::new();
    }
}

impl Default for StatsAccumulator {
    fn default() -> Self {
        Self::new()
    }
}
