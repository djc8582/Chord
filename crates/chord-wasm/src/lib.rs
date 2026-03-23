//! # chord-wasm
//!
//! WebAssembly wrapper for the Chord audio engine. Compiles the real Rust DSP engine
//! to WASM via wasm-bindgen, replacing any simulated web audio with the actual engine
//! running in the browser's AudioWorklet.
//!
//! ## Usage from JavaScript
//!
//! ```js
//! import init, { ChordEngine } from './chord_wasm.js';
//! await init();
//!
//! const engine = new ChordEngine(48000, 128);
//! const osc = engine.add_node("oscillator");
//! const out = engine.add_node("output");
//! engine.connect(osc, "out", out, "in");
//! engine.set_parameter(osc, "frequency", 440.0);
//! engine.play();
//!
//! // In AudioWorklet's process() callback:
//! engine.process(outputBuffer);
//! ```

use wasm_bindgen::prelude::*;

use chord_audio_graph::{
    Graph, GraphCompiler, NodeDescriptor, NodeId, ParameterDescriptor, PortDataType,
    PortDescriptor,
};
use chord_dsp_runtime::{AudioBuffer, AudioEngine, EngineConfig};
use chord_node_library::NodeRegistry;

use std::collections::HashMap;

#[wasm_bindgen]
pub struct ChordEngine {
    graph: Graph,
    engine: AudioEngine,
    registry: NodeRegistry,
    sample_rate: f64,
    buffer_size: usize,
    /// Map from string IDs (for JS interop) to internal NodeId.
    node_map: HashMap<String, NodeId>,
    next_id: u32,
}

