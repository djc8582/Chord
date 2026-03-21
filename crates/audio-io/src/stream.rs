//! Audio stream management — opening, running, and stopping CPAL streams.
//!
//! Wires CPAL audio callbacks to the DSP runtime engine. The output callback
//! calls `AudioEngine::process()` on each buffer, which is the hot path.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, StreamTrait};

use chord_dsp_runtime::{AudioBuffer, AudioEngine};

use crate::device::{find_input_device, find_output_device, negotiate_config};
use crate::error::Result;

/// Configuration for opening an audio stream.
#[derive(Debug, Clone)]
pub struct StreamConfig {
    /// Input device name. `None` means no input. `Some("default")` uses the system default.
    pub input_device: Option<String>,
    /// Output device name. `"default"` uses the system default.
    pub output_device: String,
    /// Desired sample rate in Hz.
    pub sample_rate: u32,
    /// Desired buffer size in samples (must be in 64..=2048).
    pub buffer_size: u32,
}

impl Default for StreamConfig {
    fn default() -> Self {
        Self {
            input_device: None,
            output_device: "default".to_string(),
            sample_rate: 48000,
            buffer_size: 256,
        }
    }
}

/// Latency measurement for a running audio stream.
#[derive(Debug, Clone)]
pub struct LatencyInfo {
    /// Estimated output latency in samples.
    pub output_latency_samples: u32,
    /// Estimated input latency in samples (0 if no input stream).
    pub input_latency_samples: u32,
    /// Total round-trip latency in samples (input + output + buffer).
    pub round_trip_samples: u32,
    /// Total round-trip latency in milliseconds.
    pub round_trip_ms: f64,
}

/// Shared state for the audio callback. Accessible from both the audio thread
/// and the main thread via atomic operations.
struct CallbackState {
    /// Whether the stream is actively processing.
    running: AtomicBool,
    /// Count of callbacks processed (for diagnostics).
    callback_count: AtomicU64,
    /// Count of underruns (buffer arrived too late).
    underrun_count: AtomicU64,
    /// Whether a device disconnection was detected.
    device_disconnected: AtomicBool,
}

impl CallbackState {
    fn new() -> Self {
        Self {
            running: AtomicBool::new(true),
            callback_count: AtomicU64::new(0),
            underrun_count: AtomicU64::new(0),
            device_disconnected: AtomicBool::new(false),
        }
    }
}

/// A running audio stream backed by CPAL.
///
/// Holds the CPAL stream handle and shared callback state. Dropping the stream
/// stops playback. The engine reference is shared via `Arc<Mutex<AudioEngine>>`:
/// the mutex is only locked in the audio callback for the duration of `process()`.
///
/// In a production system, the engine would use a lock-free mechanism (e.g.,
/// `AtomicPtr` swap) so the audio thread never blocks. For this initial
/// implementation, the `Mutex` hold time is bounded by a single `process()` call
/// which is designed to complete within the buffer deadline.
pub struct AudioStream {
    /// The CPAL output stream handle. Dropping this stops playback.
    _output_stream: cpal::Stream,
    /// The CPAL input stream handle (if input was requested).
    _input_stream: Option<cpal::Stream>,
    /// Shared callback state.
    state: Arc<CallbackState>,
    /// The stream configuration used.
    config: StreamConfig,
    /// Number of output channels.
    output_channels: u16,
    /// The shared engine reference (for external access).
    engine: Arc<Mutex<AudioEngine>>,
}

impl AudioStream {
    /// Open an audio stream with the given configuration and engine.
    ///
    /// The engine is wrapped in an `Arc<Mutex<>>` so it can be shared between
    /// the audio callback thread and the caller. The caller can continue to
    /// call `engine.swap_graph()`, `engine.set_parameter()`, etc.
    pub fn open(
        host: &cpal::Host,
        config: StreamConfig,
        engine: Arc<Mutex<AudioEngine>>,
    ) -> Result<Self> {
        let state = Arc::new(CallbackState::new());

        // --- Output stream ---
        let output_device = find_output_device(host, &config.output_device)?;
        let output_cpal_config =
            negotiate_config(&output_device, config.sample_rate, config.buffer_size, true)?;
        let output_channels = output_cpal_config.channels;

        let output_stream = build_output_stream(
            &output_device,
            &output_cpal_config,
            Arc::clone(&engine),
            Arc::clone(&state),
            output_channels,
        )?;

        // --- Input stream (optional) ---
        let input_stream = if let Some(ref input_name) = config.input_device {
            let input_device = find_input_device(host, input_name)?;
            let input_cpal_config =
                negotiate_config(&input_device, config.sample_rate, config.buffer_size, false)?;

            let stream = build_input_stream(
                &input_device,
                &input_cpal_config,
                Arc::clone(&state),
            )?;
            Some(stream)
        } else {
            None
        };

        // Start the streams.
        output_stream.play()?;
        if let Some(ref input) = input_stream {
            input.play()?;
        }

        Ok(Self {
            _output_stream: output_stream,
            _input_stream: input_stream,
            state,
            config,
            output_channels,
            engine,
        })
    }

