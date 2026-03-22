//! NodeTestHarness — automated comprehensive node validation using the diagnostic engine.
//!
//! Provides test_node, fuzz, stress, benchmark, and full_validation methods
//! that exercise audio nodes from the node-library registry and collect
//! diagnostic results (signal stats, detected problems, performance data).

use std::time::{Duration, Instant};

use chord_audio_graph::{NodeId, PortId};
use chord_diagnostics::{
    DetectorConfig, Problem, ProblemCategory, ProblemDetector, Severity, SignalStats,
    StatsAccumulator,
};
use chord_dsp_runtime::{
    AudioNode, MidiMessage, NodeParameterState, ProcessContext, ProcessStatus, TransportState,
};
use chord_node_library::NodeRegistry;

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

/// Result of running a basic node test (test_node).
pub struct TestResult {
    /// Per-buffer signal stats for the node's output.
    pub stats: Vec<SignalStats>,
    /// All problems detected across all buffers.
    pub problems: Vec<Problem>,
    /// Raw output samples, one Vec<f32> per buffer processed.
    pub output_buffers: Vec<Vec<f32>>,
}

/// Full validation report combining basic, fuzz, stress, and benchmark results.
pub struct ValidationReport {
    /// The node type that was validated.
    pub node_type: String,
    /// Whether the node passed all validation criteria.
    pub passed: bool,
    /// Basic test results.
    pub basic: TestResult,
    /// Fuzz results: each entry is (param_values, problems) for one parameter setting.
    pub fuzz_problems: Vec<(Vec<(String, f64)>, Vec<Problem>)>,
    /// Problems found during stress testing.
    pub stress_problems: Vec<Problem>,
    /// Average processing duration per buffer from benchmark.
    pub benchmark_avg: Duration,
    /// Human-readable summary of the validation.
    pub summary: String,
}

// ---------------------------------------------------------------------------
// Parameter metadata for known node types
// ---------------------------------------------------------------------------

/// Describes a parameter's range for fuzzing/stress testing.
#[derive(Debug, Clone)]
struct ParamMeta {
    name: String,
    min: f64,
    max: f64,
    default: f64,
    kind: ParamKind,
}

/// Categorizes parameters so stress testing can pick appropriate edge-case values.
#[derive(Debug, Clone, Copy, PartialEq)]
enum ParamKind {
    Frequency,
    Resonance,
    Gain,
    Generic,
}

