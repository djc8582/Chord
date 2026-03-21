//! Tests for the chord-export-engine crate.

use chord_audio_graph::*;

use crate::*;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// Build a simple Oscillator -> Output graph for testing.
fn build_osc_output_graph() -> Graph {
    let mut graph = Graph::new();

    let osc = graph.add_node(
        NodeDescriptor::new("oscillator")
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("frequency", "Frequency", 440.0, 20.0, 20000.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("amplitude", "Amplitude", 0.5, 0.0, 1.0)),
    );
    let output = graph.add_node(
        NodeDescriptor::new("output")
            .with_input(PortDescriptor::new("in", PortDataType::Audio)),
    );

    let osc_out = graph.node(&osc).unwrap().outputs[0].id;
    let out_in = graph.node(&output).unwrap().inputs[0].id;
    graph.connect(osc, osc_out, output, out_in).unwrap();

    graph
}

/// Build a more complex graph: Osc -> Gain -> Filter -> Output.
fn build_chain_graph() -> Graph {
    let mut graph = Graph::new();

    let osc = graph.add_node(
        NodeDescriptor::new("oscillator")
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("frequency", "Frequency", 440.0, 20.0, 20000.0)),
    );
    let gain = graph.add_node(
        NodeDescriptor::new("gain")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("level", "Level", 0.8, 0.0, 2.0)),
    );
    let filter = graph.add_node(
        NodeDescriptor::new("filter")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("cutoff", "Cutoff", 1000.0, 20.0, 20000.0)),
    );
    let output = graph.add_node(
        NodeDescriptor::new("output")
            .with_input(PortDescriptor::new("in", PortDataType::Audio)),
    );

    let osc_out = graph.node(&osc).unwrap().outputs[0].id;
    let gain_in = graph.node(&gain).unwrap().inputs[0].id;
    let gain_out = graph.node(&gain).unwrap().outputs[0].id;
    let filter_in = graph.node(&filter).unwrap().inputs[0].id;
    let filter_out = graph.node(&filter).unwrap().outputs[0].id;
    let out_in = graph.node(&output).unwrap().inputs[0].id;

    graph.connect(osc, osc_out, gain, gain_in).unwrap();
    graph.connect(gain, gain_out, filter, filter_in).unwrap();
    graph.connect(filter, filter_out, output, out_in).unwrap();

    graph
}

/// Build a graph with an unsupported node type (vst3_plugin).
fn build_graph_with_plugin_host_node() -> Graph {
    let mut graph = Graph::new();

    let plugin = graph.add_node(
        NodeDescriptor::new("vst3_plugin")
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),
    );
    let output = graph.add_node(
        NodeDescriptor::new("output")
            .with_input(PortDescriptor::new("in", PortDataType::Audio)),
    );

    let plugin_out = graph.node(&plugin).unwrap().outputs[0].id;
    let out_in = graph.node(&output).unwrap().inputs[0].id;
    graph.connect(plugin, plugin_out, output, out_in).unwrap();

    graph
}

fn default_options(target: ExportTarget) -> ExportOptions {
    ExportOptions {
        target,
        sample_rate: 48000,
        buffer_size: 256,
        optimization_level: OptimizationLevel::Release,
        output_directory: "/tmp/chord-export-test".to_string(),
        name: "test_patch".to_string(),
        include_gui: false,
    }
}

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

#[test]
fn validation_rejects_empty_graph() {
    let graph = Graph::new();
    let options = default_options(ExportTarget::Standalone);
    let result = ExportPipeline::validate(&graph, &options);
    assert!(result.is_err());
    match result.unwrap_err() {
        ExportError::EmptyGraph => {}
        other => panic!("Expected EmptyGraph, got: {other}"),
    }
}

