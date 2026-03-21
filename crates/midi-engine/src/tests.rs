//! Comprehensive tests for the MIDI engine.

use crate::message::{MidiData, MidiMessage};
use crate::parse::{ParseError, RawMidi};
use crate::port::{MidiDeviceInfo, MidiEngine, MidiPort};

// ═══════════════════════════════════════════════════════════════════
//  MidiMessage and MidiData type tests
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_midi_message_new() {
    let msg = MidiMessage::new(
        12345,
        MidiData::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100,
        },
    );
    assert_eq!(msg.timestamp, 12345);
    assert_eq!(
        msg.data,
        MidiData::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100
        }
    );
}

#[test]
fn test_midi_message_clone_eq() {
    let msg1 = MidiMessage::new(
        100,
        MidiData::NoteOff {
            channel: 3,
            note: 72,
            velocity: 64,
        },
    );
    let msg2 = msg1.clone();
    assert_eq!(msg1, msg2);
}

// ── Channel method ──────────────────────────────────────────────

#[test]
fn test_channel_voice_messages_have_channel() {
    let cases: Vec<(MidiData, u8)> = vec![
        (
            MidiData::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
            0,
        ),
        (
            MidiData::NoteOff {
                channel: 5,
                note: 60,
                velocity: 0,
            },
            5,
        ),
        (
            MidiData::ControlChange {
                channel: 9,
                controller: 7,
                value: 127,
            },
            9,
        ),
        (MidiData::PitchBend { channel: 15, value: 0 }, 15),
        (
            MidiData::Aftertouch {
                channel: 1,
                pressure: 80,
            },
            1,
        ),
        (
            MidiData::PolyAftertouch {
                channel: 2,
                note: 64,
                pressure: 50,
            },
            2,
        ),
        (
            MidiData::ProgramChange {
                channel: 10,
                program: 42,
            },
            10,
        ),
    ];

    for (data, expected_ch) in cases {
        assert_eq!(data.channel(), Some(expected_ch), "failed for {:?}", data);
    }
}

#[test]
fn test_system_messages_have_no_channel() {
    let system_msgs = vec![
        MidiData::SysEx {
            data: vec![0x7E, 0x7F, 0x09, 0x01],
        },
        MidiData::TimeCodeQuarterFrame {
            message_type: 0,
            value: 0,
        },
        MidiData::SongPositionPointer { position: 0 },
        MidiData::SongSelect { song: 0 },
        MidiData::TuneRequest,
        MidiData::TimingClock,
        MidiData::Start,
        MidiData::Continue,
        MidiData::Stop,
        MidiData::ActiveSensing,
        MidiData::SystemReset,
    ];

    for data in system_msgs {
        assert_eq!(data.channel(), None, "expected None for {:?}", data);
    }
}

// ── Classification helpers ──────────────────────────────────────

#[test]
fn test_is_channel_voice() {
    assert!(MidiData::NoteOn {
        channel: 0,
        note: 60,
        velocity: 100
    }
    .is_channel_voice());
    assert!(MidiData::NoteOff {
        channel: 0,
        note: 60,
        velocity: 0
    }
    .is_channel_voice());
    assert!(MidiData::ControlChange {
        channel: 0,
        controller: 1,
        value: 64
    }
    .is_channel_voice());
    assert!(MidiData::PitchBend {
        channel: 0,
        value: 0
    }
    .is_channel_voice());
    assert!(MidiData::Aftertouch {
        channel: 0,
        pressure: 0
    }
    .is_channel_voice());
    assert!(MidiData::PolyAftertouch {
        channel: 0,
        note: 0,
        pressure: 0
    }
    .is_channel_voice());
    assert!(MidiData::ProgramChange {
        channel: 0,
        program: 0
    }
    .is_channel_voice());

    // System messages are NOT channel voice
    assert!(!MidiData::TimingClock.is_channel_voice());
    assert!(!MidiData::Start.is_channel_voice());
    assert!(!MidiData::SysEx { data: vec![] }.is_channel_voice());
}

#[test]
fn test_is_realtime() {
    let realtime = vec![
        MidiData::TimingClock,
        MidiData::Start,
        MidiData::Continue,
        MidiData::Stop,
        MidiData::ActiveSensing,
        MidiData::SystemReset,
    ];
    for msg in &realtime {
        assert!(msg.is_realtime(), "expected realtime: {:?}", msg);
        assert!(!msg.is_channel_voice());
    }

    // Non-realtime
    assert!(!MidiData::NoteOn {
        channel: 0,
        note: 60,
        velocity: 100
    }
    .is_realtime());
    assert!(!MidiData::SysEx { data: vec![] }.is_realtime());
}

