//! MIDI port management: device enumeration, input/output, and virtual ports.

use std::sync::mpsc;

#[cfg(not(target_os = "windows"))]
use midir::os::unix::{VirtualInput, VirtualOutput};

use crate::message::{MidiData, MidiMessage};
use crate::parse::RawMidi;

/// Errors related to MIDI port operations.
#[derive(Debug)]
pub enum MidiPortError {
    /// Failed to initialize the MIDI subsystem.
    InitFailed(String),
    /// The requested device was not found.
    DeviceNotFound(String),
    /// Failed to open the requested port.
    OpenFailed(String),
    /// Failed to send a MIDI message.
    SendFailed(String),
    /// A connection error occurred.
    ConnectionError(String),
}

impl std::fmt::Display for MidiPortError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MidiPortError::InitFailed(msg) => write!(f, "MIDI init failed: {msg}"),
            MidiPortError::DeviceNotFound(name) => write!(f, "MIDI device not found: {name}"),
            MidiPortError::OpenFailed(msg) => write!(f, "failed to open MIDI port: {msg}"),
            MidiPortError::SendFailed(msg) => write!(f, "failed to send MIDI: {msg}"),
            MidiPortError::ConnectionError(msg) => write!(f, "MIDI connection error: {msg}"),
        }
    }
}

impl std::error::Error for MidiPortError {}

/// Information about an available MIDI device.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MidiDeviceInfo {
    /// The port index as reported by the system.
    pub index: usize,
    /// Human-readable name of the device/port.
    pub name: String,
}

/// Receives MIDI messages from an input connection.
///
/// Messages are delivered via an internal channel. Call [`MidiReceiver::try_recv`]
/// or [`MidiReceiver::recv`] to read them.
pub struct MidiReceiver {
    rx: mpsc::Receiver<MidiMessage>,
}

impl MidiReceiver {
    /// Block until a MIDI message is received.
    pub fn recv(&self) -> Result<MidiMessage, MidiPortError> {
        self.rx
            .recv()
            .map_err(|e| MidiPortError::ConnectionError(e.to_string()))
    }

    /// Try to receive a MIDI message without blocking.
    /// Returns `Ok(None)` if no message is available.
    pub fn try_recv(&self) -> Result<Option<MidiMessage>, MidiPortError> {
        match self.rx.try_recv() {
            Ok(msg) => Ok(Some(msg)),
            Err(mpsc::TryRecvError::Empty) => Ok(None),
            Err(mpsc::TryRecvError::Disconnected) => {
                Err(MidiPortError::ConnectionError("channel disconnected".into()))
            }
        }
    }

    /// Drain all currently available messages into a Vec without blocking.
    pub fn drain(&self) -> Vec<MidiMessage> {
        let mut msgs = Vec::new();
        while let Ok(msg) = self.rx.try_recv() {
            msgs.push(msg);
        }
        msgs
    }
}

/// An open MIDI input connection.
///
/// Keeps the underlying `midir` connection alive. When dropped, the connection
/// is closed and the callback is unregistered.
pub struct MidiInput {
    /// The name of the connected port.
    pub port_name: String,
    /// We hold the connection to keep it alive; dropping it closes the port.
    _connection: midir::MidiInputConnection<()>,
}

/// An open MIDI output connection.
pub struct MidiOutput {
    /// The name of the connected port.
    pub port_name: String,
    connection: midir::MidiOutputConnection,
}

impl MidiOutput {
    /// Send a [`MidiMessage`] through this output port.
    pub fn send_message(&mut self, message: &MidiMessage) -> Result<(), MidiPortError> {
        self.send_data(&message.data)
    }

    /// Send raw [`MidiData`] through this output port.
    pub fn send_data(&mut self, data: &MidiData) -> Result<(), MidiPortError> {
        let bytes = data.to_bytes();
        self.send_raw(&bytes)
    }

    /// Send raw bytes through this output port.
    pub fn send_raw(&mut self, bytes: &[u8]) -> Result<(), MidiPortError> {
        self.connection
            .send(bytes)
            .map_err(|e| MidiPortError::SendFailed(e.to_string()))
    }
}

/// Static helpers for listing and opening MIDI ports.
///
/// This is a convenience namespace — all methods are associated functions.
pub struct MidiPort;

impl MidiPort {
    /// List all available MIDI input devices/ports.
    pub fn list_inputs() -> Result<Vec<MidiDeviceInfo>, MidiPortError> {
        let midi_in = midir::MidiInput::new("chord-midi-engine-probe")
            .map_err(|e| MidiPortError::InitFailed(e.to_string()))?;
        let ports = midi_in.ports();
        let mut devices = Vec::with_capacity(ports.len());
        for (i, port) in ports.iter().enumerate() {
            let name = midi_in.port_name(port).unwrap_or_else(|_| format!("Input {i}"));
            devices.push(MidiDeviceInfo { index: i, name });
        }
        Ok(devices)
    }

    /// List all available MIDI output devices/ports.
    pub fn list_outputs() -> Result<Vec<MidiDeviceInfo>, MidiPortError> {
        let midi_out = midir::MidiOutput::new("chord-midi-engine-probe")
            .map_err(|e| MidiPortError::InitFailed(e.to_string()))?;
        let ports = midi_out.ports();
        let mut devices = Vec::with_capacity(ports.len());
        for (i, port) in ports.iter().enumerate() {
            let name = midi_out
                .port_name(port)
                .unwrap_or_else(|_| format!("Output {i}"));
            devices.push(MidiDeviceInfo { index: i, name });
        }
        Ok(devices)
    }