#[test]
fn validation_catches_invalid_graph() {
    // Create a graph with a type mismatch.
    let mut graph = Graph::new();
    let osc = graph.add_node(
        NodeDescriptor::new("oscillator")
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),
    );
    let midi = graph.add_node(
        NodeDescriptor::new("midi_node")
            .with_input(PortDescriptor::new("in", PortDataType::Midi)),
    );
    let osc_out = graph.node(&osc).unwrap().outputs[0].id;
    let midi_in = graph.node(&midi).unwrap().inputs[0].id;
    graph.connect(osc, osc_out, midi, midi_in).unwrap();

    let options = default_options(ExportTarget::Standalone);
    let result = ExportPipeline::validate(&graph, &options);
    assert!(result.is_err());
    match result.unwrap_err() {
        ExportError::CompilationFailed(msg) => {
            assert!(msg.contains("Type mismatch"), "Expected type mismatch error, got: {msg}");
        }
        other => panic!("Expected CompilationFailed, got: {other}"),
    }
}

#[test]
fn validation_catches_unsupported_node_type() {
    let graph = build_graph_with_plugin_host_node();
    let options = default_options(ExportTarget::Web);
    let result = ExportPipeline::validate(&graph, &options);
    assert!(result.is_err());
    match result.unwrap_err() {
        ExportError::UnsupportedNodes { target, node_types } => {
            assert_eq!(target, ExportTarget::Web);
            assert!(node_types.contains(&"vst3_plugin".to_string()));
        }
        other => panic!("Expected UnsupportedNodes, got: {other}"),
    }
}

#[test]
fn validation_catches_unsupported_node_for_all_restricted_targets() {
    let graph = build_graph_with_plugin_host_node();

    // Plugin host nodes are unsupported on every target.
    for target in ExportTarget::all() {
        let options = default_options(target);
        let result = ExportPipeline::validate(&graph, &options);
        assert!(
            result.is_err(),
            "Expected validation to fail for target {target}, but it passed"
        );
    }
}

#[test]
fn validation_passes_for_simple_graph() {
    let graph = build_osc_output_graph();
    for target in ExportTarget::all() {
        let options = default_options(target);
        let result = ExportPipeline::validate(&graph, &options);
        assert!(
            result.is_ok(),
            "Validation failed for target {target}: {:?}",
            result.unwrap_err()
        );
    }
}

// ---------------------------------------------------------------------------
// Web export tests
// ---------------------------------------------------------------------------

#[test]
fn web_export_generates_correct_artifacts() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::Web);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    // Should have: src/lib.rs, src/graph.rs, Cargo.toml, js/processor.js,
    // js/index.ts, js/ChordPatch.tsx, package.json, chord-export-manifest.json
    assert!(
        result.artifacts.len() >= 8,
        "Expected at least 8 artifacts, got {}",
        result.artifacts.len()
    );

    let filenames: Vec<&str> = result.artifacts.iter().map(|a| a.filename.as_str()).collect();
    assert!(filenames.contains(&"src/lib.rs"));
    assert!(filenames.contains(&"src/graph.rs"));
    assert!(filenames.contains(&"Cargo.toml"));
    assert!(filenames.contains(&"js/processor.js"));
    assert!(filenames.contains(&"js/index.ts"));
    assert!(filenames.contains(&"js/ChordPatch.tsx"));
    assert!(filenames.contains(&"package.json"));
    assert!(filenames.contains(&"chord-export-manifest.json"));
}

#[test]
fn web_export_wasm_source_contains_key_elements() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::Web);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let lib_rs = result.artifacts.iter().find(|a| a.filename == "src/lib.rs").unwrap();
    assert!(lib_rs.content.contains("wasm_bindgen"));
    assert!(lib_rs.content.contains("AudioProcessor"));
    assert!(lib_rs.content.contains("process"));
    assert!(lib_rs.content.contains("SAMPLE_RATE"));
    assert!(lib_rs.content.contains("48000"));
}

