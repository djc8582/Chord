//! The AudioNode trait and ProcessContext.
//!
//! Every audio processing node implements the [`AudioNode`] trait. The [`ProcessContext`]
//! provides all the information a node needs during its `process()` call: input/output
//! buffers, parameters, sample rate, transport state, and MIDI data.

use crate::parameter::NodeParameterState;
use crate::transport::TransportState;
use crate::{AudioBuffer, AudioError, MidiMessage, ProcessResult};

use chord_audio_graph::{NodeId, PortId};

/// Context provided to each node during processing.
///
/// Contains references to input/output buffers, parameters, timing info, and MIDI.
/// All buffers are pre-allocated — the node only reads and writes into existing slices.
pub struct ProcessContext<'a> {
    /// Input buffers: `inputs[port_index][sample]`.
    /// Each inner slice has `buffer_size` samples.
    pub inputs: &'a [&'a [f32]],
    /// Output buffers: `outputs[port_index][sample]`.
    /// Each inner slice has `buffer_size` samples.
    pub outputs: &'a mut [&'a mut [f32]],
    /// The node's current parameter values.
    pub parameters: &'a NodeParameterState,
    /// Current sample rate in Hz.
    pub sample_rate: f64,
    /// Current buffer size in samples.
    pub buffer_size: usize,
    /// Current transport state (position, tempo, time signature, etc.).
    pub transport: &'a TransportState,
    /// Incoming MIDI messages for this buffer.
    pub midi_input: &'a [MidiMessage],
    /// Outgoing MIDI messages. Pre-allocated with capacity; nodes push messages here.
    pub midi_output: &'a mut Vec<MidiMessage>,
}

/// The core audio processing trait.
///
/// Every node in the audio graph implements this trait. The `process()` method runs on
/// the audio thread and MUST follow all hard rules:
///
/// - **Zero allocation**: only read/write pre-allocated buffers.
/// - **Zero locking**: no mutexes, no blocking I/O.
/// - **Zero blocking**: process and return immediately.
/// - **Sample rate independence**: use `ctx.sample_rate`, never hardcode.
/// - **Buffer size independence**: use `ctx.buffer_size`, never assume a fixed size.
pub trait AudioNode: Send + 'static {
    /// Process one buffer of audio. This runs on the audio thread.
    ///
    /// Read from `ctx.inputs`, write to `ctx.outputs`, and return a status.
    /// MUST follow all hard rules (no allocation, no locks, no blocking).
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult;

    /// Reset internal state (called on transport stop/restart).
    ///
    /// Clear any delay lines, filter states, oscillator phases, etc.
    fn reset(&mut self);

    /// Report latency in samples (for latency compensation).
    ///
    /// Returns 0 by default (no latency). Override for nodes that introduce
    /// processing delay (e.g., look-ahead limiters, FFT-based processors).
    fn latency(&self) -> u32 {
        0
    }

    /// Report tail length in samples (reverb/delay tails).
    ///
    /// Returns 0 by default (no tail). Override for nodes that continue producing
    /// output after input stops (e.g., reverb, delay).
    fn tail_length(&self) -> u32 {
        0
    }
}

/// Hooks for monitoring the audio processing pipeline.
///
/// Implement this trait to receive notifications about buffer processing and errors.
/// The probe is called from the audio thread, so implementations must be fast and
/// avoid allocation/blocking.
pub trait DiagnosticProbe: Send {
    /// Called after each node processes a buffer.
    fn on_buffer_processed(&mut self, node_id: NodeId, port: PortId, buffer: &AudioBuffer);

    /// Called when a node produces an error (e.g., NaN detection).
    fn on_error(&mut self, node_id: NodeId, error: AudioError);

    /// Called after each node's process() call with the elapsed wall-clock time.
    /// Default implementation is a no-op so existing implementations don't break.
    fn on_node_timing(&mut self, _node_id: NodeId, _duration: std::time::Duration) {}

    /// Called after all nodes in a buffer cycle have been processed.
    /// `buffer_duration` is the real-time duration of the buffer (buffer_size / sample_rate).
    /// Default implementation is a no-op so existing implementations don't break.
    fn on_buffer_complete(&mut self, _buffer_duration: std::time::Duration) {}
}

/// Factory for creating audio node instances.
///
/// Registered at startup via `AudioEngine::register_node_type`.
/// Called off the audio thread to instantiate new nodes.
pub trait NodeFactory: Send {
    /// Create a new instance of this node type.
    fn create(&self) -> Box<dyn AudioNode>;
}

impl<F> NodeFactory for F
where
    F: Fn() -> Box<dyn AudioNode> + Send,
{
    fn create(&self) -> Box<dyn AudioNode> {
        (self)()
    }
}
