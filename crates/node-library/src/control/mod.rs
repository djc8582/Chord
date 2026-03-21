//! Control nodes — modulators and envelope generators.

mod envelope;
mod lfo;
mod quantizer;
mod sample_and_hold;

pub use envelope::AdsrEnvelope;
pub use lfo::Lfo;
pub use quantizer::{QuantizerNode, Scale};
pub use sample_and_hold::SampleAndHoldNode;
