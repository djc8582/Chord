//! Error types for plugin hosting.

use std::fmt;
use std::path::PathBuf;

use crate::PluginFormat;

/// Errors that can occur when loading or interacting with a hosted plugin.
#[derive(Debug, Clone)]
pub enum PluginError {
    /// The plugin file was not found at the expected path.
    NotFound {
        /// The path that was searched.
        path: PathBuf,
    },
    /// The plugin format is not supported on this platform.
    UnsupportedFormat {
        /// The format that was requested.
        format: PluginFormat,
    },
    /// Loading the plugin binary failed.
    LoadFailed {
        /// Human-readable reason.
        reason: String,
    },
    /// The plugin is not yet implemented (FFI stub).
    NotImplemented {
        /// Which format was requested.
        format: PluginFormat,
    },
    /// A parameter with the given id was not found.
    ParameterNotFound {
        /// The parameter id that was looked up.
        id: String,
    },
    /// The plugin state data is invalid or corrupt.
    InvalidState {
        /// Human-readable reason.
        reason: String,
    },
}

impl fmt::Display for PluginError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound { path } => write!(f, "Plugin not found: {}", path.display()),
            Self::UnsupportedFormat { format } => {
                write!(f, "Unsupported plugin format: {format:?}")
            }
            Self::LoadFailed { reason } => write!(f, "Plugin load failed: {reason}"),
            Self::NotImplemented { format } => {
                write!(f, "Plugin format not yet implemented: {format:?}")
            }
            Self::ParameterNotFound { id } => write!(f, "Parameter not found: {id}"),
            Self::InvalidState { reason } => write!(f, "Invalid plugin state: {reason}"),
        }
    }
}

impl std::error::Error for PluginError {}
