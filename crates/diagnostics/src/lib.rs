//! # chord-diagnostics
//!
//! Real-time audio diagnostics and self-monitoring for the Chord audio programming environment.
//!
//! Hooks into the DSP processing pipeline, continuously analyzes signal health at every
//! connection, detects problems (clipping, clicks, NaN, DC offset, silence), and reports them.
//! Also includes a performance profiler and aggregated diagnostic reports.
//!
//! ## Design Goals
//!
//! - **< 0.1% CPU overhead**: Single-pass analysis piggybacks on the audio thread.
//! - **Lock-free reporting**: Stats written by audio thread, read by UI thread via snapshots.
//! - **Comprehensive detection**: Clipping, clicks, NaN/Inf, DC offset, digital silence.
//! - **Auto-fix suggestions**: Each detected problem includes a suggested fix.

pub mod analysis;
mod detector;
mod engine;
pub mod professional_check;
mod profiler;
mod report;
mod signal_monitor;
mod stats;

pub use analysis::{analyze, SoundAnalysis};
pub use detector::*;
pub use engine::*;
pub use professional_check::{sounds_professional_check, ProfessionalReport, QualityIssue, IssueSeverity};
pub use profiler::*;
pub use report::*;
pub use signal_monitor::*;
pub use stats::*;

// Re-export key types from dependencies for convenience.
pub use chord_audio_graph::{NodeId, PortId};
pub use chord_dsp_runtime::{AudioBuffer, AudioError};

#[cfg(test)]
mod tests;