/// Returns parameter metadata for a known node type.
/// Since nodes in chord-node-library do not self-describe their parameters,
/// we maintain this table manually for all registered node types.
fn params_for_type(node_type: &str) -> Vec<ParamMeta> {
    match node_type {
        "oscillator" => vec![
            ParamMeta {
                name: "frequency".into(),
                min: 0.0,
                max: 20000.0,
                default: 440.0,
                kind: ParamKind::Frequency,
            },
            ParamMeta {
                name: "detune".into(),
                min: -1200.0,
                max: 1200.0,
                default: 0.0,
                kind: ParamKind::Generic,
            },
            ParamMeta {
                name: "waveform".into(),
                min: 0.0,
                max: 3.0,
                default: 0.0,
                kind: ParamKind::Generic,
            },
        ],
        "filter" => vec![
            ParamMeta {
                name: "cutoff".into(),
                min: 20.0,
                max: 20000.0,
                default: 1000.0,
                kind: ParamKind::Frequency,
            },
            ParamMeta {
                name: "resonance".into(),
                min: 0.1,
                max: 20.0,
                default: 0.707,
                kind: ParamKind::Resonance,
            },
            ParamMeta {
                name: "mode".into(),
                min: 0.0,
                max: 2.0,
                default: 0.0,
                kind: ParamKind::Generic,
            },
        ],
        "gain" => vec![ParamMeta {
            name: "gain".into(),
            min: 0.0,
            max: 10.0,
            default: 1.0,
            kind: ParamKind::Gain,
        }],
        "envelope" => vec![
            ParamMeta {
                name: "attack".into(),
                min: 0.001,
                max: 10.0,
                default: 0.01,
                kind: ParamKind::Generic,
            },
            ParamMeta {
                name: "decay".into(),
                min: 0.001,
                max: 10.0,
                default: 0.1,
                kind: ParamKind::Generic,
            },
            ParamMeta {
                name: "sustain".into(),
                min: 0.0,
                max: 1.0,
                default: 0.7,
                kind: ParamKind::Gain,
            },
            ParamMeta {
                name: "release".into(),
                min: 0.001,
                max: 10.0,
                default: 0.3,
                kind: ParamKind::Generic,
            },
        ],
        "lfo" => vec![
            ParamMeta {
                name: "rate".into(),
                min: 0.01,
                max: 100.0,
                default: 1.0,
                kind: ParamKind::Frequency,
            },
            ParamMeta {
                name: "depth".into(),
                min: 0.0,
                max: 1.0,
                default: 1.0,
                kind: ParamKind::Gain,
            },
            ParamMeta {
                name: "waveform".into(),
                min: 0.0,
                max: 3.0,
                default: 0.0,
                kind: ParamKind::Generic,
            },
        ],
        "mixer" => vec![],
        "output" => vec![],
        "midi_to_freq" => vec![],
        "delay" => vec![
            ParamMeta {
                name: "time".into(),
                min: 0.0,
                max: 2.0,
                default: 0.3,
                kind: ParamKind::Generic,
            },
            ParamMeta {
                name: "feedback".into(),
                min: 0.0,
                max: 1.0,
                default: 0.3,
                kind: ParamKind::Resonance,
            },
            ParamMeta {
                name: "mix".into(),
                min: 0.0,
                max: 1.0,
                default: 0.5,
                kind: ParamKind::Gain,
            },
        ],
        "reverb" => vec![
            ParamMeta {
                name: "room_size".into(),
                min: 0.0,
                max: 1.0,
                default: 0.5,
                kind: ParamKind::Generic,
            },
            ParamMeta {
                name: "damping".into(),
                min: 0.0,
                max: 1.0,
                default: 0.5,
                kind: ParamKind::Generic,
            },
            ParamMeta {
                name: "mix".into(),
                min: 0.0,
                max: 1.0,
                default: 0.3,
                kind: ParamKind::Gain,
            },
        ],
        "compressor" => vec![
            ParamMeta {
                name: "threshold".into(),
                min: -60.0,
                max: 0.0,
                default: -20.0,
                kind: ParamKind::Generic,
            },
            ParamMeta {
                name: "ratio".into(),
                min: 1.0,
                max: 20.0,
                default: 4.0,
                kind: ParamKind::Generic,
            },
            ParamMeta {
                name: "attack".into(),
                min: 0.001,
                max: 0.5,
                default: 0.01,
                kind: ParamKind::Generic,
            },
            ParamMeta {
                name: "release".into(),
                min: 0.01,
                max: 2.0,
                default: 0.1,
                kind: ParamKind::Generic,
            },
        ],
        "eq" => vec![
            ParamMeta {
                name: "low_gain".into(),
                min: -12.0,
                max: 12.0,
                default: 0.0,
                kind: ParamKind::Gain,
            },
            ParamMeta {
                name: "mid_gain".into(),
                min: -12.0,
                max: 12.0,
                default: 0.0,
                kind: ParamKind::Gain,
            },
            ParamMeta {
                name: "high_gain".into(),
                min: -12.0,
                max: 12.0,
                default: 0.0,
                kind: ParamKind::Gain,
            },
        ],
        "noise" => vec![ParamMeta {
            name: "color".into(),
            min: 0.0,
            max: 2.0,
            default: 0.0,
            kind: ParamKind::Generic,
        }],
        "sample_and_hold" => vec![],
        "quantizer" => vec![ParamMeta {
            name: "scale".into(),
            min: 0.0,
            max: 5.0,
            default: 0.0,
            kind: ParamKind::Generic,
        }],
        "euclidean" => vec![
            ParamMeta {
                name: "steps".into(),
                min: 1.0,
                max: 32.0,
                default: 16.0,
                kind: ParamKind::Generic,
            },
            ParamMeta {
                name: "pulses".into(),
                min: 0.0,
                max: 32.0,
                default: 4.0,
                kind: ParamKind::Generic,
            },
        ],
        "crossfader" => vec![ParamMeta {
            name: "mix".into(),
            min: 0.0,
            max: 1.0,
            default: 0.5,
            kind: ParamKind::Gain,
        }],
        "waveshaper" => vec![
            ParamMeta {
                name: "drive".into(),
                min: 0.0,
                max: 10.0,
                default: 1.0,
                kind: ParamKind::Gain,
            },
            ParamMeta {
                name: "mode".into(),
                min: 0.0,
                max: 3.0,
                default: 0.0,
                kind: ParamKind::Generic,
            },
        ],
        "ring_modulator" => vec![ParamMeta {
            name: "mix".into(),
            min: 0.0,
            max: 1.0,
            default: 1.0,
            kind: ParamKind::Gain,
        }],
        "chorus" => vec![
            ParamMeta {
                name: "rate".into(),
                min: 0.1,
                max: 10.0,
                default: 1.0,
                kind: ParamKind::Frequency,
            },
            ParamMeta {
                name: "depth".into(),
                min: 0.0,
                max: 1.0,
                default: 0.5,
                kind: ParamKind::Gain,
            },
            ParamMeta {
                name: "mix".into(),
                min: 0.0,
                max: 1.0,
                default: 0.5,
                kind: ParamKind::Gain,
            },
        ],
        "phaser" => vec![
            ParamMeta {
                name: "rate".into(),
                min: 0.1,
                max: 10.0,
                default: 0.5,
                kind: ParamKind::Frequency,
            },
            ParamMeta {
                name: "depth".into(),
                min: 0.0,
                max: 1.0,
                default: 0.5,
                kind: ParamKind::Gain,
            },
            ParamMeta {
                name: "feedback".into(),
                min: 0.0,
                max: 0.99,
                default: 0.3,
                kind: ParamKind::Resonance,
            },
        ],
        "pitch_shifter" => vec![ParamMeta {
            name: "semitones".into(),
            min: -24.0,
            max: 24.0,
            default: 0.0,
            kind: ParamKind::Generic,
        }],
        "limiter" => vec![
            ParamMeta {
                name: "ceiling".into(),
                min: -24.0,
                max: 0.0,
                default: 0.0,
                kind: ParamKind::Gain,
            },
            ParamMeta {
                name: "release".into(),
                min: 0.01,
                max: 2.0,
                default: 0.1,
                kind: ParamKind::Generic,
            },
        ],
        "gate" => vec![
            ParamMeta {
                name: "threshold".into(),
                min: -80.0,
                max: 0.0,
                default: -40.0,
                kind: ParamKind::Generic,
            },
            ParamMeta {
                name: "attack".into(),
                min: 0.001,
                max: 0.5,
                default: 0.01,
                kind: ParamKind::Generic,
            },
            ParamMeta {
                name: "release".into(),
                min: 0.01,
                max: 2.0,
                default: 0.1,
                kind: ParamKind::Generic,
            },
        ],
        "stereo" => vec![ParamMeta {
            name: "width".into(),
            min: 0.0,
            max: 200.0,
            default: 100.0,
            kind: ParamKind::Generic,
        }],
        "dc_blocker" => vec![],
        _ => vec![],
    }
}

