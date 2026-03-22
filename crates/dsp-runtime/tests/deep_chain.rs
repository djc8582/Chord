//! Integration test: deep effect chain of 8+ nodes produces valid audio.
//!
//! Verifies that a realistic signal chain — Oscillator -> Filter -> Delay ->
//! Reverb -> Compressor -> EQ -> Chorus -> Gain — runs through the AudioEngine
//! without producing NaN/Inf, maintains non-zero RMS, and stays below a
//! reasonable peak threshold.

use chord_audio_graph::{Graph, GraphCompiler, NodeDescriptor, PortDataType, PortDescriptor};
use chord_dsp_runtime::{AudioBuffer, AudioEngine, EngineConfig, NodeId};
use chord_node_library::NodeRegistry;

#[test]
fn test_deep_chain_produces_valid_audio() {
    let registry = NodeRegistry::with_all();

    let config = EngineConfig {
        sample_rate: 48000.0,
        buffer_size: 256,
        ..Default::default()
    };
    let mut engine = AudioEngine::new(config);

    // Build a graph with 8 nodes in a chain:
    // Oscillator -> Filter -> Delay -> Reverb -> Compressor -> EQ -> Chorus -> Gain
    let mut graph = Graph::new();

    // Node 0: Oscillator (source — no input, one output).
    let osc_id = graph.add_node(
        NodeDescriptor::new("oscillator")
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),
    );

    // Nodes 1-7: Effects (one input, one output each).
    let effect_types = [
        "filter",
        "delay",
        "reverb",
        "compressor",
        "eq",
        "chorus",
        "gain",
    ];
    let mut effect_ids = Vec::new();
    for type_name in &effect_types {
        let id = graph.add_node(
            NodeDescriptor::new(type_name)
                .with_input(PortDescriptor::new("in", PortDataType::Audio))
                .with_output(PortDescriptor::new("out", PortDataType::Audio)),
        );
        effect_ids.push(id);
    }

    // Connect the chain: osc -> filter -> delay -> reverb -> compressor -> eq -> chorus -> gain.
    let all_ids: Vec<NodeId> = std::iter::once(osc_id)
        .chain(effect_ids.iter().copied())
        .collect();

    for i in 0..(all_ids.len() - 1) {
        let from_id = all_ids[i];
        let to_id = all_ids[i + 1];
        let from_port = graph.node(&from_id).unwrap().outputs[0].id;
        let to_port = graph.node(&to_id).unwrap().inputs[0].id;
        graph.connect(from_id, from_port, to_id, to_port).unwrap();
    }

    let compiled = GraphCompiler::compile(&graph).unwrap();

    // Build the routing table: (from_node, from_port_idx, to_node, to_port_idx).
    // All connections are port index 0 -> port index 0.
    let routing: Vec<(NodeId, usize, NodeId, usize)> = (0..(all_ids.len() - 1))
        .map(|i| (all_ids[i], 0, all_ids[i + 1], 0))
        .collect();

    // Create and register node instances from the registry.
    let node_types = [
        "oscillator",
        "filter",
        "delay",
        "reverb",
        "compressor",
        "eq",
        "chorus",
        "gain",
    ];
    for (idx, type_name) in node_types.iter().enumerate() {
        let node = registry
            .create(type_name)
            .unwrap_or_else(|| panic!("Node type '{}' not found in registry", type_name));
        engine.register_node(all_ids[idx], node);
    }

    // Set parameters: oscillator frequency and sine waveform.
    engine.set_parameter(osc_id, "frequency", 440.0);
    engine.set_parameter(osc_id, "waveform", 0.0);

    // Filter: low-pass at 2kHz to let the 440 Hz fundamental through.
    engine.set_parameter(effect_ids[0], "cutoff", 2000.0);
    engine.set_parameter(effect_ids[0], "resonance", 0.5);

    // Delay: short delay with moderate feedback.
    engine.set_parameter(effect_ids[1], "time", 0.1);
    engine.set_parameter(effect_ids[1], "feedback", 0.2);
    engine.set_parameter(effect_ids[1], "mix", 0.3);

    // Reverb: moderate room size, some damping.
    engine.set_parameter(effect_ids[2], "room_size", 0.5);
    engine.set_parameter(effect_ids[2], "damping", 0.5);
    engine.set_parameter(effect_ids[2], "mix", 0.3);

    // Compressor: gentle compression.
    engine.set_parameter(effect_ids[3], "threshold", -12.0);
    engine.set_parameter(effect_ids[3], "ratio", 3.0);
    engine.set_parameter(effect_ids[3], "attack", 10.0);
    engine.set_parameter(effect_ids[3], "release", 100.0);

    // EQ: slight mid boost.
    engine.set_parameter(effect_ids[4], "mid_freq", 1000.0);
    engine.set_parameter(effect_ids[4], "mid_gain", 3.0);
    engine.set_parameter(effect_ids[4], "mid_q", 1.0);

    // Chorus: subtle chorus effect.
    engine.set_parameter(effect_ids[5], "rate", 1.0);
    engine.set_parameter(effect_ids[5], "depth", 0.3);
    engine.set_parameter(effect_ids[5], "voices", 3.0);
    engine.set_parameter(effect_ids[5], "mix", 0.3);

    // Gain: reduce output to 0.5 to keep levels reasonable.
    engine.set_parameter(effect_ids[6], "gain", 0.5);

    // Swap in the graph with routing information.
    engine.swap_graph_with_routing(compiled, routing);

    // Process several buffers to let the chain warm up (delay/reverb need time
    // to build up, compressor envelope needs to settle).
    let input = AudioBuffer::new(1, 256);
    let mut output = AudioBuffer::new(1, 256);
    let warmup_buffers = 20;

    for _ in 0..warmup_buffers {
        output.clear();
        engine.process(&input, &mut output);
    }

    // Collect statistics from several buffers after warm-up.
    let measurement_buffers = 10;
    let mut total_rms = 0.0_f64;
    let mut any_nan_or_inf = false;
    let mut peak = 0.0_f32;
    let mut nonzero_count = 0_usize;

    for _ in 0..measurement_buffers {
        output.clear();
        engine.process(&input, &mut output);

        let ch = output.channel(0);
        for &s in ch {
            if !s.is_finite() {
                any_nan_or_inf = true;
            }
            total_rms += (s as f64) * (s as f64);
            let abs = s.abs();
            if abs > peak {
                peak = abs;
            }
            if abs > 1e-10 {
                nonzero_count += 1;
            }
        }
    }

    let total_samples = (measurement_buffers * 256) as f64;
    let rms = (total_rms / total_samples).sqrt();

    // 1. No NaN or Inf in the output.
    assert!(
        !any_nan_or_inf,
        "Deep chain produced NaN or Inf values in the output"
    );

    // 2. Non-zero RMS (signal is present after going through 8 nodes).
    assert!(
        rms > 1e-6,
        "Deep chain output RMS is too low ({rms:.2e}); expected audible signal"
    );

    // 3. Peak below a reasonable threshold.
    // The gain node at the end is set to 0.5, plus the compressor limits dynamics,
    // so the peak should stay well below 10.0 (generous upper bound).
    let peak_threshold = 10.0;
    assert!(
        peak < peak_threshold,
        "Deep chain output peak ({peak:.4}) exceeds threshold ({peak_threshold})"
    );

    // 4. Substantial number of non-zero samples (not just a single spike).
    assert!(
        nonzero_count > 100,
        "Deep chain output has too few non-zero samples ({nonzero_count}); \
         expected substantial signal presence across {measurement_buffers} buffers"
    );
}
