//! Parameter bridging — expose plugin parameters through the standard
//! [`ParameterDescriptor`](chord_audio_graph::ParameterDescriptor) interface.

use chord_audio_graph::ParameterDescriptor;

use crate::format::PluginBridge;
use crate::error::PluginError;

/// A snapshot of all parameters exposed by a loaded plugin.
///
/// This is a lightweight, owned copy that can be sent across threads or
/// serialized.  It is *not* the live parameter state — call
/// [`refresh`](Self::refresh) or read through `PluginBridge` for live values.
#[derive(Debug, Clone)]
pub struct PluginParameterMap {
    /// Ordered list of parameter descriptors.
    descriptors: Vec<ParameterDescriptor>,
}

impl PluginParameterMap {
    /// Build a parameter map by querying a loaded plugin bridge.
    pub fn from_bridge(bridge: &dyn PluginBridge) -> Self {
        let descriptors = bridge.parameter_descriptors();
        Self { descriptors }
    }

    /// Return the descriptors as a slice.
    pub fn descriptors(&self) -> &[ParameterDescriptor] {
        &self.descriptors
    }

    /// Look up a descriptor by its `id`.
    pub fn find(&self, id: &str) -> Option<&ParameterDescriptor> {
        self.descriptors.iter().find(|d| d.id == id)
    }

    /// Number of parameters.
    pub fn len(&self) -> usize {
        self.descriptors.len()
    }

    /// Whether the map is empty.
    pub fn is_empty(&self) -> bool {
        self.descriptors.is_empty()
    }

    /// Re-read current values from the bridge, updating the `value` field on
    /// each descriptor in place.
    pub fn refresh(&mut self, bridge: &dyn PluginBridge) {
        for desc in &mut self.descriptors {
            if let Some(v) = bridge.get_parameter(&desc.id) {
                desc.value = v;
            }
        }
    }
}

/// Convenience: set a parameter on a bridge, validating that it exists and is
/// within range.
pub fn set_parameter_checked(
    bridge: &mut dyn PluginBridge,
    param_map: &PluginParameterMap,
    id: &str,
    value: f64,
) -> Result<(), PluginError> {
    let desc = param_map.find(id).ok_or_else(|| PluginError::ParameterNotFound {
        id: id.to_string(),
    })?;
    // Clamp to the declared range.
    let clamped = value.clamp(desc.min, desc.max);
    bridge.set_parameter(id, clamped)
}