#[test]
fn web_export_js_bindings_contain_audioworklet() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::Web);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let processor = result.artifacts.iter().find(|a| a.filename == "js/processor.js").unwrap();
    assert!(processor.content.contains("AudioWorkletProcessor"));
    assert!(processor.content.contains("registerProcessor"));
    assert!(processor.content.contains("test_patch-processor"));
}

#[test]
fn web_export_react_component_is_valid() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::Web);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let component = result.artifacts.iter().find(|a| a.filename == "js/ChordPatch.tsx").unwrap();
    assert!(component.content.contains("React"));
    assert!(component.content.contains("useEffect"));
    assert!(component.content.contains("TestPatch"));
    assert!(component.content.contains("playing"));
}

#[test]
fn web_export_package_json_is_valid() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::Web);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let pkg = result.artifacts.iter().find(|a| a.filename == "package.json").unwrap();
    // Verify it's valid JSON.
    let parsed: serde_json::Value = serde_json::from_str(&pkg.content)
        .expect("package.json should be valid JSON");
    assert_eq!(parsed["name"], "@chord/test_patch");
    assert!(parsed["scripts"]["build"].as_str().unwrap().contains("wasm-pack"));
}

// ---------------------------------------------------------------------------
// VST3 export tests
// ---------------------------------------------------------------------------

#[test]
fn vst3_export_generates_correct_artifacts() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::VST3);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let filenames: Vec<&str> = result.artifacts.iter().map(|a| a.filename.as_str()).collect();
    assert!(filenames.contains(&"src/lib.rs"));
    assert!(filenames.contains(&"src/graph.rs"));
    assert!(filenames.contains(&"src/info.rs"));
    assert!(filenames.contains(&"Cargo.toml"));
}

#[test]
fn vst3_export_has_correct_metadata() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::VST3);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let info = result.artifacts.iter().find(|a| a.filename == "src/info.rs").unwrap();
    assert!(info.content.contains("PLUGIN_NAME"));
    assert!(info.content.contains("test_patch"));
    assert!(info.content.contains("PLUGIN_VENDOR"));
    assert!(info.content.contains("Chord"));
    assert!(info.content.contains("PLUGIN_CATEGORY"));
    assert!(info.content.contains("PLUGIN_ID"));
    assert!(info.content.contains("vst3"));
}

#[test]
fn vst3_export_includes_parameters() {
    let graph = build_chain_graph();
    let options = default_options(ExportTarget::VST3);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let lib = result.artifacts.iter().find(|a| a.filename == "src/lib.rs").unwrap();
    // The chain graph has frequency, level, and cutoff parameters.
    assert!(lib.content.contains("frequency"));
    assert!(lib.content.contains("level") || lib.content.contains("Level"));
    assert!(lib.content.contains("cutoff") || lib.content.contains("Cutoff"));
    assert!(lib.content.contains("ParameterInfo"));
}

// ---------------------------------------------------------------------------
// CLAP export tests
// ---------------------------------------------------------------------------

#[test]
fn clap_export_generates_correct_artifacts() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::CLAP);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let filenames: Vec<&str> = result.artifacts.iter().map(|a| a.filename.as_str()).collect();
    assert!(filenames.contains(&"src/lib.rs"));
    assert!(filenames.contains(&"src/info.rs"));

    let info = result.artifacts.iter().find(|a| a.filename == "src/info.rs").unwrap();
    assert!(info.content.contains("clap"));
}

// ---------------------------------------------------------------------------
// Standalone export tests
// ---------------------------------------------------------------------------

#[test]
fn standalone_export_generates_runnable_main() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::Standalone);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let filenames: Vec<&str> = result.artifacts.iter().map(|a| a.filename.as_str()).collect();
    assert!(filenames.contains(&"src/main.rs"));
    assert!(filenames.contains(&"src/graph.rs"));
    assert!(filenames.contains(&"src/processor.rs"));
    assert!(filenames.contains(&"Cargo.toml"));

    let main = result.artifacts.iter().find(|a| a.filename == "src/main.rs").unwrap();
    assert!(main.content.contains("fn main()"));
    assert!(main.content.contains("--sample-rate"));
    assert!(main.content.contains("--buffer-size"));
    assert!(main.content.contains("--duration"));
    assert!(main.content.contains("--output"));
    assert!(main.content.contains("CPAL"));
}

