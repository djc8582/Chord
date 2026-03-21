//! MIDI message parsing from raw bytes.

use crate::message::{MidiData, MidiMessage};

/// Errors that can occur when parsing raw MIDI bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    /// The input byte slice is empty.
    EmptyInput,
    /// The status byte is not recognized.
    InvalidStatusByte(u8),
    /// Not enough data bytes following the status byte.
    InsufficientData {
        expected: usize,
        got: usize,
    },
    /// SysEx message is missing the terminating 0xF7 byte.
    UnterminatedSysEx,
    /// A data byte has its high bit set (invalid in MIDI).
    InvalidDataByte(u8),
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParseError::EmptyInput => write!(f, "empty input"),
            ParseError::InvalidStatusByte(b) => write!(f, "invalid status byte: 0x{b:02X}"),
            ParseError::InsufficientData { expected, got } => {
                write!(f, "expected {expected} data bytes, got {got}")
            }
            ParseError::UnterminatedSysEx => write!(f, "unterminated SysEx message"),
            ParseError::InvalidDataByte(b) => write!(f, "invalid data byte: 0x{b:02X}"),
        }
    }
}

impl std::error::Error for ParseError {}

/// A helper for working with raw MIDI byte slices.
pub struct RawMidi;

impl RawMidi {
    /// Parse a MIDI message from raw bytes. Returns the parsed [`MidiData`] and
    /// the number of bytes consumed.
    ///
    /// This handles all MIDI 1.0 message types including SysEx.
    pub fn parse(bytes: &[u8]) -> Result<(MidiData, usize), ParseError> {
        if bytes.is_empty() {
            return Err(ParseError::EmptyInput);
        }

        let status = bytes[0];
        if status < 0x80 {
            return Err(ParseError::InvalidStatusByte(status));
        }

        match status & 0xF0 {
            // Channel voice messages
            0x80 => Self::parse_three_byte(bytes, |ch, d1, d2| MidiData::NoteOff {
                channel: ch,
                note: d1,
                velocity: d2,
            }),
            0x90 => Self::parse_three_byte(bytes, |ch, d1, d2| MidiData::NoteOn {
                channel: ch,
                note: d1,
                velocity: d2,
            }),
            0xA0 => Self::parse_three_byte(bytes, |ch, d1, d2| MidiData::PolyAftertouch {
                channel: ch,
                note: d1,
                pressure: d2,
            }),
            0xB0 => Self::parse_three_byte(bytes, |ch, d1, d2| MidiData::ControlChange {
                channel: ch,
                controller: d1,
                value: d2,
            }),
            0xC0 => Self::parse_two_byte(bytes, |ch, d1| MidiData::ProgramChange {
                channel: ch,
                program: d1,
            }),
            0xD0 => Self::parse_two_byte(bytes, |ch, d1| MidiData::Aftertouch {
                channel: ch,
                pressure: d1,
            }),
            0xE0 => {
                if bytes.len() < 3 {
                    return Err(ParseError::InsufficientData {
                        expected: 2,
                        got: bytes.len() - 1,
                    });
                }
                let channel = status & 0x0F;
                let lsb = bytes[1];
                let msb = bytes[2];
                if lsb > 0x7F {
                    return Err(ParseError::InvalidDataByte(lsb));
                }
                if msb > 0x7F {
                    return Err(ParseError::InvalidDataByte(msb));
                }
                let unsigned = ((msb as u16) << 7) | (lsb as u16);
                let value = (unsigned as i16) - 8192;
                Ok((MidiData::PitchBend { channel, value }, 3))
            }
            0xF0 => {
                // System messages — use the full status byte
                match status {
                    0xF0 => Self::parse_sysex(bytes),
                    0xF1 => {
                        if bytes.len() < 2 {
                            return Err(ParseError::InsufficientData {
                                expected: 1,
                                got: 0,
                            });
                        }
                        let data = bytes[1];
                        if data > 0x7F {
                            return Err(ParseError::InvalidDataByte(data));
                        }
                        let message_type = (data >> 4) & 0x07;
                        let value = data & 0x0F;
                        Ok((
                            MidiData::TimeCodeQuarterFrame {
                                message_type,
                                value,
                            },
                            2,
                        ))
                    }
                    0xF2 => {
                        if bytes.len() < 3 {
                            return Err(ParseError::InsufficientData {
                                expected: 2,
                                got: bytes.len() - 1,
                            });
                        }
                        let lsb = bytes[1];
                        let msb = bytes[2];
                        if lsb > 0x7F {
                            return Err(ParseError::InvalidDataByte(lsb));
                        }
                        if msb > 0x7F {
                            return Err(ParseError::InvalidDataByte(msb));
                        }
                        let position = ((msb as u16) << 7) | (lsb as u16);
                        Ok((MidiData::SongPositionPointer { position }, 3))
                    }
                    0xF3 => {
                        if bytes.len() < 2 {
                            return Err(ParseError::InsufficientData {
                                expected: 1,
                                got: 0,
                            });
                        }
                        let song = bytes[1];
                        if song > 0x7F {
                            return Err(ParseError::InvalidDataByte(song));
                        }
                        Ok((MidiData::SongSelect { song }, 2))
                    }
                    0xF6 => Ok((MidiData::TuneRequest, 1)),
                    // System Real-Time
                    0xF8 => Ok((MidiData::TimingClock, 1)),
                    0xFA => Ok((MidiData::Start, 1)),
                    0xFB => Ok((MidiData::Continue, 1)),
                    0xFC => Ok((MidiData::Stop, 1)),
                    0xFE => Ok((MidiData::ActiveSensing, 1)),
                    0xFF => Ok((MidiData::SystemReset, 1)),
                    other => Err(ParseError::InvalidStatusByte(other)),
                }
            }
            _ => Err(ParseError::InvalidStatusByte(status)),
        }
    }

