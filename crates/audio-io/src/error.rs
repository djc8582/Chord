//! Error types for audio I/O operations.

use std::fmt;

/// Errors that can occur during audio I/O operations.
#[derive(Debug)]
pub enum AudioIoError {
    /// No audio host available on the system.
    NoHost(String),
    /// The requested device was not found.
    DeviceNotFound(String),
    /// Failed to enumerate devices.
    DeviceEnumerationFailed(String),
    /// The requested sample rate is not supported.
    UnsupportedSampleRate {
        requested: u32,
        available: Vec<u32>,
    },
    /// The requested buffer size is out of the valid range.
    InvalidBufferSize {
        requested: u32,
        min: u32,
        max: u32,
    },
    /// Failed to build or start an audio stream.
    StreamError(String),
    /// The stream is not currently running.
    StreamNotRunning,
    /// Device was disconnected.
    DeviceDisconnected(String),
    /// A CPAL error.
    CpalError(String),
}

impl fmt::Display for AudioIoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoHost(msg) => write!(f, "No audio host available: {msg}"),
            Self::DeviceNotFound(name) => write!(f, "Audio device not found: {name}"),
            Self::DeviceEnumerationFailed(msg) => {
                write!(f, "Failed to enumerate audio devices: {msg}")
            }
            Self::UnsupportedSampleRate {
                requested,
                available,
            } => {
                write!(
                    f,
                    "Sample rate {requested}Hz not supported. Available: {available:?}"
                )
            }
            Self::InvalidBufferSize {
                requested,
                min,
                max,
            } => {
                write!(
                    f,
                    "Buffer size {requested} out of range [{min}, {max}]"
                )
            }
            Self::StreamError(msg) => write!(f, "Audio stream error: {msg}"),
            Self::StreamNotRunning => write!(f, "Audio stream is not running"),
            Self::DeviceDisconnected(name) => write!(f, "Audio device disconnected: {name}"),
            Self::CpalError(msg) => write!(f, "CPAL error: {msg}"),
        }
    }
}

impl std::error::Error for AudioIoError {}

impl From<cpal::DevicesError> for AudioIoError {
    fn from(err: cpal::DevicesError) -> Self {
        Self::DeviceEnumerationFailed(err.to_string())
    }
}

impl From<cpal::DeviceNameError> for AudioIoError {
    fn from(err: cpal::DeviceNameError) -> Self {
        Self::CpalError(format!("Failed to get device name: {err}"))
    }
}

impl From<cpal::DefaultStreamConfigError> for AudioIoError {
    fn from(err: cpal::DefaultStreamConfigError) -> Self {
        Self::CpalError(format!("Failed to get default stream config: {err}"))
    }
}

impl From<cpal::SupportedStreamConfigsError> for AudioIoError {
    fn from(err: cpal::SupportedStreamConfigsError) -> Self {
        Self::CpalError(format!("Failed to get supported stream configs: {err}"))
    }
}

impl From<cpal::BuildStreamError> for AudioIoError {
    fn from(err: cpal::BuildStreamError) -> Self {
        Self::StreamError(format!("Failed to build stream: {err}"))
    }
}

impl From<cpal::PlayStreamError> for AudioIoError {
    fn from(err: cpal::PlayStreamError) -> Self {
        Self::StreamError(format!("Failed to play stream: {err}"))
    }
}

impl From<cpal::PauseStreamError> for AudioIoError {
    fn from(err: cpal::PauseStreamError) -> Self {
        Self::StreamError(format!("Failed to pause stream: {err}"))
    }
}

/// Result type alias for audio I/O operations.
pub type Result<T> = std::result::Result<T, AudioIoError>;