/// Returns true if the node type is a self-generating source (no audio input needed).
fn is_source_node(node_type: &str) -> bool {
    matches!(node_type, "oscillator" | "noise" | "lfo" | "euclidean")
}

// ---------------------------------------------------------------------------
// Internal helper: test signal sources
// ---------------------------------------------------------------------------

/// A configurable test signal source for use in stress testing.
struct TestSignalSource {
    kind: TestSignal,
    phase: f64,
    frequency: f64,
}

#[derive(Debug, Clone, Copy)]
enum TestSignal {
    Silence,
    Dc(f32),
    Impulse,
    FullScaleSine,
}

impl TestSignalSource {
    fn new(kind: TestSignal) -> Self {
        Self {
            kind,
            phase: 0.0,
            frequency: 440.0,
        }
    }
}

impl AudioNode for TestSignalSource {
    fn process(&mut self, ctx: &mut ProcessContext) -> chord_dsp_runtime::ProcessResult {
        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }
        let output = &mut ctx.outputs[0];
        match self.kind {
            TestSignal::Silence => {
                for i in 0..ctx.buffer_size {
                    output[i] = 0.0;
                }
            }
            TestSignal::Dc(value) => {
                for i in 0..ctx.buffer_size {
                    output[i] = value;
                }
            }
            TestSignal::Impulse => {
                output[0] = 1.0;
                for i in 1..ctx.buffer_size {
                    output[i] = 0.0;
                }
            }
            TestSignal::FullScaleSine => {
                let phase_inc = self.frequency / ctx.sample_rate;
                for i in 0..ctx.buffer_size {
                    output[i] = (self.phase * std::f64::consts::TAU).sin() as f32;
                    self.phase += phase_inc;
                    self.phase -= self.phase.floor();
                }
            }
        }
        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.phase = 0.0;
    }
}

