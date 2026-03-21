//! Snapshot testing — save and load reference audio buffers as JSON for regression testing.
//!
//! Snapshots are stored as JSON files containing sample data. On subsequent test runs,
//! the current output is compared against the saved snapshot within a tolerance.

use std::path::{Path, PathBuf};

use chord_dsp_runtime::AudioBuffer;
use serde::{Deserialize, Serialize};

/// Default directory for snapshots (relative to the crate root).
const DEFAULT_SNAPSHOT_DIR: &str = "test_snapshots";

/// Serializable representation of an audio buffer for snapshot storage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioSnapshot {
    /// Number of channels in the buffer.
    pub num_channels: usize,
    /// Number of samples per channel.
    pub buffer_size: usize,
    /// Sample data: `channels[ch][sample]`.
    pub channels: Vec<Vec<f32>>,
}

impl AudioSnapshot {
    /// Create a snapshot from an AudioBuffer.
    pub fn from_buffer(buffer: &AudioBuffer) -> Self {
        let num_channels = buffer.num_channels();
        let buffer_size = buffer.buffer_size();
        let mut channels = Vec::with_capacity(num_channels);

        for ch in 0..num_channels {
            channels.push(buffer.channel(ch).to_vec());
        }

        Self {
            num_channels,
            buffer_size,
            channels,
        }
    }

    /// Convert the snapshot back to an AudioBuffer.
    pub fn to_buffer(&self) -> AudioBuffer {
        let mut buffer = AudioBuffer::new(self.num_channels, self.buffer_size);
        for (ch, data) in self.channels.iter().enumerate() {
            let channel = buffer.channel_mut(ch);
            let copy_len = channel.len().min(data.len());
            channel[..copy_len].copy_from_slice(&data[..copy_len]);
        }
        buffer
    }

    /// Serialize the snapshot to a JSON string.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// Deserialize a snapshot from a JSON string.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

/// Get the snapshot directory path, creating it if needed.
fn snapshot_dir() -> PathBuf {
    let dir = PathBuf::from(DEFAULT_SNAPSHOT_DIR);
    if !dir.exists() {
        std::fs::create_dir_all(&dir).ok();
    }
    dir
}

/// Get the full path for a named snapshot.
fn snapshot_path(name: &str) -> PathBuf {
    snapshot_dir().join(format!("{name}.json"))
}

/// Save an audio buffer as a named snapshot (JSON file).
///
/// The snapshot is saved to `test_snapshots/{name}.json` relative to the current
/// working directory.
pub fn save_snapshot(name: &str, buffer: &AudioBuffer) {
    let snapshot = AudioSnapshot::from_buffer(buffer);
    let json = snapshot
        .to_json()
        .expect("Failed to serialize audio snapshot");
    let path = snapshot_path(name);
    std::fs::write(&path, json)
        .unwrap_or_else(|e| panic!("Failed to write snapshot to {}: {e}", path.display()));
}

/// Load a previously saved snapshot by name.
///
/// Returns `None` if the snapshot file does not exist.
pub fn load_snapshot(name: &str) -> Option<AudioSnapshot> {
    let path = snapshot_path(name);
    let json = std::fs::read_to_string(&path).ok()?;
    AudioSnapshot::from_json(&json).ok()
}

/// Assert that an audio buffer matches a previously saved snapshot within tolerance.
///
/// If no snapshot exists yet, saves the current buffer as the reference snapshot
/// and the assertion passes (first-run behavior).
///
/// On subsequent runs, compares the current buffer against the saved snapshot
/// sample-by-sample, asserting that no sample differs by more than `tolerance`.
pub fn assert_matches_snapshot(name: &str, buffer: &AudioBuffer, tolerance: f32) {
    let path = snapshot_path(name);

    if !path.exists() {
        // First run: save the current output as the reference.
        save_snapshot(name, buffer);
        return;
    }

    let snapshot = load_snapshot(name).unwrap_or_else(|| {
        panic!(
            "Failed to load snapshot '{}' from {}",
            name,
            path.display()
        )
    });

    let reference = snapshot.to_buffer();

    assert_eq!(
        buffer.num_channels(),
        reference.num_channels(),
        "Snapshot '{name}' channel count mismatch: got {}, expected {}",
        buffer.num_channels(),
        reference.num_channels()
    );
    assert_eq!(
        buffer.buffer_size(),
        reference.buffer_size(),
        "Snapshot '{name}' buffer size mismatch: got {}, expected {}",
        buffer.buffer_size(),
        reference.buffer_size()
    );

    for ch in 0..buffer.num_channels() {
        let current = buffer.channel(ch);
        let expected = reference.channel(ch);
        for (i, (&c, &e)) in current.iter().zip(expected.iter()).enumerate() {
            let diff = (c - e).abs();
            assert!(
                diff <= tolerance,
                "Snapshot '{name}' mismatch at channel {ch}, sample {i}: got {c}, expected {e} (diff {diff} > tolerance {tolerance})"
            );
        }
    }
}

/// Save a snapshot to a specific file path (not using the default directory).
pub fn save_snapshot_to_path(path: &Path, buffer: &AudioBuffer) {
    let snapshot = AudioSnapshot::from_buffer(buffer);
    let json = snapshot
        .to_json()
        .expect("Failed to serialize audio snapshot");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(path, json)
        .unwrap_or_else(|e| panic!("Failed to write snapshot to {}: {e}", path.display()));
}

/// Load a snapshot from a specific file path.
pub fn load_snapshot_from_path(path: &Path) -> Option<AudioSnapshot> {
    let json = std::fs::read_to_string(path).ok()?;
    AudioSnapshot::from_json(&json).ok()
}
