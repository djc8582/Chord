//! # chord-testing-framework
//!
//! Audio testing assertions and utilities for the Chord audio programming environment.
//!
//! Provides:
//! - **Audio assertions** (`assert_silent`, `assert_not_silent`, `assert_peak_below`, etc.)
//! - **Snapshot testing** for regression testing of audio output
//! - **AudioTestHarness** for setting up test graphs without boilerplate
//! - **Test node helpers** (sine source, silence source, passthrough, null output)
//! - **Simple DFT / Goertzel** for frequency analysis in tests

mod assertions;
mod dft;
mod harness;
mod helpers;
mod snapshot;

pub use assertions::*;
pub use dft::*;
pub use harness::*;
pub use helpers::*;
pub use snapshot::*;

// Re-export commonly needed types from dependencies.
pub use chord_audio_graph::{
    CompiledGraph, Graph, GraphCompiler, NodeDescriptor, NodeId, PortDataType, PortDescriptor,
    PortId,
};
pub use chord_dsp_runtime::{AudioBuffer, AudioEngine, AudioNode, EngineConfig, ProcessContext};

#[cfg(test)]
mod tests;