    /// Open a MIDI input by device name. Returns a [`MidiInput`] handle and a
    /// [`MidiReceiver`] that receives parsed MIDI messages from the device.
    ///
    /// The connection stays open until the returned [`MidiInput`] is dropped.
    pub fn open_input(device: &str) -> Result<(MidiInput, MidiReceiver), MidiPortError> {
        let midi_in = midir::MidiInput::new("chord-midi-engine-in")
            .map_err(|e| MidiPortError::InitFailed(e.to_string()))?;
        let ports = midi_in.ports();
        let port = ports
            .iter()
            .find(|p| {
                midi_in
                    .port_name(p)
                    .map(|n| n == device)
                    .unwrap_or(false)
            })
            .ok_or_else(|| MidiPortError::DeviceNotFound(device.to_string()))?
            .clone();

        let port_name = midi_in
            .port_name(&port)
            .unwrap_or_else(|_| device.to_string());

        let (tx, rx) = mpsc::channel::<MidiMessage>();

        let connection = midi_in
            .connect(
                &port,
                "chord-midi-input",
                move |timestamp_us, raw_bytes, _| {
                    if let Ok((data, _)) = RawMidi::parse(raw_bytes) {
                        let msg = MidiMessage::new(timestamp_us, data);
                        // If the receiver has been dropped, silently discard.
                        let _ = tx.send(msg);
                    }
                },
                (),
            )
            .map_err(|e| MidiPortError::OpenFailed(e.to_string()))?;

        Ok((
            MidiInput {
                port_name,
                _connection: connection,
            },
            MidiReceiver { rx },
        ))
    }

    /// Open a MIDI output by device name.
    pub fn open_output(device: &str) -> Result<MidiOutput, MidiPortError> {
        let midi_out = midir::MidiOutput::new("chord-midi-engine-out")
            .map_err(|e| MidiPortError::InitFailed(e.to_string()))?;
        let ports = midi_out.ports();
        let port = ports
            .iter()
            .find(|p| {
                midi_out
                    .port_name(p)
                    .map(|n| n == device)
                    .unwrap_or(false)
            })
            .ok_or_else(|| MidiPortError::DeviceNotFound(device.to_string()))?
            .clone();

        let port_name = midi_out
            .port_name(&port)
            .unwrap_or_else(|_| device.to_string());

        let connection = midi_out
            .connect(&port, "chord-midi-output")
            .map_err(|e| MidiPortError::OpenFailed(e.to_string()))?;

        Ok(MidiOutput {
            port_name,
            connection,
        })
    }
}

/// Higher-level MIDI engine that manages multiple ports and virtual devices.
///
/// Use [`MidiEngine::new`] to create an instance, then open ports as needed.
pub struct MidiEngine {
    _private: (),
}

impl MidiEngine {
    /// Create a new MIDI engine instance.
    pub fn new() -> Result<Self, MidiPortError> {
        Ok(Self { _private: () })
    }

    /// List all available MIDI input devices.
    pub fn list_inputs(&self) -> Result<Vec<MidiDeviceInfo>, MidiPortError> {
        MidiPort::list_inputs()
    }

    /// List all available MIDI output devices.
    pub fn list_outputs(&self) -> Result<Vec<MidiDeviceInfo>, MidiPortError> {
        MidiPort::list_outputs()
    }

    /// Open a MIDI input port by device name.
    pub fn open_input(&self, device: &str) -> Result<(MidiInput, MidiReceiver), MidiPortError> {
        MidiPort::open_input(device)
    }

    /// Open a MIDI output port by device name.
    pub fn open_output(&self, device: &str) -> Result<MidiOutput, MidiPortError> {
        MidiPort::open_output(device)
    }

    /// Create a virtual MIDI input port (macOS and Linux only).
    ///
    /// Other applications can see and connect to this virtual port.
    /// Returns a [`MidiReceiver`] that receives messages sent to the virtual port,
    /// along with a handle that keeps the port alive.
    #[cfg(not(target_os = "windows"))]
    pub fn create_virtual_input(
        &self,
        name: &str,
    ) -> Result<(MidiInput, MidiReceiver), MidiPortError> {
        let midi_in = midir::MidiInput::new("chord-midi-engine-virtual-in")
            .map_err(|e| MidiPortError::InitFailed(e.to_string()))?;

        let (tx, rx) = mpsc::channel::<MidiMessage>();
        let port_name = name.to_string();

        let connection = midi_in
            .create_virtual(
                name,
                move |timestamp_us, raw_bytes, _| {
                    if let Ok((data, _)) = RawMidi::parse(raw_bytes) {
                        let msg = MidiMessage::new(timestamp_us, data);
                        let _ = tx.send(msg);
                    }
                },
                (),
            )
            .map_err(|e: midir::ConnectError<midir::MidiInput>| MidiPortError::OpenFailed(e.to_string()))?;

        Ok((
            MidiInput {
                port_name,
                _connection: connection,
            },
            MidiReceiver { rx },
        ))
    }

    /// Create a virtual MIDI output port (macOS and Linux only).
    ///
    /// Other applications can see and connect to this virtual port.
    #[cfg(not(target_os = "windows"))]
    pub fn create_virtual_output(&self, name: &str) -> Result<MidiOutput, MidiPortError> {
        let midi_out = midir::MidiOutput::new("chord-midi-engine-virtual-out")
            .map_err(|e| MidiPortError::InitFailed(e.to_string()))?;

        let connection = midi_out
            .create_virtual(name)
            .map_err(|e: midir::ConnectError<midir::MidiOutput>| MidiPortError::OpenFailed(e.to_string()))?;

        Ok(MidiOutput {
            port_name: name.to_string(),
            connection,
        })
    }
}

impl Default for MidiEngine {
    fn default() -> Self {
        Self::new().expect("failed to create MIDI engine")
    }
}