    /// Check if the stream is currently running.
    pub fn is_running(&self) -> bool {
        self.state.running.load(Ordering::Relaxed)
    }

    /// Check if the device has been disconnected.
    pub fn is_device_disconnected(&self) -> bool {
        self.state.device_disconnected.load(Ordering::Relaxed)
    }

    /// Get the number of audio callbacks processed so far.
    pub fn callback_count(&self) -> u64 {
        self.state.callback_count.load(Ordering::Relaxed)
    }

    /// Get the number of underruns detected.
    pub fn underrun_count(&self) -> u64 {
        self.state.underrun_count.load(Ordering::Relaxed)
    }

    /// Get the stream configuration.
    pub fn config(&self) -> &StreamConfig {
        &self.config
    }

    /// Get estimated latency information.
    pub fn latency(&self) -> LatencyInfo {
        let buffer_samples = self.config.buffer_size;
        // CPAL doesn't expose precise latency, so we estimate:
        // Output latency is typically 1-2 buffers on most systems.
        let output_latency = buffer_samples;
        let input_latency = if self.config.input_device.is_some() {
            buffer_samples
        } else {
            0
        };
        let round_trip = output_latency + input_latency + buffer_samples;
        let round_trip_ms =
            round_trip as f64 / self.config.sample_rate as f64 * 1000.0;

        LatencyInfo {
            output_latency_samples: output_latency,
            input_latency_samples: input_latency,
            round_trip_samples: round_trip,
            round_trip_ms,
        }
    }

    /// Get a reference to the shared engine.
    pub fn engine(&self) -> &Arc<Mutex<AudioEngine>> {
        &self.engine
    }

    /// Get the number of output channels.
    pub fn output_channels(&self) -> u16 {
        self.output_channels
    }

    /// Stop the stream. After calling this, the stream is no longer processing audio.
    /// The stream object can be dropped after this call.
    pub fn stop(&self) {
        self.state.running.store(false, Ordering::Relaxed);
        // CPAL streams are stopped/paused when dropped.
        // Setting running=false makes the callback output silence.
    }
}

/// Build the CPAL output stream that calls `engine.process()` on each callback.
fn build_output_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    engine: Arc<Mutex<AudioEngine>>,
    state: Arc<CallbackState>,
    channels: u16,
) -> Result<cpal::Stream> {
    let channels_usize = channels as usize;
    let sample_rate = config.sample_rate.0;
    let err_state = Arc::clone(&state);

    let stream = device.build_output_stream(
        config,
        move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
            // If we've been stopped, output silence.
            if !state.running.load(Ordering::Relaxed) {
                for sample in data.iter_mut() {
                    *sample = 0.0;
                }
                return;
            }

            state.callback_count.fetch_add(1, Ordering::Relaxed);

            // Calculate the number of frames in this callback.
            let num_frames = if channels_usize > 0 {
                data.len() / channels_usize
            } else {
                0
            };

            if num_frames == 0 {
                return;
            }

            // Lock the engine for the duration of process().
            // This lock should be very short — just one process() call.
            let mut engine_guard = match engine.try_lock() {
                Ok(guard) => guard,
                Err(_) => {
                    // Engine is locked by another thread (e.g., graph swap).
                    // Output silence to avoid blocking the audio thread.
                    for sample in data.iter_mut() {
                        *sample = 0.0;
                    }
                    state.underrun_count.fetch_add(1, Ordering::Relaxed);
                    return;
                }
            };

            // Create AudioBuffers for the engine.
            // Input: silence (no input stream routed here currently).
            let input_buffer = AudioBuffer::new(channels_usize, num_frames);
            let mut output_buffer = AudioBuffer::new(channels_usize, num_frames);

            // Process audio through the engine.
            engine_guard.process(&input_buffer, &mut output_buffer);

            // De-interleave from AudioBuffer (channel-major) into CPAL's
            // interleaved output format.
            let out_channels = output_buffer.num_channels().min(channels_usize);
            for frame in 0..num_frames {
                for ch in 0..channels_usize {
                    let sample_idx = frame * channels_usize + ch;
                    if sample_idx < data.len() {
                        data[sample_idx] = if ch < out_channels {
                            output_buffer.channel(ch)[frame]
                        } else {
                            0.0
                        };
                    }
                }
            }

            drop(engine_guard);
            let _ = sample_rate; // suppress unused warning; available for future use.
        },
        move |err| {
            // Error callback — device disconnected or other fatal error.
            err_state.device_disconnected.store(true, Ordering::Relaxed);
            err_state.running.store(false, Ordering::Relaxed);
            eprintln!("Audio output stream error: {err}");
        },
        None, // No timeout.
    )?;

    Ok(stream)
}