#[test]
fn standalone_export_processor_references_node_types() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::Standalone);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let proc = result.artifacts.iter().find(|a| a.filename == "src/processor.rs").unwrap();
    assert!(proc.content.contains("oscillator"));
    assert!(proc.content.contains("output"));
    assert!(proc.content.contains("DspProcessor"));
    assert!(proc.content.contains("fn process"));
}

// ---------------------------------------------------------------------------
// Game engine export tests
// ---------------------------------------------------------------------------

#[test]
fn game_engine_export_generates_c_header_and_ffi_bridge() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::GameEngine);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let filenames: Vec<&str> = result.artifacts.iter().map(|a| a.filename.as_str()).collect();
    assert!(filenames.contains(&"include/test_patch.h"));
    assert!(filenames.contains(&"src/lib.rs"));
    assert!(filenames.contains(&"src/graph.rs"));
    assert!(filenames.contains(&"Cargo.toml"));
}

#[test]
fn game_engine_c_header_has_correct_api() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::GameEngine);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let header = result.artifacts.iter()
        .find(|a| a.filename.ends_with(".h") && a.filename.starts_with("include/"))
        .unwrap();

    // Check for all required C API functions.
    assert!(header.content.contains("test_patch_create"));
    assert!(header.content.contains("test_patch_destroy"));
    assert!(header.content.contains("test_patch_process"));
    assert!(header.content.contains("test_patch_set_parameter"));
    assert!(header.content.contains("test_patch_get_parameter"));
    assert!(header.content.contains("test_patch_reset"));
    assert!(header.content.contains("test_patch_node_count"));
    assert!(header.content.contains("test_patch_param_count"));

    // Check for include guard.
    assert!(header.content.contains("#ifndef TEST_PATCH_H"));
    assert!(header.content.contains("#define TEST_PATCH_H"));
    assert!(header.content.contains("#endif"));

    // Check for extern "C" block.
    assert!(header.content.contains("extern \"C\""));
}

#[test]
fn game_engine_ffi_bridge_has_no_mangle_exports() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::GameEngine);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let bridge = result.artifacts.iter().find(|a| a.filename == "src/lib.rs").unwrap();
    assert!(bridge.content.contains("#[no_mangle]"));
    assert!(bridge.content.contains("pub extern \"C\""));
    assert!(bridge.content.contains("test_patch_create"));
    assert!(bridge.content.contains("test_patch_destroy"));
    assert!(bridge.content.contains("test_patch_process"));
}

// ---------------------------------------------------------------------------
// Mobile framework export tests
// ---------------------------------------------------------------------------

#[test]
fn mobile_export_includes_platform_wrappers() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::MobileFramework);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    let filenames: Vec<&str> = result.artifacts.iter().map(|a| a.filename.as_str()).collect();

    // Should include C header, FFI bridge, iOS bridging header, and Android JNI wrapper.
    assert!(filenames.iter().any(|f| f.ends_with(".h") && f.starts_with("include/")));
    assert!(filenames.contains(&"src/lib.rs"));
    assert!(filenames.iter().any(|f| f.contains("ios/") && f.ends_with("-Bridging-Header.h")));
    assert!(filenames.iter().any(|f| f.contains("android/") && f.ends_with(".kt")));
}

// ---------------------------------------------------------------------------
// Desktop export tests
// ---------------------------------------------------------------------------

#[test]
fn desktop_export_generates_standalone_artifacts() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::Desktop);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    // Desktop currently uses the standalone exporter.
    let filenames: Vec<&str> = result.artifacts.iter().map(|a| a.filename.as_str()).collect();
    assert!(filenames.contains(&"src/main.rs"));
    assert!(filenames.contains(&"src/processor.rs"));
}

