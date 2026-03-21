//! Core types for the export engine.

use serde::{Deserialize, Serialize};
use std::fmt;

/// The platform/format to export to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ExportTarget {
    /// WebAssembly + JavaScript/TypeScript bindings (AudioWorklet + React component).
    Web,
    /// Native desktop binary (Rust + CPAL audio output).
    Desktop,
    /// VST3 DAW plugin.
    VST3,
    /// CLAP DAW plugin.
    CLAP,
    /// Game engine integration (C header + static/dynamic library).
    GameEngine,
    /// Mobile framework (iOS xcframework / Android JNI .so).
    MobileFramework,
    /// Standalone command-line tool with audio output.
    Standalone,
}

impl fmt::Display for ExportTarget {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Web => write!(f, "Web (WASM + JS)"),
            Self::Desktop => write!(f, "Desktop (Native)"),
            Self::VST3 => write!(f, "VST3 Plugin"),
            Self::CLAP => write!(f, "CLAP Plugin"),
            Self::GameEngine => write!(f, "Game Engine (C API)"),
            Self::MobileFramework => write!(f, "Mobile Framework"),
            Self::Standalone => write!(f, "Standalone CLI"),
        }
    }
}

impl ExportTarget {
    /// Return all available export targets.
    pub fn all() -> Vec<ExportTarget> {
        vec![
            Self::Web,
            Self::Desktop,
            Self::VST3,
            Self::CLAP,
            Self::GameEngine,
            Self::MobileFramework,
            Self::Standalone,
        ]
    }
}

/// Optimization level for the exported build.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum OptimizationLevel {
    /// No optimizations, fast compile, includes debug info.
    Debug,
    /// Full optimizations for performance.
    Release,
    /// Optimize for smallest binary size.
    Size,
}

impl fmt::Display for OptimizationLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Debug => write!(f, "Debug"),
            Self::Release => write!(f, "Release"),
            Self::Size => write!(f, "Size"),
        }
    }
}

/// Configuration for an export operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    /// Which platform/format to target.
    pub target: ExportTarget,
    /// Audio sample rate in Hz.
    pub sample_rate: u32,
    /// Audio buffer size in samples.
    pub buffer_size: u32,
    /// Compiler optimization level.
    pub optimization_level: OptimizationLevel,
    /// Directory where exported files should be written.
    pub output_directory: String,
    /// Name of the exported project/plugin.
    pub name: String,
    /// Whether to include GUI/visualizer in the export.
    pub include_gui: bool,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            target: ExportTarget::Standalone,
            sample_rate: 48000,
            buffer_size: 256,
            optimization_level: OptimizationLevel::Release,
            output_directory: "./export".to_string(),
            name: "chord_patch".to_string(),
            include_gui: false,
        }
    }
}

/// A single generated artifact (file) from the export process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportArtifact {
    /// Filename (relative to the output directory).
    pub filename: String,
    /// File content as a string.
    pub content: String,
}

/// The successful result of an export operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    /// All generated artifacts (files).
    pub artifacts: Vec<ExportArtifact>,
    /// Export manifest with metadata.
    pub manifest: crate::manifest::ExportManifest,
}

/// Errors that can occur during the export process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportError {
    /// The graph failed to compile.
    CompilationFailed(String),
    /// Diagnostics found critical problems that prevent export.
    DiagnosticErrors(Vec<String>),
    /// One or more node types are not supported on the chosen target.
    UnsupportedNodes {
        target: ExportTarget,
        node_types: Vec<String>,
    },
    /// Code generation failed.
    CodegenFailed(String),
    /// The graph is empty and cannot be exported.
    EmptyGraph,
}

impl fmt::Display for ExportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CompilationFailed(msg) => write!(f, "Graph compilation failed: {msg}"),
            Self::DiagnosticErrors(errs) => {
                write!(f, "Diagnostic errors: {}", errs.join("; "))
            }
            Self::UnsupportedNodes { target, node_types } => {
                write!(
                    f,
                    "Unsupported node types for {target}: {}",
                    node_types.join(", ")
                )
            }
            Self::CodegenFailed(msg) => write!(f, "Code generation failed: {msg}"),
            Self::EmptyGraph => write!(f, "Cannot export an empty graph"),
        }
    }
}

impl std::error::Error for ExportError {}
