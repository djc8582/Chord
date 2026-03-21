//! Aggregated diagnostic report.
//!
//! [`DiagnosticReport`] combines signal stats, detected problems, and performance data
//! into a single serializable structure suitable for display in the UI or export.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::detector::Problem;
use crate::profiler::CpuProfile;
use crate::stats::SignalStats;

/// An aggregated diagnostic report combining all diagnostic data.
///
/// This is the primary output of [`DiagnosticEngine::run_full_diagnostic`](crate::DiagnosticEngine::run_full_diagnostic).
/// It is serializable with serde for transmission to the frontend or export.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticReport {
    /// Per-node/port signal statistics. Key is "node_id:port_id".
    pub signal_stats: HashMap<String, SignalStats>,
    /// All detected problems.
    pub problems: Vec<Problem>,
    /// CPU performance profile.
    pub cpu_profile: CpuProfile,
    /// Summary statistics.
    pub summary: ReportSummary,
}

/// Summary statistics for the diagnostic report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportSummary {
    /// Total number of nodes being monitored.
    pub monitored_nodes: usize,
    /// Total number of problems detected.
    pub total_problems: usize,
    /// Number of critical problems.
    pub critical_count: usize,
    /// Number of error-level problems.
    pub error_count: usize,
    /// Number of warning-level problems.
    pub warning_count: usize,
    /// Number of info-level problems.
    pub info_count: usize,
    /// Overall health score (0.0 = many problems, 1.0 = perfect).
    pub health_score: f64,
}

impl DiagnosticReport {
    /// Create a new empty report.
    pub fn new() -> Self {
        Self {
            signal_stats: HashMap::new(),
            problems: Vec::new(),
            cpu_profile: CpuProfile {
                dsp_load_percent: 0.0,
                node_times: HashMap::new(),
                underrun_count: 0,
                buffer_duration_us: 0.0,
                total_process_time_us: 0.0,
            },
            summary: ReportSummary {
                monitored_nodes: 0,
                total_problems: 0,
                critical_count: 0,
                error_count: 0,
                warning_count: 0,
                info_count: 0,
                health_score: 1.0,
            },
        }
    }

    /// Compute summary statistics from the current problems list.
    pub fn compute_summary(&mut self) {
        use crate::detector::Severity;

        let total = self.problems.len();
        let mut critical = 0;
        let mut errors = 0;
        let mut warnings = 0;
        let mut infos = 0;

        for p in &self.problems {
            match p.severity {
                Severity::Critical => critical += 1,
                Severity::Error => errors += 1,
                Severity::Warning => warnings += 1,
                Severity::Info => infos += 1,
            }
        }

        // Health score: 1.0 = no problems, decreasing with severity-weighted problems.
        // Critical = -0.3, Error = -0.15, Warning = -0.05, Info = -0.01
        let penalty = critical as f64 * 0.3
            + errors as f64 * 0.15
            + warnings as f64 * 0.05
            + infos as f64 * 0.01;
        let health = (1.0 - penalty).max(0.0);

        self.summary = ReportSummary {
            monitored_nodes: self.signal_stats.len(),
            total_problems: total,
            critical_count: critical,
            error_count: errors,
            warning_count: warnings,
            info_count: infos,
            health_score: health,
        };
    }
}

impl Default for DiagnosticReport {
    fn default() -> Self {
        Self::new()
    }
}
