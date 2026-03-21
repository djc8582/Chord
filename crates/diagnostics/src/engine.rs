//! The main diagnostic engine that ties all components together.
//!
//! [`DiagnosticEngine`] implements [`DiagnosticProbe`] and coordinates the signal monitor,
//! problem detector, and performance profiler into a single unified interface.

use std::time::Duration;

use chord_audio_graph::{NodeId, PortId};
use chord_dsp_runtime::DiagnosticProbe;
use chord_dsp_runtime::{AudioBuffer, AudioError};

use crate::detector::{DetectorConfig, Problem, ProblemDetector};
use crate::profiler::{CpuProfile, PerformanceProfiler, ProfilerConfig};
use crate::report::DiagnosticReport;
use crate::signal_monitor::{SignalMonitor, SignalMonitorConfig};
use crate::stats::SignalStats;

/// Configuration for the diagnostic engine.
#[derive(Debug, Clone, Default)]
pub struct DiagnosticConfig {
    /// Signal monitor configuration.
    pub signal_monitor: SignalMonitorConfig,
    /// Problem detector configuration.
    pub detector: DetectorConfig,
    /// Performance profiler configuration.
    pub profiler: ProfilerConfig,
}

/// The main diagnostic engine.
///
/// Implements [`DiagnosticProbe`] so it can be plugged directly into the audio engine.
/// Coordinates the signal monitor, problem detector, and performance profiler.
///
/// # Usage
///
/// ```ignore
/// let config = DiagnosticConfig::default();
/// let engine = DiagnosticEngine::new(config);
/// // Plug into the audio engine:
/// // audio_engine.set_diagnostic_probe(Box::new(engine));
/// ```
pub struct DiagnosticEngine {
    /// Signal monitor — tracks per-node/port signal statistics.
    signal_monitor: SignalMonitor,
    /// Problem detector — analyzes stats to find issues.
    problem_detector: ProblemDetector,
    /// Performance profiler — tracks processing time per node.
    performance_profiler: PerformanceProfiler,
}

impl DiagnosticEngine {
    /// Create a new diagnostic engine with the given configuration.
    pub fn new(config: DiagnosticConfig) -> Self {
        Self {
            signal_monitor: SignalMonitor::new(config.signal_monitor),
            problem_detector: ProblemDetector::new(config.detector),
            performance_profiler: PerformanceProfiler::new(config.profiler),
        }
    }

    /// Get signal stats for a specific node/port.
    pub fn get_signal_stats(&self, node_id: NodeId, port: PortId) -> Option<SignalStats> {
        self.signal_monitor.get_signal_stats(node_id, port)
    }

    /// Run the problem detector across all tracked nodes and return detected problems.
    pub fn get_problems(&mut self) -> Vec<Problem> {
        let mut all_problems = Vec::new();

        for np in self.signal_monitor.tracked_ports() {
            if let Some(stats) = self.signal_monitor.get_signal_stats(np.node_id, np.port_id) {
                let problems =
                    self.problem_detector
                        .analyze(np.node_id, np.port_id, &stats);
                all_problems.extend(problems);
            }
        }

        all_problems
    }

    /// Get the current CPU profile.
    pub fn get_cpu_profile(&self) -> CpuProfile {
        self.performance_profiler.cpu_profile()
    }

    /// Run a full diagnostic and return an aggregated report.
    pub fn run_full_diagnostic(&mut self) -> DiagnosticReport {
        let mut signal_stats = std::collections::HashMap::new();
        for np in self.signal_monitor.tracked_ports() {
            if let Some(stats) = self.signal_monitor.get_signal_stats(np.node_id, np.port_id) {
                let key = format!("{}:{}", np.node_id.0, np.port_id.0);
                signal_stats.insert(key, stats);
            }
        }

        let problems = self.get_problems();
        let cpu_profile = self.get_cpu_profile();

        let mut report = DiagnosticReport {
            signal_stats,
            problems,
            cpu_profile,
            ..DiagnosticReport::new()
        };
        report.compute_summary();
        report
    }

    /// Record a node's processing duration (called by the engine or externally).
    pub fn record_node_timing(&mut self, node_id: NodeId, duration: Duration) {
        self.performance_profiler.record_node_timing(node_id, duration);
    }

    /// Signal the end of a buffer processing cycle.
    pub fn end_buffer(&mut self) {
        self.performance_profiler.end_buffer();
    }

    /// Get a reference to the signal monitor.
    pub fn signal_monitor(&self) -> &SignalMonitor {
        &self.signal_monitor
    }

    /// Get a mutable reference to the signal monitor.
    pub fn signal_monitor_mut(&mut self) -> &mut SignalMonitor {
        &mut self.signal_monitor
    }

    /// Get a reference to the performance profiler.
    pub fn performance_profiler(&self) -> &PerformanceProfiler {
        &self.performance_profiler
    }

    /// Get a mutable reference to the performance profiler.
    pub fn performance_profiler_mut(&mut self) -> &mut PerformanceProfiler {
        &mut self.performance_profiler
    }

    /// Reset all diagnostic state.
    pub fn reset(&mut self) {
        self.signal_monitor.reset();
        self.performance_profiler.reset();
    }
}

impl DiagnosticProbe for DiagnosticEngine {
    fn on_buffer_processed(&mut self, node_id: NodeId, port: PortId, buffer: &AudioBuffer) {
        self.signal_monitor.on_buffer_processed(node_id, port, buffer);
    }

    fn on_error(&mut self, node_id: NodeId, error: AudioError) {
        self.signal_monitor.on_error(node_id, error);
    }
}

impl Default for DiagnosticEngine {
    fn default() -> Self {
        Self::new(DiagnosticConfig::default())
    }
}
