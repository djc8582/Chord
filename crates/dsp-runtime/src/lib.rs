//! # chord-dsp-runtime
//!
//! The real-time audio processing engine for the Chord audio programming environment.
//!
//! Takes a [`CompiledGraph`](chord_audio_graph::CompiledGraph) from `audio-graph` and executes it
//! with zero allocations, zero locks, and zero blocking on the audio thread. This is the most
//! critical crate in the entire project.
//!
//! ## Hard Rules (audio thread)
//!
//! 1. **Zero allocation** — all buffers pre-allocated at graph compile time.
//! 2. **Zero locking** — only atomics and lock-free ring buffers for communication.
//! 3. **Zero blocking** — no I/O, no sleep, no mutexes.
//! 4. **Denormal protection** — FTZ/DAZ flags set at callback entry.
//! 5. **NaN/Inf prevention** — output sanitized after every node.
//! 6. **No hardcoded buffer size** — nodes work at any size from 1 to 8192.
//! 7. **Sample rate independence** — all time calculations use `ProcessContext::sample_rate`.
//! 8. **Parameter smoothing** — all parameter changes go through `SmoothedParam`.

mod buffer_pool;
mod engine;
mod node;
mod parameter;
mod ring_buffer;
mod sanitize;
mod transport;

pub use buffer_pool::*;
pub use engine::*;
pub use node::*;
pub use parameter::*;
pub use ring_buffer::*;
pub use sanitize::*;
pub use transport::*;

// Re-export graph types used in our public API.
pub use chord_audio_graph::{
    BufferIndex, BufferLayout, CompiledGraph, Connection, ConnectionId, NodeId, PortDataType,
    PortId,
};

/// Audio error reported through the diagnostic probe.
#[derive(Debug, Clone)]
pub enum AudioError {
    /// A node produced NaN or Infinity values.
    NanDetected {
        /// Number of non-finite samples found.
        count: usize,
    },
    /// A node's process call failed.
    ProcessingFailed {
        /// Description of the failure.
        message: String,
    },
    /// The parameter ring buffer overflowed.
    ParameterOverflow,
}

impl std::fmt::Display for AudioError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NanDetected { count } => {
                write!(f, "NaN/Inf detected: {count} non-finite samples")
            }
            Self::ProcessingFailed { message } => write!(f, "Processing failed: {message}"),
            Self::ParameterOverflow => write!(f, "Parameter ring buffer overflow"),
        }
    }
}

impl std::error::Error for AudioError {}

/// Result of processing a single node.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessStatus {
    /// Node processed normally.
    Ok,
    /// Node is producing a tail (reverb/delay tail after input ends).
    Tail,
    /// Node output is silent and can be skipped for downstream optimization.
    Silent,
}

/// The result returned from [`AudioNode::process`].
pub type ProcessResult = Result<ProcessStatus, AudioError>;

/// A single MIDI message.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MidiMessage {
    /// Offset in samples from the start of the current buffer.
    pub sample_offset: u32,
    /// MIDI status byte.
    pub status: u8,
    /// First data byte.
    pub data1: u8,
    /// Second data byte.
    pub data2: u8,
}

/// An audio buffer: a collection of channel buffers, each holding `buffer_size` samples.
#[derive(Debug, Clone)]
pub struct AudioBuffer {
    /// Channel data. `channels[ch][sample]`.
    channels: Vec<Vec<f32>>,
}

impl AudioBuffer {
    /// Create a new audio buffer with the given number of channels and buffer size.
    pub fn new(num_channels: usize, buffer_size: usize) -> Self {
        Self {
            channels: (0..num_channels)
                .map(|_| vec![0.0f32; buffer_size])
                .collect(),
        }
    }

    /// Number of channels.
    pub fn num_channels(&self) -> usize {
        self.channels.len()
    }

    /// Number of samples per channel.
    pub fn buffer_size(&self) -> usize {
        if self.channels.is_empty() {
            0
        } else {
            self.channels[0].len()
        }
    }

    /// Get a reference to a channel's sample data.
    pub fn channel(&self, ch: usize) -> &[f32] {
        &self.channels[ch]
    }

    /// Get a mutable reference to a channel's sample data.
    pub fn channel_mut(&mut self, ch: usize) -> &mut [f32] {
        &mut self.channels[ch]
    }

    /// Fill the entire buffer with silence (zeros).
    pub fn clear(&mut self) {
        for ch in &mut self.channels {
            for s in ch.iter_mut() {
                *s = 0.0;
            }
        }
    }

    /// Copy the contents of another buffer into this one.
    /// Panics if dimensions don't match.
    pub fn copy_from(&mut self, other: &AudioBuffer) {
        assert_eq!(self.num_channels(), other.num_channels());
        assert_eq!(self.buffer_size(), other.buffer_size());
        for (dst, src) in self.channels.iter_mut().zip(other.channels.iter()) {
            dst.copy_from_slice(src);
        }
    }

    /// Mix (add) the contents of another buffer into this one.
    pub fn mix_from(&mut self, other: &AudioBuffer) {
        assert_eq!(self.num_channels(), other.num_channels());
        assert_eq!(self.buffer_size(), other.buffer_size());
        for (dst, src) in self.channels.iter_mut().zip(other.channels.iter()) {
            for (d, s) in dst.iter_mut().zip(src.iter()) {
                *d += *s;
            }
        }
    }
}

#[cfg(test)]
mod tests;