#[test]
fn test_is_system_common() {
    assert!(MidiData::SysEx { data: vec![] }.is_system_common());
    assert!(MidiData::TimeCodeQuarterFrame {
        message_type: 0,
        value: 0
    }
    .is_system_common());
    assert!(MidiData::SongPositionPointer { position: 0 }.is_system_common());
    assert!(MidiData::SongSelect { song: 0 }.is_system_common());
    assert!(MidiData::TuneRequest.is_system_common());

    // Real-time messages are NOT system common
    assert!(!MidiData::TimingClock.is_system_common());
    assert!(!MidiData::NoteOn {
        channel: 0,
        note: 60,
        velocity: 100
    }
    .is_system_common());
}

// ═══════════════════════════════════════════════════════════════════
//  Serialization (to_bytes) tests
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_note_on_to_bytes() {
    let data = MidiData::NoteOn {
        channel: 0,
        note: 60,
        velocity: 100,
    };
    assert_eq!(data.to_bytes(), vec![0x90, 60, 100]);
}

#[test]
fn test_note_on_channel_15() {
    let data = MidiData::NoteOn {
        channel: 15,
        note: 127,
        velocity: 127,
    };
    assert_eq!(data.to_bytes(), vec![0x9F, 127, 127]);
}

#[test]
fn test_note_off_to_bytes() {
    let data = MidiData::NoteOff {
        channel: 3,
        note: 72,
        velocity: 64,
    };
    assert_eq!(data.to_bytes(), vec![0x83, 72, 64]);
}

#[test]
fn test_control_change_to_bytes() {
    let data = MidiData::ControlChange {
        channel: 0,
        controller: 7,
        value: 100,
    };
    assert_eq!(data.to_bytes(), vec![0xB0, 7, 100]);
}

#[test]
fn test_program_change_to_bytes() {
    let data = MidiData::ProgramChange {
        channel: 5,
        program: 42,
    };
    assert_eq!(data.to_bytes(), vec![0xC5, 42]);
}

#[test]
fn test_aftertouch_to_bytes() {
    let data = MidiData::Aftertouch {
        channel: 1,
        pressure: 80,
    };
    assert_eq!(data.to_bytes(), vec![0xD1, 80]);
}

#[test]
fn test_poly_aftertouch_to_bytes() {
    let data = MidiData::PolyAftertouch {
        channel: 2,
        note: 64,
        pressure: 50,
    };
    assert_eq!(data.to_bytes(), vec![0xA2, 64, 50]);
}

#[test]
fn test_pitch_bend_center_to_bytes() {
    let data = MidiData::PitchBend {
        channel: 0,
        value: 0,
    };
    // center = 8192 = 0x2000 → LSB=0x00, MSB=0x40
    assert_eq!(data.to_bytes(), vec![0xE0, 0x00, 0x40]);
}

#[test]
fn test_pitch_bend_min_to_bytes() {
    let data = MidiData::PitchBend {
        channel: 0,
        value: -8192,
    };
    // min = 0 → LSB=0x00, MSB=0x00
    assert_eq!(data.to_bytes(), vec![0xE0, 0x00, 0x00]);
}

#[test]
fn test_pitch_bend_max_to_bytes() {
    let data = MidiData::PitchBend {
        channel: 0,
        value: 8191,
    };
    // max = 16383 = 0x3FFF → LSB=0x7F, MSB=0x7F
    assert_eq!(data.to_bytes(), vec![0xE0, 0x7F, 0x7F]);
}

#[test]
fn test_sysex_to_bytes() {
    let data = MidiData::SysEx {
        data: vec![0x7E, 0x7F, 0x09, 0x01],
    };
    assert_eq!(data.to_bytes(), vec![0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7]);
}

#[test]
fn test_sysex_empty_to_bytes() {
    let data = MidiData::SysEx { data: vec![] };
    assert_eq!(data.to_bytes(), vec![0xF0, 0xF7]);
}

#[test]
fn test_time_code_quarter_frame_to_bytes() {
    let data = MidiData::TimeCodeQuarterFrame {
        message_type: 3,
        value: 5,
    };
    // byte = (3 << 4) | 5 = 0x35
    assert_eq!(data.to_bytes(), vec![0xF1, 0x35]);
}

