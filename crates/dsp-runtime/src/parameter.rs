//! Parameter management — smoothed parameters and parameter state.
//!
//! Raw parameter changes cause clicks/pops (discontinuities in the audio signal).
//! Every parameter that affects audio must be smoothed. The default smoothing is
//! 64 samples (~1.3ms at 48kHz) — fast enough to feel responsive, slow enough to
//! prevent clicks.

use std::collections::HashMap;

use chord_audio_graph::NodeId;

/// Default smoothing length in samples (~1.3ms at 48kHz).
pub const DEFAULT_SMOOTHING_SAMPLES: usize = 64;

/// A parameter value that smoothly transitions to its target.
///
/// Every `set_parameter()` goes through `SmoothedParam`. No exceptions.
#[derive(Debug, Clone)]
pub struct SmoothedParam {
    /// Current (smoothed) value.
    current: f32,
    /// Target value to converge to.
    target: f32,
    /// Increment per sample.
    step: f32,
    /// Number of remaining smoothing samples.
    remaining: usize,
}

impl SmoothedParam {
    /// Create a new smoothed parameter with the given initial value.
    pub fn new(value: f32) -> Self {
        Self {
            current: value,
            target: value,
            step: 0.0,
            remaining: 0,
        }
    }

    /// Set a new target value. The parameter will smoothly transition over
    /// `smoothing_samples` samples.
    pub fn set_target(&mut self, value: f32, smoothing_samples: usize) {
        self.target = value;
        if smoothing_samples == 0 {
            self.current = value;
            self.step = 0.0;
            self.remaining = 0;
        } else {
            self.step = (self.target - self.current) / smoothing_samples as f32;
            self.remaining = smoothing_samples;
        }
    }

    /// Set the value immediately, with no smoothing.
    pub fn set_immediate(&mut self, value: f32) {
        self.current = value;
        self.target = value;
        self.step = 0.0;
        self.remaining = 0;
    }

    /// Advance by one sample. Returns the smoothed value.
    #[inline]
    pub fn next_sample(&mut self) -> f32 {
        if self.remaining > 0 {
            self.remaining -= 1;
            if self.remaining == 0 {
                self.current = self.target;
            } else {
                self.current += self.step;
            }
        }
        self.current
    }

    /// Get the current (smoothed) value without advancing.
    #[inline]
    pub fn current(&self) -> f32 {
        self.current
    }

    /// Get the target value.
    #[inline]
    pub fn target(&self) -> f32 {
        self.target
    }

    /// Check if the parameter has reached its target.
    pub fn is_settled(&self) -> bool {
        self.remaining == 0
    }
}

/// Holds all parameter values for a single node.
#[derive(Debug, Clone)]
pub struct NodeParameterState {
    /// Parameters keyed by parameter name.
    params: HashMap<String, SmoothedParam>,
}

impl NodeParameterState {
    /// Create a new empty node parameter state.
    pub fn new() -> Self {
        Self {
            params: HashMap::new(),
        }
    }

    /// Set or create a parameter.
    pub fn set(&mut self, name: &str, value: f32, smoothing_samples: usize) {
        if let Some(param) = self.params.get_mut(name) {
            param.set_target(value, smoothing_samples);
        } else {
            let mut param = SmoothedParam::new(value);
            param.set_target(value, 0); // No smoothing for initial value.
            self.params.insert(name.to_string(), param);
        }
    }

    /// Get the current value of a parameter.
    pub fn get(&self, name: &str) -> Option<f32> {
        self.params.get(name).map(|p| p.current())
    }

    /// Get a mutable reference to a smoothed parameter.
    pub fn get_mut(&mut self, name: &str) -> Option<&mut SmoothedParam> {
        self.params.get_mut(name)
    }

    /// Advance all parameters by one sample. Called once per sample in the audio loop.
    pub fn advance_all(&mut self) {
        for param in self.params.values_mut() {
            param.next_sample();
        }
    }
}

impl Default for NodeParameterState {
    fn default() -> Self {
        Self::new()
    }
}

/// Global parameter state for the entire engine, holding parameters for all nodes.
#[derive(Debug, Clone)]
pub struct ParameterState {
    /// Per-node parameter states.
    nodes: HashMap<NodeId, NodeParameterState>,
}

