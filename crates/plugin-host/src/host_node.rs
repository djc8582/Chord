//! `PluginHostNode` — an [`AudioNode`] that delegates `process()` to a loaded
//! plugin via the [`PluginBridge`] interface.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

use crate::instance::PluginInstance;
use crate::parameters::PluginParameterMap;

/// An [`AudioNode`] wrapper that hosts a plugin.
///
/// Bridges the dsp-runtime `AudioNode` interface to the plugin-host
/// `PluginBridge` interface, adapting buffers, parameters, and state.
pub struct PluginHostNode {
    /// The loaded plugin instance.
    instance: PluginInstance,
    /// Cached parameter map (refreshed on demand).
    param_map: PluginParameterMap,
    /// Number of input channels this node expects.
    num_input_channels: usize,
    /// Number of output channels this node produces.
    num_output_channels: usize,
}

impl PluginHostNode {
    /// Wrap a [`PluginInstance`] as an `AudioNode`.
    ///
    /// `num_input_channels` and `num_output_channels` define the channel layout
    /// that this node exposes to the graph.
    pub fn new(
        instance: PluginInstance,
        num_input_channels: usize,
        num_output_channels: usize,
    ) -> Self {
        let param_map = PluginParameterMap::from_bridge(instance.bridge());
        Self {
            instance,
            param_map,
            num_input_channels,
            num_output_channels,
        }
    }

    /// Create a `PluginHostNode` backed by the mock plugin with stereo I/O.
    pub fn new_mock(name: &str) -> Self {
        let instance = PluginInstance::load_mock(name);
        Self::new(instance, 2, 2)
    }

    /// Get a reference to the underlying plugin instance.
    pub fn instance(&self) -> &PluginInstance {
        &self.instance
    }

    /// Get a mutable reference to the underlying plugin instance.
    pub fn instance_mut(&mut self) -> &mut PluginInstance {
        &mut self.instance
    }

    /// Get the cached parameter map.
    pub fn parameter_map(&self) -> &PluginParameterMap {
        &self.param_map
    }

    /// Refresh the parameter map from the live plugin state.
    pub fn refresh_parameters(&mut self) {
        self.param_map.refresh(self.instance.bridge());
    }

    /// Save the plugin's state.
    pub fn save_state(&self) -> Vec<u8> {
        self.instance.bridge().save_state()
    }

    /// Load the plugin's state.
    pub fn load_state(&mut self, state: &[u8]) -> Result<(), crate::PluginError> {
        self.instance.bridge_mut().load_state(state)
    }
}

impl AudioNode for PluginHostNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let bridge = self.instance.bridge_mut();

        // Apply any parameter changes from the ProcessContext.
        // The dsp-runtime parameter system provides smoothed values; we forward
        // them to the plugin bridge.
        for desc in self.param_map.descriptors() {
            if let Some(v) = ctx.parameters.get(&desc.id) {
                // Ignore errors from set_parameter — the node should not fail
                // processing because of a stale parameter name.
                let _ = bridge.set_parameter(&desc.id, v as f64);
            }
        }

        // Build input buffer references.
        // ctx.inputs is &[&[f32]] — one slice per port (not per channel).
        // We pass as many channels as we have inputs or pad with silence.
        let empty: Vec<f32> = vec![0.0f32; ctx.buffer_size];
        let empty_slice: &[f32] = &empty;

        let input_refs: Vec<&[f32]> = (0..self.num_input_channels)
            .map(|ch| {
                if ch < ctx.inputs.len() {
                    ctx.inputs[ch]
                } else {
                    empty_slice
                }
            })
            .collect();

        // Build output buffer references.
        // We need to construct a Vec<&mut [f32]> that the bridge can write into.
        // ctx.outputs is &mut [&mut [f32]].
        let num_out = self.num_output_channels.min(ctx.outputs.len());
        let (used_outputs, _) = ctx.outputs.split_at_mut(num_out);

        bridge.process(&input_refs, used_outputs, ctx.sample_rate, ctx.buffer_size);

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.instance.bridge_mut().reset();
    }

    fn latency(&self) -> u32 {
        self.instance.bridge().latency_samples()
    }

    fn tail_length(&self) -> u32 {
        self.instance.bridge().tail_samples()
    }
}