#[wasm_bindgen]
impl ChordEngine {
    /// Create a new ChordEngine. Called once from JS.
    ///
    /// `sample_rate` — the AudioContext sample rate (e.g. 48000).
    /// `buffer_size` — the AudioWorklet render quantum (typically 128).
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f64, buffer_size: usize) -> Self {
        let config = EngineConfig {
            sample_rate,
            buffer_size,
            ..Default::default()
        };
        Self {
            graph: Graph::new(),
            engine: AudioEngine::new(config),
            registry: NodeRegistry::with_all(),
            sample_rate,
            buffer_size,
            node_map: HashMap::new(),
            next_id: 1,
        }
    }

    /// Add a node to the graph. Returns a string ID for use in JS.
    ///
    /// Supported types: "oscillator", "filter", "gain", "delay", "reverb",
    /// "lfo", "noise", "mixer", "output", "envelope", "kick_drum", "snare_drum",
    /// "hi_hat", "clap", "tom", "step_sequencer", "euclidean",
    /// "markov_sequencer", "gravity_sequencer", and more.
    pub fn add_node(&mut self, node_type: &str) -> String {
        let id = format!("n{}", self.next_id);
        self.next_id += 1;

        let descriptor = build_descriptor(node_type);
        let node_id = descriptor.id;
        self.graph.add_node(descriptor);

        // Create the real DSP node instance from the registry.
        if let Some(audio_node) = self.registry.create(node_type) {
            self.engine.register_node(node_id, audio_node);
        }

        self.node_map.insert(id.clone(), node_id);
        self.recompile();
        id
    }

    /// Remove a node from the graph.
    pub fn remove_node(&mut self, id: &str) {
        if let Some(node_id) = self.node_map.remove(id) {
            self.graph.remove_node(&node_id);
            self.engine.remove_node(&node_id);
            self.recompile();
        }
    }

    /// Connect two nodes by their string IDs and port names.
    /// Returns true on success, false if the connection failed.
    pub fn connect(
        &mut self,
        from_id: &str,
        from_port: &str,
        to_id: &str,
        to_port: &str,
    ) -> bool {
        let from_nid = match self.node_map.get(from_id) {
            Some(id) => *id,
            None => return false,
        };
        let to_nid = match self.node_map.get(to_id) {
            Some(id) => *id,
            None => return false,
        };

        // Look up port IDs by name on each node's descriptor.
        let from_port_id = match self
            .graph
            .node(&from_nid)
            .and_then(|n| n.outputs.iter().find(|p| p.name == from_port).map(|p| p.id))
        {
            Some(id) => id,
            None => return false,
        };
        let to_port_id = match self
            .graph
            .node(&to_nid)
            .and_then(|n| n.inputs.iter().find(|p| p.name == to_port).map(|p| p.id))
        {
            Some(id) => id,
            None => return false,
        };

        match self
            .graph
            .connect(from_nid, from_port_id, to_nid, to_port_id)
        {
            Ok(_) => {
                self.recompile();
                true
            }
            Err(_) => false,
        }
    }

    /// Set a parameter on a node.
    pub fn set_parameter(&self, id: &str, param: &str, value: f64) {
        if let Some(&node_id) = self.node_map.get(id) {
            self.engine.set_parameter(node_id, param, value);
        }
    }

    /// Get a parameter value from a node. Returns 0.0 if not found.
    pub fn get_parameter(&self, id: &str, param: &str) -> f64 {
        if let Some(&node_id) = self.node_map.get(id) {
            self.engine.get_parameter(node_id, param).unwrap_or(0.0)
        } else {
            0.0
        }
    }

    /// Process one buffer of audio. Called from the AudioWorklet's process() method.
    ///
    /// Writes mono output into the provided `output` buffer (Float32Array).
    /// The buffer length should match the `buffer_size` passed to the constructor.
    pub fn process(&mut self, output: &mut [f32]) {
        let buf_size = output.len().max(1);
        let input = AudioBuffer::new(1, buf_size);
        let mut out_buf = AudioBuffer::new(1, buf_size);

        self.engine.process(&input, &mut out_buf);

        // Copy mono output to the JS-provided buffer.
        let channel = out_buf.channel(0);
        let copy_len = output.len().min(channel.len());
        output[..copy_len].copy_from_slice(&channel[..copy_len]);
    }

    /// Start transport (begin playback).
    pub fn play(&mut self) {
        self.engine.transport_mut().play();
    }

    /// Stop transport.
    pub fn stop(&mut self) {
        self.engine.transport_mut().stop();
        self.engine.reset_all_nodes();
    }

    /// Set the transport tempo in BPM.
    pub fn set_tempo(&mut self, bpm: f64) {
        self.engine.transport_mut().set_tempo(bpm);
    }

    /// Get a copy of the last output buffer as a Vec<f32> (for waveform display).
    pub fn get_waveform_data(&self) -> Vec<f32> {
        self.engine.get_last_output_buffer()
    }

    /// Get the RMS level of the last output buffer.
    pub fn get_rms(&self) -> f64 {
        let buf = self.engine.get_last_output_buffer();
        if buf.is_empty() {
            return 0.0;
        }
        let sum: f64 = buf.iter().map(|&s| (s as f64) * (s as f64)).sum();
        (sum / buf.len() as f64).sqrt()
    }

    /// Analyze an audio buffer and return a JSON string with the analysis results.
    ///
    /// Used for sound recreation: pass in recorded audio, get back pitch, envelope,
    /// harmonic structure, and noise characteristics.
    pub fn analyze_audio(&self, audio: &[f32]) -> String {
        let result = chord_diagnostics::analysis::analyze(audio, self.sample_rate);
        serde_json::to_string(&AnalysisResult::from(result)).unwrap_or_default()
    }

    /// Get the number of nodes currently in the graph.
    pub fn node_count(&self) -> usize {
        self.graph.node_count()
    }

    /// Get the number of connections currently in the graph.
    pub fn connection_count(&self) -> usize {
        self.graph.connection_count()
    }

    /// Send a MIDI note-on message into the engine.
    pub fn note_on(&self, note: u8, velocity: u8) {
        self.engine.send_note_on(note, velocity);
    }

    /// Send a MIDI note-off message into the engine.
    pub fn note_off(&self, note: u8) {
        self.engine.send_note_off(note);
    }

    /// Trigger a drum or percussive node (sends note-on for MIDI note 60).
    pub fn trigger_node(&self, id: &str) {
        if let Some(&_node_id) = self.node_map.get(id) {
            self.engine.send_note_on(60, 127);
        }
    }

    /// Get the sample rate.
    pub fn get_sample_rate(&self) -> f64 {
        self.sample_rate
    }

    /// Get the buffer size.
    pub fn get_buffer_size(&self) -> usize {
        self.buffer_size
    }

    /// Check if a node type is supported.
    pub fn has_node_type(&self, node_type: &str) -> bool {
        self.registry.has_type(node_type)
    }

    /// List all supported node types as a JSON array string.
    pub fn list_node_types(&self) -> String {
        let types = self.registry.registered_types();
        serde_json::to_string(&types).unwrap_or_else(|_| "[]".to_string())
    }
}

