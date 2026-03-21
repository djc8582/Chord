//! # chord-export-engine
//!
//! Compiles Chord audio graph patches into deployable packages for every platform:
//! web (WASM + JS/React), desktop standalone, DAW plugins (VST3/CLAP), game engines
//! (C API), mobile frameworks (iOS/Android), and command-line tools.
//!
//! ## Architecture
//!
//! The export pipeline has three phases:
//!
//! 1. **Validation** — compile the graph, run diagnostics, check for unsupported nodes per target.
//! 2. **Code generation** — produce target-specific source code and configuration files.
//! 3. **Build** — collect generated artifacts (actual compilation deferred to external toolchains).
//!
//! ## Example
//!
//! ```
//! use chord_export_engine::*;
//! use chord_audio_graph::*;
//!
//! let mut graph = Graph::new();
//! let osc = graph.add_node(
//!     NodeDescriptor::new("oscillator")
//!         .with_output(PortDescriptor::new("out", PortDataType::Audio))
//! );
//! let output = graph.add_node(
//!     NodeDescriptor::new("output")
//!         .with_input(PortDescriptor::new("in", PortDataType::Audio))
//! );
//! let osc_out = graph.node(&osc).unwrap().outputs[0].id;
//! let out_in = graph.node(&output).unwrap().inputs[0].id;
//! graph.connect(osc, osc_out, output, out_in).unwrap();
//!
//! let options = ExportOptions {
//!     target: ExportTarget::Standalone,
//!     sample_rate: 48000,
//!     buffer_size: 256,
//!     optimization_level: OptimizationLevel::Release,
//!     output_directory: "/tmp/export".to_string(),
//!     name: "my_synth".to_string(),
//!     include_gui: false,
//! };
//!
//! let result = ExportPipeline::run(&graph, &options).unwrap();
//! assert!(!result.artifacts.is_empty());
//! ```

mod codegen;
mod manifest;
mod pipeline;
mod target;
mod types;
mod validate;

pub use codegen::*;
pub use manifest::*;
pub use pipeline::*;
pub use target::*;
pub use types::*;
pub use validate::*;

// Re-export key dependency types for convenience.
pub use chord_audio_graph::{
    CompiledGraph, CompileError, Connection, Graph, GraphCompiler, NodeDescriptor, NodeId,
    ParameterDescriptor, PortDataType, PortDescriptor,
};
pub use chord_diagnostics::DiagnosticReport;

#[cfg(test)]
mod tests;
