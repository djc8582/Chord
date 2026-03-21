//! # Chord MIDI Engine
//!
//! MIDI I/O and message types for the Chord audio programming environment.
//! Handles hardware MIDI devices, virtual ports, and provides the core MIDI
//! data types used throughout the system.
//!
//! ## Features
//!
//! - Complete MIDI 1.0 message type definitions
//! - Hardware MIDI device enumeration
//! - MIDI input with sample-accurate timestamps
//! - MIDI output (message sending)
//! - Virtual MIDI port creation (macOS/Linux)
//! - Raw byte parsing and serialization of MIDI messages

mod message;
mod parse;
mod port;

pub use message::{MidiData, MidiMessage};
pub use parse::{ParseError, RawMidi};
pub use port::{
    MidiDeviceInfo, MidiEngine, MidiInput, MidiOutput, MidiPort, MidiPortError, MidiReceiver,
};

#[cfg(test)]
mod tests;
