# midi-engine

> **Tier 0** — No dependencies. Can be built immediately.

## What This Is

MIDI I/O and message types. Handles hardware MIDI devices, virtual ports, and provides the core MIDI data types used throughout the system.

## Public API

```rust
pub struct MidiMessage {
    pub timestamp: u64, // sample-accurate
    pub data: MidiData,
}

pub enum MidiData {
    NoteOn { channel: u8, note: u8, velocity: u8 },
    NoteOff { channel: u8, note: u8, velocity: u8 },
    ControlChange { channel: u8, controller: u8, value: u8 },
    PitchBend { channel: u8, value: i16 },
    Aftertouch { channel: u8, pressure: u8 },
    PolyAftertouch { channel: u8, note: u8, pressure: u8 },
    ProgramChange { channel: u8, program: u8 },
    // ... all MIDI 1.0 messages
}

pub struct MidiPort;
impl MidiPort {
    pub fn list_inputs() -> Vec<MidiDeviceInfo>;
    pub fn list_outputs() -> Vec<MidiDeviceInfo>;
    pub fn open_input(device: &str) -> Result<MidiInput>;
    pub fn open_output(device: &str) -> Result<MidiOutput>;
}
```

## Dependencies
- External: `midir` crate

## Definition of Done
- [ ] All MIDI 1.0 message types defined
- [ ] Lists MIDI devices on macOS, Windows, Linux
- [ ] Opens MIDI input, receives messages with timestamps
- [ ] Opens MIDI output, sends messages
- [ ] Virtual MIDI port creation (macOS/Linux)
