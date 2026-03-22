//! Source nodes — signal generators.

pub mod granular;
mod noise;
mod oscillator;

pub use granular::GranularNode;
pub use noise::{NoiseColor, NoiseNode};
pub use oscillator::{Oscillator, Waveform};