#[test]
fn test_song_position_pointer_to_bytes() {
    let data = MidiData::SongPositionPointer { position: 1000 };
    // 1000 = 0b0000_0111_1101_000 → LSB = 1000 & 0x7F = 104, MSB = (1000 >> 7) & 0x7F = 7
    let lsb = (1000u16 & 0x7F) as u8;
    let msb = ((1000u16 >> 7) & 0x7F) as u8;
    assert_eq!(data.to_bytes(), vec![0xF2, lsb, msb]);
}

#[test]
fn test_song_select_to_bytes() {
    let data = MidiData::SongSelect { song: 42 };
    assert_eq!(data.to_bytes(), vec![0xF3, 42]);
}

#[test]
fn test_tune_request_to_bytes() {
    assert_eq!(MidiData::TuneRequest.to_bytes(), vec![0xF6]);
}

#[test]
fn test_realtime_to_bytes() {
    assert_eq!(MidiData::TimingClock.to_bytes(), vec![0xF8]);
    assert_eq!(MidiData::Start.to_bytes(), vec![0xFA]);
    assert_eq!(MidiData::Continue.to_bytes(), vec![0xFB]);
    assert_eq!(MidiData::Stop.to_bytes(), vec![0xFC]);
    assert_eq!(MidiData::ActiveSensing.to_bytes(), vec![0xFE]);
    assert_eq!(MidiData::SystemReset.to_bytes(), vec![0xFF]);
}

// ═══════════════════════════════════════════════════════════════════
//  Parsing tests
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_parse_note_on() {
    let (data, consumed) = RawMidi::parse(&[0x90, 60, 100]).unwrap();
    assert_eq!(consumed, 3);
    assert_eq!(
        data,
        MidiData::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100
        }
    );
}

#[test]
fn test_parse_note_on_channel_15() {
    let (data, _) = RawMidi::parse(&[0x9F, 127, 127]).unwrap();
    assert_eq!(
        data,
        MidiData::NoteOn {
            channel: 15,
            note: 127,
            velocity: 127
        }
    );
}

#[test]
fn test_parse_note_off() {
    let (data, consumed) = RawMidi::parse(&[0x83, 72, 64]).unwrap();
    assert_eq!(consumed, 3);
    assert_eq!(
        data,
        MidiData::NoteOff {
            channel: 3,
            note: 72,
            velocity: 64
        }
    );
}

#[test]
fn test_parse_control_change() {
    let (data, consumed) = RawMidi::parse(&[0xB0, 7, 100]).unwrap();
    assert_eq!(consumed, 3);
    assert_eq!(
        data,
        MidiData::ControlChange {
            channel: 0,
            controller: 7,
            value: 100
        }
    );
}

#[test]
fn test_parse_program_change() {
    let (data, consumed) = RawMidi::parse(&[0xC5, 42]).unwrap();
    assert_eq!(consumed, 2);
    assert_eq!(
        data,
        MidiData::ProgramChange {
            channel: 5,
            program: 42
        }
    );
}

#[test]
fn test_parse_aftertouch() {
    let (data, consumed) = RawMidi::parse(&[0xD1, 80]).unwrap();
    assert_eq!(consumed, 2);
    assert_eq!(
        data,
        MidiData::Aftertouch {
            channel: 1,
            pressure: 80
        }
    );
}

#[test]
fn test_parse_poly_aftertouch() {
    let (data, consumed) = RawMidi::parse(&[0xA2, 64, 50]).unwrap();
    assert_eq!(consumed, 3);
    assert_eq!(
        data,
        MidiData::PolyAftertouch {
            channel: 2,
            note: 64,
            pressure: 50
        }
    );
}

#[test]
fn test_parse_pitch_bend_center() {
    let (data, consumed) = RawMidi::parse(&[0xE0, 0x00, 0x40]).unwrap();
    assert_eq!(consumed, 3);
    assert_eq!(data, MidiData::PitchBend { channel: 0, value: 0 });
}

#[test]
fn test_parse_pitch_bend_min() {
    let (data, _) = RawMidi::parse(&[0xE0, 0x00, 0x00]).unwrap();
    assert_eq!(
        data,
        MidiData::PitchBend {
            channel: 0,
            value: -8192
        }
    );
}

#[test]
fn test_parse_pitch_bend_max() {
    let (data, _) = RawMidi::parse(&[0xE0, 0x7F, 0x7F]).unwrap();
    assert_eq!(
        data,
        MidiData::PitchBend {
            channel: 0,
            value: 8191
        }
    );
}