// ---------------------------------------------------------------------------
// NodeTestHarness
// ---------------------------------------------------------------------------

/// Automates comprehensive node validation using the diagnostic engine.
///
/// Creates test audio graphs, processes buffers through nodes from the registry,
/// and collects diagnostic data (signal stats, problems, timing).
pub struct NodeTestHarness {
    sample_rate: f64,
    buffer_size: usize,
    registry: NodeRegistry,
}

impl NodeTestHarness {
    /// Create a new harness with the given sample rate, buffer size,
    /// and a fully populated node registry.
    pub fn new(sample_rate: f64, buffer_size: usize, registry: NodeRegistry) -> Self {
        Self {
            sample_rate,
            buffer_size,
            registry,
        }
    }

    /// Create a harness with default settings (48 kHz, 256 samples)
    /// and all available nodes registered.
    pub fn default_config() -> Self {
        Self::new(48000.0, 256, NodeRegistry::with_all())
    }

    // ------------------------------------------------------------------
    // Core internal: process a node directly and collect diagnostics
    // ------------------------------------------------------------------

    /// Process a node instance with the given source and parameter values
    /// for `num_buffers` buffers. Returns per-buffer stats and raw output.
    ///
    /// If `source` is `Some`, it generates input signal for the node under test.
    /// If `source` is `None`, the node is treated as a self-generating source.
    fn process_node_direct(
        &self,
        node: &mut dyn AudioNode,
        source: Option<&mut dyn AudioNode>,
        params: &[(String, f64)],
        num_buffers: usize,
    ) -> TestResult {
        let mut accumulator = StatsAccumulator::new();
        let mut detector = ProblemDetector::new(DetectorConfig::default());
        let mut all_problems = Vec::new();
        let mut all_stats = Vec::new();
        let mut all_output = Vec::new();

        let src_params = NodeParameterState::new();
        let transport = TransportState::new(self.sample_rate);
        let dummy_node_id = NodeId::new();
        let port_id = PortId(0);
        let has_source = source.is_some();

        // We need to wrap source in an Option we can repeatedly reborrow.
        let mut source_opt = source;

        for _buf_idx in 0..num_buffers {
            // Generate source signal if we have a source node.
            let mut source_data = vec![0.0f32; self.buffer_size];
            if let Some(ref mut src) = source_opt {
                let mut src_out_data = vec![0.0f32; self.buffer_size];
                {
                    let mut src_out_slices: Vec<&mut [f32]> =
                        vec![src_out_data.as_mut_slice()];
                    let src_inputs: &[&[f32]] = &[];
                    let mut midi_out: Vec<MidiMessage> = Vec::new();
                    let mut src_ctx = ProcessContext {
                        inputs: src_inputs,
                        outputs: &mut src_out_slices,
                        parameters: &src_params,
                        sample_rate: self.sample_rate,
                        buffer_size: self.buffer_size,
                        transport: &transport,
                        midi_input: &[],
                        midi_output: &mut midi_out,
                    };
                    let _ = src.process(&mut src_ctx);
                }
                source_data.copy_from_slice(&src_out_data);
            }

            // Set up parameter state for this buffer.
            let mut node_param_state = NodeParameterState::new();
            for (name, value) in params {
                node_param_state.set(name, *value as f32, 0);
            }

            // Process the node under test.
            let input_refs: Vec<&[f32]> = vec![source_data.as_slice()];
            let mut output_data = vec![0.0f32; self.buffer_size];
            {
                let mut output_slices: Vec<&mut [f32]> =
                    vec![output_data.as_mut_slice()];
                let mut midi_out: Vec<MidiMessage> = Vec::new();

                let mut ctx = ProcessContext {
                    inputs: if has_source { &input_refs } else { &[] },
                    outputs: &mut output_slices,
                    parameters: &node_param_state,
                    sample_rate: self.sample_rate,
                    buffer_size: self.buffer_size,
                    transport: &transport,
                    midi_input: &[],
                    midi_output: &mut midi_out,
                };

                let _ = node.process(&mut ctx);
            }

            // Collect stats via the accumulator.
            accumulator.process_buffer(&output_data);
            let stats = accumulator.snapshot();

            // Detect problems from accumulated stats.
            let problems = detector.analyze(dummy_node_id, port_id, &stats);

            // Record new problems (avoid category duplicates with lower severity).
            for p in &problems {
                let dominated = all_problems.iter().any(|existing: &Problem| {
                    existing.category == p.category && existing.severity >= p.severity
                });
                if !dominated {
                    all_problems.push(p.clone());
                }
            }

            all_stats.push(stats);
            all_output.push(output_data);

            // Reset accumulator per buffer so each stats entry is per-buffer.
            accumulator.reset();
        }

        // Do one final accumulated analysis across all output.
        let mut final_acc = StatsAccumulator::new();
        for buf in &all_output {
            final_acc.process_buffer(buf);
        }
        let final_stats = final_acc.snapshot();
        let final_problems = detector.analyze(dummy_node_id, port_id, &final_stats);
        for p in final_problems {
            let dominated = all_problems
                .iter()
                .any(|existing: &Problem| existing.category == p.category);
            if !dominated {
                all_problems.push(p);
            }
        }

        TestResult {
            stats: all_stats,
            problems: all_problems,
            output_buffers: all_output,
        }
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /// Create a test graph: SineSource(440Hz) -> NodeUnderTest -> OutputCapture.
    /// Set the given params. Process `num_buffers` buffers. Run diagnostics on
    /// each buffer. Return TestResult with stats and problems.
    pub fn test_node(
        &self,
        node_type: &str,
        params: &[(&str, f64)],
        num_buffers: usize,
    ) -> TestResult {
        let mut node = self
            .registry
            .create(node_type)
            .unwrap_or_else(|| panic!("Unknown node type: {node_type}"));

        let owned_params: Vec<(String, f64)> =
            params.iter().map(|(k, v)| (k.to_string(), *v)).collect();

        let is_source = is_source_node(node_type);
        if is_source {
            self.process_node_direct(node.as_mut(), None, &owned_params, num_buffers)
        } else {
            let mut source: Box<dyn AudioNode> =
                Box::new(crate::helpers::SineSource::new(440.0, 0.8));
            self.process_node_direct(
                node.as_mut(),
                Some(source.as_mut()),
                &owned_params,
                num_buffers,
            )
        }
    }

    /// Sweep each parameter through its full range in `steps_per_param` steps.
    /// At each value, process a few buffers and collect problems.
    /// Returns (param_values, problems) for each sweep point.
    pub fn fuzz(&self, node_type: &str, steps_per_param: usize) -> Vec<(Vec<(String, f64)>, Vec<Problem>)> {
        let meta = params_for_type(node_type);
        if meta.is_empty() {
            // No known parameters — run a single basic test.
            let result = self.test_node(node_type, &[], 3);
            return vec![(vec![], result.problems)];
        }

        let is_source = is_source_node(node_type);
        let mut results = Vec::new();

        // Single-parameter sweeps: for each parameter, sweep it while others stay at default.
        for target_param in &meta {
            let steps = steps_per_param.max(2);
            for step in 0..steps {
                let t = step as f64 / (steps - 1).max(1) as f64;
                let value = target_param.min + t * (target_param.max - target_param.min);

                // Build param set: target at swept value, others at default.
                let param_values: Vec<(String, f64)> = meta
                    .iter()
                    .map(|p| {
                        if p.name == target_param.name {
                            (p.name.clone(), value)
                        } else {
                            (p.name.clone(), p.default)
                        }
                    })
                    .collect();

                let mut node = match self.registry.create(node_type) {
                    Some(n) => n,
                    None => continue,
                };

                let mut source: Box<dyn AudioNode> =
                    Box::new(crate::helpers::SineSource::new(440.0, 0.8));

                let test = self.process_node_direct(
                    node.as_mut(),
                    if is_source {
                        None
                    } else {
                        Some(source.as_mut())
                    },
                    &param_values,
                    3,
                );

                let combo: Vec<(String, f64)> = param_values
                    .iter()
                    .filter(|(name, _)| name == &target_param.name)
                    .cloned()
                    .collect();

                if !test.problems.is_empty() {
                    results.push((combo, test.problems));
                } else {
                    results.push((combo, vec![]));
                }
            }
        }

        results
    }

    /// Test at known-dangerous parameter values and input signals.
    ///
    /// For frequency params: 0 Hz, 1 Hz, Nyquist/2, Nyquist, above Nyquist.
    /// For resonance/feedback params: 0, 0.99, 1.0, >1.0 (if max allows).
    /// For gain params: 0, 1, max value.
    /// Also tests all params at min and max simultaneously, plus special input signals
    /// (silence, DC, impulse, full-scale sine).
    pub fn stress(&self, node_type: &str) -> Vec<Problem> {
        let meta = params_for_type(node_type);
        let is_source = is_source_node(node_type);
        let nyquist = self.sample_rate / 2.0;
        let mut all_problems = Vec::new();

        // Helper closure: run a test with given params and source, collect problems.
        let run_test =
            |harness: &Self, params: &[(String, f64)], source: Option<TestSignal>| -> Vec<Problem> {
                let mut node = match harness.registry.create(node_type) {
                    Some(n) => n,
                    None => return vec![],
                };

                let mut src: Box<dyn AudioNode> = match source {
                    Some(sig) => Box::new(TestSignalSource::new(sig)),
                    None => Box::new(crate::helpers::SineSource::new(440.0, 0.8)),
                };

                let result = harness.process_node_direct(
                    node.as_mut(),
                    if is_source { None } else { Some(src.as_mut()) },
                    params,
                    5,
                );
                result.problems
            };

        // Build edge-case parameter sets.
        let mut edge_cases: Vec<Vec<(String, f64)>> = Vec::new();

        for param in &meta {
            let base: Vec<(String, f64)> = meta
                .iter()
                .map(|p| (p.name.clone(), p.default))
                .collect();

            let stress_values: Vec<f64> = match param.kind {
                ParamKind::Frequency => {
                    vec![0.0, 1.0, nyquist / 2.0, nyquist, nyquist * 1.5]
                }
                ParamKind::Resonance => {
                    let mut vals = vec![0.0, 0.99, 1.0];
                    if param.max > 1.0 {
                        vals.push(param.max);
                    }
                    vals
                }
                ParamKind::Gain => {
                    vec![0.0, 1.0, param.max]
                }
                ParamKind::Generic => {
                    vec![param.min, param.max]
                }
            };

            for val in stress_values {
                // Clamp to the declared range.
                let clamped = val.clamp(param.min, param.max);
                let mut case = base.clone();
                for entry in &mut case {
                    if entry.0 == param.name {
                        entry.1 = clamped;
                    }
                }
                edge_cases.push(case);
            }
        }

        // All params at min simultaneously.
        if !meta.is_empty() {
            let all_min: Vec<(String, f64)> =
                meta.iter().map(|p| (p.name.clone(), p.min)).collect();
            edge_cases.push(all_min);

            // All params at max simultaneously.
            let all_max: Vec<(String, f64)> =
                meta.iter().map(|p| (p.name.clone(), p.max)).collect();
            edge_cases.push(all_max);
        }

        // Default params (for input signal stress tests).
        let defaults: Vec<(String, f64)> =
            meta.iter().map(|p| (p.name.clone(), p.default)).collect();

        // Run edge-case parameter combos with a standard sine input.
        for case in &edge_cases {
            let problems = run_test(self, case, None);
            all_problems.extend(problems);
        }

        // Run different input signals at default params (only for processor nodes).
        if !is_source {
            let signals = [
                TestSignal::Silence,
                TestSignal::Dc(1.0),
                TestSignal::Impulse,
                TestSignal::FullScaleSine,
            ];
            for sig in &signals {
                let problems = run_test(self, &defaults, Some(*sig));
                all_problems.extend(problems);
            }
        }

        // Deduplicate: keep highest severity per category.
        let mut deduped: Vec<Problem> = Vec::new();
        for p in all_problems {
            if let Some(existing) = deduped
                .iter_mut()
                .find(|e| e.category == p.category)
            {
                if p.severity > existing.severity {
                    *existing = p;
                }
            } else {
                deduped.push(p);
            }
        }

        deduped
    }

    /// Benchmark: create the test setup, process `iterations` buffers,
    /// return the average process() duration per buffer.
    pub fn benchmark(&self, node_type: &str, iterations: usize) -> Duration {
        let mut node = self
            .registry
            .create(node_type)
            .unwrap_or_else(|| panic!("Unknown node type: {node_type}"));

        let is_source = is_source_node(node_type);

        let mut source: Box<dyn AudioNode> =
            Box::new(crate::helpers::SineSource::new(440.0, 0.8));

        let params = NodeParameterState::new();
        let transport = TransportState::new(self.sample_rate);
        let mut total = Duration::ZERO;

        for _ in 0..iterations {
            // Generate source.
            let mut source_data = vec![0.0f32; self.buffer_size];
            if !is_source {
                let mut src_out = vec![0.0f32; self.buffer_size];
                {
                    let mut src_slices: Vec<&mut [f32]> = vec![src_out.as_mut_slice()];
                    let empty_in: &[&[f32]] = &[];
                    let mut midi_out: Vec<MidiMessage> = Vec::new();
                    let mut ctx = ProcessContext {
                        inputs: empty_in,
                        outputs: &mut src_slices,
                        parameters: &params,
                        sample_rate: self.sample_rate,
                        buffer_size: self.buffer_size,
                        transport: &transport,
                        midi_input: &[],
                        midi_output: &mut midi_out,
                    };
                    let _ = source.process(&mut ctx);
                }
                source_data.copy_from_slice(&src_out);
            }

            let input_refs: Vec<&[f32]> = vec![source_data.as_slice()];
            let mut output_data = vec![0.0f32; self.buffer_size];
            {
                let mut output_slices: Vec<&mut [f32]> =
                    vec![output_data.as_mut_slice()];
                let mut midi_out: Vec<MidiMessage> = Vec::new();

                let mut ctx = ProcessContext {
                    inputs: if is_source { &[] } else { &input_refs },
                    outputs: &mut output_slices,
                    parameters: &params,
                    sample_rate: self.sample_rate,
                    buffer_size: self.buffer_size,
                    transport: &transport,
                    midi_input: &[],
                    midi_output: &mut midi_out,
                };

                let start = Instant::now();
                let _ = node.process(&mut ctx);
                total += start.elapsed();
            }
        }

        if iterations > 0 {
            total / iterations as u32
        } else {
            Duration::ZERO
        }
    }

    /// Run basic test + fuzz + stress + benchmark. Aggregate into a ValidationReport.
    ///
    /// `passed` is true only if:
    /// - No Critical or Error severity problems in basic test
    /// - No NaN detected anywhere
    /// - No persistent clipping in basic test (occasional transient is OK)
    /// - Benchmark within reasonable bounds (< 10% of buffer duration)
    pub fn full_validation(&self, node_type: &str) -> ValidationReport {
        // Basic test with default params.
        let basic = self.test_node(node_type, &[], 10);

        // Fuzz.
        let fuzz_results = self.fuzz(node_type, 5);

        // Stress.
        let stress_problems = self.stress(node_type);

        // Benchmark.
        let benchmark_avg = self.benchmark(node_type, 100);

        // Determine pass/fail.
        let buffer_duration = Duration::from_secs_f64(self.buffer_size as f64 / self.sample_rate);
        let benchmark_budget = buffer_duration.mul_f64(0.1); // 10% of buffer duration

        // Check for Critical/Error in basic test.
        let has_critical_or_error = basic
            .problems
            .iter()
            .any(|p| p.severity >= Severity::Error);

        // Check for NaN anywhere.
        let has_nan_basic = basic.stats.iter().any(|s| s.has_nan);
        let has_nan_fuzz = fuzz_results
            .iter()
            .any(|(_, problems)| problems.iter().any(|p| p.category == ProblemCategory::NaN));
        let has_nan_stress = stress_problems
            .iter()
            .any(|p| p.category == ProblemCategory::NaN);
        let has_nan = has_nan_basic || has_nan_fuzz || has_nan_stress;

        // Check for persistent clipping in basic test (> 50% of buffers clipping).
        let clipping_buffers = basic
            .stats
            .iter()
            .filter(|s| s.clip_count > 0)
            .count();
        let persistent_clipping = if basic.stats.is_empty() {
            false
        } else {
            clipping_buffers > basic.stats.len() / 2
        };

        let benchmark_ok = benchmark_avg <= benchmark_budget;

        let passed =
            !has_critical_or_error && !has_nan && !persistent_clipping && benchmark_ok;

        // Build summary.
        let fuzz_problem_count: usize =
            fuzz_results.iter().map(|(_, ps)| ps.len()).sum();
        let summary = format!(
            "Node '{}': {} | Basic: {} problems | Fuzz: {} problem combos across {} sweeps | \
             Stress: {} problems | Benchmark: {:.1}us/buffer (budget: {:.1}us)",
            node_type,
            if passed { "PASSED" } else { "FAILED" },
            basic.problems.len(),
            fuzz_problem_count,
            fuzz_results.len(),
            stress_problems.len(),
            benchmark_avg.as_secs_f64() * 1_000_000.0,
            benchmark_budget.as_secs_f64() * 1_000_000.0,
        );

        ValidationReport {
            node_type: node_type.to_string(),
            passed,
            basic,
            fuzz_problems: fuzz_results,
            stress_problems,
            benchmark_avg,
            summary,
        }
    }
}
