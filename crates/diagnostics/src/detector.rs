//! Problem detection — identifies common audio issues from signal statistics.
//!
//! [`ProblemDetector`] analyzes [`SignalStats`] and produces [`Problem`] instances
//! with severity levels and auto-fix suggestions.

use serde::{Deserialize, Serialize};

use chord_audio_graph::NodeId;
use chord_audio_graph::PortId;

use crate::stats::SignalStats;

/// Unique identifier for a detected problem.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ProblemId(pub u64);

/// Severity level of a detected problem.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Severity {
    /// Informational — not an issue, but worth noting.
    Info,
    /// Warning — potential issue that may degrade audio quality.
    Warning,
    /// Error — definite audio quality issue.
    Error,
    /// Critical — immediate action needed (e.g., NaN in signal path).
    Critical,
}

/// Category of a detected problem.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ProblemCategory {
    /// Signal exceeds 0 dBFS (samples > 1.0 or < -1.0).
    Clipping,
    /// Sudden large sample-to-sample discontinuity.
    Click,
    /// Excessive DC offset in the signal.
    DcOffset,
    /// NaN values detected in the signal.
    NaN,
    /// Infinity values detected in the signal.
    Infinity,
    /// Prolonged digital silence (all zeros).
    Silence,
    /// CPU usage spike for a node.
    CpuSpike,
    /// Buffer underrun detected.
    BufferUnderrun,
}

/// A suggested automatic fix for a detected problem.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AutoFix {
    /// Insert a gain node to reduce level.
    InsertGain(f64),
    /// Insert a DC blocker filter.
    InsertDcBlocker,
    /// Insert a limiter to prevent clipping.
    InsertLimiter,
    /// Mute the problematic node.
    MuteNode,
    /// Bypass the problematic node.
    BypassNode,
    /// Increase the audio buffer size.
    IncreaseBufferSize(u32),
}

/// A detected audio problem.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Problem {
    /// Unique problem identifier.
    pub id: ProblemId,
    /// How serious the problem is.
    pub severity: Severity,
    /// What kind of problem it is.
    pub category: ProblemCategory,
    /// Which node is affected.
    pub node_id: NodeId,
    /// Which port is affected (if applicable).
    pub port_id: Option<PortId>,
    /// Human-readable description.
    pub description: String,
    /// Suggested automatic fix (if available).
    pub auto_fix: Option<AutoFix>,
}

/// Configuration for the problem detector.
#[derive(Debug, Clone)]
pub struct DetectorConfig {
    /// DC offset threshold (absolute value). Default: 0.01.
    pub dc_offset_threshold: f32,
    /// Number of consecutive silent buffers before reporting silence. Default: 100.
    pub silence_buffer_threshold: u32,
    /// Click detection threshold (sample-to-sample delta). Default: 0.5.
    pub click_threshold: f32,
    /// Clipping sample count threshold before reporting. Default: 1.
    pub clip_count_threshold: u32,
}

impl Default for DetectorConfig {
    fn default() -> Self {
        Self {
            dc_offset_threshold: 0.01,
            silence_buffer_threshold: 100,
            click_threshold: 0.5,
            clip_count_threshold: 1,
        }
    }
}

/// Detects common audio problems from signal statistics.
///
/// Feed it [`SignalStats`] from the [`SignalMonitor`](crate::SignalMonitor)
/// and it will produce a list of [`Problem`] instances.
pub struct ProblemDetector {
    config: DetectorConfig,
    next_problem_id: u64,
}

impl ProblemDetector {
    /// Create a new problem detector with the given configuration.
    pub fn new(config: DetectorConfig) -> Self {
        Self {
            config,
            next_problem_id: 1,
        }
    }

    /// Allocate the next unique problem ID.
    fn next_id(&mut self) -> ProblemId {
        let id = ProblemId(self.next_problem_id);
        self.next_problem_id += 1;
        id
    }

    /// Analyze signal stats for a node/port and return any detected problems.
    pub fn analyze(
        &mut self,
        node_id: NodeId,
        port_id: PortId,
        stats: &SignalStats,
    ) -> Vec<Problem> {
        let mut problems = Vec::new();

        // NaN detection — Critical severity.
        if stats.has_nan {
            problems.push(Problem {
                id: self.next_id(),
                severity: Severity::Critical,
                category: ProblemCategory::NaN,
                node_id,
                port_id: Some(port_id),
                description: format!(
                    "NaN values detected in signal at Node({}) Port({})",
                    node_id.0, port_id.0
                ),
                auto_fix: Some(AutoFix::MuteNode),
            });
        }

        // Infinity detection — Critical severity.
        if stats.has_inf {
            problems.push(Problem {
                id: self.next_id(),
                severity: Severity::Critical,
                category: ProblemCategory::Infinity,
                node_id,
                port_id: Some(port_id),
                description: format!(
                    "Infinity values detected in signal at Node({}) Port({})",
                    node_id.0, port_id.0
                ),
                auto_fix: Some(AutoFix::MuteNode),
            });
        }

        // Clipping detection — Error severity.
        if stats.clip_count >= self.config.clip_count_threshold {
            let headroom_needed = if stats.peak > 1.0 {
                1.0 / stats.peak as f64
            } else {
                1.0
            };
            problems.push(Problem {
                id: self.next_id(),
                severity: Severity::Error,
                category: ProblemCategory::Clipping,
                node_id,
                port_id: Some(port_id),
                description: format!(
                    "Clipping detected: {} samples exceed 0 dBFS (peak: {:.2})",
                    stats.clip_count, stats.peak
                ),
                auto_fix: Some(AutoFix::InsertGain(headroom_needed)),
            });
        }

        // DC offset detection — Warning severity.
        if stats.dc_offset.abs() > self.config.dc_offset_threshold {
            problems.push(Problem {
                id: self.next_id(),
                severity: Severity::Warning,
                category: ProblemCategory::DcOffset,
                node_id,
                port_id: Some(port_id),
                description: format!(
                    "DC offset of {:.4} detected at Node({}) Port({})",
                    stats.dc_offset, node_id.0, port_id.0
                ),
                auto_fix: Some(AutoFix::InsertDcBlocker),
            });
        }

        // Click detection — Warning severity.
        if stats.click_count > 0 {
            problems.push(Problem {
                id: self.next_id(),
                severity: Severity::Warning,
                category: ProblemCategory::Click,
                node_id,
                port_id: Some(port_id),
                description: format!(
                    "{} click(s)/discontinuities detected at Node({}) Port({})",
                    stats.click_count, node_id.0, port_id.0
                ),
                auto_fix: Some(AutoFix::InsertLimiter),
            });
        }

        // Silence detection — Info severity.
        if stats.silent_buffer_count >= self.config.silence_buffer_threshold {
            problems.push(Problem {
                id: self.next_id(),
                severity: Severity::Info,
                category: ProblemCategory::Silence,
                node_id,
                port_id: Some(port_id),
                description: format!(
                    "Digital silence for {} consecutive buffers at Node({}) Port({})",
                    stats.silent_buffer_count, node_id.0, port_id.0
                ),
                auto_fix: Some(AutoFix::BypassNode),
            });
        }

        problems
    }

    /// Get the detector configuration.
    pub fn config(&self) -> &DetectorConfig {
        &self.config
    }
}

impl Default for ProblemDetector {
    fn default() -> Self {
        Self::new(DetectorConfig::default())
    }
}
