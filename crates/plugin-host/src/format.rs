//! Plugin format abstraction — trait shared by VST3, CLAP, and AU loaders.

use std::path::PathBuf;

use chord_audio_graph::ParameterDescriptor;

use crate::error::PluginError;

/// Supported plugin binary formats.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PluginFormat {
    /// Steinberg VST3 plugin (.vst3 bundle).
    Vst3,
    /// CLAP plugin (.clap file).
    Clap,
    /// Apple Audio Unit (.component bundle) — macOS only.
    AudioUnit,
}

impl PluginFormat {
    /// File extension (without leading dot) for this format.
    pub fn extension(&self) -> &'static str {
        match self {
            Self::Vst3 => "vst3",
            Self::Clap => "clap",
            Self::AudioUnit => "component",
        }
    }

    /// Attempt to detect the format from a file path's extension.
    pub fn from_path(path: &std::path::Path) -> Option<Self> {
        let ext = path.extension()?.to_str()?;
        match ext {
            "vst3" => Some(Self::Vst3),
            "clap" => Some(Self::Clap),
            "component" => Some(Self::AudioUnit),
            _ => None,
        }
    }
}

/// Information about a discovered plugin.
///
/// Returned by the plugin scanner and used to load a plugin instance.
#[derive(Debug, Clone)]
pub struct PluginInfo {
    /// Human-readable name (e.g. "Serum", "Vital").
    pub name: String,
    /// Vendor / manufacturer.
    pub vendor: String,
    /// Plugin binary format.
    pub format: PluginFormat,
    /// Filesystem path to the plugin bundle or file.
    pub path: PathBuf,
    /// Unique identifier string (derived from path + format for scanned plugins).
    pub uid: String,
    /// Category (e.g. "Synthesizer", "Effect", "Utility").
    pub category: String,
    /// Whether this plugin can generate audio from MIDI (instrument / synth).
    pub is_instrument: bool,
    /// Whether this plugin processes audio (effect / insert).
    pub is_effect: bool,
}

/// Trait abstracting over plugin format loaders (VST3, CLAP, AU).
///
/// Each format implements this trait.  The [`PluginInstance`](crate::PluginInstance) type
/// wraps a `Box<dyn PluginFormatLoader>` and exposes it as an
/// [`AudioNode`](chord_dsp_runtime::AudioNode).
pub trait PluginFormatLoader: Send {
    /// Human-readable format name.
    fn format_name(&self) -> &str;

    /// Attempt to load a plugin from the given info.
    fn load(&self, info: &PluginInfo) -> Result<Box<dyn PluginBridge>, PluginError>;
}

/// Bridge to a loaded plugin binary.
///
/// This is what a format-specific loader produces.  The host node delegates
/// `process()`, parameter access, and state serialization to it.
pub trait PluginBridge: Send {
    /// Process audio through the plugin.
    ///
    /// `inputs` and `outputs` are slices of per-channel sample slices.
    fn process(
        &mut self,
        inputs: &[&[f32]],
        outputs: &mut [&mut [f32]],
        sample_rate: f64,
        buffer_size: usize,
    );

    /// Reset / flush internal state.
    fn reset(&mut self);

    /// Report the plugin's latency in samples.
    fn latency_samples(&self) -> u32;

    /// Report the plugin's tail length in samples.
    fn tail_samples(&self) -> u32;

    /// List the plugin's parameters.
    fn parameter_descriptors(&self) -> Vec<ParameterDescriptor>;

    /// Get the current value of a parameter by id.
    fn get_parameter(&self, id: &str) -> Option<f64>;

    /// Set the value of a parameter by id.
    fn set_parameter(&mut self, id: &str, value: f64) -> Result<(), PluginError>;

    /// Serialize the plugin's full internal state to an opaque byte vector.
    fn save_state(&self) -> Vec<u8>;

    /// Restore the plugin's state from a previously saved byte vector.
    fn load_state(&mut self, state: &[u8]) -> Result<(), PluginError>;

    /// The plugin's display name.
    fn name(&self) -> &str;
}
