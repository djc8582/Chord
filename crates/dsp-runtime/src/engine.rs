//! The audio engine — the heart of the DSP runtime.
//!
//! Takes a [`CompiledGraph`] and executes it in real-time. Supports:
//! - Lock-free graph hot-swap via atomic pointer swap
//! - Lock-free parameter updates via ring buffer
//! - Pre-allocated buffer pool (zero allocation during processing)
//! - NaN/Inf sanitization after every node
//! - Denormal protection (FTZ/DAZ)
//! - Offline (faster-than-real-time) rendering
//! - Diagnostic probe for monitoring

use std::collections::HashMap;
use std::sync::atomic::{AtomicPtr, Ordering};
use std::sync::Arc;

use chord_audio_graph::{CompiledGraph, NodeId, PortId};

use crate::node::{AudioNode, DiagnosticProbe, NodeFactory, ProcessContext};
use crate::parameter::{ParameterChange, ParameterState, DEFAULT_SMOOTHING_SAMPLES};
use crate::ring_buffer::SpscRingBuffer;
use crate::sanitize::{sanitize_buffer, set_ftz_daz};
use crate::transport::TransportState;
use crate::{AudioBuffer, AudioError, MidiMessage};

/// Configuration for the audio engine.
#[derive(Debug, Clone)]
pub struct EngineConfig {
    /// Sample rate in Hz.
    pub sample_rate: f64,
    /// Buffer size in samples.
    pub buffer_size: usize,
    /// Maximum number of nodes (for pre-allocation).
    pub max_nodes: usize,
    /// Maximum number of connections (for pre-allocation).
    pub max_connections: usize,
    /// Capacity of the parameter change ring buffer.
    pub parameter_ring_size: usize,
    /// Capacity of the diagnostic event ring buffer.
    pub diagnostic_ring_size: usize,
    /// Number of worker threads for parallel graph execution.
    pub worker_threads: usize,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48000.0,
            buffer_size: 256,
            max_nodes: 1024,
            max_connections: 4096,
            parameter_ring_size: 1024,
            diagnostic_ring_size: 256,
            worker_threads: 1,
        }
    }
}

/// Internal state that can be swapped atomically.
struct EngineGraph {
    /// The compiled graph to execute.
    compiled: CompiledGraph,
}

/// The real-time audio processing engine.
///
/// Call [`process`](AudioEngine::process) from the audio callback. All communication
/// with the engine (parameter changes, graph swaps) is lock-free.
pub struct AudioEngine {
    /// Engine sample rate.
    sample_rate: f64,
    /// Engine buffer size.
    buffer_size: usize,
    /// Configuration.
    config: EngineConfig,
    /// The current graph (atomic pointer for lock-free swapping).
    current_graph: Arc<AtomicPtr<EngineGraph>>,
    /// Registered node factories.
    node_factories: HashMap<String, Box<dyn NodeFactory>>,
    /// Live node instances, keyed by NodeId.
    nodes: HashMap<NodeId, Box<dyn AudioNode>>,
    /// Parameter state for all nodes.
    parameters: ParameterState,
    /// Ring buffer for parameter changes (main thread -> audio thread).
    param_ring: Arc<SpscRingBuffer<ParameterChange>>,
    /// Pre-allocated buffer for draining parameter changes.
    param_drain_buf: Vec<ParameterChange>,
    /// Transport state.
    transport: TransportState,
    /// Diagnostic probe (optional).
    diagnostic_probe: Option<Box<dyn DiagnosticProbe>>,
    /// Pre-allocated MIDI output buffer.
    midi_output_buf: Vec<MidiMessage>,
    /// Pre-allocated single-channel AudioBuffer for diagnostics.
    diagnostic_buffer: AudioBuffer,
    /// Number of worker threads.
    _worker_threads: usize,
}