// ---------------------------------------------------------------------------
// ExportManifest tests
// ---------------------------------------------------------------------------

#[test]
fn manifest_roundtrip_serialization() {
    let manifest = ExportManifest::new(
        "test_synth",
        ExportTarget::VST3,
        48000,
        256,
        "abcdef0123456789",
        vec!["src/lib.rs".to_string(), "src/graph.rs".to_string()],
    );

    let json = manifest.to_json().expect("Serialization should succeed");
    let deserialized = ExportManifest::from_json(&json).expect("Deserialization should succeed");

    assert_eq!(manifest, deserialized);
    assert_eq!(deserialized.name, "test_synth");
    assert_eq!(deserialized.target, ExportTarget::VST3);
    assert_eq!(deserialized.sample_rate, 48000);
    assert_eq!(deserialized.buffer_size, 256);
    assert_eq!(deserialized.graph_hash, "abcdef0123456789");
    assert_eq!(deserialized.files.len(), 2);
}

#[test]
fn manifest_included_in_export_result() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::Standalone);
    let result = ExportPipeline::run(&graph, &options).unwrap();

    // The manifest should be in the result struct.
    assert_eq!(result.manifest.name, "test_patch");
    assert_eq!(result.manifest.target, ExportTarget::Standalone);
    assert_eq!(result.manifest.sample_rate, 48000);

    // And also as an artifact file.
    let manifest_artifact = result.artifacts.iter()
        .find(|a| a.filename == "chord-export-manifest.json")
        .expect("Manifest artifact should be present");

    // Verify the artifact content is valid JSON that round-trips.
    let parsed: ExportManifest = serde_json::from_str(&manifest_artifact.content)
        .expect("Manifest artifact should be valid JSON");
    assert_eq!(parsed.name, "test_patch");
}

// ---------------------------------------------------------------------------
// Optimization level tests
// ---------------------------------------------------------------------------

#[test]
fn different_optimization_levels_produce_different_configs() {
    let graph = build_osc_output_graph();

    let debug_options = ExportOptions {
        optimization_level: OptimizationLevel::Debug,
        ..default_options(ExportTarget::Standalone)
    };
    let release_options = ExportOptions {
        optimization_level: OptimizationLevel::Release,
        ..default_options(ExportTarget::Standalone)
    };
    let size_options = ExportOptions {
        optimization_level: OptimizationLevel::Size,
        ..default_options(ExportTarget::Standalone)
    };

    let debug_result = ExportPipeline::run(&graph, &debug_options).unwrap();
    let release_result = ExportPipeline::run(&graph, &release_options).unwrap();
    let size_result = ExportPipeline::run(&graph, &size_options).unwrap();

    let debug_cargo = debug_result.artifacts.iter().find(|a| a.filename == "Cargo.toml").unwrap();
    let release_cargo = release_result.artifacts.iter().find(|a| a.filename == "Cargo.toml").unwrap();
    let size_cargo = size_result.artifacts.iter().find(|a| a.filename == "Cargo.toml").unwrap();

    // Debug should have opt-level = 0.
    assert!(debug_cargo.content.contains("opt-level = 0"));
    // Release should have opt-level = 3.
    assert!(release_cargo.content.contains("opt-level = 3"));
    // Size should have opt-level = "s".
    assert!(size_cargo.content.contains("opt-level = \"s\""));

    // Release and Size should have LTO enabled.
    assert!(release_cargo.content.contains("lto = true"));
    assert!(size_cargo.content.contains("lto = true"));

    // Size should have strip enabled.
    assert!(size_cargo.content.contains("strip = true"));
    assert!(!release_cargo.content.contains("strip = true"));
}

// ---------------------------------------------------------------------------
// Round-trip: export Osc->Output to every target
// ---------------------------------------------------------------------------