#[test]
fn test_parse_sysex() {
    let bytes = [0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7];
    let (data, consumed) = RawMidi::parse(&bytes).unwrap();
    assert_eq!(consumed, 6);
    assert_eq!(
        data,
        MidiData::SysEx {
            data: vec![0x7E, 0x7F, 0x09, 0x01]
        }
    );
}

#[test]
fn test_parse_sysex_empty() {
    let bytes = [0xF0, 0xF7];
    let (data, consumed) = RawMidi::parse(&bytes).unwrap();
    assert_eq!(consumed, 2);
    assert_eq!(data, MidiData::SysEx { data: vec![] });
}

#[test]
fn test_parse_time_code_quarter_frame() {
    let (data, consumed) = RawMidi::parse(&[0xF1, 0x35]).unwrap();
    assert_eq!(consumed, 2);
    assert_eq!(
        data,
        MidiData::TimeCodeQuarterFrame {
            message_type: 3,
            value: 5
        }
    );
}

#[test]
fn test_parse_song_position_pointer() {
    let lsb = (1000u16 & 0x7F) as u8;
    let msb = ((1000u16 >> 7) & 0x7F) as u8;
    let (data, consumed) = RawMidi::parse(&[0xF2, lsb, msb]).unwrap();
    assert_eq!(consumed, 3);
    assert_eq!(data, MidiData::SongPositionPointer { position: 1000 });
}

#[test]
fn test_parse_song_select() {
    let (data, consumed) = RawMidi::parse(&[0xF3, 42]).unwrap();
    assert_eq!(consumed, 2);
    assert_eq!(data, MidiData::SongSelect { song: 42 });
}

#[test]
fn test_parse_tune_request() {
    let (data, consumed) = RawMidi::parse(&[0xF6]).unwrap();
    assert_eq!(consumed, 1);
    assert_eq!(data, MidiData::TuneRequest);
}

#[test]
fn test_parse_realtime_messages() {
    let cases = vec![
        (0xF8u8, MidiData::TimingClock),
        (0xFA, MidiData::Start),
        (0xFB, MidiData::Continue),
        (0xFC, MidiData::Stop),
        (0xFE, MidiData::ActiveSensing),
        (0xFF, MidiData::SystemReset),
    ];
    for (byte, expected) in cases {
        let (data, consumed) = RawMidi::parse(&[byte]).unwrap();
        assert_eq!(consumed, 1);
        assert_eq!(data, expected, "failed for byte 0x{byte:02X}");
    }
}

// ── Parse error tests ───────────────────────────────────────────

#[test]
fn test_parse_empty_input() {
    let result = RawMidi::parse(&[]);
    assert_eq!(result, Err(ParseError::EmptyInput));
}

#[test]
fn test_parse_invalid_status_byte() {
    // Data byte (< 0x80) as first byte
    let result = RawMidi::parse(&[0x60]);
    assert_eq!(result, Err(ParseError::InvalidStatusByte(0x60)));
}

#[test]
fn test_parse_insufficient_data_note_on() {
    let result = RawMidi::parse(&[0x90, 60]);
    assert_eq!(
        result,
        Err(ParseError::InsufficientData {
            expected: 2,
            got: 1
        })
    );
}

#[test]
fn test_parse_insufficient_data_note_on_single_byte() {
    let result = RawMidi::parse(&[0x90]);
    assert_eq!(
        result,
        Err(ParseError::InsufficientData {
            expected: 2,
            got: 0
        })
    );
}

#[test]
fn test_parse_insufficient_data_program_change() {
    let result = RawMidi::parse(&[0xC0]);
    assert_eq!(
        result,
        Err(ParseError::InsufficientData {
            expected: 1,
            got: 0
        })
    );
}

#[test]
fn test_parse_insufficient_data_pitch_bend() {
    let result = RawMidi::parse(&[0xE0, 0x00]);
    assert_eq!(
        result,
        Err(ParseError::InsufficientData {
            expected: 2,
            got: 1
        })
    );
}

#[test]
fn test_parse_insufficient_data_song_position() {
    let result = RawMidi::parse(&[0xF2, 0x00]);
    assert_eq!(
        result,
        Err(ParseError::InsufficientData {
            expected: 2,
            got: 1
        })
    );
}

#[test]
fn test_parse_insufficient_data_song_select() {
    let result = RawMidi::parse(&[0xF3]);
    assert_eq!(
        result,
        Err(ParseError::InsufficientData {
            expected: 1,
            got: 0
        })
    );
}

#[test]
fn test_parse_insufficient_data_time_code() {
    let result = RawMidi::parse(&[0xF1]);
    assert_eq!(
        result,
        Err(ParseError::InsufficientData {
            expected: 1,
            got: 0
        })
    );
}

