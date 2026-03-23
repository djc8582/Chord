//! Transport state — playback position, tempo, time signature.
//!
//! The transport tracks the current playback position with sample-accurate precision,
//! supporting tempo changes (both instantaneous and ramped).

/// The current state of the audio transport.
#[derive(Debug, Clone)]
pub struct TransportState {
    /// Whether playback is active.
    pub playing: bool,
    /// Current position in samples from the start.
    pub position_samples: u64,
    /// Current position in seconds.
    pub position_seconds: f64,
    /// Current tempo in beats per minute.
    pub tempo_bpm: f64,
    /// Time signature numerator (e.g., 4 in 4/4).
    pub time_sig_numerator: u32,
    /// Time signature denominator (e.g., 4 in 4/4).
    pub time_sig_denominator: u32,
    /// Current position in beats (quarter notes).
    pub position_beats: f64,
    /// Whether the transport is looping.
    pub looping: bool,
    /// Loop start position in samples.
    pub loop_start_samples: u64,
    /// Loop end position in samples.
    pub loop_end_samples: u64,
    /// Sample rate (needed for time conversions).
    sample_rate: f64,
    /// Target tempo for ramped tempo changes.
    target_tempo_bpm: f64,
    /// Tempo ramp rate in BPM per sample.
    tempo_ramp_rate: f64,
}

impl TransportState {
    /// Create a new transport state at the default settings.
    pub fn new(sample_rate: f64) -> Self {
        Self {
            playing: false,
            position_samples: 0,
            position_seconds: 0.0,
            tempo_bpm: 120.0,
            time_sig_numerator: 4,
            time_sig_denominator: 4,
            position_beats: 0.0,
            looping: false,
            loop_start_samples: 0,
            loop_end_samples: 0,
            sample_rate,
            target_tempo_bpm: 120.0,
            tempo_ramp_rate: 0.0,
        }
    }

    /// Start playback.
    pub fn play(&mut self) {
        self.playing = true;
    }

    /// Stop playback.
    pub fn stop(&mut self) {
        self.playing = false;
    }

    /// Reset to the beginning.
    pub fn reset(&mut self) {
        self.position_samples = 0;
        self.position_seconds = 0.0;
        self.position_beats = 0.0;
    }

    /// Set tempo instantaneously.
    pub fn set_tempo(&mut self, bpm: f64) {
        self.tempo_bpm = bpm;
        self.target_tempo_bpm = bpm;
        self.tempo_ramp_rate = 0.0;
    }

    /// Set a tempo ramp: smoothly transition from the current tempo to `target_bpm`
    /// over `duration_samples` samples.
    pub fn set_tempo_ramp(&mut self, target_bpm: f64, duration_samples: u64) {
        if duration_samples == 0 {
            self.set_tempo(target_bpm);
            return;
        }
        self.target_tempo_bpm = target_bpm;
        self.tempo_ramp_rate =
            (target_bpm - self.tempo_bpm) / duration_samples as f64;
    }

    /// Set the time signature.
    pub fn set_time_signature(&mut self, numerator: u32, denominator: u32) {
        self.time_sig_numerator = numerator;
        self.time_sig_denominator = denominator;
    }

    /// Set loop points.
    pub fn set_loop(&mut self, enabled: bool, start_samples: u64, end_samples: u64) {
        self.looping = enabled;
        self.loop_start_samples = start_samples;
        self.loop_end_samples = end_samples;
    }

    /// Get the current position as (bar, beat, tick).
    /// Bar is 1-based, beat is 1-based within the bar. Tick resolution is 960 PPQN.
    pub fn position_bars_beats(&self) -> (u32, u32, u32) {
        let beats_per_bar = self.time_sig_numerator as f64;
        let samples_per_beat = self.sample_rate * 60.0 / self.tempo_bpm;
        let total_beats = self.position_samples as f64 / samples_per_beat;
        let bar = (total_beats / beats_per_bar).floor() as u32 + 1;
        let beat_in_bar = (total_beats % beats_per_bar).floor() as u32 + 1;
        let tick = ((total_beats % 1.0) * 960.0) as u32; // 960 PPQN
        (bar, beat_in_bar, tick)
    }

    /// Convert a bar count (0-based) to a sample position.
    pub fn bars_to_samples(&self, bars: f64) -> u64 {
        let beats_per_bar = self.time_sig_numerator as f64;
        let samples_per_beat = self.sample_rate * 60.0 / self.tempo_bpm;
        (bars * beats_per_bar * samples_per_beat) as u64
    }

    /// Set the loop region using bar positions (1-based).
    pub fn set_loop_bars(&mut self, enabled: bool, start_bar: f64, end_bar: f64) {
        self.looping = enabled;
        self.loop_start_samples = self.bars_to_samples(start_bar - 1.0);
        self.loop_end_samples = self.bars_to_samples(end_bar - 1.0);
    }

    /// Jump to a specific bar position (1-based).
    pub fn set_position_bar(&mut self, bar: f64) {
        let target = self.bars_to_samples(bar - 1.0);
        self.seek_samples(target);
    }

