//! Shared application state for the Chord Tauri app.
//!
//! Holds the audio graph, DSP engine, node registry, audio I/O host,
//! and diagnostics engine in a single struct managed by Tauri's state system.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chord_audio_graph::{
    ConnectionId, Graph, NodeDescriptor, NodeId, ParameterDescriptor, PortDataType,
    PortDescriptor,
};
use chord_audio_io::{AudioHost, AudioStream};
use chord_diagnostics::{DiagnosticConfig, DiagnosticEngine};
use chord_dsp_runtime::{AudioEngine, AudioNode, EngineConfig};
use chord_node_library::NodeRegistry;

/// The central application state shared across all Tauri commands.
///
/// All fields are behind `Mutex` (or `Arc<Mutex>` for the engine, which is shared
/// with the CPAL audio callback) so commands can safely access them from any thread.
pub struct AppState {
    /// The abstract audio graph (nodes + connections).
    pub graph: Mutex<Graph>,
    /// Maps frontend string IDs to backend NodeIds.
    /// This eliminates the async race condition where the frontend needs
    /// to know the backend ID before it can make connection/parameter calls.
    pub frontend_id_map: Mutex<HashMap<String, NodeId>>,
    /// The real-time DSP engine, shared with the audio callback via Arc.
    pub engine: Arc<Mutex<AudioEngine>>,
    /// Registry of all available node types.
    pub registry: NodeRegistry,
    /// The CPAL audio host for device enumeration and stream creation.
    pub audio_host: Mutex<AudioHost>,
    /// The currently running audio stream (if any).
    pub audio_stream: Mutex<Option<AudioStream>>,
    /// The diagnostics engine for signal analysis.
    pub diagnostics: Mutex<DiagnosticEngine>,
    /// Map from graph NodeIds to instantiated AudioNode instances.
    /// These are registered into the engine when play() is called.
    pub node_instances: Mutex<HashMap<NodeId, Box<dyn AudioNode>>>,
    /// Map from frontend connection ID strings to the graph's ConnectionId.
    pub connection_ids: Mutex<HashMap<String, ConnectionId>>,
}

// SAFETY: AudioHost contains a cpal::Host which holds platform-specific audio
// backend state. On macOS (CoreAudio), Windows (WASAPI), and Linux (ALSA/PulseAudio),
// the cpal::Host is safe to send between threads — it is a handle to system audio
// resources that are internally synchronized by the OS audio subsystem.
// cpal::Host does not implement Send/Sync by default because some niche backends
// (e.g., ASIO on Windows) have thread-affinity requirements, but the default backends
// used on each platform are thread-safe. We wrap AudioHost in a Mutex, so only one
// thread accesses it at a time, making this safe in practice.
unsafe impl Send for AppState {}
unsafe impl Sync for AppState {}

impl AppState {
    /// Create a new `AppState` with default configuration.
    ///
    /// Initializes the node registry with all available waves, creates the
    /// audio engine, and sets up the diagnostics engine.
    pub fn new() -> Self {
        let registry = NodeRegistry::with_all();

        let engine_config = EngineConfig {
            sample_rate: 48000.0,
            buffer_size: 256,
            ..EngineConfig::default()
        };
        let engine = Arc::new(Mutex::new(AudioEngine::new(engine_config)));

        // AudioHost::new() should always succeed (CPAL default host).
        let audio_host = AudioHost::new().expect("Failed to initialize audio host");

        let diagnostics = DiagnosticEngine::new(DiagnosticConfig::default());

        Self {
            graph: Mutex::new(Graph::new()),
            frontend_id_map: Mutex::new(HashMap::new()),
            engine,
            registry,
            audio_host: Mutex::new(audio_host),
            audio_stream: Mutex::new(None),
            diagnostics: Mutex::new(diagnostics),
            node_instances: Mutex::new(HashMap::new()),
            connection_ids: Mutex::new(HashMap::new()),
        }
    }
}

