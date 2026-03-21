//! AudioTestHarness — sets up a test graph with nodes, processes N buffers,
//! and collects output. Convenience for writing audio tests without boilerplate.

use chord_audio_graph::{
    CompiledGraph, Graph, GraphCompiler, NodeDescriptor, NodeId, PortDataType, PortDescriptor,
};
use chord_dsp_runtime::{AudioBuffer, AudioEngine, AudioNode, EngineConfig};

/// A test harness for audio processing graphs.
///
/// Provides a convenient builder API for constructing audio graphs, registering
/// node instances, processing buffers, and collecting output for assertions.
///
/// # Example
///
/// ```ignore
/// use chord_testing_framework::*;
///
/// let mut harness = AudioTestHarness::new(48000.0, 256);
/// let sine_id = harness.add_source("sine");
/// let out_id = harness.add_sink("output");
/// harness.connect(sine_id, out_id);
/// harness.set_node(sine_id, Box::new(SineSource::new(440.0, 0.8)));
/// harness.set_node(out_id, Box::new(Passthrough::new()));
///
/// let output = harness.process_n_buffers(10);
/// assert_not_silent(&output[0]);
/// ```
pub struct AudioTestHarness {
    /// The underlying audio graph.
    graph: Graph,
    /// Node instances to register with the engine.
    node_instances: Vec<(NodeId, Box<dyn AudioNode>)>,
    /// Sample rate for the engine.
    sample_rate: f64,
    /// Buffer size for the engine.
    buffer_size: usize,
}

impl AudioTestHarness {
    /// Create a new test harness with the given sample rate and buffer size.
    pub fn new(sample_rate: f64, buffer_size: usize) -> Self {
        Self {
            graph: Graph::new(),
            node_instances: Vec::new(),
            sample_rate,
            buffer_size,
        }
    }

    /// Create a new test harness with default settings (48kHz, 256 samples).
    pub fn default_config() -> Self {
        Self::new(48000.0, 256)
    }

    /// Add a source node (has an output port, no input port).
    /// Returns the NodeId for further use.
    pub fn add_source(&mut self, node_type: &str) -> NodeId {
        let descriptor = NodeDescriptor::new(node_type)
            .with_output(PortDescriptor::new("out", PortDataType::Audio));
        self.graph.add_node(descriptor)
    }

    /// Add a processor node (has one input port and one output port).
    /// Returns the NodeId.
    pub fn add_processor(&mut self, node_type: &str) -> NodeId {
        let descriptor = NodeDescriptor::new(node_type)
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio));
        self.graph.add_node(descriptor)
    }

    /// Add a sink node (has an input port, no output port).
    /// Returns the NodeId.
    pub fn add_sink(&mut self, node_type: &str) -> NodeId {
        let descriptor = NodeDescriptor::new(node_type)
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio));
        self.graph.add_node(descriptor)
    }

    /// Connect the output of `from_node` to the input of `to_node`.
    ///
    /// Uses the first output port of `from_node` and the first input port of `to_node`.
    pub fn connect(&mut self, from_node: NodeId, to_node: NodeId) {
        let from_port = self
            .graph
            .node(&from_node)
            .expect("from_node not found")
            .outputs[0]
            .id;
        let to_port = self
            .graph
            .node(&to_node)
            .expect("to_node not found")
            .inputs[0]
            .id;
        self.graph
            .connect(from_node, from_port, to_node, to_port)
            .expect("Failed to connect nodes");
    }

    /// Register an AudioNode instance for a given NodeId.
    ///
    /// This node will be used during processing when the engine reaches that
    /// node in the execution order.
    pub fn set_node(&mut self, node_id: NodeId, node: Box<dyn AudioNode>) {
        self.node_instances.push((node_id, node));
    }

    /// Get a reference to the underlying graph for manual manipulation.
    pub fn graph(&self) -> &Graph {
        &self.graph
    }

    /// Get a mutable reference to the underlying graph.
    pub fn graph_mut(&mut self) -> &mut Graph {
        &mut self.graph
    }

    /// Compile the graph, build the engine, process N buffers, and return collected output.
    ///
    /// Returns a `Vec<AudioBuffer>`, one per buffer processed.
    pub fn process_n_buffers(&mut self, num_buffers: usize) -> Vec<AudioBuffer> {
        let compiled = GraphCompiler::compile(&self.graph).expect("Graph compilation failed");
        self.process_with_compiled(compiled, num_buffers)
    }

    /// Process N buffers with an explicitly provided CompiledGraph.
    pub fn process_with_compiled(
        &mut self,
        compiled: CompiledGraph,
        num_buffers: usize,
    ) -> Vec<AudioBuffer> {
        let config = EngineConfig {
            sample_rate: self.sample_rate,
            buffer_size: self.buffer_size,
            ..EngineConfig::default()
        };

        let mut engine = AudioEngine::new(config);

        // Register node instances.
        for (node_id, node) in self.node_instances.drain(..) {
            engine.register_node(node_id, node);
        }

        // Swap in the compiled graph.
        engine.swap_graph(compiled);

        // Process buffers.
        let silence_input = AudioBuffer::new(1, self.buffer_size);
        let mut results = Vec::with_capacity(num_buffers);

        for _ in 0..num_buffers {
            let mut output = AudioBuffer::new(1, self.buffer_size);
            engine.process(&silence_input, &mut output);
            results.push(output);
        }

        results
    }

    /// Convenience: add a source node with a SineSource and return the NodeId.
    pub fn add_sine_source(&mut self, frequency: f64, amplitude: f32) -> NodeId {
        let node_id = self.add_source("test_sine");
        let sine = crate::helpers::SineSource::new(frequency, amplitude);
        self.set_node(node_id, Box::new(sine));
        node_id
    }

    /// Convenience: add a sink node with a Passthrough and return the NodeId.
    pub fn add_passthrough_sink(&mut self) -> NodeId {
        let node_id = self.add_sink("test_output");
        let passthrough = crate::helpers::Passthrough::new();
        self.set_node(node_id, Box::new(passthrough));
        node_id
    }

    /// Convenience: add a processor node with a Passthrough and return the NodeId.
    pub fn add_passthrough_processor(&mut self) -> NodeId {
        let node_id = self.add_processor("test_passthrough");
        let passthrough = crate::helpers::Passthrough::new();
        self.set_node(node_id, Box::new(passthrough));
        node_id
    }

    /// Get the sample rate.
    pub fn sample_rate(&self) -> f64 {
        self.sample_rate
    }

    /// Get the buffer size.
    pub fn buffer_size(&self) -> usize {
        self.buffer_size
    }
}