    /// Parse raw bytes into a [`MidiMessage`] with the given timestamp.
    pub fn parse_with_timestamp(
        timestamp: u64,
        bytes: &[u8],
    ) -> Result<(MidiMessage, usize), ParseError> {
        let (data, consumed) = Self::parse(bytes)?;
        Ok((MidiMessage::new(timestamp, data), consumed))
    }

    /// Helper for 3-byte channel messages (status + 2 data bytes).
    fn parse_three_byte<F>(bytes: &[u8], make: F) -> Result<(MidiData, usize), ParseError>
    where
        F: FnOnce(u8, u8, u8) -> MidiData,
    {
        if bytes.len() < 3 {
            return Err(ParseError::InsufficientData {
                expected: 2,
                got: bytes.len() - 1,
            });
        }
        let channel = bytes[0] & 0x0F;
        let d1 = bytes[1];
        let d2 = bytes[2];
        if d1 > 0x7F {
            return Err(ParseError::InvalidDataByte(d1));
        }
        if d2 > 0x7F {
            return Err(ParseError::InvalidDataByte(d2));
        }
        Ok((make(channel, d1, d2), 3))
    }

    /// Helper for 2-byte channel messages (status + 1 data byte).
    fn parse_two_byte<F>(bytes: &[u8], make: F) -> Result<(MidiData, usize), ParseError>
    where
        F: FnOnce(u8, u8) -> MidiData,
    {
        if bytes.len() < 2 {
            return Err(ParseError::InsufficientData {
                expected: 1,
                got: 0,
            });
        }
        let channel = bytes[0] & 0x0F;
        let d1 = bytes[1];
        if d1 > 0x7F {
            return Err(ParseError::InvalidDataByte(d1));
        }
        Ok((make(channel, d1), 2))
    }

    /// Parse a SysEx message. Expects bytes starting with 0xF0 and ending with 0xF7.
    fn parse_sysex(bytes: &[u8]) -> Result<(MidiData, usize), ParseError> {
        debug_assert_eq!(bytes[0], 0xF0);
        // Find the terminating 0xF7
        let end = bytes
            .iter()
            .position(|&b| b == 0xF7)
            .ok_or(ParseError::UnterminatedSysEx)?;
        // Data is everything between 0xF0 and 0xF7 (exclusive on both sides)
        let data = bytes[1..end].to_vec();
        // Consumed count includes both 0xF0 and 0xF7
        Ok((MidiData::SysEx { data }, end + 1))
    }
}
