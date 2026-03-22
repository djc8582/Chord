//! Node registry — maps node type strings to constructor functions.
//!
//! The registry allows the engine to instantiate nodes by name (e.g., "oscillator").
//! All Wave 1-5 nodes are registered by default.

use std::collections::HashMap;

use chord_dsp_runtime::{AudioNode, NodeFactory};

use chord_scripting_runtime::ExpressionNode;
use crate::control::{AdsrEnvelope, Lfo, NoteToFreq, QuantizerNode, SampleAndHoldNode};
use crate::effects::{
    BiquadFilter, Chorus, CompressorNode, ConvolutionReverb, CrossFader, DelayNode, EqNode, Gate,
    Limiter, Phaser, PitchShifter, ReverbNode, RingModulator, Vocoder, Waveshaper,
};
use crate::midi::MidiToFreq;
use crate::sequencers::{
    EuclideanNode, GameOfLifeSequencer, GravitySequencer, MarkovSequencer, PolyrhythmEngine,
    StepSequencer,
};
use crate::sources::{GranularNode, NoiseNode, Oscillator};
use crate::utility::{DCBlocker, GainNode, MixerNode, OutputNode, Stereo};

/// Central registry of all node types.
///
/// Maps string type names (e.g., "oscillator", "filter") to factory functions
/// that create instances of those nodes. The engine calls `create("oscillator")`
/// to get a new `Box<dyn AudioNode>`.
pub struct NodeRegistry {
    factories: HashMap<String, Box<dyn NodeFactory>>,
}

impl NodeRegistry {
    /// Create a new empty registry.
    pub fn new() -> Self {
        Self {
            factories: HashMap::new(),
        }
    }

    /// Create a registry pre-populated with all Wave 1 nodes.
    pub fn with_wave1() -> Self {
        let mut registry = Self::new();
        registry.register_wave1();
        registry
    }

    /// Create a registry pre-populated with Wave 1 and Wave 2 nodes.
    pub fn with_wave2() -> Self {
        let mut registry = Self::with_wave1();
        registry.register_wave2();
        registry
    }

    /// Create a registry pre-populated with Wave 1, Wave 2, and Wave 3 nodes.
    pub fn with_wave3() -> Self {
        let mut registry = Self::with_wave2();
        registry.register_wave3();
        registry
    }

    /// Create a registry pre-populated with Wave 1-4 nodes.
    pub fn with_wave4() -> Self {
        let mut registry = Self::with_wave3();
        registry.register_wave4();
        registry
    }

    /// Create a registry pre-populated with Wave 1-5 nodes.
    pub fn with_wave5() -> Self {
        let mut registry = Self::with_wave4();
        registry.register_wave5();
        registry
    }

    /// Create a registry pre-populated with all available nodes (Wave 1-5).
    pub fn with_all() -> Self {
        Self::with_wave5()
    }

    /// Register a node type with a factory.
    pub fn register<F>(&mut self, type_name: &str, factory: F)
    where
        F: Fn() -> Box<dyn AudioNode> + Send + 'static,
    {
        self.factories
            .insert(type_name.to_string(), Box::new(factory));
    }

    /// Register all Wave 1 (MVP) nodes.
    pub fn register_wave1(&mut self) {
        self.register("oscillator", || Box::new(Oscillator::new()));
        self.register("filter", || Box::new(BiquadFilter::new()));
        self.register("gain", || Box::new(GainNode::new()));
        self.register("envelope", || Box::new(AdsrEnvelope::new()));
        self.register("lfo", || Box::new(Lfo::new()));
        self.register("mixer", || Box::new(MixerNode::new()));
        self.register("output", || Box::new(OutputNode::new()));
        self.register("midi_to_freq", || Box::new(MidiToFreq::new()));
        self.register("note_to_freq", || Box::new(NoteToFreq::new()));
        self.register("expression", || Box::new(ExpressionNode::new()));
    }

    /// Register all Wave 2 (effects) nodes.
    pub fn register_wave2(&mut self) {
        self.register("delay", || Box::new(DelayNode::new()));
        self.register("reverb", || Box::new(ReverbNode::new()));
        self.register("compressor", || Box::new(CompressorNode::new()));
        self.register("eq", || Box::new(EqNode::new()));
    }

    /// Register all Wave 3 (generative/experimental) nodes.
    pub fn register_wave3(&mut self) {
        self.register("euclidean", || Box::new(EuclideanNode::new()));
        self.register("noise", || Box::new(NoiseNode::new()));
        self.register("sample_and_hold", || Box::new(SampleAndHoldNode::new()));
        self.register("quantizer", || Box::new(QuantizerNode::new()));
        self.register("step_sequencer", || Box::new(StepSequencer::new()));
        self.register("gravity_sequencer", || Box::new(GravitySequencer::new()));
        self.register("game_of_life_sequencer", || Box::new(GameOfLifeSequencer::new()));
        self.register("markov_sequencer", || Box::new(MarkovSequencer::new()));
        self.register("polyrhythm", || Box::new(PolyrhythmEngine::new()));
    }

    /// Register all Wave 4 (advanced modulation & routing) nodes.
    pub fn register_wave4(&mut self) {
        self.register("crossfader", || Box::new(CrossFader::new()));
        self.register("waveshaper", || Box::new(Waveshaper::new()));
        self.register("ring_modulator", || Box::new(RingModulator::new()));
        self.register("chorus", || Box::new(Chorus::new()));
        self.register("phaser", || Box::new(Phaser::new()));
        self.register("granular", || Box::new(GranularNode::new()));
        self.register("vocoder", || Box::new(Vocoder::new()));
    }

    /// Register all Wave 5 (utility & analysis) nodes.
    pub fn register_wave5(&mut self) {
        self.register("pitch_shifter", || Box::new(PitchShifter::new()));
        self.register("limiter", || Box::new(Limiter::new()));
        self.register("gate", || Box::new(Gate::new()));
        self.register("stereo", || Box::new(Stereo::new()));
        self.register("dc_blocker", || Box::new(DCBlocker::new()));
        self.register("convolution_reverb", || Box::new(ConvolutionReverb::new()));
    }

    /// Create a node instance by type name.
    /// Returns `None` if the type is not registered.
    pub fn create(&self, type_name: &str) -> Option<Box<dyn AudioNode>> {
        self.factories.get(type_name).map(|f| f.create())
    }

    /// List all registered node type names.
    pub fn registered_types(&self) -> Vec<&str> {
        self.factories.keys().map(|s| s.as_str()).collect()
    }

    /// Check if a node type is registered.
    pub fn has_type(&self, type_name: &str) -> bool {
        self.factories.contains_key(type_name)
    }

    /// Number of registered node types.
    pub fn len(&self) -> usize {
        self.factories.len()
    }

    /// Whether the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.factories.is_empty()
    }
}

impl Default for NodeRegistry {
    fn default() -> Self {
        Self::with_wave1()
    }
}
