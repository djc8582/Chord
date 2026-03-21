//! Mock / stub plugin — a fully working [`PluginBridge`] implementation used
//! for testing and as a reference for real format loaders.
//!
//! The mock plugin is a simple stereo gain + DC offset effect:
//!
//! ```text
//! output[ch][i] = input[ch][i] * gain + dc_offset
//! ```
//!
//! It exposes two parameters: `gain` (0.0..2.0, default 1.0) and `dc_offset`
//! (-1.0..1.0, default 0.0).

use chord_audio_graph::ParameterDescriptor;

use crate::error::PluginError;
use crate::format::PluginBridge;

/// A mock plugin that applies `gain` and `dc_offset` to the input signal.
///
/// Implements [`PluginBridge`] so it can be wrapped by [`PluginHostNode`](crate::PluginHostNode).
pub struct MockPlugin {
    name: String,
    gain: f64,
    dc_offset: f64,
}

impl MockPlugin {
    /// Create a new mock plugin with default parameter values.
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            gain: 1.0,
            dc_offset: 0.0,
        }
    }
}

impl PluginBridge for MockPlugin {
    fn process(
        &mut self,
        inputs: &[&[f32]],
        outputs: &mut [&mut [f32]],
        _sample_rate: f64,
        buffer_size: usize,
    ) {
        let gain = self.gain as f32;
        let dc = self.dc_offset as f32;

        for (ch_idx, out_ch) in outputs.iter_mut().enumerate() {
            let len = out_ch.len().min(buffer_size);
            if ch_idx < inputs.len() {
                for i in 0..len {
                    out_ch[i] = inputs[ch_idx][i] * gain + dc;
                }
            } else {
                // No corresponding input channel — output DC offset only.
                for i in 0..len {
                    out_ch[i] = dc;
                }
            }
        }
    }

    fn reset(&mut self) {
        // The mock plugin is stateless beyond parameters — nothing to reset.
    }

    fn latency_samples(&self) -> u32 {
        0
    }

    fn tail_samples(&self) -> u32 {
        0
    }

    fn parameter_descriptors(&self) -> Vec<ParameterDescriptor> {
        vec![
            ParameterDescriptor::new("gain", "Gain", 1.0, 0.0, 2.0),
            ParameterDescriptor::new("dc_offset", "DC Offset", 0.0, -1.0, 1.0),
        ]
    }

    fn get_parameter(&self, id: &str) -> Option<f64> {
        match id {
            "gain" => Some(self.gain),
            "dc_offset" => Some(self.dc_offset),
            _ => None,
        }
    }

    fn set_parameter(&mut self, id: &str, value: f64) -> Result<(), PluginError> {
        match id {
            "gain" => {
                self.gain = value;
                Ok(())
            }
            "dc_offset" => {
                self.dc_offset = value;
                Ok(())
            }
            _ => Err(PluginError::ParameterNotFound {
                id: id.to_string(),
            }),
        }
    }

    fn save_state(&self) -> Vec<u8> {
        // Simple deterministic encoding: 8 bytes gain + 8 bytes dc_offset.
        let mut state = Vec::with_capacity(16);
        state.extend_from_slice(&self.gain.to_le_bytes());
        state.extend_from_slice(&self.dc_offset.to_le_bytes());
        state
    }

    fn load_state(&mut self, state: &[u8]) -> Result<(), PluginError> {
        if state.len() < 16 {
            return Err(PluginError::InvalidState {
                reason: format!("Expected 16 bytes, got {}", state.len()),
            });
        }
        self.gain = f64::from_le_bytes(state[0..8].try_into().unwrap());
        self.dc_offset = f64::from_le_bytes(state[8..16].try_into().unwrap());
        Ok(())
    }

    fn name(&self) -> &str {
        &self.name
    }
}