#[test]
fn test_parse_unterminated_sysex() {
    let result = RawMidi::parse(&[0xF0, 0x7E, 0x7F]);
    assert_eq!(result, Err(ParseError::UnterminatedSysEx));
}

#[test]
fn test_parse_invalid_system_status_bytes() {
    // 0xF4 and 0xF5 are undefined in MIDI 1.0
    assert!(matches!(
        RawMidi::parse(&[0xF4]),
        Err(ParseError::InvalidStatusByte(0xF4))
    ));
    assert!(matches!(
        RawMidi::parse(&[0xF5]),
        Err(ParseError::InvalidStatusByte(0xF5))
    ));
    // 0xF7 alone (end of SysEx without start)
    assert!(matches!(
        RawMidi::parse(&[0xF7]),
        Err(ParseError::InvalidStatusByte(0xF7))
    ));
    // 0xF9 and 0xFD are undefined
    assert!(matches!(
        RawMidi::parse(&[0xF9]),
        Err(ParseError::InvalidStatusByte(0xF9))
    ));
    assert!(matches!(
        RawMidi::parse(&[0xFD]),
        Err(ParseError::InvalidStatusByte(0xFD))
    ));
}

// ── parse_with_timestamp ────────────────────────────────────────

#[test]
fn test_parse_with_timestamp() {
    let (msg, consumed) = RawMidi::parse_with_timestamp(999, &[0x90, 60, 100]).unwrap();
    assert_eq!(consumed, 3);
    assert_eq!(msg.timestamp, 999);
    assert_eq!(
        msg.data,
        MidiData::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100
        }
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Round-trip tests: to_bytes → parse → compare
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_roundtrip_all_channel_messages() {
    let messages = vec![
        MidiData::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100,
        },
        MidiData::NoteOn {
            channel: 15,
            note: 127,
            velocity: 0,
        },
        MidiData::NoteOff {
            channel: 3,
            note: 72,
            velocity: 64,
        },
        MidiData::ControlChange {
            channel: 9,
            controller: 1,
            value: 64,
        },
        MidiData::ControlChange {
            channel: 0,
            controller: 127,
            value: 127,
        },
        MidiData::ProgramChange {
            channel: 5,
            program: 42,
        },
        MidiData::ProgramChange {
            channel: 0,
            program: 0,
        },
        MidiData::Aftertouch {
            channel: 1,
            pressure: 80,
        },
        MidiData::PolyAftertouch {
            channel: 2,
            note: 64,
            pressure: 50,
        },
        MidiData::PitchBend {
            channel: 0,
            value: 0,
        },
        MidiData::PitchBend {
            channel: 7,
            value: -8192,
        },
        MidiData::PitchBend {
            channel: 15,
            value: 8191,
        },
        MidiData::PitchBend {
            channel: 4,
            value: 1000,
        },
        MidiData::PitchBend {
            channel: 4,
            value: -1000,
        },
    ];

    for original in &messages {
        let bytes = original.to_bytes();
        let (parsed, consumed) = RawMidi::parse(&bytes).unwrap();
        assert_eq!(consumed, bytes.len(), "consumed mismatch for {:?}", original);
        assert_eq!(
            &parsed, original,
            "round-trip failed for {:?} → {:?} → {:?}",
            original, bytes, parsed
        );
    }
}

#[test]
fn test_roundtrip_system_common_messages() {
    let messages = vec![
        MidiData::SysEx {
            data: vec![0x7E, 0x7F, 0x09, 0x01],
        },
        MidiData::SysEx { data: vec![] },
        MidiData::TimeCodeQuarterFrame {
            message_type: 7,
            value: 15,
        },
        MidiData::TimeCodeQuarterFrame {
            message_type: 0,
            value: 0,
        },
        MidiData::SongPositionPointer { position: 0 },
        MidiData::SongPositionPointer { position: 16383 },
        MidiData::SongPositionPointer { position: 1000 },
        MidiData::SongSelect { song: 0 },
        MidiData::SongSelect { song: 127 },
        MidiData::TuneRequest,
    ];

    for original in &messages {
        let bytes = original.to_bytes();
        let (parsed, consumed) = RawMidi::parse(&bytes).unwrap();
        assert_eq!(consumed, bytes.len(), "consumed mismatch for {:?}", original);
        assert_eq!(
            &parsed, original,
            "round-trip failed for {:?} → {:?} → {:?}",
            original, bytes, parsed
        );
    }
}