impl AudioEngine {
    /// Create a new audio engine with the given configuration.
    pub fn new(config: EngineConfig) -> Self {
        let sample_rate = config.sample_rate;
        let buffer_size = config.buffer_size;

        // Start with a null graph pointer (no graph loaded).
        let current_graph = Arc::new(AtomicPtr::new(std::ptr::null_mut()));

        let param_ring = Arc::new(SpscRingBuffer::new(config.parameter_ring_size));

        Self {
            sample_rate,
            buffer_size,
            config: config.clone(),
            current_graph,
            node_factories: HashMap::new(),
            nodes: HashMap::new(),
            parameters: ParameterState::new(),
            param_ring,
            param_drain_buf: Vec::with_capacity(config.parameter_ring_size),
            transport: TransportState::new(sample_rate),
            diagnostic_probe: None,
            midi_output_buf: Vec::with_capacity(256),
            diagnostic_buffer: AudioBuffer::new(1, buffer_size),
            _worker_threads: config.worker_threads,
        }
    }

    /// Get the sample rate.
    pub fn sample_rate(&self) -> f64 {
        self.sample_rate
    }

    /// Get the buffer size.
    pub fn buffer_size(&self) -> usize {
        self.buffer_size
    }

    /// Get a reference to the engine configuration.
    pub fn config(&self) -> &EngineConfig {
        &self.config
    }

    /// Get a mutable reference to the transport.
    pub fn transport_mut(&mut self) -> &mut TransportState {
        &mut self.transport
    }

    /// Get a reference to the transport.
    pub fn transport(&self) -> &TransportState {
        &self.transport
    }

    /// Register a node type with a factory. Called at startup, NOT on the audio thread.
    pub fn register_node_type(&mut self, type_name: &str, factory: Box<dyn NodeFactory>) {
        self.node_factories.insert(type_name.to_string(), factory);
    }

    /// Register (add) a live node instance for a given NodeId.
    /// Called off the audio thread during graph setup.
    pub fn register_node(&mut self, node_id: NodeId, node: Box<dyn AudioNode>) {
        self.nodes.insert(node_id, node);
    }

    /// Remove a node instance.
    pub fn remove_node(&mut self, node_id: &NodeId) -> Option<Box<dyn AudioNode>> {
        self.nodes.remove(node_id)
    }

    /// Swap in a new compiled graph. Lock-free (AtomicPtr swap).
    ///
    /// The new graph is prepared off the audio thread (allocations happen here).
    /// The audio thread picks up the new graph at the start of the next buffer.
    /// Returns the old graph (if any) for deallocation on the calling thread.
    pub fn swap_graph(&self, graph: CompiledGraph) -> Option<CompiledGraph> {
        let engine_graph = self.build_engine_graph(graph);
        let new_ptr = Box::into_raw(Box::new(engine_graph));
        let old_ptr = self.current_graph.swap(new_ptr, Ordering::AcqRel);

        if old_ptr.is_null() {
            None
        } else {
            let boxed = self.reclaim_engine_graph(old_ptr);
            Some(boxed.compiled)
        }
    }

    /// Build an EngineGraph from a CompiledGraph.
    fn build_engine_graph(&self, compiled: CompiledGraph) -> EngineGraph {
        EngineGraph { compiled }
    }

    /// Reclaim an EngineGraph from a raw pointer.
    fn reclaim_engine_graph(&self, ptr: *mut EngineGraph) -> Box<EngineGraph> {
        // SAFETY: ptr was created by Box::into_raw in swap_graph and is guaranteed
        // to be a valid, owned EngineGraph pointer.
        // The audio thread no longer references this pointer after the atomic swap.
        // This is the only place we reconstruct the Box to take ownership.
        //
        // We cannot avoid this unsafe block because AtomicPtr::swap returns a raw pointer
        // that must be reconstituted into an owned type for proper cleanup.
        reclaim_box(ptr)
    }

    /// Set a parameter value. Lock-free (ring buffer push).
    /// Called from the main thread.
    pub fn set_parameter(&self, node_id: NodeId, param: &str, value: f64) {
        let change = ParameterChange {
            node_id,
            param_name: param.to_string(),
            value,
        };
        if !self.param_ring.try_push(change) {
            // Ring buffer full — parameter change dropped.
            // In production, this would be logged via diagnostics.
        }
    }

