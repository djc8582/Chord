//! # chord-audio-io
//!
//! Cross-platform audio I/O via CPAL for the Chord audio programming environment.
//!
//! This crate manages audio devices, creates audio streams, and calls
//! [`AudioEngine::process()`](chord_dsp_runtime::AudioEngine::process) in the
//! CPAL audio callback so compiled audio graphs actually produce sound through
//! the speakers.
//!
//! ## Architecture
//!
//! ```text
//! ┌─────────────┐     ┌─────────────┐     ┌──────────────┐
//! │  AudioHost   │────►│ AudioStream │────►│ CPAL Output  │
//! │  (devices)   │     │ (callback)  │     │  (speakers)  │
//! └─────────────┘     └──────┬──────┘     └──────────────┘
//!                            │
//!                     ┌──────┴──────┐
//!                     │ AudioEngine │
//!                     │ (dsp-runtime)│
//!                     └─────────────┘
//! ```
//!
//! ## Quick Start
//!
//! ```no_run
//! use std::sync::{Arc, Mutex};
//! use chord_audio_io::{AudioHost, StreamConfig};
//! use chord_dsp_runtime::{AudioEngine, EngineConfig};
//!
//! // 1. Create the audio host.
//! let host = AudioHost::new().expect("No audio backend");
//!
//! // 2. List devices.
//! for dev in host.list_devices().unwrap() {
//!     println!("{}: {}ch out", dev.name, dev.output_channels);
//! }
//!
//! // 3. Create the DSP engine.
//! let engine = Arc::new(Mutex::new(AudioEngine::new(EngineConfig::default())));
//!
//! // 4. Open a stream — audio starts flowing!
//! let stream = host.open_stream(StreamConfig::default(), engine).unwrap();
//! ```

mod device;
mod error;
mod host;
mod stream;

// Public API re-exports.
pub use device::AudioDevice;
pub use error::{AudioIoError, Result};
pub use host::{AudioHost, DeviceChanges, DeviceWatcher};
pub use stream::{AudioStream, LatencyInfo, StreamConfig};

#[cfg(test)]
mod integration_tests {
    use super::*;
    use chord_dsp_runtime::{AudioEngine, EngineConfig};
    use std::sync::{Arc, Mutex};

    /// End-to-end test: create host, list devices, optionally open a stream.
    /// This test is hardware-dependent: it will skip stream opening if no
    /// audio device is available (e.g., in CI).
    #[test]
    fn test_full_lifecycle() {
        let host = AudioHost::new().expect("AudioHost::new() should not fail");

        // List devices (should not panic).
        let devices = host.list_devices().unwrap_or_default();

        // If we have an output device, try opening a stream.
        if host.default_output_device_name().is_some() && !devices.is_empty() {
            let engine = Arc::new(Mutex::new(AudioEngine::new(EngineConfig {
                sample_rate: 48000.0,
                buffer_size: 256,
                ..EngineConfig::default()
            })));

            let config = StreamConfig {
                input_device: None,
                output_device: "default".to_string(),
                sample_rate: 48000,
                buffer_size: 256,
            };

            match host.open_stream(config, engine) {
                Ok(stream) => {
                    assert!(stream.is_running());
                    let latency = stream.latency();
                    assert!(latency.round_trip_ms > 0.0);
                    stream.stop();
                    assert!(!stream.is_running());
                }
                Err(_) => {
                    // Device may refuse the config — that's fine.
                }
            }
        }
    }

    /// Test that the AudioHost can be created and list devices multiple times.
    #[test]
    fn test_repeated_enumeration() {
        let host = AudioHost::new().unwrap();
        for _ in 0..5 {
            let _ = host.list_devices();
        }
    }

    /// Test DeviceWatcher poll stability.
    #[test]
    fn test_device_watcher_stability() {
        let host = AudioHost::new().unwrap();
        let mut watcher = DeviceWatcher::new(&host);

        // Multiple polls should be stable (no changes if hardware doesn't change).
        for _ in 0..3 {
            let changes = watcher.poll(&host);
            assert!(!changes.has_changes());
        }
    }

    /// Test that error types display correctly.
    #[test]
    fn test_error_display() {
        let err = AudioIoError::DeviceNotFound("My Device".to_string());
        assert!(err.to_string().contains("My Device"));

        let err = AudioIoError::UnsupportedSampleRate {
            requested: 44100,
            available: vec![48000, 96000],
        };
        assert!(err.to_string().contains("44100"));

        let err = AudioIoError::InvalidBufferSize {
            requested: 32,
            min: 64,
            max: 2048,
        };
        assert!(err.to_string().contains("32"));
        assert!(err.to_string().contains("64"));
    }

    /// Test that StreamConfig defaults are sensible.
    #[test]
    fn test_stream_config_defaults() {
        let config = StreamConfig::default();
        assert_eq!(config.output_device, "default");
        assert!(config.input_device.is_none());
        assert_eq!(config.sample_rate, 48000);
        assert!(config.buffer_size >= 64 && config.buffer_size <= 2048);
    }

    /// Test AudioDevice struct.
    #[test]
    fn test_audio_device_struct() {
        let device = AudioDevice {
            name: "Test Output".to_string(),
            input_channels: 0,
            output_channels: 2,
            sample_rates: vec![44100, 48000],
            is_default_input: false,
            is_default_output: true,
        };

        assert_eq!(device.name, "Test Output");
        assert_eq!(device.output_channels, 2);
        assert!(device.is_default_output);
        assert!(!device.is_default_input);
    }

    /// Test LatencyInfo construction.
    #[test]
    fn test_latency_info() {
        let info = LatencyInfo {
            output_latency_samples: 256,
            input_latency_samples: 0,
            round_trip_samples: 512,
            round_trip_ms: 10.67,
        };
        assert_eq!(info.output_latency_samples, 256);
        assert_eq!(info.input_latency_samples, 0);
    }
}
