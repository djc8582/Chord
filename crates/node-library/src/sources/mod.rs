//! Source nodes — signal generators.

pub mod clap;
pub mod granular;
pub mod hi_hat;
pub mod kick_drum;
mod noise;
mod oscillator;
pub mod snare_drum;
pub mod tom;

pub use clap::Clap;
pub use granular::GranularNode;
pub use hi_hat::HiHat;
pub use kick_drum::KickDrum;
pub use noise::{NoiseColor, NoiseNode};
pub use oscillator::{Oscillator, Waveform};
pub use snare_drum::SnareDrum;
pub use tom::Tom;