impl ParameterState {
    /// Create a new empty parameter state.
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
        }
    }

    /// Get or create the parameter state for a node.
    pub fn node_mut(&mut self, node_id: NodeId) -> &mut NodeParameterState {
        self.nodes.entry(node_id).or_default()
    }

    /// Get the parameter state for a node (read-only).
    pub fn node(&self, node_id: &NodeId) -> Option<&NodeParameterState> {
        self.nodes.get(node_id)
    }

    /// Set a parameter value.
    pub fn set(
        &mut self,
        node_id: NodeId,
        param_name: &str,
        value: f32,
        smoothing_samples: usize,
    ) {
        self.node_mut(node_id).set(param_name, value, smoothing_samples);
    }

    /// Get a parameter value.
    pub fn get(&self, node_id: &NodeId, param_name: &str) -> Option<f32> {
        self.nodes.get(node_id)?.get(param_name)
    }
}

impl Default for ParameterState {
    fn default() -> Self {
        Self::new()
    }
}

/// A parameter change message sent through the ring buffer from the main thread.
#[derive(Debug, Clone)]
pub struct ParameterChange {
    /// The node to update.
    pub node_id: NodeId,
    /// The parameter name.
    pub param_name: String,
    /// The new target value.
    pub value: f64,
}

#[cfg(test)]
mod parameter_tests {
    use super::*;

    #[test]
    fn test_smoothed_param_immediate() {
        let mut p = SmoothedParam::new(0.0);
        assert_eq!(p.current(), 0.0);
        assert_eq!(p.target(), 0.0);
        assert!(p.is_settled());

        p.set_immediate(1.0);
        assert_eq!(p.current(), 1.0);
        assert_eq!(p.target(), 1.0);
        assert!(p.is_settled());
    }

    #[test]
    fn test_smoothed_param_smooth() {
        let mut p = SmoothedParam::new(0.0);
        p.set_target(1.0, 4);

        assert!(!p.is_settled());
        let v1 = p.next_sample();
        let v2 = p.next_sample();
        let v3 = p.next_sample();
        let v4 = p.next_sample();

        // After 4 samples, should be at target.
        assert!(p.is_settled());
        assert_eq!(p.current(), 1.0);

        // Values should be monotonically increasing.
        assert!(v1 > 0.0);
        assert!(v2 > v1);
        assert!(v3 > v2);
        assert_eq!(v4, 1.0);
    }

    #[test]
    fn test_smoothed_param_no_click() {
        let mut p = SmoothedParam::new(0.0);
        p.set_target(1.0, DEFAULT_SMOOTHING_SAMPLES);

        let mut prev = p.current();
        let mut max_delta: f32 = 0.0;
        for _ in 0..DEFAULT_SMOOTHING_SAMPLES {
            let v = p.next_sample();
            let delta = (v - prev).abs();
            if delta > max_delta {
                max_delta = delta;
            }
            prev = v;
        }

        // The maximum per-sample delta should be small (no clicks).
        // For linear smoothing over 64 samples: 1.0 / 64 = 0.015625
        assert!(max_delta < 0.02, "max_delta was {max_delta}");
    }

    #[test]
    fn test_smoothed_param_zero_smoothing() {
        let mut p = SmoothedParam::new(0.0);
        p.set_target(1.0, 0);
        assert!(p.is_settled());
        assert_eq!(p.current(), 1.0);
    }

    #[test]
    fn test_parameter_state() {
        let node_id = NodeId(1);
        let mut state = ParameterState::new();
        state.set(node_id, "gain", 0.5, 0);
        assert_eq!(state.get(&node_id, "gain"), Some(0.5));
        assert_eq!(state.get(&node_id, "nonexistent"), None);
    }

    #[test]
    fn test_node_parameter_state_advance() {
        let mut state = NodeParameterState::new();
        state.set("gain", 0.0, 0);
        state.set("gain", 1.0, 4);

        for _ in 0..4 {
            state.advance_all();
        }

        let val = state.get("gain").unwrap();
        assert!((val - 1.0).abs() < 1e-6, "val was {val}");
    }

    #[test]
    fn test_rapid_parameter_changes() {
        let mut p = SmoothedParam::new(0.0);

        // Change target multiple times mid-smoothing.
        p.set_target(1.0, 10);
        for _ in 0..5 {
            p.next_sample();
        }
        // Change target mid-ramp.
        p.set_target(0.0, 10);
        for _ in 0..10 {
            p.next_sample();
        }
        assert!((p.current() - 0.0).abs() < 1e-6);
    }
}
