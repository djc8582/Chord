//! Effect nodes — signal processors.

mod chorus;
mod compressor;
mod crossfader;
mod delay;
mod eq;
mod filter;
mod gate;
mod limiter;
mod phaser;
mod pitch_shifter;
mod reverb;
mod ring_modulator;
mod waveshaper;

pub use chorus::Chorus;
pub use compressor::CompressorNode;
pub use crossfader::CrossFader;
pub use delay::DelayNode;
pub use eq::EqNode;
pub use filter::{BiquadFilter, FilterMode};
pub use gate::Gate;
pub use limiter::Limiter;
pub use phaser::Phaser;
pub use pitch_shifter::PitchShifter;
pub use reverb::ReverbNode;
pub use ring_modulator::RingModulator;
pub use waveshaper::{Waveshaper, WaveshaperMode};