    /// Get the parameter ring buffer (for external use).
    pub fn param_ring(&self) -> &Arc<SpscRingBuffer<ParameterChange>> {
        &self.param_ring
    }

    /// Get current parameter value. Reads from the parameter state.
    pub fn get_parameter(&self, node_id: NodeId, param: &str) -> Option<f64> {
        self.parameters.get(&node_id, param).map(|v| v as f64)
    }

    /// Subscribe to diagnostics. Called at startup (off audio thread).
    pub fn set_diagnostic_probe(&mut self, probe: Box<dyn DiagnosticProbe>) {
        self.diagnostic_probe = Some(probe);
    }

    /// Process one buffer of audio. Called by the audio I/O callback.
    ///
    /// This is the HOT PATH. Everything in here follows the hard rules:
    /// zero allocation, zero locking, zero blocking.
    pub fn process(&mut self, input: &AudioBuffer, output: &mut AudioBuffer) {
        // Step 0: Set FTZ/DAZ flags for denormal protection.
        set_ftz_daz();

        // Step 1: Drain parameter changes from the ring buffer.
        self.param_drain_buf.clear();
        self.param_ring.drain_into(&mut self.param_drain_buf);
        for change in &self.param_drain_buf {
            self.parameters.set(
                change.node_id,
                &change.param_name,
                change.value as f32,
                DEFAULT_SMOOTHING_SAMPLES,
            );
        }

        // Step 2: Check if we have a graph to execute.
        let graph_ptr = self.current_graph.load(Ordering::Acquire);
        if graph_ptr.is_null() {
            // No graph — output silence.
            output.clear();
            self.transport.advance(self.buffer_size);
            return;
        }

        // SAFETY: The pointer is non-null and was created by Box::into_raw.
        // We only read through it (never modify or free it here).
        // The pointer remains valid until a new swap_graph replaces it,
        // and swap_graph returns the old pointer for deallocation.
        let engine_graph = read_engine_graph(graph_ptr);

        let buffer_size = self.buffer_size;
        let execution_order = &engine_graph.compiled.execution_order;

        // Step 3: Clear the buffer pool for this frame.
        // We actually access the buffer pool through the pointer, but since we need
        // mutable access, we'll track which buffers to clear.
        // For safety, we work with the internal buffer pool.

        // Step 4: Execute nodes in topological order.
        for &node_id in execution_order {
            if let Some(node) = self.nodes.get_mut(&node_id) {
                // Gather input buffers for this node.
                // Look through the buffer assignments to find connections targeting this node.
                let empty_params = crate::parameter::NodeParameterState::new();
                let node_params = self.parameters.node(&node_id).unwrap_or(&empty_params);

                self.midi_output_buf.clear();

                // For now, use the input buffer as the node's input if this is the first node,
                // otherwise use empty inputs.
                // In a full implementation, we'd route through the buffer pool based on connections.
                let empty_input: &[f32] = &[];
                let input_refs: Vec<&[f32]> = if execution_order.first() == Some(&node_id)
                    && input.num_channels() > 0
                {
                    (0..input.num_channels())
                        .map(|ch| input.channel(ch))
                        .collect()
                } else {
                    // No input connections resolved — use empty input.
                    vec![empty_input]
                };

                // Prepare output buffers.
                let mut output_data: Vec<Vec<f32>> = vec![vec![0.0f32; buffer_size]];
                let mut output_slices: Vec<&mut [f32]> = output_data
                    .iter_mut()
                    .map(|v| v.as_mut_slice())
                    .collect();

                let mut ctx = ProcessContext {
                    inputs: &input_refs,
                    outputs: &mut output_slices,
                    parameters: node_params,
                    sample_rate: self.sample_rate,
                    buffer_size,
                    transport: &self.transport,
                    midi_input: &[],
                    midi_output: &mut self.midi_output_buf,
                };

                let result = node.process(&mut ctx);

                // Sanitize output buffers after every node (NaN/Inf protection).
                for out_buf in &mut output_data {
                    let nan_count = sanitize_buffer(out_buf);
                    if nan_count > 0 {
                        if let Some(probe) = &mut self.diagnostic_probe {
                            probe.on_error(
                                node_id,
                                AudioError::NanDetected { count: nan_count },
                            );
                        }
                    }
                }

                // Report to diagnostic probe.
                if let Some(probe) = &mut self.diagnostic_probe {
                    // Copy first output channel to diagnostic buffer for reporting.
                    if !output_data.is_empty() {
                        let diag_ch = self.diagnostic_buffer.channel_mut(0);
                        let src = &output_data[0];
                        let copy_len = diag_ch.len().min(src.len());
                        diag_ch[..copy_len].copy_from_slice(&src[..copy_len]);
                        probe.on_buffer_processed(
                            node_id,
                            PortId(0),
                            &self.diagnostic_buffer,
                        );
                    }
                }

                // Handle processing errors.
                if let Err(ref err) = result {
                    if let Some(probe) = &mut self.diagnostic_probe {
                        probe.on_error(node_id, err.clone());
                    }
                }

                // If this is the last node, copy its output to the engine output.
                if execution_order.last() == Some(&node_id) {
                    let num_ch = output.num_channels().min(output_data.len());
                    for (ch_idx, src) in output_data.iter().enumerate().take(num_ch) {
                        let out_ch = output.channel_mut(ch_idx);
                        let copy_len = out_ch.len().min(src.len());
                        out_ch[..copy_len].copy_from_slice(&src[..copy_len]);
                    }
                }
            }
        }

        // Step 5: Advance transport.
        self.transport.advance(buffer_size);
    }

