//! # chord-node-library
//!
//! All built-in node implementations for the Chord audio programming environment.
//! Every source, effect, control, and utility node lives here.
//!
//! ## Wave 1 (MVP) Nodes
//!
//! - [`sources::Oscillator`] — Sine, saw, square, triangle with anti-aliasing (PolyBLEP).
//! - [`effects::BiquadFilter`] — Low-pass, high-pass, band-pass biquad filter.
//! - [`utility::GainNode`] — Simple volume control with parameter smoothing.
//! - [`control::AdsrEnvelope`] — Attack-Decay-Sustain-Release envelope generator.
//! - [`control::Lfo`] — Low-frequency oscillator for modulation.
//! - [`utility::MixerNode`] — Sums multiple audio inputs.
//! - [`utility::OutputNode`] — Terminal node for audio output.
//! - [`midi::MidiToFreq`] — Converts MIDI notes to frequency + gate signals.
//!
//! ## Wave 2 (Effects) Nodes
//!
//! - [`effects::DelayNode`] — Stereo delay with circular buffer, feedback, wet/dry mix.
//! - [`effects::ReverbNode`] — Algorithmic reverb (Schroeder-style) with room size, damping.
//! - [`effects::CompressorNode`] — Dynamics compressor with envelope follower.
//! - [`effects::EqNode`] — 3-band parametric EQ (low/mid/high).
//!
//! ## Wave 3 (Generative) Nodes
//!
//! - [`sequencers::EuclideanNode`] — Euclidean rhythm generator (Bjorklund's algorithm).
//! - [`sources::NoiseNode`] — White, pink, brown noise generator.
//! - [`control::SampleAndHoldNode`] — Samples input on trigger, holds value.
//! - [`control::QuantizerNode`] — Quantizes pitch to musical scales.
//!
//! ## Wave 4 (Advanced Modulation & Routing) Nodes
//!
//! - [`effects::CrossFader`] — Crossfade between two audio inputs (A/B).
//! - [`effects::Waveshaper`] — Distortion/saturation via transfer function.
//! - [`effects::RingModulator`] — Multiplies two audio signals (carrier x modulator).
//! - [`effects::Chorus`] — Multi-voice chorus with modulated delay lines.
//! - [`effects::Phaser`] — Phase shifting with all-pass filter chain and LFO.
//!
//! ## Wave 5 (Utility & Analysis) Nodes
//!
//! - [`effects::PitchShifter`] — Simple pitch shifting via resampling.
//! - [`effects::Limiter`] — Brick-wall limiter with ceiling and release.
//! - [`effects::Gate`] — Noise gate with threshold, attack, hold, release.
//! - [`utility::Stereo`] — Stereo width control (mono to wide).
//! - [`utility::DCBlocker`] — Removes DC offset from signal.
//!
//! ## Registry
//!
//! The [`registry::NodeRegistry`] maps node type strings to constructor functions,
//! allowing the engine to create nodes by name.

pub mod control;
pub mod effects;
pub mod midi;
pub mod registry;
pub mod sequencers;
pub mod sources;
pub mod utility;

// Re-export key types at the crate root for convenience.
// Wave 1
pub use control::{AdsrEnvelope, Lfo};
pub use effects::{BiquadFilter, FilterMode};
pub use midi::MidiToFreq;
pub use registry::NodeRegistry;
pub use sources::{Oscillator, Waveform};
pub use utility::{GainNode, MixerNode, OutputNode};

// Wave 2
pub use effects::{CompressorNode, DelayNode, EqNode, ReverbNode};

// Wave 3
pub use control::{QuantizerNode, SampleAndHoldNode, Scale};
pub use sequencers::EuclideanNode;
pub use sources::{NoiseColor, NoiseNode};

// Wave 4 sources
pub use sources::GranularNode;

// Wave 4
pub use effects::{Chorus, CrossFader, Phaser, RingModulator, Vocoder, Waveshaper, WaveshaperMode};

// Wave 5
pub use effects::{ConvolutionReverb, Gate, Limiter, PitchShifter, SpectralNode};
pub use utility::{DCBlocker, Stereo};

#[cfg(test)]
mod tests;
