//! # chord-audio-graph
//!
//! The abstract graph data structure and compiler for the Chord audio programming environment.
//!
//! This crate knows nothing about audio — it only understands directed graphs with typed ports,
//! topological sorting, cycle detection, and compilation into execution orders. It is the
//! foundation everything else builds on.
//!
//! ## Key Types
//!
//! - [`Graph`] — The main graph container holding nodes and connections.
//! - [`NodeDescriptor`] — Description of a single node with typed input/output ports.
//! - [`Connection`] — A typed edge between two ports on two nodes.
//! - [`GraphCompiler`] — Compiles a [`Graph`] into a [`CompiledGraph`] with execution order,
//!   buffer layout, feedback detection, and parallel group identification.
//!
//! ## Example
//!
//! ```
//! use chord_audio_graph::*;
//!
//! let mut graph = Graph::new();
//! let osc = graph.add_node(NodeDescriptor::new("oscillator")
//!     .with_output(PortDescriptor::new("out", PortDataType::Audio)));
//! let gain = graph.add_node(NodeDescriptor::new("gain")
//!     .with_input(PortDescriptor::new("in", PortDataType::Audio))
//!     .with_output(PortDescriptor::new("out", PortDataType::Audio)));
//!
//! let osc_out = graph.node(&osc).unwrap().outputs[0].id;
//! let gain_in = graph.node(&gain).unwrap().inputs[0].id;
//! graph.connect(osc, osc_out, gain, gain_in).unwrap();
//!
//! let compiled = GraphCompiler::compile(&graph).unwrap();
//! assert_eq!(compiled.execution_order, vec![osc, gain]);
//! ```

mod types;
mod graph;
mod compiler;
pub mod patch_format;

pub use types::*;
pub use graph::*;
pub use compiler::*;
pub use patch_format::PatchFile;

#[cfg(test)]
mod tests;