#[test]
fn roundtrip_osc_output_to_all_targets() {
    let graph = build_osc_output_graph();

    for target in ExportTarget::all() {
        let options = default_options(target);
        let result = ExportPipeline::run(&graph, &options);
        assert!(
            result.is_ok(),
            "Export failed for target {target}: {:?}",
            result.unwrap_err()
        );

        let result = result.unwrap();

        // Every target should produce at least 2 artifacts (source + manifest).
        assert!(
            result.artifacts.len() >= 2,
            "Target {target} produced only {} artifacts",
            result.artifacts.len()
        );

        // Every artifact should have non-empty content.
        for artifact in &result.artifacts {
            assert!(
                !artifact.content.is_empty(),
                "Target {target}: artifact {:?} has empty content",
                artifact.filename
            );
            assert!(
                !artifact.filename.is_empty(),
                "Target {target}: artifact has empty filename"
            );
        }

        // Manifest should reference all files except itself.
        let non_manifest_count = result.artifacts.iter()
            .filter(|a| a.filename != "chord-export-manifest.json")
            .count();
        assert_eq!(
            result.manifest.files.len(),
            non_manifest_count,
            "Target {target}: manifest file count ({}) does not match artifact count ({})",
            result.manifest.files.len(),
            non_manifest_count,
        );

        // Graph hash should be consistent.
        assert!(
            !result.manifest.graph_hash.is_empty(),
            "Target {target}: graph hash is empty"
        );
    }
}

// ---------------------------------------------------------------------------
// Graph hash consistency
// ---------------------------------------------------------------------------

#[test]
fn graph_hash_is_deterministic() {
    let graph = build_osc_output_graph();
    let options = default_options(ExportTarget::Standalone);

    let result1 = ExportPipeline::run(&graph, &options).unwrap();
    let result2 = ExportPipeline::run(&graph, &options).unwrap();

    assert_eq!(result1.manifest.graph_hash, result2.manifest.graph_hash);
}

// ---------------------------------------------------------------------------
// ExportTarget tests
// ---------------------------------------------------------------------------

#[test]
fn export_target_all_returns_all_variants() {
    let targets = ExportTarget::all();
    assert_eq!(targets.len(), 7);
    assert!(targets.contains(&ExportTarget::Web));
    assert!(targets.contains(&ExportTarget::Desktop));
    assert!(targets.contains(&ExportTarget::VST3));
    assert!(targets.contains(&ExportTarget::CLAP));
    assert!(targets.contains(&ExportTarget::GameEngine));
    assert!(targets.contains(&ExportTarget::MobileFramework));
    assert!(targets.contains(&ExportTarget::Standalone));
}

#[test]
fn export_target_display_is_human_readable() {
    assert_eq!(format!("{}", ExportTarget::Web), "Web (WASM + JS)");
    assert_eq!(format!("{}", ExportTarget::VST3), "VST3 Plugin");
    assert_eq!(format!("{}", ExportTarget::Standalone), "Standalone CLI");
}

// ---------------------------------------------------------------------------
// Available targets
// ---------------------------------------------------------------------------

#[test]
fn pipeline_lists_available_targets() {
    let targets = ExportPipeline::available_targets();
    assert_eq!(targets.len(), 7);
}

// ---------------------------------------------------------------------------
// Graph embedding code generation
// ---------------------------------------------------------------------------

#[test]
fn graph_embed_code_contains_metadata() {
    let graph = build_chain_graph();
    let compiled = GraphCompiler::compile(&graph).unwrap();
    let options = default_options(ExportTarget::Standalone);

    let code = crate::codegen::generate_graph_embed_code(&graph, &compiled, &options);

    assert!(code.contains("GRAPH_NAME"));
    assert!(code.contains("test_patch"));
    assert!(code.contains("SAMPLE_RATE"));
    assert!(code.contains("48000"));
    assert!(code.contains("BUFFER_SIZE"));
    assert!(code.contains("256"));
    assert!(code.contains("NODE_TYPES"));
    assert!(code.contains("oscillator"));
    assert!(code.contains("gain"));
    assert!(code.contains("filter"));
    assert!(code.contains("output"));
    assert!(code.contains("PARAMETER_DEFAULTS"));
    assert!(code.contains("frequency"));
}

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------

