//! The AudioHost — top-level entry point for audio I/O management.
//!
//! Wraps CPAL host initialization, device enumeration, and stream lifecycle.

use std::sync::{Arc, Mutex};

use cpal::traits::HostTrait;

use chord_dsp_runtime::AudioEngine;

use crate::device::{self, AudioDevice};
use crate::error::Result;
use crate::stream::{AudioStream, StreamConfig};

/// Top-level audio host managing devices and streams.
///
/// Create one `AudioHost` at application startup. Use it to enumerate devices,
/// open streams, and manage the audio lifecycle.
///
/// # Example
///
/// ```no_run
/// use std::sync::{Arc, Mutex};
/// use chord_audio_io::{AudioHost, StreamConfig};
/// use chord_dsp_runtime::{AudioEngine, EngineConfig};
///
/// let host = AudioHost::new().expect("Failed to initialize audio");
/// let devices = host.list_devices().unwrap();
/// for dev in &devices {
///     println!("{}: {}in/{}out", dev.name, dev.input_channels, dev.output_channels);
/// }
///
/// let engine = Arc::new(Mutex::new(AudioEngine::new(EngineConfig::default())));
/// let config = StreamConfig::default();
/// let stream = host.open_stream(config, engine).unwrap();
/// ```
pub struct AudioHost {
    /// The CPAL host.
    host: cpal::Host,
}

impl AudioHost {
    /// Create a new AudioHost using the platform's default audio backend.
    ///
    /// Returns an error if no audio host is available.
    pub fn new() -> Result<Self> {
        let host = cpal::default_host();
        Ok(Self { host })
    }

    /// Create an AudioHost from a specific CPAL host (for testing or platform selection).
    pub fn from_cpal_host(host: cpal::Host) -> Self {
        Self { host }
    }

    /// List all available audio devices.
    ///
    /// Returns descriptions of input and output devices, including channel counts
    /// and supported sample rates.
    pub fn list_devices(&self) -> Result<Vec<AudioDevice>> {
        device::list_devices(&self.host)
    }

    /// Open an audio stream with the given configuration and engine.
    ///
    /// The engine is shared via `Arc<Mutex<AudioEngine>>` so the caller retains
    /// access for graph swaps, parameter changes, etc.
    ///
    /// Returns a running [`AudioStream`] that pipes audio through the engine
    /// to the speakers.
    pub fn open_stream(
        &self,
        config: StreamConfig,
        engine: Arc<Mutex<AudioEngine>>,
    ) -> Result<AudioStream> {
        AudioStream::open(&self.host, config, engine)
    }

    /// Get the name of the default output device, if available.
    pub fn default_output_device_name(&self) -> Option<String> {
        self.host
            .default_output_device()
            .and_then(|d| cpal::traits::DeviceTrait::name(&d).ok())
    }

    /// Get the name of the default input device, if available.
    pub fn default_input_device_name(&self) -> Option<String> {
        self.host
            .default_input_device()
            .and_then(|d| cpal::traits::DeviceTrait::name(&d).ok())
    }

    /// Check if a specific output device is available.
    pub fn has_output_device(&self, name: &str) -> bool {
        device::find_output_device(&self.host, name).is_ok()
    }

    /// Check if a specific input device is available.
    pub fn has_input_device(&self, name: &str) -> bool {
        device::find_input_device(&self.host, name).is_ok()
    }

    /// Get a reference to the underlying CPAL host.
    pub fn cpal_host(&self) -> &cpal::Host {
        &self.host
    }
}

/// Device hot-plug watcher.
///
/// Periodically checks for device changes by re-enumerating devices.
/// CPAL does not provide native hot-plug callbacks on all platforms,
/// so we poll at a configurable interval.
pub struct DeviceWatcher {
    /// The last known set of device names.
    last_device_names: Vec<String>,
}

impl DeviceWatcher {
    /// Create a new device watcher with the current device list.
    pub fn new(host: &AudioHost) -> Self {
        let names = host
            .list_devices()
            .unwrap_or_default()
            .into_iter()
            .map(|d| d.name)
            .collect();
        Self {
            last_device_names: names,
        }
    }

    /// Poll for device changes. Returns lists of added and removed device names.
    ///
    /// Call this periodically (e.g., every 1-2 seconds) from a non-audio thread.
    pub fn poll(&mut self, host: &AudioHost) -> DeviceChanges {
        let current_names: Vec<String> = host
            .list_devices()
            .unwrap_or_default()
            .into_iter()
            .map(|d| d.name)
            .collect();

        let added: Vec<String> = current_names
            .iter()
            .filter(|n| !self.last_device_names.contains(n))
            .cloned()
            .collect();

        let removed: Vec<String> = self
            .last_device_names
            .iter()
            .filter(|n| !current_names.contains(n))
            .cloned()
            .collect();

        self.last_device_names = current_names;

        DeviceChanges { added, removed }
    }
}

/// Result of a device change poll.
#[derive(Debug, Clone)]
pub struct DeviceChanges {
    /// Devices that were added since the last poll.
    pub added: Vec<String>,
    /// Devices that were removed since the last poll.
    pub removed: Vec<String>,
}

impl DeviceChanges {
    /// Whether any changes were detected.
    pub fn has_changes(&self) -> bool {
        !self.added.is_empty() || !self.removed.is_empty()
    }
}

#[cfg(test)]
mod host_tests {
    use super::*;

    #[test]
    fn test_audio_host_creation() {
        // AudioHost::new() should not panic, even without hardware.
        let result = AudioHost::new();
        assert!(result.is_ok());
    }

    #[test]
    fn test_list_devices_via_host() {
        let host = AudioHost::new().unwrap();
        // Should not panic. Result depends on hardware availability.
        let _ = host.list_devices();
    }

    #[test]
    fn test_default_device_names() {
        let host = AudioHost::new().unwrap();
        // These may return None in CI — just verify no panic.
        let _ = host.default_output_device_name();
        let _ = host.default_input_device_name();
    }

    #[test]
    fn test_has_device_nonexistent() {
        let host = AudioHost::new().unwrap();
        assert!(!host.has_output_device("NonExistentDevice99999"));
        assert!(!host.has_input_device("NonExistentDevice99999"));
    }

    #[test]
    fn test_device_watcher_no_changes() {
        let host = AudioHost::new().unwrap();
        let mut watcher = DeviceWatcher::new(&host);
        // Immediately polling should show no changes.
        let changes = watcher.poll(&host);
        assert!(!changes.has_changes());
    }

    #[test]
    fn test_device_changes_struct() {
        let empty = DeviceChanges {
            added: vec![],
            removed: vec![],
        };
        assert!(!empty.has_changes());

        let with_added = DeviceChanges {
            added: vec!["New Device".to_string()],
            removed: vec![],
        };
        assert!(with_added.has_changes());

        let with_removed = DeviceChanges {
            added: vec![],
            removed: vec!["Old Device".to_string()],
        };
        assert!(with_removed.has_changes());
    }
}