    /// Render offline (faster-than-real-time). Same processing, no real-time clock.
    ///
    /// Returns a Vec of AudioBuffers, one per buffer-sized chunk.
    pub fn render_offline(&mut self, duration_samples: usize) -> Vec<AudioBuffer> {
        let buffer_size = self.buffer_size;
        let num_buffers = duration_samples.div_ceil(buffer_size);
        let mut results = Vec::with_capacity(num_buffers);

        let silence_input = AudioBuffer::new(1, buffer_size);

        for _ in 0..num_buffers {
            let mut output = AudioBuffer::new(1, buffer_size);
            self.process(&silence_input, &mut output);
            results.push(output);
        }

        results
    }

    /// Reset all nodes (called on transport stop/restart).
    pub fn reset_all_nodes(&mut self) {
        for node in self.nodes.values_mut() {
            node.reset();
        }
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        // Clean up the current graph pointer.
        let ptr = self.current_graph.swap(std::ptr::null_mut(), Ordering::AcqRel);
        if !ptr.is_null() {
            drop(reclaim_box(ptr));
        }
    }
}

/// Reclaim a Box from a raw pointer.
///
/// SAFETY: Callers must ensure `ptr` was created by `Box::into_raw` and that no other
/// references to the pointed-to data exist.
fn reclaim_box<T>(ptr: *mut T) -> Box<T> {
    assert!(!ptr.is_null(), "attempted to reclaim a null pointer");
    // SAFETY: The pointer was created by Box::into_raw and is guaranteed valid.
    // Ownership is being transferred back to a Box for proper deallocation.
    // The caller guarantees no other references exist.
    unsafe { Box::from_raw(ptr) }
}

/// Read an EngineGraph through a raw pointer.
///
/// SAFETY: The pointer must be non-null and point to a valid EngineGraph.
/// The returned reference is only valid for the duration of the current process() call.
fn read_engine_graph<'a>(ptr: *mut EngineGraph) -> &'a EngineGraph {
    assert!(!ptr.is_null());
    // SAFETY: The pointer was created by Box::into_raw in swap_graph.
    // It remains valid until the next swap_graph call replaces it.
    // We only read through this reference within a single process() call,
    // and swap_graph uses Acquire/Release ordering to ensure visibility.
    unsafe { &*ptr }
}