#[test]
fn export_error_display_is_informative() {
    let err = ExportError::EmptyGraph;
    assert_eq!(err.to_string(), "Cannot export an empty graph");

    let err = ExportError::CompilationFailed("cycle detected".to_string());
    assert!(err.to_string().contains("cycle detected"));

    let err = ExportError::UnsupportedNodes {
        target: ExportTarget::Web,
        node_types: vec!["vst3_plugin".to_string()],
    };
    assert!(err.to_string().contains("vst3_plugin"));
    assert!(err.to_string().contains("Web"));
}

// ---------------------------------------------------------------------------
// Network-only nodes rejected for restricted targets
// ---------------------------------------------------------------------------

#[test]
fn network_nodes_rejected_for_web_target() {
    let mut graph = Graph::new();
    let osc_send = graph.add_node(
        NodeDescriptor::new("osc_send")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),
    );
    let output = graph.add_node(
        NodeDescriptor::new("output")
            .with_input(PortDescriptor::new("in", PortDataType::Audio)),
    );
    let osc_out = graph.node(&osc_send).unwrap().outputs[0].id;
    let out_in = graph.node(&output).unwrap().inputs[0].id;
    graph.connect(osc_send, osc_out, output, out_in).unwrap();

    let options = default_options(ExportTarget::Web);
    let result = ExportPipeline::validate(&graph, &options);
    assert!(result.is_err());
    match result.unwrap_err() {
        ExportError::UnsupportedNodes { node_types, .. } => {
            assert!(node_types.contains(&"osc_send".to_string()));
        }
        other => panic!("Expected UnsupportedNodes, got: {other}"),
    }
}

#[test]
fn network_nodes_allowed_for_standalone_target() {
    // Standalone should not block on network-only nodes since
    // desktop environments can use network I/O.
    // However, the current implementation does not restrict network
    // nodes on Standalone/Desktop targets, so this should pass.
    let mut graph = Graph::new();
    let osc_send = graph.add_node(
        NodeDescriptor::new("osc_send")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),
    );
    let output = graph.add_node(
        NodeDescriptor::new("output")
            .with_input(PortDescriptor::new("in", PortDataType::Audio)),
    );
    let osc_out = graph.node(&osc_send).unwrap().outputs[0].id;
    let out_in = graph.node(&output).unwrap().inputs[0].id;
    graph.connect(osc_send, osc_out, output, out_in).unwrap();

    let options = default_options(ExportTarget::Standalone);
    let result = ExportPipeline::validate(&graph, &options);
    assert!(result.is_ok());
}

// ---------------------------------------------------------------------------
// Complex graph export
// ---------------------------------------------------------------------------

#[test]
fn chain_graph_exports_to_all_targets() {
    let graph = build_chain_graph();

    for target in ExportTarget::all() {
        let options = default_options(target);
        let result = ExportPipeline::run(&graph, &options);
        assert!(
            result.is_ok(),
            "Chain graph export failed for target {target}: {:?}",
            result.unwrap_err()
        );

        let result = result.unwrap();
        // All artifacts should be non-empty.
        for artifact in &result.artifacts {
            assert!(
                !artifact.content.is_empty(),
                "Chain graph, target {target}: artifact {:?} is empty",
                artifact.filename
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Default options
// ---------------------------------------------------------------------------

#[test]
fn default_export_options_are_reasonable() {
    let opts = ExportOptions::default();
    assert_eq!(opts.target, ExportTarget::Standalone);
    assert_eq!(opts.sample_rate, 48000);
    assert_eq!(opts.buffer_size, 256);
    assert_eq!(opts.optimization_level, OptimizationLevel::Release);
    assert!(!opts.include_gui);
}