#[test]
fn test_roundtrip_realtime_messages() {
    let messages = vec![
        MidiData::TimingClock,
        MidiData::Start,
        MidiData::Continue,
        MidiData::Stop,
        MidiData::ActiveSensing,
        MidiData::SystemReset,
    ];

    for original in &messages {
        let bytes = original.to_bytes();
        let (parsed, consumed) = RawMidi::parse(&bytes).unwrap();
        assert_eq!(consumed, bytes.len());
        assert_eq!(&parsed, original, "round-trip failed for {:?}", original);
    }
}

// ═══════════════════════════════════════════════════════════════════
//  to_bytes boundary value / masking tests
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_to_bytes_masks_channel() {
    // Channel values > 15 should be masked
    let data = MidiData::NoteOn {
        channel: 0xFF,
        note: 60,
        velocity: 100,
    };
    let bytes = data.to_bytes();
    assert_eq!(bytes[0], 0x9F); // 0xFF & 0x0F = 0x0F → 0x90 | 0x0F = 0x9F
}

#[test]
fn test_to_bytes_masks_data_bytes() {
    let data = MidiData::NoteOn {
        channel: 0,
        note: 0xFF,
        velocity: 0xFF,
    };
    let bytes = data.to_bytes();
    assert_eq!(bytes[1], 0x7F); // masked to 7 bits
    assert_eq!(bytes[2], 0x7F);
}

#[test]
fn test_pitch_bend_clamps_extreme_values() {
    // Values outside -8192..8191 should be clamped
    let data = MidiData::PitchBend {
        channel: 0,
        value: -10000,
    };
    let bytes = data.to_bytes();
    // Should clamp to -8192 → unsigned 0 → LSB=0, MSB=0
    assert_eq!(bytes, vec![0xE0, 0x00, 0x00]);

    let data = MidiData::PitchBend {
        channel: 0,
        value: 10000,
    };
    let bytes = data.to_bytes();
    // Should clamp to 8191 → unsigned 16383 → LSB=0x7F, MSB=0x7F
    assert_eq!(bytes, vec![0xE0, 0x7F, 0x7F]);
}

// ═══════════════════════════════════════════════════════════════════
//  Parse error Display tests
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_parse_error_display() {
    let err = ParseError::EmptyInput;
    assert_eq!(format!("{err}"), "empty input");

    let err = ParseError::InvalidStatusByte(0x42);
    assert_eq!(format!("{err}"), "invalid status byte: 0x42");

    let err = ParseError::InsufficientData {
        expected: 2,
        got: 1,
    };
    assert_eq!(format!("{err}"), "expected 2 data bytes, got 1");

    let err = ParseError::UnterminatedSysEx;
    assert_eq!(format!("{err}"), "unterminated SysEx message");

    let err = ParseError::InvalidDataByte(0x80);
    assert_eq!(format!("{err}"), "invalid data byte: 0x80");
}

#[test]
fn test_parse_error_is_std_error() {
    let err: Box<dyn std::error::Error> = Box::new(ParseError::EmptyInput);
    // Just verifying the trait object compiles and displays
    assert!(!format!("{err}").is_empty());
}

// ═══════════════════════════════════════════════════════════════════
//  Port / Device management tests
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_midi_device_info_clone_eq() {
    let info = MidiDeviceInfo {
        index: 0,
        name: "Test Device".to_string(),
    };
    let cloned = info.clone();
    assert_eq!(info, cloned);
}

#[test]
fn test_midi_device_info_debug() {
    let info = MidiDeviceInfo {
        index: 1,
        name: "My MIDI Keyboard".to_string(),
    };
    let debug = format!("{info:?}");
    assert!(debug.contains("My MIDI Keyboard"));
    assert!(debug.contains("1"));
}

#[test]
fn test_list_inputs_does_not_panic() {
    // This test verifies that list_inputs can be called without panicking.
    // On CI or machines without MIDI hardware, the list may be empty.
    let result = MidiPort::list_inputs();
    assert!(result.is_ok());
}

#[test]
fn test_list_outputs_does_not_panic() {
    let result = MidiPort::list_outputs();
    assert!(result.is_ok());
}

#[test]
fn test_open_input_nonexistent_device() {
    let result = MidiPort::open_input("__nonexistent_device_12345__");
    assert!(result.is_err());
}

#[test]
fn test_open_output_nonexistent_device() {
    let result = MidiPort::open_output("__nonexistent_device_12345__");
    assert!(result.is_err());
}

