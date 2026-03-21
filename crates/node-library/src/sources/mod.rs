//! Source nodes — signal generators.

mod noise;
mod oscillator;

pub use noise::{NoiseColor, NoiseNode};
pub use oscillator::{Oscillator, Waveform};