    /// Seek to a position in samples.
    pub fn seek_samples(&mut self, position: u64) {
        self.position_samples = position;
        self.position_seconds = position as f64 / self.sample_rate;
        // Recompute beat position (approximate — doesn't account for tempo changes).
        self.position_beats =
            self.position_seconds * self.tempo_bpm / 60.0;
    }

    /// Advance the transport by `num_samples`. Called once per audio buffer.
    ///
    /// This updates the position and handles tempo ramping and looping.
    pub fn advance(&mut self, num_samples: usize) {
        if !self.playing {
            return;
        }

        for _ in 0..num_samples {
            // Apply tempo ramp.
            if self.tempo_ramp_rate != 0.0 {
                self.tempo_bpm += self.tempo_ramp_rate;
                // Check if we've reached the target.
                if (self.tempo_ramp_rate > 0.0 && self.tempo_bpm >= self.target_tempo_bpm)
                    || (self.tempo_ramp_rate < 0.0 && self.tempo_bpm <= self.target_tempo_bpm)
                {
                    self.tempo_bpm = self.target_tempo_bpm;
                    self.tempo_ramp_rate = 0.0;
                }
            }

            // Advance by one sample.
            self.position_samples += 1;
            self.position_seconds = self.position_samples as f64 / self.sample_rate;

            // Advance beat position based on current tempo.
            // beats_per_second = tempo_bpm / 60.0
            // beats_per_sample = beats_per_second / sample_rate
            let beats_per_sample = self.tempo_bpm / (60.0 * self.sample_rate);
            self.position_beats += beats_per_sample;

            // Handle looping.
            if self.looping
                && self.loop_end_samples > self.loop_start_samples
                && self.position_samples >= self.loop_end_samples
            {
                let loop_len = self.loop_end_samples - self.loop_start_samples;
                self.position_samples = self.loop_start_samples
                    + (self.position_samples - self.loop_end_samples) % loop_len;
                self.position_seconds = self.position_samples as f64 / self.sample_rate;
                // Recompute beat position approximately.
                self.position_beats =
                    self.position_seconds * self.tempo_bpm / 60.0;
            }
        }
    }
}

#[cfg(test)]
mod transport_tests {
    use super::*;

    #[test]
    fn test_transport_new() {
        let t = TransportState::new(48000.0);
        assert!(!t.playing);
        assert_eq!(t.position_samples, 0);
        assert_eq!(t.tempo_bpm, 120.0);
        assert_eq!(t.time_sig_numerator, 4);
        assert_eq!(t.time_sig_denominator, 4);
    }

    #[test]
    fn test_play_stop() {
        let mut t = TransportState::new(48000.0);
        t.play();
        assert!(t.playing);
        t.stop();
        assert!(!t.playing);
    }

    #[test]
    fn test_advance_position() {
        let mut t = TransportState::new(48000.0);
        t.play();
        t.advance(48000); // 1 second at 48kHz
        assert_eq!(t.position_samples, 48000);
        assert!((t.position_seconds - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_advance_beats() {
        let mut t = TransportState::new(48000.0);
        t.set_tempo(120.0); // 2 beats per second
        t.play();
        t.advance(48000); // 1 second
        // At 120 BPM, 1 second = 2 beats.
        assert!((t.position_beats - 2.0).abs() < 0.01);
    }

    #[test]
    fn test_tempo_change_instantaneous() {
        let mut t = TransportState::new(48000.0);
        t.set_tempo(60.0); // 1 beat per second
        t.play();
        t.advance(48000); // 1 second
        assert!((t.position_beats - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_tempo_ramp() {
        let mut t = TransportState::new(48000.0);
        t.set_tempo(60.0);
        t.play();
        // Ramp from 60 to 120 BPM over 48000 samples (1 second).
        t.set_tempo_ramp(120.0, 48000);
        t.advance(48000);
        assert!((t.tempo_bpm - 120.0).abs() < 0.01);
    }

    #[test]
    fn test_reset() {
        let mut t = TransportState::new(48000.0);
        t.play();
        t.advance(1000);
        t.reset();
        assert_eq!(t.position_samples, 0);
        assert_eq!(t.position_seconds, 0.0);
        assert_eq!(t.position_beats, 0.0);
    }

    #[test]
    fn test_seek() {
        let mut t = TransportState::new(48000.0);
        t.seek_samples(96000); // 2 seconds
        assert_eq!(t.position_samples, 96000);
        assert!((t.position_seconds - 2.0).abs() < 1e-10);
    }

    #[test]
    fn test_looping() {
        let mut t = TransportState::new(48000.0);
        t.set_loop(true, 0, 100);
        t.play();
        t.advance(250); // Should wrap around.
        assert!(t.position_samples < 100);
    }

    #[test]
    fn test_no_advance_when_stopped() {
        let mut t = TransportState::new(48000.0);
        // Not playing.
        t.advance(1000);
        assert_eq!(t.position_samples, 0);
    }

    #[test]
    fn test_time_signature() {
        let mut t = TransportState::new(48000.0);
        t.set_time_signature(3, 4);
        assert_eq!(t.time_sig_numerator, 3);
        assert_eq!(t.time_sig_denominator, 4);
    }
}
