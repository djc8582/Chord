//! MIDI message types covering the complete MIDI 1.0 specification.

/// A timestamped MIDI message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MidiMessage {
    /// Sample-accurate timestamp (microseconds from an arbitrary epoch).
    pub timestamp: u64,
    /// The MIDI message payload.
    pub data: MidiData,
}

impl MidiMessage {
    /// Create a new MIDI message with the given timestamp and data.
    pub fn new(timestamp: u64, data: MidiData) -> Self {
        Self { timestamp, data }
    }
}

/// All MIDI 1.0 message types.
///
/// Channel values are 0-15 (representing MIDI channels 1-16).
/// Note values are 0-127 (middle C = 60).
/// Velocity/pressure/value fields are 0-127 unless otherwise noted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MidiData {
    // ── Channel Voice Messages ──────────────────────────────────────

    /// Note On — a key was pressed.
    NoteOn {
        channel: u8,
        note: u8,
        velocity: u8,
    },

    /// Note Off — a key was released.
    NoteOff {
        channel: u8,
        note: u8,
        velocity: u8,
    },

    /// Control Change (CC) — a controller value changed.
    ControlChange {
        channel: u8,
        controller: u8,
        value: u8,
    },

    /// Pitch Bend — pitch wheel position. Value is -8192..8191 (center = 0).
    PitchBend { channel: u8, value: i16 },

    /// Channel Aftertouch (Channel Pressure) — pressure applied after key press.
    Aftertouch { channel: u8, pressure: u8 },

    /// Polyphonic Aftertouch (Poly Key Pressure) — per-note pressure.
    PolyAftertouch {
        channel: u8,
        note: u8,
        pressure: u8,
    },

    /// Program Change — select a patch/program.
    ProgramChange { channel: u8, program: u8 },

    // ── System Common Messages ──────────────────────────────────────

    /// System Exclusive (SysEx) — manufacturer-specific data.
    /// The data includes everything between (but not including) F0 and F7.
    SysEx { data: Vec<u8> },

    /// MIDI Time Code Quarter Frame.
    TimeCodeQuarterFrame { message_type: u8, value: u8 },

    /// Song Position Pointer — position in beats (1 beat = 6 MIDI clocks).
    SongPositionPointer { position: u16 },

    /// Song Select — choose a song/sequence.
    SongSelect { song: u8 },

    /// Tune Request — ask analog synths to retune.
    TuneRequest,

    // ── System Real-Time Messages ───────────────────────────────────

    /// Timing Clock — sent 24 times per quarter note.
    TimingClock,

    /// Start — start playback from the beginning.
    Start,

    /// Continue — resume playback from current position.
    Continue,

    /// Stop — stop playback.
    Stop,

    /// Active Sensing — keepalive message.
    ActiveSensing,

    /// System Reset — reset all devices to power-on state.
    SystemReset,
}

impl MidiData {
    /// Returns the MIDI channel (0-15) if this is a channel message, or `None`
    /// for system messages.
    pub fn channel(&self) -> Option<u8> {
        match self {
            MidiData::NoteOn { channel, .. }
            | MidiData::NoteOff { channel, .. }
            | MidiData::ControlChange { channel, .. }
            | MidiData::PitchBend { channel, .. }
            | MidiData::Aftertouch { channel, .. }
            | MidiData::PolyAftertouch { channel, .. }
            | MidiData::ProgramChange { channel, .. } => Some(*channel),
            _ => None,
        }
    }

    /// Returns `true` if this is a channel voice message.
    pub fn is_channel_voice(&self) -> bool {
        matches!(
            self,
            MidiData::NoteOn { .. }
                | MidiData::NoteOff { .. }
                | MidiData::ControlChange { .. }
                | MidiData::PitchBend { .. }
                | MidiData::Aftertouch { .. }
                | MidiData::PolyAftertouch { .. }
                | MidiData::ProgramChange { .. }
        )
    }

    /// Returns `true` if this is a system real-time message.
    pub fn is_realtime(&self) -> bool {
        matches!(
            self,
            MidiData::TimingClock
                | MidiData::Start
                | MidiData::Continue
                | MidiData::Stop
                | MidiData::ActiveSensing
                | MidiData::SystemReset
        )
    }

    /// Returns `true` if this is a system common message.
    pub fn is_system_common(&self) -> bool {
        matches!(
            self,
            MidiData::SysEx { .. }
                | MidiData::TimeCodeQuarterFrame { .. }
                | MidiData::SongPositionPointer { .. }
                | MidiData::SongSelect { .. }
                | MidiData::TuneRequest
        )
    }

    /// Serialize this message to raw MIDI bytes.
    pub fn to_bytes(&self) -> Vec<u8> {
        match self {
            MidiData::NoteOff {
                channel,
                note,
                velocity,
            } => vec![0x80 | (channel & 0x0F), note & 0x7F, velocity & 0x7F],
            MidiData::NoteOn {
                channel,
                note,
                velocity,
            } => vec![0x90 | (channel & 0x0F), note & 0x7F, velocity & 0x7F],
            MidiData::PolyAftertouch {
                channel,
                note,
                pressure,
            } => vec![0xA0 | (channel & 0x0F), note & 0x7F, pressure & 0x7F],
            MidiData::ControlChange {
                channel,
                controller,
                value,
            } => vec![0xB0 | (channel & 0x0F), controller & 0x7F, value & 0x7F],
            MidiData::ProgramChange { channel, program } => {
                vec![0xC0 | (channel & 0x0F), program & 0x7F]
            }
            MidiData::Aftertouch { channel, pressure } => {
                vec![0xD0 | (channel & 0x0F), pressure & 0x7F]
            }
            MidiData::PitchBend { channel, value } => {
                // Convert signed i16 (-8192..8191) to unsigned 14-bit (0..16383, center = 8192)
                let unsigned = ((*value as i32) + 8192).clamp(0, 16383) as u16;
                let lsb = (unsigned & 0x7F) as u8;
                let msb = ((unsigned >> 7) & 0x7F) as u8;
                vec![0xE0 | (channel & 0x0F), lsb, msb]
            }
            MidiData::SysEx { data } => {
                let mut bytes = Vec::with_capacity(data.len() + 2);
                bytes.push(0xF0);
                bytes.extend_from_slice(data);
                bytes.push(0xF7);
                bytes
            }
            MidiData::TimeCodeQuarterFrame {
                message_type,
                value,
            } => {
                vec![0xF1, ((message_type & 0x07) << 4) | (value & 0x0F)]
            }
            MidiData::SongPositionPointer { position } => {
                let lsb = (*position & 0x7F) as u8;
                let msb = ((*position >> 7) & 0x7F) as u8;
                vec![0xF2, lsb, msb]
            }
            MidiData::SongSelect { song } => vec![0xF3, song & 0x7F],
            MidiData::TuneRequest => vec![0xF6],
            MidiData::TimingClock => vec![0xF8],
            MidiData::Start => vec![0xFA],
            MidiData::Continue => vec![0xFB],
            MidiData::Stop => vec![0xFC],
            MidiData::ActiveSensing => vec![0xFE],
            MidiData::SystemReset => vec![0xFF],
        }
    }
}