// ─── Private methods (not exported to JS) ───

impl ChordEngine {
    /// Recompile the graph and swap it into the engine.
    fn recompile(&mut self) {
        if self.graph.is_empty() {
            return;
        }
        if let Ok(compiled) = GraphCompiler::compile(&self.graph) {
            let routing = self.compute_routing();
            self.engine.swap_graph_with_routing(compiled, routing);
        }
    }

    /// Compute the routing table from the graph's connections.
    ///
    /// Each entry is (from_node, from_port_index, to_node, to_port_index) where
    /// port indices are 0-based positions in the node's output/input port lists.
    fn compute_routing(&self) -> Vec<(NodeId, usize, NodeId, usize)> {
        self.graph
            .connections()
            .iter()
            .map(|c| {
                let from_idx = self
                    .graph
                    .node(&c.from_node)
                    .and_then(|n| n.outputs.iter().position(|p| p.id == c.from_port))
                    .unwrap_or(0);
                let to_idx = self
                    .graph
                    .node(&c.to_node)
                    .and_then(|n| n.inputs.iter().position(|p| p.id == c.to_port))
                    .unwrap_or(0);
                (c.from_node, from_idx, c.to_node, to_idx)
            })
            .collect()
    }
}

// ─── Analysis result (serializable for JS) ───

/// Serializable analysis result returned to JS as JSON.
#[derive(serde::Serialize)]
struct AnalysisResult {
    duration: f64,
    rms: f64,
    peak: f64,
    is_pitched: bool,
    is_noisy: bool,
    is_percussive: bool,
    fundamental_freq: Option<f64>,
    spectral_centroid: f64,
    attack_time: f64,
    decay_time: f64,
    sustain_level: f64,
    release_time: f64,
    harmonic_count: usize,
    formant_count: usize,
    noise_ratio: f64,
    inharmonicity: f64,
}

impl From<chord_diagnostics::analysis::SoundAnalysis> for AnalysisResult {
    fn from(a: chord_diagnostics::analysis::SoundAnalysis) -> Self {
        Self {
            duration: a.duration,
            rms: a.rms,
            peak: a.peak,
            is_pitched: a.is_pitched,
            is_noisy: a.is_noisy,
            is_percussive: a.is_percussive,
            fundamental_freq: a.fundamental_freq,
            spectral_centroid: a.spectral_centroid,
            attack_time: a.attack_time,
            decay_time: a.decay_time,
            sustain_level: a.sustain_level,
            release_time: a.release_time,
            harmonic_count: a.harmonics.len(),
            formant_count: a.formants.len(),
            noise_ratio: a.noise_ratio,
            inharmonicity: a.inharmonicity,
        }
    }
}

// ─── Node descriptor builder ───

