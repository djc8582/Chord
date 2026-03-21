//! Signal monitoring — implements the [`DiagnosticProbe`] trait.
//!
//! [`SignalMonitor`] tracks per-node/port signal statistics using a ring buffer of
//! recent stats snapshots, enabling both real-time display and historical scrubbing.

use std::collections::HashMap;
use std::time::Duration;

use chord_audio_graph::{NodeId, PortId};
use chord_dsp_runtime::DiagnosticProbe;
use chord_dsp_runtime::{AudioBuffer, AudioError};

use crate::stats::{SignalStats, StatsAccumulator};

/// Key identifying a specific node/port combination.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NodePort {
    pub node_id: NodeId,
    pub port_id: PortId,
}

/// Configuration for the signal monitor.
#[derive(Debug, Clone)]
pub struct SignalMonitorConfig {
    /// Number of historical snapshots to keep per node/port.
    /// At one snapshot per buffer, this determines how many seconds of history
    /// are available for scrubbing.
    pub history_size: usize,
    /// Number of buffers between automatic snapshots.
    /// Set to 1 to snapshot every buffer (most detail, more memory).
    pub snapshot_interval: usize,
}

impl Default for SignalMonitorConfig {
    fn default() -> Self {
        Self {
            // At 256 samples / 48kHz, one buffer = ~5.3ms.
            // 1875 snapshots * 5.3ms = ~10 seconds of history.
            history_size: 1875,
            snapshot_interval: 1,
        }
    }
}

/// Per-node/port monitoring state.
struct MonitorEntry {
    /// Running accumulator for the current snapshot window.
    accumulator: StatsAccumulator,
    /// Ring buffer of historical stats snapshots.
    history: Vec<SignalStats>,
    /// Write position in the ring buffer.
    write_pos: usize,
    /// Number of valid entries in the history.
    valid_count: usize,
    /// Buffer count since last snapshot.
    buffers_since_snapshot: usize,
}

impl MonitorEntry {
    fn new(history_size: usize) -> Self {
        Self {
            accumulator: StatsAccumulator::new(),
            history: (0..history_size).map(|_| SignalStats::new()).collect(),
            write_pos: 0,
            valid_count: 0,
            buffers_since_snapshot: 0,
        }
    }

    fn push_snapshot(&mut self) {
        let snapshot = self.accumulator.snapshot();
        let len = self.history.len();
        if len > 0 {
            self.history[self.write_pos % len] = snapshot;
            self.write_pos = (self.write_pos + 1) % len;
            if self.valid_count < len {
                self.valid_count += 1;
            }
        }
        self.accumulator.reset();
        self.buffers_since_snapshot = 0;
    }
}

/// Monitors signal health at every node/port in the audio graph.
///
/// Implements [`DiagnosticProbe`] so it can be plugged into the audio engine.
/// Tracks per-node signal statistics with a ring buffer of recent snapshots
/// for historical viewing.
pub struct SignalMonitor {
    /// Per-node/port monitoring state.
    entries: HashMap<NodePort, MonitorEntry>,
    /// Configuration.
    config: SignalMonitorConfig,
    /// Errors recorded from the audio engine.
    errors: Vec<(NodeId, AudioError)>,
    /// Per-node timing data (most recent durations).
    node_timings: HashMap<NodeId, Duration>,
}

impl SignalMonitor {
    /// Create a new signal monitor with the given configuration.
    pub fn new(config: SignalMonitorConfig) -> Self {
        Self {
            entries: HashMap::new(),
            config,
            errors: Vec::new(),
            node_timings: HashMap::new(),
        }
    }

    /// Get the current signal stats for a specific node/port.
    ///
    /// Returns the live accumulator snapshot if it has data, otherwise returns
    /// the most recent historical snapshot (which is stored after each snapshot interval).
    pub fn get_signal_stats(&self, node_id: NodeId, port_id: PortId) -> Option<SignalStats> {
        let key = NodePort { node_id, port_id };
        let entry = self.entries.get(&key)?;
        let snapshot = entry.accumulator.snapshot();
        if snapshot.sample_count > 0 {
            Some(snapshot)
        } else if entry.valid_count > 0 {
            // Accumulator was just reset after a snapshot — return the latest historical entry.
            let idx = if entry.write_pos == 0 {
                entry.history.len() - 1
            } else {
                entry.write_pos - 1
            };
            Some(entry.history[idx].clone())
        } else {
            None
        }
    }

    /// Get the most recent historical snapshot for a node/port.
    pub fn get_latest_snapshot(&self, node_id: NodeId, port_id: PortId) -> Option<&SignalStats> {
        let key = NodePort { node_id, port_id };
        let entry = self.entries.get(&key)?;
        if entry.valid_count == 0 {
            return None;
        }
        let idx = if entry.write_pos == 0 {
            entry.history.len() - 1
        } else {
            entry.write_pos - 1
        };
        Some(&entry.history[idx])
    }

    /// Get all historical snapshots for a node/port (oldest first).
    pub fn get_history(&self, node_id: NodeId, port_id: PortId) -> Vec<&SignalStats> {
        let key = NodePort { node_id, port_id };
        let entry = match self.entries.get(&key) {
            Some(e) => e,
            None => return Vec::new(),
        };

        let len = entry.history.len();
        let count = entry.valid_count;
        if count == 0 {
            return Vec::new();
        }

        let mut result = Vec::with_capacity(count);
        let start = if count < len {
            0
        } else {
            entry.write_pos
        };
        for i in 0..count {
            let idx = (start + i) % len;
            result.push(&entry.history[idx]);
        }
        result
    }

    /// Get all tracked node/port pairs.
    pub fn tracked_ports(&self) -> Vec<NodePort> {
        self.entries.keys().copied().collect()
    }

    /// Get errors recorded from the audio engine.
    pub fn get_errors(&self) -> &[(NodeId, AudioError)] {
        &self.errors
    }

    /// Clear recorded errors.
    pub fn clear_errors(&mut self) {
        self.errors.clear();
    }

    /// Get the most recent timing for a node.
    pub fn get_node_timing(&self, node_id: NodeId) -> Option<Duration> {
        self.node_timings.get(&node_id).copied()
    }

    /// Get all node timings.
    pub fn get_all_timings(&self) -> &HashMap<NodeId, Duration> {
        &self.node_timings
    }

    /// Reset all monitoring state.
    pub fn reset(&mut self) {
        self.entries.clear();
        self.errors.clear();
        self.node_timings.clear();
    }

    /// Get or create the monitor entry for a node/port.
    fn get_or_create_entry(&mut self, node_id: NodeId, port_id: PortId) -> &mut MonitorEntry {
        let key = NodePort { node_id, port_id };
        let history_size = self.config.history_size;
        self.entries
            .entry(key)
            .or_insert_with(|| MonitorEntry::new(history_size))
    }
}

impl DiagnosticProbe for SignalMonitor {
    fn on_buffer_processed(&mut self, node_id: NodeId, port: PortId, buffer: &AudioBuffer) {
        let snapshot_interval = self.config.snapshot_interval;
        let entry = self.get_or_create_entry(node_id, port);

        // Process all channels of the buffer.
        for ch in 0..buffer.num_channels() {
            entry.accumulator.process_buffer(buffer.channel(ch));
        }

        entry.buffers_since_snapshot += 1;
        if entry.buffers_since_snapshot >= snapshot_interval {
            entry.push_snapshot();
        }
    }

    fn on_error(&mut self, node_id: NodeId, error: AudioError) {
        // Cap error log to prevent unbounded growth.
        if self.errors.len() < 10_000 {
            self.errors.push((node_id, error));
        }
    }
}
