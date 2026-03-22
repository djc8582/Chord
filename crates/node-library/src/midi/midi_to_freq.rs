//! MIDI-to-Frequency converter node.
//!
//! Converts incoming MIDI note-on/note-off messages into a frequency (Hz) control signal
//! and a gate signal. Uses standard equal temperament tuning (A4 = 440 Hz).

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Standard concert pitch: A4 = 440 Hz.
const A4_HZ: f64 = 440.0;
/// MIDI note number for A4.
const A4_MIDI: u8 = 69;

/// Convert a MIDI note number (0-127) to frequency in Hz.
/// Uses equal temperament: freq = 440 * 2^((note - 69) / 12).
#[inline]
pub fn midi_note_to_freq(note: u8) -> f64 {
    A4_HZ * (2.0_f64).powf((note as f64 - A4_MIDI as f64) / 12.0)
}

/// MIDI-to-Frequency converter node.
///
/// Reads MIDI messages from `ctx.midi_input` and outputs:
///
/// ## Outputs
/// - `[0]` frequency in Hz (control signal).
/// - `[1]` gate signal (1.0 when note is on, 0.0 when note is off).
///
/// This node tracks the most recent note-on. On note-off for that note,
/// the gate goes low.
pub struct MidiToFreq {
    /// Current frequency output.
    current_freq: f64,
    /// Current gate state.
    gate: f32,
    /// The MIDI note currently held (for monophonic tracking).
    current_note: Option<u8>,
}

impl MidiToFreq {
    pub fn new() -> Self {
        Self {
            current_freq: A4_HZ,
            gate: 0.0,
            current_note: None,
        }
    }
}

impl Default for MidiToFreq {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for MidiToFreq {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        // Process MIDI messages.
        // The dsp-runtime MidiMessage uses raw status/data1/data2 bytes.
        for msg in ctx.midi_input.iter() {
            let status_nibble = msg.status & 0xF0;
            let note = msg.data1;
            let velocity = msg.data2;

            match status_nibble {
                0x90 => {
                    // Note On (velocity 0 = note off per MIDI spec).
                    if velocity > 0 {
                        self.current_note = Some(note);
                        self.current_freq = midi_note_to_freq(note);
                        self.gate = 1.0;
                    } else {
                        // Velocity 0 note-on is treated as note-off.
                        if self.current_note == Some(note) {
                            self.gate = 0.0;
                            self.current_note = None;
                        }
                    }
                }
                0x80 => {
                    // Note Off.
                    if self.current_note == Some(note) {
                        self.gate = 0.0;
                        self.current_note = None;
                    }
                }
                _ => {
                    // Ignore other message types.
                }
            }
        }

        // Write frequency and gate to output buffers.
        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        // When no note is active (gate is off), output 0.0 frequency.
        // This avoids sending a stale frequency value when nothing is playing
        // and keeps the output at 0.0 (silence) until a note-on is received.
        let freq_f32 = if self.gate > 0.0 {
            self.current_freq as f32
        } else {
            0.0
        };

        // Output 0: frequency.
        let freq_out = &mut ctx.outputs[0];
        for sample in freq_out.iter_mut().take(ctx.buffer_size) {
            *sample = freq_f32;
        }

        // Output 1: gate (if available).
        if ctx.outputs.len() > 1 {
            let gate_out = &mut ctx.outputs[1];
            for sample in gate_out.iter_mut().take(ctx.buffer_size) {
                *sample = self.gate;
            }
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.current_freq = A4_HZ;
        self.gate = 0.0;
        self.current_note = None;
    }
}
