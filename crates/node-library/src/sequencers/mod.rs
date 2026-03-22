//! Sequencer nodes — rhythm and pattern generators.

/// Convert a MIDI note number to frequency in Hz.
/// Used by all sequencers so they output Hz directly (no converter node needed).
#[inline]
pub(crate) fn midi_to_hz(note: f32) -> f32 {
    440.0 * (2.0_f32).powf((note - 69.0) / 12.0)
}

mod euclidean;
mod game_of_life;
mod gravity;
mod markov;
mod polyrhythm;
mod step;

pub use euclidean::EuclideanNode;
pub use game_of_life::GameOfLifeSequencer;
pub use gravity::GravitySequencer;
pub use markov::MarkovSequencer;
pub use polyrhythm::PolyrhythmEngine;
pub use step::StepSequencer;