/// Build a [`NodeDescriptor`] with the correct ports and parameters for a given node type.
///
/// This mirrors the MCP server's `build_node_descriptor` function. It defines the
/// graph-level metadata (ports, parameters) for each supported node type.
pub fn build_node_descriptor(node_type: &str) -> NodeDescriptor {
    match node_type {
        "oscillator" => NodeDescriptor::new("oscillator")
            .with_input(PortDescriptor::new("fm", PortDataType::Audio))
            .with_input(PortDescriptor::new("am", PortDataType::Audio))
            .with_input(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(
                ParameterDescriptor::new("frequency", "Frequency", 440.0, 0.1, 20000.0)
                    .with_unit("Hz"),
            )
            .with_parameter(
                ParameterDescriptor::new("detune", "Detune", 0.0, -1200.0, 1200.0)
                    .with_unit("cents"),
            )
            .with_parameter(ParameterDescriptor::new("waveform", "Waveform", 0.0, 0.0, 3.0)),

        "filter" => NodeDescriptor::new("filter")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(
                ParameterDescriptor::new("cutoff", "Cutoff", 1000.0, 20.0, 20000.0)
                    .with_unit("Hz"),
            )
            .with_parameter(ParameterDescriptor::new(
                "resonance",
                "Resonance",
                0.707,
                0.1,
                30.0,
            ))
            .with_parameter(ParameterDescriptor::new("mode", "Mode", 0.0, 0.0, 2.0)),

        "gain" => NodeDescriptor::new("gain")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("gain", "Gain", 1.0, 0.0, 10.0)),

        "envelope" => NodeDescriptor::new("envelope")
            .with_input(PortDescriptor::new("gate", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(
                ParameterDescriptor::new("attack", "Attack", 0.01, 0.0, 10.0).with_unit("s"),
            )
            .with_parameter(
                ParameterDescriptor::new("decay", "Decay", 0.1, 0.0, 10.0).with_unit("s"),
            )
            .with_parameter(ParameterDescriptor::new("sustain", "Sustain", 0.7, 0.0, 1.0))
            .with_parameter(
                ParameterDescriptor::new("release", "Release", 0.3, 0.0, 30.0).with_unit("s"),
            ),

        "lfo" => NodeDescriptor::new("lfo")
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(
                ParameterDescriptor::new("rate", "Rate", 1.0, 0.01, 100.0).with_unit("Hz"),
            )
            .with_parameter(ParameterDescriptor::new("depth", "Depth", 1.0, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("waveform", "Waveform", 0.0, 0.0, 3.0)),

        "mixer" => NodeDescriptor::new("mixer")
            .with_input(PortDescriptor::new("in1", PortDataType::Audio))
            .with_input(PortDescriptor::new("in2", PortDataType::Audio))
            .with_input(PortDescriptor::new("in3", PortDataType::Audio))
            .with_input(PortDescriptor::new("in4", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),

        "output" => NodeDescriptor::new("output")
            .with_input(PortDescriptor::new("in", PortDataType::Audio)),

        "midi_to_freq" => NodeDescriptor::new("midi_to_freq")
            .with_input(PortDescriptor::new("midi", PortDataType::Midi))
            .with_output(PortDescriptor::new("freq", PortDataType::Control))
            .with_output(PortDescriptor::new("gate", PortDataType::Control)),

        "delay" => NodeDescriptor::new("delay")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(
                ParameterDescriptor::new("time", "Delay Time", 0.5, 0.0, 5.0).with_unit("s"),
            )
            .with_parameter(ParameterDescriptor::new(
                "feedback", "Feedback", 0.3, 0.0, 0.99,
            ))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 0.5, 0.0, 1.0)),

        "reverb" => NodeDescriptor::new("reverb")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "room_size",
                "Room Size",
                0.5,
                0.0,
                1.0,
            ))
            .with_parameter(ParameterDescriptor::new("damping", "Damping", 0.5, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 0.3, 0.0, 1.0)),

        "compressor" => NodeDescriptor::new("compressor")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(
                ParameterDescriptor::new("threshold", "Threshold", -20.0, -60.0, 0.0)
                    .with_unit("dB"),
            )
            .with_parameter(ParameterDescriptor::new("ratio", "Ratio", 4.0, 1.0, 20.0))
            .with_parameter(
                ParameterDescriptor::new("attack", "Attack", 0.01, 0.001, 1.0).with_unit("s"),
            )
            .with_parameter(
                ParameterDescriptor::new("release", "Release", 0.1, 0.01, 2.0).with_unit("s"),
            ),

        "eq" => NodeDescriptor::new("eq")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(
                ParameterDescriptor::new("low_gain", "Low Gain", 0.0, -24.0, 24.0)
                    .with_unit("dB"),
            )
            .with_parameter(
                ParameterDescriptor::new("mid_gain", "Mid Gain", 0.0, -24.0, 24.0)
                    .with_unit("dB"),
            )
            .with_parameter(
                ParameterDescriptor::new("high_gain", "High Gain", 0.0, -24.0, 24.0)
                    .with_unit("dB"),
            ),

        "expression" => NodeDescriptor::new("expression")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(
                ParameterDescriptor::new("freq", "Frequency", 440.0, 0.1, 20000.0).with_unit("Hz"),
            )
            .with_parameter(ParameterDescriptor::new("param1", "Param 1", 0.5, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("param2", "Param 2", 0.5, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("preset", "Preset", 0.0, 0.0, 7.0)),

        "note_to_freq" => NodeDescriptor::new("note_to_freq")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_parameter(
                ParameterDescriptor::new("a4_freq", "Concert A", 440.0, 400.0, 480.0)
                    .with_unit("Hz"),
            ),

        "noise" => NodeDescriptor::new("noise")
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("color", "Color", 0.0, 0.0, 2.0)),

        "step_sequencer" => NodeDescriptor::new("step_sequencer")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("steps", "Steps", 8.0, 1.0, 32.0))
            .with_parameter(ParameterDescriptor::new("gate_length", "Gate Length", 0.5, 0.0, 1.0)),

        "gravity_sequencer" => NodeDescriptor::new("gravity_sequencer")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("gravity", "Gravity", 1.0, 0.01, 10.0))
            .with_parameter(ParameterDescriptor::new("num_particles", "Particles", 4.0, 1.0, 16.0))
            .with_parameter(ParameterDescriptor::new("scale", "Scale", 0.0, 0.0, 11.0)),

        "game_of_life_sequencer" => NodeDescriptor::new("game_of_life_sequencer")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("width", "Width", 16.0, 4.0, 32.0))
            .with_parameter(ParameterDescriptor::new("height", "Height", 8.0, 4.0, 16.0))
            .with_parameter(ParameterDescriptor::new("density", "Density", 0.3, 0.0, 1.0)),

        "markov_sequencer" => NodeDescriptor::new("markov_sequencer")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("randomness", "Randomness", 0.3, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("root_note", "Root Note", 60.0, 0.0, 127.0))
            .with_parameter(ParameterDescriptor::new("scale_type", "Scale", 0.0, 0.0, 3.0)),

        "polyrhythm" => NodeDescriptor::new("polyrhythm")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("a", PortDataType::Audio))
            .with_output(PortDescriptor::new("b", PortDataType::Audio))
            .with_output(PortDescriptor::new("c", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("pattern_a", "Pattern A", 3.0, 2.0, 16.0))
            .with_parameter(ParameterDescriptor::new("pattern_b", "Pattern B", 4.0, 2.0, 16.0))
            .with_parameter(ParameterDescriptor::new("pattern_c", "Pattern C", 5.0, 2.0, 16.0)),

        // Fallback: generic pass-through descriptor for unknown types.
        other => NodeDescriptor::new(other)
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),
    }
}