/// Build a [`NodeDescriptor`] for a given node type.
///
/// This mirrors the Tauri app's `build_node_descriptor` function, defining
/// the same ports and parameters so the WASM engine is fully compatible
/// with patches created in the desktop app.
fn build_descriptor(node_type: &str) -> NodeDescriptor {
    match node_type {
        "oscillator" => NodeDescriptor::new("oscillator")
            .with_input(PortDescriptor::new("fm", PortDataType::Audio))
            .with_input(PortDescriptor::new("am", PortDataType::Audio))
            .with_input(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "frequency",
                "Frequency",
                440.0,
                0.1,
                20000.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "waveform", "Waveform", 0.0, 0.0, 3.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "detune", "Detune", 0.0, -1200.0, 1200.0,
            )),

        "filter" => NodeDescriptor::new("filter")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("cutoff_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("resonance_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "cutoff", "Cutoff", 1000.0, 20.0, 20000.0,
            ))
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
            .with_input(PortDescriptor::new("gain_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("gain", "Gain", 1.0, 0.0, 10.0)),

        "delay" => NodeDescriptor::new("delay")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("time_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("feedback_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "time", "Time", 0.5, 0.001, 2.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "feedback", "Feedback", 0.3, 0.0, 0.99,
            ))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 0.5, 0.0, 1.0)),

        "reverb" => NodeDescriptor::new("reverb")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("room_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("mix_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "room_size", "Room", 0.5, 0.0, 1.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "damping", "Damping", 0.5, 0.0, 1.0,
            ))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 0.3, 0.0, 1.0)),

        "lfo" => NodeDescriptor::new("lfo")
            .with_input(PortDescriptor::new("rate_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("depth_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "rate", "Rate", 1.0, 0.01, 100.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "depth", "Depth", 1.0, 0.0, 1.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "waveform", "Waveform", 0.0, 0.0, 3.0,
            )),

        "noise" => NodeDescriptor::new("noise")
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("color", "Color", 0.0, 0.0, 2.0)),

        "mixer" => NodeDescriptor::new("mixer")
            .with_input(PortDescriptor::new("in1", PortDataType::Audio))
            .with_input(PortDescriptor::new("in2", PortDataType::Audio))
            .with_input(PortDescriptor::new("in3", PortDataType::Audio))
            .with_input(PortDescriptor::new("in4", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),

        "output" => NodeDescriptor::new("output")
            .with_input(PortDescriptor::new("in", PortDataType::Audio)),

        "kick_drum" | "snare_drum" | "hi_hat" | "clap" | "tom" => {
            NodeDescriptor::new(node_type)
                .with_input(PortDescriptor::new("trigger", PortDataType::Audio))
                .with_output(PortDescriptor::new("out", PortDataType::Audio))
        }

        "envelope" => NodeDescriptor::new("envelope")
            .with_input(PortDescriptor::new("gate", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "attack", "Attack", 0.01, 0.0, 10.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "decay", "Decay", 0.1, 0.0, 10.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "sustain", "Sustain", 0.7, 0.0, 1.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "release", "Release", 0.3, 0.0, 30.0,
            )),

        "step_sequencer" => NodeDescriptor::new("step_sequencer")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "steps", "Steps", 8.0, 1.0, 32.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "gate_length",
                "Gate",
                0.5,
                0.0,
                1.0,
            )),

        "euclidean" => NodeDescriptor::new("euclidean")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "steps", "Steps", 16.0, 1.0, 32.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "pulses", "Pulses", 4.0, 0.0, 32.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "rotation",
                "Rotation",
                0.0,
                0.0,
                31.0,
            )),

        "markov_sequencer" => NodeDescriptor::new("markov_sequencer")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "randomness",
                "Randomness",
                0.3,
                0.0,
                1.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "root_note", "Root", 60.0, 0.0, 127.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "scale_type",
                "Scale",
                0.0,
                0.0,
                3.0,
            )),

        "gravity_sequencer" => NodeDescriptor::new("gravity_sequencer")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "gravity", "Gravity", 1.0, 0.01, 10.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "num_particles",
                "Particles",
                4.0,
                1.0,
                16.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "scale", "Scale", 0.0, 0.0, 11.0,
            )),

        "compressor" => NodeDescriptor::new("compressor")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "threshold",
                "Threshold",
                -20.0,
                -60.0,
                0.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "ratio", "Ratio", 4.0, 1.0, 20.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "attack", "Attack", 0.01, 0.001, 0.5,
            ))
            .with_parameter(ParameterDescriptor::new(
                "release", "Release", 0.1, 0.01, 2.0,
            )),

        "eq" => NodeDescriptor::new("eq")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "low_gain",
                "Low",
                0.0,
                -12.0,
                12.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "mid_gain",
                "Mid",
                0.0,
                -12.0,
                12.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "high_gain",
                "High",
                0.0,
                -12.0,
                12.0,
            )),

        "chorus" => NodeDescriptor::new("chorus")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("rate", "Rate", 1.5, 0.1, 10.0))
            .with_parameter(ParameterDescriptor::new(
                "depth", "Depth", 0.5, 0.0, 1.0,
            ))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 0.5, 0.0, 1.0)),

        "phaser" => NodeDescriptor::new("phaser")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("rate", "Rate", 0.5, 0.01, 10.0))
            .with_parameter(ParameterDescriptor::new(
                "depth", "Depth", 0.7, 0.0, 1.0,
            ))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 0.5, 0.0, 1.0)),

        "waveshaper" => NodeDescriptor::new("waveshaper")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "drive", "Drive", 1.0, 0.0, 10.0,
            ))
            .with_parameter(ParameterDescriptor::new("mode", "Mode", 0.0, 0.0, 3.0)),

        "limiter" => NodeDescriptor::new("limiter")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "ceiling",
                "Ceiling",
                -0.3,
                -12.0,
                0.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "release", "Release", 0.1, 0.01, 1.0,
            )),

        "dc_blocker" => NodeDescriptor::new("dc_blocker")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),

        "stereo" => NodeDescriptor::new("stereo")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "width", "Width", 1.0, 0.0, 2.0,
            )),

        "crossfader" => NodeDescriptor::new("crossfader")
            .with_input(PortDescriptor::new("a", PortDataType::Audio))
            .with_input(PortDescriptor::new("b", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 0.5, 0.0, 1.0)),

        "ring_modulator" => NodeDescriptor::new("ring_modulator")
            .with_input(PortDescriptor::new("carrier", PortDataType::Audio))
            .with_input(PortDescriptor::new("modulator", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),

        "pitch_shifter" => NodeDescriptor::new("pitch_shifter")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "semitones",
                "Semitones",
                0.0,
                -24.0,
                24.0,
            )),

        "gate" => NodeDescriptor::new("gate")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "threshold",
                "Threshold",
                -40.0,
                -80.0,
                0.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "attack", "Attack", 0.001, 0.0001, 0.1,
            ))
            .with_parameter(ParameterDescriptor::new(
                "release", "Release", 0.05, 0.001, 1.0,
            )),

        "midi_to_freq" => NodeDescriptor::new("midi_to_freq")
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio)),

        "note_to_freq" => NodeDescriptor::new("note_to_freq")
            .with_input(PortDescriptor::new("note", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio)),

        "sample_and_hold" => NodeDescriptor::new("sample_and_hold")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("trigger", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),

        "quantizer" => NodeDescriptor::new("quantizer")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "scale", "Scale", 0.0, 0.0, 11.0,
            )),

        "granular" => NodeDescriptor::new("granular")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new(
                "grain_size",
                "Grain Size",
                0.05,
                0.001,
                1.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "density", "Density", 10.0, 1.0, 100.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "position",
                "Position",
                0.0,
                0.0,
                1.0,
            ))
            .with_parameter(ParameterDescriptor::new(
                "pitch", "Pitch", 1.0, 0.25, 4.0,
            )),

        // Fallback: generic single-input/single-output node.
        _ => NodeDescriptor::new(node_type)
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),
    }
}