#[test]
fn test_midi_port_error_display() {
    let e = crate::port::MidiPortError::InitFailed("boom".into());
    assert_eq!(format!("{e}"), "MIDI init failed: boom");

    let e = crate::port::MidiPortError::DeviceNotFound("dev".into());
    assert_eq!(format!("{e}"), "MIDI device not found: dev");

    let e = crate::port::MidiPortError::OpenFailed("oops".into());
    assert_eq!(format!("{e}"), "failed to open MIDI port: oops");

    let e = crate::port::MidiPortError::SendFailed("err".into());
    assert_eq!(format!("{e}"), "failed to send MIDI: err");

    let e = crate::port::MidiPortError::ConnectionError("disc".into());
    assert_eq!(format!("{e}"), "MIDI connection error: disc");
}

#[test]
fn test_midi_port_error_is_std_error() {
    let err: Box<dyn std::error::Error> = Box::new(crate::port::MidiPortError::InitFailed("x".into()));
    assert!(!format!("{err}").is_empty());
}

// ═══════════════════════════════════════════════════════════════════
//  MidiEngine tests
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_midi_engine_new() {
    let engine = MidiEngine::new();
    assert!(engine.is_ok());
}

#[test]
fn test_midi_engine_default() {
    let _engine = MidiEngine::default();
}

#[test]
fn test_midi_engine_list_inputs() {
    let engine = MidiEngine::new().unwrap();
    let result = engine.list_inputs();
    assert!(result.is_ok());
}

#[test]
fn test_midi_engine_list_outputs() {
    let engine = MidiEngine::new().unwrap();
    let result = engine.list_outputs();
    assert!(result.is_ok());
}

#[test]
fn test_midi_engine_open_nonexistent_input() {
    let engine = MidiEngine::new().unwrap();
    let result = engine.open_input("__nonexistent__");
    assert!(result.is_err());
}

#[test]
fn test_midi_engine_open_nonexistent_output() {
    let engine = MidiEngine::new().unwrap();
    let result = engine.open_output("__nonexistent__");
    assert!(result.is_err());
}

// ═══════════════════════════════════════════════════════════════════
//  Virtual port tests (macOS/Linux only)
// ═══════════════════════════════════════════════════════════════════

#[cfg(not(target_os = "windows"))]
mod virtual_port_tests {
    use super::*;

    #[test]
    fn test_create_virtual_input() {
        let engine = MidiEngine::new().unwrap();
        let result = engine.create_virtual_input("Chord Test Virtual In");
        assert!(result.is_ok());
        let (input, _receiver) = result.unwrap();
        assert_eq!(input.port_name, "Chord Test Virtual In");
    }

    #[test]
    fn test_create_virtual_output() {
        let engine = MidiEngine::new().unwrap();
        let result = engine.create_virtual_output("Chord Test Virtual Out");
        assert!(result.is_ok());
        let output = result.unwrap();
        assert_eq!(output.port_name, "Chord Test Virtual Out");
    }

    #[test]
    fn test_virtual_output_send_message() {
        let engine = MidiEngine::new().unwrap();
        let mut output = engine
            .create_virtual_output("Chord Test Send")
            .unwrap();
        let msg = MidiMessage::new(
            0,
            MidiData::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
        );
        // Should succeed even if nobody is listening
        let result = output.send_message(&msg);
        assert!(result.is_ok());
    }

    #[test]
    fn test_virtual_output_send_data() {
        let engine = MidiEngine::new().unwrap();
        let mut output = engine
            .create_virtual_output("Chord Test Send Data")
            .unwrap();
        let data = MidiData::ControlChange {
            channel: 0,
            controller: 7,
            value: 100,
        };
        let result = output.send_data(&data);
        assert!(result.is_ok());
    }

    #[test]
    fn test_virtual_output_send_raw() {
        let engine = MidiEngine::new().unwrap();
        let mut output = engine
            .create_virtual_output("Chord Test Send Raw")
            .unwrap();
        let result = output.send_raw(&[0x90, 60, 100]);
        assert!(result.is_ok());
    }

    #[test]
    fn test_receiver_try_recv_empty() {
        let engine = MidiEngine::new().unwrap();
        let (_input, receiver) = engine
            .create_virtual_input("Chord Test Recv Empty")
            .unwrap();
        // No messages sent, should return None
        let result = receiver.try_recv().unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_receiver_drain_empty() {
        let engine = MidiEngine::new().unwrap();
        let (_input, receiver) = engine
            .create_virtual_input("Chord Test Drain Empty")
            .unwrap();
        let messages = receiver.drain();
        assert!(messages.is_empty());
    }
}

// ═══════════════════════════════════════════════════════════════════
//  Additional edge case / coverage tests
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_parse_extra_bytes_ignored() {
    // Parser should consume only the message bytes and report consumed count
    let (data, consumed) = RawMidi::parse(&[0x90, 60, 100, 0xFF, 0xFF]).unwrap();
    assert_eq!(consumed, 3);
    assert_eq!(
        data,
        MidiData::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100
        }
    );
}

