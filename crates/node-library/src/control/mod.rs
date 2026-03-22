//! Control nodes — modulators and envelope generators.

mod envelope;
mod lfo;
mod note_to_freq;
mod quantizer;
mod sample_and_hold;

pub use envelope::AdsrEnvelope;
pub use lfo::Lfo;
pub use note_to_freq::NoteToFreq;
pub use quantizer::{QuantizerNode, Scale};
pub use sample_and_hold::SampleAndHoldNode;
