//! Performance profiling — tracks per-node processing time and DSP load.
//!
//! [`PerformanceProfiler`] monitors how long each node takes to process audio,
//! detects buffer underruns, and computes overall DSP load percentage.

use std::collections::HashMap;
use std::time::Duration;

use chord_audio_graph::NodeId;
use serde::{Deserialize, Serialize};

/// Configuration for the performance profiler.
#[derive(Debug, Clone)]
pub struct ProfilerConfig {
    /// Sample rate in Hz (needed to compute buffer duration).
    pub sample_rate: f64,
    /// Buffer size in samples (needed to compute buffer duration).
    pub buffer_size: usize,
    /// Number of timing history entries to keep per node.
    pub timing_history_size: usize,
    /// CPU spike threshold — a node taking more than this fraction of the buffer
    /// duration triggers a CPU spike warning. Default: 0.5 (50%).
    pub spike_threshold: f64,
}

impl Default for ProfilerConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48000.0,
            buffer_size: 256,
            timing_history_size: 256,
            spike_threshold: 0.5,
        }
    }
}

/// Per-node timing statistics.
#[derive(Debug, Clone)]
struct NodeProfile {
    /// Ring buffer of recent processing durations.
    history: Vec<Duration>,
    /// Write position in the history ring buffer.
    write_pos: usize,
    /// Number of valid entries.
    valid_count: usize,
    /// Running total of all durations (for computing average).
    total_duration: Duration,
    /// Total number of process calls.
    total_calls: u64,
    /// Maximum duration observed.
    max_duration: Duration,
}

impl NodeProfile {
    fn new(history_size: usize) -> Self {
        Self {
            history: vec![Duration::ZERO; history_size],
            write_pos: 0,
            valid_count: 0,
            total_duration: Duration::ZERO,
            total_calls: 0,
            max_duration: Duration::ZERO,
        }
    }

    fn record(&mut self, duration: Duration) {
        let len = self.history.len();
        if len > 0 {
            self.history[self.write_pos % len] = duration;
            self.write_pos = (self.write_pos + 1) % len;
            if self.valid_count < len {
                self.valid_count += 1;
            }
        }
        self.total_duration += duration;
        self.total_calls += 1;
        if duration > self.max_duration {
            self.max_duration = duration;
        }
    }

    fn average_duration(&self) -> Duration {
        if self.total_calls == 0 {
            Duration::ZERO
        } else {
            self.total_duration / self.total_calls as u32
        }
    }

    fn recent_average(&self) -> Duration {
        if self.valid_count == 0 {
            return Duration::ZERO;
        }
        let sum: Duration = self.history[..self.valid_count].iter().sum();
        sum / self.valid_count as u32
    }

    fn latest_duration(&self) -> Duration {
        if self.valid_count == 0 {
            return Duration::ZERO;
        }
        let idx = if self.write_pos == 0 {
            self.history.len() - 1
        } else {
            self.write_pos - 1
        };
        self.history[idx]
    }
}

/// Aggregated CPU profile data for the entire DSP graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuProfile {
    /// DSP load as a percentage (0.0 to 100.0+).
    /// This is the total processing time as a fraction of the buffer duration.
    pub dsp_load_percent: f64,
    /// Per-node processing times (most recent).
    pub node_times: HashMap<u64, NodeTimingInfo>,
    /// Number of buffer underruns detected.
    pub underrun_count: u64,
    /// Buffer duration in microseconds (the real-time deadline).
    pub buffer_duration_us: f64,
    /// Total processing time for the most recent buffer (microseconds).
    pub total_process_time_us: f64,
}

/// Timing information for a single node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeTimingInfo {
    /// Most recent processing duration in microseconds.
    pub latest_us: f64,
    /// Average processing duration in microseconds.
    pub average_us: f64,
    /// Maximum processing duration in microseconds.
    pub max_us: f64,
    /// Number of times this node has been profiled.
    pub call_count: u64,
}

/// Tracks per-node processing time, buffer underruns, and overall DSP load.
pub struct PerformanceProfiler {
    config: ProfilerConfig,
    /// Per-node profiling data.
    node_profiles: HashMap<NodeId, NodeProfile>,
    /// Buffer duration (the real-time deadline for each process() call).
    buffer_duration: Duration,
    /// Total processing time for the most recent buffer.
    latest_total_time: Duration,
    /// Running accumulator for the current buffer's total time.
    current_buffer_total: Duration,
    /// Number of buffer underruns (total time exceeding buffer duration).
    underrun_count: u64,
    /// Total buffers processed.
    total_buffers: u64,
}