#[test]
fn test_parse_sysex_with_trailing_data() {
    let bytes = [0xF0, 0x01, 0x02, 0xF7, 0x90, 0x3C, 0x64];
    let (data, consumed) = RawMidi::parse(&bytes).unwrap();
    assert_eq!(consumed, 4); // F0, 01, 02, F7
    assert_eq!(data, MidiData::SysEx { data: vec![0x01, 0x02] });
}

#[test]
fn test_all_channels_roundtrip() {
    // Verify all 16 channels round-trip correctly for NoteOn
    for ch in 0..16u8 {
        let original = MidiData::NoteOn {
            channel: ch,
            note: 60,
            velocity: 100,
        };
        let bytes = original.to_bytes();
        let (parsed, _) = RawMidi::parse(&bytes).unwrap();
        assert_eq!(parsed, original, "channel {ch} failed round-trip");
    }
}

#[test]
fn test_all_notes_roundtrip() {
    // Verify all 128 note values round-trip correctly
    for note in 0..128u8 {
        let original = MidiData::NoteOn {
            channel: 0,
            note,
            velocity: 100,
        };
        let bytes = original.to_bytes();
        let (parsed, _) = RawMidi::parse(&bytes).unwrap();
        assert_eq!(parsed, original, "note {note} failed round-trip");
    }
}

#[test]
fn test_all_velocities_roundtrip() {
    for vel in 0..128u8 {
        let original = MidiData::NoteOn {
            channel: 0,
            note: 60,
            velocity: vel,
        };
        let bytes = original.to_bytes();
        let (parsed, _) = RawMidi::parse(&bytes).unwrap();
        assert_eq!(parsed, original, "velocity {vel} failed round-trip");
    }
}

#[test]
fn test_all_cc_controllers_roundtrip() {
    for cc in 0..128u8 {
        let original = MidiData::ControlChange {
            channel: 0,
            controller: cc,
            value: 64,
        };
        let bytes = original.to_bytes();
        let (parsed, _) = RawMidi::parse(&bytes).unwrap();
        assert_eq!(parsed, original, "CC {cc} failed round-trip");
    }
}

#[test]
fn test_pitch_bend_full_range_roundtrip() {
    // Test a range of pitch bend values from min to max
    for value in (-8192..=8191).step_by(100) {
        let original = MidiData::PitchBend {
            channel: 0,
            value: value as i16,
        };
        let bytes = original.to_bytes();
        let (parsed, _) = RawMidi::parse(&bytes).unwrap();
        assert_eq!(
            parsed, original,
            "pitch bend {value} failed round-trip"
        );
    }
    // Also test exact min and max
    for value in [-8192i16, 8191] {
        let original = MidiData::PitchBend { channel: 0, value };
        let bytes = original.to_bytes();
        let (parsed, _) = RawMidi::parse(&bytes).unwrap();
        assert_eq!(parsed, original);
    }
}

#[test]
fn test_song_position_pointer_full_range() {
    for pos in (0..=16383u16).step_by(1000) {
        let original = MidiData::SongPositionPointer { position: pos };
        let bytes = original.to_bytes();
        let (parsed, _) = RawMidi::parse(&bytes).unwrap();
        assert_eq!(parsed, original, "SPP {pos} failed round-trip");
    }
    // Also test exact max
    let original = MidiData::SongPositionPointer { position: 16383 };
    let bytes = original.to_bytes();
    let (parsed, _) = RawMidi::parse(&bytes).unwrap();
    assert_eq!(parsed, original);
}

#[test]
fn test_midi_data_debug_format() {
    let data = MidiData::NoteOn {
        channel: 0,
        note: 60,
        velocity: 100,
    };
    let debug = format!("{data:?}");
    assert!(debug.contains("NoteOn"));
    assert!(debug.contains("60"));
    assert!(debug.contains("100"));
}

#[test]
fn test_midi_message_debug_format() {
    let msg = MidiMessage::new(
        42,
        MidiData::Stop,
    );
    let debug = format!("{msg:?}");
    assert!(debug.contains("42"));
    assert!(debug.contains("Stop"));
}