/// Build a CPAL input stream (for recording / live input processing).
///
/// Currently captures audio data and could route it to the engine's input buffer.
/// For the initial implementation, we just track that the stream is alive.
fn build_input_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    state: Arc<CallbackState>,
) -> Result<cpal::Stream> {
    let err_state = Arc::clone(&state);

    let stream = device.build_input_stream(
        config,
        move |_data: &[f32], _: &cpal::InputCallbackInfo| {
            // Input data is available here. In a full implementation, we would
            // push this into a lock-free ring buffer for the engine to consume.
            // For now, we just acknowledge the callback.
        },
        move |err| {
            err_state.device_disconnected.store(true, Ordering::Relaxed);
            err_state.running.store(false, Ordering::Relaxed);
            eprintln!("Audio input stream error: {err}");
        },
        None,
    )?;

    Ok(stream)
}

#[cfg(test)]
mod stream_tests {
    use super::*;

    #[test]
    fn test_stream_config_default() {
        let config = StreamConfig::default();
        assert_eq!(config.output_device, "default");
        assert!(config.input_device.is_none());
        assert_eq!(config.sample_rate, 48000);
        assert_eq!(config.buffer_size, 256);
    }

    #[test]
    fn test_latency_info_calculation() {
        // Simulate latency calculation without an actual stream.
        let config = StreamConfig {
            input_device: Some("default".to_string()),
            output_device: "default".to_string(),
            sample_rate: 48000,
            buffer_size: 256,
        };

        let buffer_samples = config.buffer_size;
        let output_latency = buffer_samples;
        let input_latency = buffer_samples;
        let round_trip = output_latency + input_latency + buffer_samples;
        let round_trip_ms = round_trip as f64 / config.sample_rate as f64 * 1000.0;

        let info = LatencyInfo {
            output_latency_samples: output_latency,
            input_latency_samples: input_latency,
            round_trip_samples: round_trip,
            round_trip_ms,
        };

        assert_eq!(info.output_latency_samples, 256);
        assert_eq!(info.input_latency_samples, 256);
        assert_eq!(info.round_trip_samples, 768);
        // 768 / 48000 * 1000 = 16ms
        assert!((info.round_trip_ms - 16.0).abs() < 0.01);
    }

    #[test]
    fn test_callback_state_defaults() {
        let state = CallbackState::new();
        assert!(state.running.load(Ordering::Relaxed));
        assert_eq!(state.callback_count.load(Ordering::Relaxed), 0);
        assert_eq!(state.underrun_count.load(Ordering::Relaxed), 0);
        assert!(!state.device_disconnected.load(Ordering::Relaxed));
    }

    #[test]
    fn test_callback_state_stop() {
        let state = CallbackState::new();
        state.running.store(false, Ordering::Relaxed);
        assert!(!state.running.load(Ordering::Relaxed));
    }

    #[test]
    fn test_stream_open_with_no_hardware() {
        // In CI without audio hardware, opening a stream should fail gracefully.
        use chord_dsp_runtime::EngineConfig;

        let host = cpal::default_host();
        let config = StreamConfig::default();
        let engine = Arc::new(Mutex::new(AudioEngine::new(EngineConfig::default())));
        let result = AudioStream::open(&host, config, engine);

        // We don't know if hardware is present — just verify no panic.
        match result {
            Ok(stream) => {
                assert!(stream.is_running());
                assert!(!stream.is_device_disconnected());
                stream.stop();
            }
            Err(_) => {
                // Expected in CI without audio hardware.
            }
        }
    }
}
