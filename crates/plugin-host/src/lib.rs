//! # chord-plugin-host
//!
//! Hosts VST3, CLAP, and AU audio plugins. Each plugin appears as an
//! [`AudioNode`](chord_dsp_runtime::AudioNode) in the graph.  Plugin scanning,
//! parameter bridging, state serialization, and (future) crash‐isolated
//! subprocess hosting are all provided.
//!
//! ## Initial implementation scope
//!
//! The full FFI layer for real VST3/CLAP/AU binary loading is *stubbed out*
//! with clear `TODO` markers.  What **does** work end‑to‑end right now:
//!
//! - **Plugin scanner** — finds `.vst3`, `.clap`, and `.component` bundles on disk.
//! - **Mock plugin** — a working [`AudioNode`] that can be used in tests and as a
//!   reference for the real loaders.
//! - **`PluginHostNode`** — wraps any [`PluginInstance`] (including the mock) as an
//!   `AudioNode`, bridging parameters, state, and process calls.
//! - **Parameter bridging** — exposes plugin parameters through the standard
//!   [`ParameterDescriptor`](chord_audio_graph::ParameterDescriptor) interface.

mod error;
mod format;
mod host_node;
mod instance;
mod mock_plugin;
mod parameters;
mod scanner;

pub use error::*;
pub use format::*;
pub use host_node::*;
pub use instance::*;
pub use mock_plugin::*;
pub use parameters::*;
pub use scanner::*;

// Re-export key dsp-runtime types used in our public API.
pub use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

#[cfg(test)]
mod tests;
