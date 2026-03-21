//! Plugin instance — load a plugin from a [`PluginInfo`] and wrap it as a
//! [`PluginBridge`].
//!
//! Currently only the mock plugin works end-to-end. Real VST3/CLAP/AU loading
//! is stubbed with clear TODO markers.

use std::path::Path;

use crate::error::PluginError;
use crate::format::{PluginBridge, PluginFormat, PluginInfo};
use crate::mock_plugin::MockPlugin;

/// A loaded plugin instance, wrapping a format-specific [`PluginBridge`].
///
/// Construct via [`PluginInstance::load`] or [`PluginInstance::load_mock`].
///
/// `Debug` is implemented manually because `PluginBridge` is a trait object.
pub struct PluginInstance {
    info: PluginInfo,
    bridge: Box<dyn PluginBridge>,
}

impl PluginInstance {
    /// Load a plugin from a [`PluginInfo`].
    ///
    /// For now, only the mock format and path validation are implemented.
    /// Real VST3/CLAP/AU loading returns `PluginError::NotImplemented`.
    pub fn load(info: &PluginInfo) -> Result<Self, PluginError> {
        // Verify the path exists on disk.
        if !info.path.exists() {
            return Err(PluginError::NotFound {
                path: info.path.clone(),
            });
        }

        match info.format {
            PluginFormat::Vst3 => {
                // TODO: Load VST3 binary via vst3-sys FFI.
                Err(PluginError::NotImplemented {
                    format: PluginFormat::Vst3,
                })
            }
            PluginFormat::Clap => {
                // TODO: Load CLAP binary via clack-host FFI.
                Err(PluginError::NotImplemented {
                    format: PluginFormat::Clap,
                })
            }
            PluginFormat::AudioUnit => {
                // TODO: Load Audio Unit via CoreAudio / AudioToolbox FFI.
                Err(PluginError::NotImplemented {
                    format: PluginFormat::AudioUnit,
                })
            }
        }
    }

    /// Create a plugin instance backed by the [`MockPlugin`].
    ///
    /// This is the primary way to get a working `PluginInstance` in the
    /// current implementation.
    pub fn load_mock(name: &str) -> Self {
        let info = PluginInfo {
            name: name.to_string(),
            vendor: "Chord (Mock)".to_string(),
            format: PluginFormat::Vst3, // Format is irrelevant for mock
            path: std::path::PathBuf::from("__mock__"),
            uid: format!("mock:{name}"),
            category: "Effect".to_string(),
            is_instrument: false,
            is_effect: true,
        };
        Self {
            info,
            bridge: Box::new(MockPlugin::new(name)),
        }
    }

    /// Create a plugin instance from an existing bridge implementation.
    ///
    /// Useful for testing or providing a custom bridge.
    pub fn from_bridge(info: PluginInfo, bridge: Box<dyn PluginBridge>) -> Self {
        Self { info, bridge }
    }

    /// Get the info for this plugin.
    pub fn info(&self) -> &PluginInfo {
        &self.info
    }

    /// Get a reference to the underlying bridge.
    pub fn bridge(&self) -> &dyn PluginBridge {
        self.bridge.as_ref()
    }

    /// Get a mutable reference to the underlying bridge.
    pub fn bridge_mut(&mut self) -> &mut dyn PluginBridge {
        self.bridge.as_mut()
    }
}

impl std::fmt::Debug for PluginInstance {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PluginInstance")
            .field("info", &self.info)
            .field("bridge", &format!("<{}>", self.bridge.name()))
            .finish()
    }
}

/// Check whether a path looks like a valid plugin bundle.
///
/// This is a lightweight heuristic — it checks that the path exists and has a
/// recognised extension. It does *not* attempt to open or validate the binary.
pub fn is_plugin_path(path: &Path) -> bool {
    PluginFormat::from_path(path).is_some() && path.exists()
}