impl PerformanceProfiler {
    /// Create a new performance profiler with the given configuration.
    pub fn new(config: ProfilerConfig) -> Self {
        let buffer_duration = Duration::from_secs_f64(
            config.buffer_size as f64 / config.sample_rate,
        );
        Self {
            config,
            node_profiles: HashMap::new(),
            buffer_duration,
            latest_total_time: Duration::ZERO,
            current_buffer_total: Duration::ZERO,
            underrun_count: 0,
            total_buffers: 0,
        }
    }

    /// Record a node's processing duration.
    pub fn record_node_timing(&mut self, node_id: NodeId, duration: Duration) {
        let history_size = self.config.timing_history_size;
        let profile = self
            .node_profiles
            .entry(node_id)
            .or_insert_with(|| NodeProfile::new(history_size));
        profile.record(duration);
        self.current_buffer_total += duration;
    }

    /// Signal the end of a buffer processing cycle.
    /// This finalizes the current buffer's timing and checks for underruns.
    pub fn end_buffer(&mut self) {
        self.latest_total_time = self.current_buffer_total;

        // Check for buffer underrun.
        if self.current_buffer_total > self.buffer_duration {
            self.underrun_count += 1;
        }

        self.total_buffers += 1;
        self.current_buffer_total = Duration::ZERO;
    }

    /// Compute the current CPU profile snapshot.
    pub fn cpu_profile(&self) -> CpuProfile {
        let buffer_duration_us = self.buffer_duration.as_secs_f64() * 1_000_000.0;
        let total_process_time_us = self.latest_total_time.as_secs_f64() * 1_000_000.0;
        let dsp_load_percent = if buffer_duration_us > 0.0 {
            (total_process_time_us / buffer_duration_us) * 100.0
        } else {
            0.0
        };

        let mut node_times = HashMap::new();
        for (node_id, profile) in &self.node_profiles {
            node_times.insert(
                node_id.0,
                NodeTimingInfo {
                    latest_us: profile.latest_duration().as_secs_f64() * 1_000_000.0,
                    average_us: profile.average_duration().as_secs_f64() * 1_000_000.0,
                    max_us: profile.max_duration.as_secs_f64() * 1_000_000.0,
                    call_count: profile.total_calls,
                },
            );
        }

        CpuProfile {
            dsp_load_percent,
            node_times,
            underrun_count: self.underrun_count,
            buffer_duration_us,
            total_process_time_us,
        }
    }

    /// Check if a specific node is exceeding the CPU spike threshold.
    pub fn is_node_spiking(&self, node_id: NodeId) -> bool {
        if let Some(profile) = self.node_profiles.get(&node_id) {
            let latest = profile.latest_duration();
            let threshold = self.buffer_duration.mul_f64(self.config.spike_threshold);
            latest > threshold
        } else {
            false
        }
    }

    /// Get the number of buffer underruns.
    pub fn underrun_count(&self) -> u64 {
        self.underrun_count
    }

    /// Get the total number of buffers processed.
    pub fn total_buffers(&self) -> u64 {
        self.total_buffers
    }

    /// Get the buffer duration (real-time deadline).
    pub fn buffer_duration(&self) -> Duration {
        self.buffer_duration
    }

    /// Get the recent average processing time for a node.
    pub fn node_recent_average(&self, node_id: NodeId) -> Option<Duration> {
        self.node_profiles.get(&node_id).map(|p| p.recent_average())
    }

    /// Reset all profiling data.
    pub fn reset(&mut self) {
        self.node_profiles.clear();
        self.latest_total_time = Duration::ZERO;
        self.current_buffer_total = Duration::ZERO;
        self.underrun_count = 0;
        self.total_buffers = 0;
    }

    /// Get the profiler configuration.
    pub fn config(&self) -> &ProfilerConfig {
        &self.config
    }
}

impl Default for PerformanceProfiler {
    fn default() -> Self {
        Self::new(ProfilerConfig::default())
    }
}
