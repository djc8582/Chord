//! Tests for the plugin-host crate.

use std::path::PathBuf;

use chord_dsp_runtime::{
    AudioNode, MidiMessage, NodeParameterState, ProcessContext, ProcessStatus, TransportState,
};

use crate::error::PluginError;
use crate::format::{PluginBridge, PluginFormat, PluginInfo};
use crate::host_node::PluginHostNode;
use crate::instance::PluginInstance;
use crate::mock_plugin::MockPlugin;
use crate::parameters::{PluginParameterMap, set_parameter_checked};
use crate::scanner::PluginScanner;

// ---------------------------------------------------------------------------
// Helper: create a simple ProcessContext for testing
// ---------------------------------------------------------------------------

fn make_context<'a>(
    inputs: &'a [&'a [f32]],
    outputs: &'a mut [&'a mut [f32]],
    params: &'a NodeParameterState,
    transport: &'a TransportState,
    midi_output: &'a mut Vec<MidiMessage>,
    buffer_size: usize,
) -> ProcessContext<'a> {
    ProcessContext {
        inputs,
        outputs,
        parameters: params,
        sample_rate: 48000.0,
        buffer_size,
        transport,
        midi_input: &[],
        midi_output,
    }
}

// ===========================================================================
// Scanner tests
// ===========================================================================

#[test]
fn scanner_finds_vst3_plugins() {
    let dir = tempfile::tempdir().unwrap();
    // Create a fake .vst3 directory (VST3 bundles are directories).
    std::fs::create_dir(dir.path().join("MyPlugin.vst3")).unwrap();
    std::fs::create_dir(dir.path().join("AnotherPlugin.vst3")).unwrap();
    // A non-plugin file should be ignored.
    std::fs::write(dir.path().join("readme.txt"), "ignore me").unwrap();

    let results = PluginScanner::scan_directories(&[dir.path().to_path_buf()]);
    assert_eq!(results.len(), 2);
    let names: Vec<&str> = results.iter().map(|r| r.name.as_str()).collect();
    assert!(names.contains(&"MyPlugin"));
    assert!(names.contains(&"AnotherPlugin"));
    for info in &results {
        assert_eq!(info.format, PluginFormat::Vst3);
    }
}

#[test]
fn scanner_finds_clap_plugins() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("Vital.clap"), [0u8]).unwrap();

    let results = PluginScanner::scan_directories(&[dir.path().to_path_buf()]);
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].name, "Vital");
    assert_eq!(results[0].format, PluginFormat::Clap);
}

#[test]
fn scanner_finds_au_components() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir(dir.path().join("AUInstrument.component")).unwrap();

    let results = PluginScanner::scan_directories(&[dir.path().to_path_buf()]);
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].name, "AUInstrument");
    assert_eq!(results[0].format, PluginFormat::AudioUnit);
}

#[test]
fn scanner_finds_mixed_formats() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir(dir.path().join("Synth.vst3")).unwrap();
    std::fs::write(dir.path().join("Effect.clap"), [0u8]).unwrap();
    std::fs::create_dir(dir.path().join("Reverb.component")).unwrap();

    let results = PluginScanner::scan_directories(&[dir.path().to_path_buf()]);
    assert_eq!(results.len(), 3);
}

#[test]
fn scanner_skips_nonexistent_directories() {
    let results = PluginScanner::scan_directories(&[PathBuf::from("/nonexistent/path")]);
    assert!(results.is_empty());
}

#[test]
fn scanner_handles_empty_directory() {
    let dir = tempfile::tempdir().unwrap();
    let results = PluginScanner::scan_directories(&[dir.path().to_path_buf()]);
    assert!(results.is_empty());
}

#[test]
fn scanner_scans_multiple_directories() {
    let dir1 = tempfile::tempdir().unwrap();
    let dir2 = tempfile::tempdir().unwrap();
    std::fs::create_dir(dir1.path().join("A.vst3")).unwrap();
    std::fs::create_dir(dir2.path().join("B.vst3")).unwrap();

    let results = PluginScanner::scan_directories(&[
        dir1.path().to_path_buf(),
        dir2.path().to_path_buf(),
    ]);
    assert_eq!(results.len(), 2);
}

// ===========================================================================
// PluginFormat tests
// ===========================================================================

#[test]
fn format_extension() {
    assert_eq!(PluginFormat::Vst3.extension(), "vst3");
    assert_eq!(PluginFormat::Clap.extension(), "clap");
    assert_eq!(PluginFormat::AudioUnit.extension(), "component");
}

#[test]
fn format_from_path() {
    assert_eq!(
        PluginFormat::from_path(&PathBuf::from("Foo.vst3")),
        Some(PluginFormat::Vst3)
    );
    assert_eq!(
        PluginFormat::from_path(&PathBuf::from("Bar.clap")),
        Some(PluginFormat::Clap)
    );
    assert_eq!(
        PluginFormat::from_path(&PathBuf::from("Baz.component")),
        Some(PluginFormat::AudioUnit)
    );
    assert_eq!(PluginFormat::from_path(&PathBuf::from("nope.txt")), None);
    assert_eq!(PluginFormat::from_path(&PathBuf::from("noext")), None);
}

// ===========================================================================
// MockPlugin tests
// ===========================================================================

#[test]
fn mock_plugin_passthrough() {
    let mut mock = MockPlugin::new("test");
    let input: Vec<f32> = vec![1.0, 0.5, -0.5, 0.0];
    let input_refs: &[&[f32]] = &[&input];
    let mut output = vec![0.0f32; 4];
    let mut out_refs: Vec<&mut [f32]> = vec![&mut output];
    mock.process(input_refs, &mut out_refs, 48000.0, 4);

    // Default gain=1.0, dc_offset=0.0 → passthrough.
    assert_eq!(output, vec![1.0, 0.5, -0.5, 0.0]);
}

#[test]
fn mock_plugin_gain() {
    let mut mock = MockPlugin::new("test");
    mock.set_parameter("gain", 0.5).unwrap();

    let input: Vec<f32> = vec![1.0, 2.0, -1.0, 0.0];
    let input_refs: &[&[f32]] = &[&input];
    let mut output = vec![0.0f32; 4];
    let mut out_refs: Vec<&mut [f32]> = vec![&mut output];
    mock.process(input_refs, &mut out_refs, 48000.0, 4);

    assert_eq!(output, vec![0.5, 1.0, -0.5, 0.0]);
}

#[test]
fn mock_plugin_dc_offset() {
    let mut mock = MockPlugin::new("test");
    mock.set_parameter("dc_offset", 0.25).unwrap();

    let input: Vec<f32> = vec![0.0, 0.0, 0.0, 0.0];
    let input_refs: &[&[f32]] = &[&input];
    let mut output = vec![0.0f32; 4];
    let mut out_refs: Vec<&mut [f32]> = vec![&mut output];
    mock.process(input_refs, &mut out_refs, 48000.0, 4);

    assert_eq!(output, vec![0.25, 0.25, 0.25, 0.25]);
}

#[test]
fn mock_plugin_combined_gain_and_offset() {
    let mut mock = MockPlugin::new("test");
    mock.set_parameter("gain", 2.0).unwrap();
    mock.set_parameter("dc_offset", 0.1).unwrap();

    let input: Vec<f32> = vec![1.0, -1.0];
    let input_refs: &[&[f32]] = &[&input];
    let mut output = vec![0.0f32; 2];
    let mut out_refs: Vec<&mut [f32]> = vec![&mut output];
    mock.process(input_refs, &mut out_refs, 48000.0, 2);

    // 1.0*2.0 + 0.1 = 2.1, -1.0*2.0 + 0.1 = -1.9
    assert!((output[0] - 2.1).abs() < 1e-6);
    assert!((output[1] - (-1.9)).abs() < 1e-6);
}

#[test]
fn mock_plugin_parameter_not_found() {
    let mut mock = MockPlugin::new("test");
    let result = mock.set_parameter("nonexistent", 1.0);
    assert!(result.is_err());
    assert!(matches!(result.unwrap_err(), PluginError::ParameterNotFound { .. }));
}

#[test]
fn mock_plugin_save_load_state() {
    let mut mock = MockPlugin::new("test");
    mock.set_parameter("gain", 0.75).unwrap();
    mock.set_parameter("dc_offset", -0.3).unwrap();

    let state = mock.save_state();
    assert_eq!(state.len(), 16);

    // Create a new mock and load state.
    let mut mock2 = MockPlugin::new("test2");
    mock2.load_state(&state).unwrap();

    assert!((mock2.get_parameter("gain").unwrap() - 0.75).abs() < 1e-10);
    assert!((mock2.get_parameter("dc_offset").unwrap() - (-0.3)).abs() < 1e-10);
}

#[test]
fn mock_plugin_load_state_too_short() {
    let mut mock = MockPlugin::new("test");
    let result = mock.load_state(&[0u8; 8]);
    assert!(result.is_err());
    assert!(matches!(result.unwrap_err(), PluginError::InvalidState { .. }));
}

#[test]
fn mock_plugin_parameter_descriptors() {
    let mock = MockPlugin::new("test");
    let descs = mock.parameter_descriptors();
    assert_eq!(descs.len(), 2);
    assert_eq!(descs[0].id, "gain");
    assert_eq!(descs[1].id, "dc_offset");
    assert_eq!(descs[0].default, 1.0);
    assert_eq!(descs[1].default, 0.0);
}

#[test]
fn mock_plugin_stereo() {
    let mut mock = MockPlugin::new("stereo");

    let left: Vec<f32> = vec![1.0, 2.0];
    let right: Vec<f32> = vec![3.0, 4.0];
    let input_refs: &[&[f32]] = &[&left, &right];

    let mut out_l = vec![0.0f32; 2];
    let mut out_r = vec![0.0f32; 2];
    let mut out_refs: Vec<&mut [f32]> = vec![&mut out_l, &mut out_r];

    mock.process(input_refs, &mut out_refs, 48000.0, 2);
    assert_eq!(out_l, vec![1.0, 2.0]);
    assert_eq!(out_r, vec![3.0, 4.0]);
}

// ===========================================================================
// PluginParameterMap tests
// ===========================================================================

#[test]
fn parameter_map_from_bridge() {
    let mock = MockPlugin::new("test");
    let map = PluginParameterMap::from_bridge(&mock);
    assert_eq!(map.len(), 2);
    assert!(!map.is_empty());
    assert!(map.find("gain").is_some());
    assert!(map.find("dc_offset").is_some());
    assert!(map.find("nonexistent").is_none());
}

#[test]
fn parameter_map_refresh() {
    let mut mock = MockPlugin::new("test");
    let mut map = PluginParameterMap::from_bridge(&mock);

    mock.set_parameter("gain", 0.42).unwrap();
    // Before refresh, map still has old value.
    assert!((map.find("gain").unwrap().value - 1.0).abs() < 1e-10);

    map.refresh(&mock);
    assert!((map.find("gain").unwrap().value - 0.42).abs() < 1e-10);
}

#[test]
fn set_parameter_checked_clamps() {
    let mut mock = MockPlugin::new("test");
    let map = PluginParameterMap::from_bridge(&mock);

    // Set above max — should be clamped to 2.0.
    set_parameter_checked(&mut mock, &map, "gain", 10.0).unwrap();
    assert!((mock.get_parameter("gain").unwrap() - 2.0).abs() < 1e-10);

    // Set below min — should be clamped to 0.0.
    set_parameter_checked(&mut mock, &map, "gain", -5.0).unwrap();
    assert!((mock.get_parameter("gain").unwrap() - 0.0).abs() < 1e-10);
}

#[test]
fn set_parameter_checked_rejects_unknown() {
    let mut mock = MockPlugin::new("test");
    let map = PluginParameterMap::from_bridge(&mock);
    let result = set_parameter_checked(&mut mock, &map, "nonexistent", 1.0);
    assert!(result.is_err());
}

// ===========================================================================
// PluginInstance tests
// ===========================================================================

#[test]
fn instance_load_mock() {
    let inst = PluginInstance::load_mock("TestGain");
    assert_eq!(inst.info().name, "TestGain");
    assert_eq!(inst.info().vendor, "Chord (Mock)");
    assert_eq!(inst.bridge().name(), "TestGain");
}

#[test]
fn instance_load_nonexistent_path() {
    let info = PluginInfo {
        name: "Ghost".to_string(),
        vendor: "Nobody".to_string(),
        format: PluginFormat::Vst3,
        path: PathBuf::from("/nonexistent/Ghost.vst3"),
        uid: "vst3:ghost".to_string(),
        category: "Effect".to_string(),
        is_instrument: false,
        is_effect: true,
    };
    let result = PluginInstance::load(&info);
    assert!(result.is_err());
    assert!(matches!(result.unwrap_err(), PluginError::NotFound { .. }));
}

#[test]
fn instance_load_real_format_returns_not_implemented() {
    let dir = tempfile::tempdir().unwrap();
    let vst_path = dir.path().join("Real.vst3");
    std::fs::create_dir(&vst_path).unwrap();

    let info = PluginInfo {
        name: "Real".to_string(),
        vendor: "Vendor".to_string(),
        format: PluginFormat::Vst3,
        path: vst_path,
        uid: "vst3:real".to_string(),
        category: "Effect".to_string(),
        is_instrument: false,
        is_effect: true,
    };
    let result = PluginInstance::load(&info);
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        PluginError::NotImplemented { format: PluginFormat::Vst3 }
    ));
}

// ===========================================================================
// PluginHostNode tests (AudioNode integration)
// ===========================================================================

#[test]
fn host_node_processes_audio() {
    let mut node = PluginHostNode::new_mock("TestNode");

    let input_l: Vec<f32> = vec![0.5; 64];
    let input_r: Vec<f32> = vec![0.25; 64];
    let input_refs: Vec<&[f32]> = vec![&input_l, &input_r];

    let mut out_l = vec![0.0f32; 64];
    let mut out_r = vec![0.0f32; 64];
    let mut output_refs: Vec<&mut [f32]> = vec![&mut out_l, &mut out_r];

    let params = NodeParameterState::new();
    let transport = TransportState::new(48000.0);
    let mut midi_out = Vec::new();

    let mut ctx = make_context(
        &input_refs,
        &mut output_refs,
        &params,
        &transport,
        &mut midi_out,
        64,
    );

    let result = node.process(&mut ctx);
    assert_eq!(result.unwrap(), ProcessStatus::Ok);

    // Default gain=1.0, dc_offset=0.0 → passthrough.
    assert_eq!(out_l, vec![0.5; 64]);
    assert_eq!(out_r, vec![0.25; 64]);
}

#[test]
fn host_node_applies_parameters_from_context() {
    let mut node = PluginHostNode::new_mock("TestNode");

    let input: Vec<f32> = vec![1.0; 8];
    let input_refs: Vec<&[f32]> = vec![&input];

    let mut output = vec![0.0f32; 8];
    let mut output_refs: Vec<&mut [f32]> = vec![&mut output];

    // Set gain=0.5 in the parameter state.
    let mut params = NodeParameterState::new();
    params.set("gain", 0.5, 0);

    let transport = TransportState::new(48000.0);
    let mut midi_out = Vec::new();

    let mut ctx = make_context(
        &input_refs,
        &mut output_refs,
        &params,
        &transport,
        &mut midi_out,
        8,
    );

    node.process(&mut ctx).unwrap();

    for &s in output.iter() {
        assert!((s - 0.5).abs() < 1e-6, "expected 0.5, got {s}");
    }
}

#[test]
fn host_node_reset() {
    let mut node = PluginHostNode::new_mock("TestNode");
    // Reset should not panic.
    node.reset();
}

#[test]
fn host_node_latency_and_tail() {
    let node = PluginHostNode::new_mock("TestNode");
    assert_eq!(node.latency(), 0);
    assert_eq!(node.tail_length(), 0);
}

#[test]
fn host_node_save_load_state() {
    let mut node = PluginHostNode::new_mock("TestNode");

    // Change a parameter via the bridge.
    node.instance_mut()
        .bridge_mut()
        .set_parameter("gain", 0.3)
        .unwrap();

    let state = node.save_state();

    // Create a second node and restore state.
    let mut node2 = PluginHostNode::new_mock("TestNode2");
    node2.load_state(&state).unwrap();

    let restored_gain = node2.instance().bridge().get_parameter("gain").unwrap();
    assert!((restored_gain - 0.3).abs() < 1e-10);
}

#[test]
fn host_node_parameter_map() {
    let node = PluginHostNode::new_mock("TestNode");
    let map = node.parameter_map();
    assert_eq!(map.len(), 2);
    assert!(map.find("gain").is_some());
    assert!(map.find("dc_offset").is_some());
}

#[test]
fn host_node_refresh_parameters() {
    let mut node = PluginHostNode::new_mock("TestNode");
    node.instance_mut()
        .bridge_mut()
        .set_parameter("gain", 0.77)
        .unwrap();
    node.refresh_parameters();

    let val = node.parameter_map().find("gain").unwrap().value;
    assert!((val - 0.77).abs() < 1e-10);
}

// ===========================================================================
// Error display tests
// ===========================================================================

#[test]
fn error_display() {
    let e = PluginError::NotFound {
        path: PathBuf::from("/foo/bar.vst3"),
    };
    let msg = format!("{e}");
    assert!(msg.contains("not found"), "got: {msg}");

    let e = PluginError::NotImplemented {
        format: PluginFormat::Clap,
    };
    let msg = format!("{e}");
    assert!(msg.contains("not yet implemented"), "got: {msg}");

    let e = PluginError::ParameterNotFound {
        id: "volume".to_string(),
    };
    let msg = format!("{e}");
    assert!(msg.contains("volume"), "got: {msg}");
}

// ===========================================================================
// Integration: scanner → instance → host_node pipeline
// ===========================================================================

#[test]
fn end_to_end_mock_pipeline() {
    // 1. Create a mock instance.
    let instance = PluginInstance::load_mock("E2E-Gain");

    // 2. Wrap it as a host node.
    let mut node = PluginHostNode::new(instance, 1, 1);

    // 3. Process audio through it.
    let input: Vec<f32> = vec![0.8; 32];
    let input_refs: Vec<&[f32]> = vec![&input];
    let mut output = vec![0.0f32; 32];
    let mut output_refs: Vec<&mut [f32]> = vec![&mut output];

    let params = NodeParameterState::new();
    let transport = TransportState::new(48000.0);
    let mut midi_out = Vec::new();

    let mut ctx = make_context(
        &input_refs,
        &mut output_refs,
        &params,
        &transport,
        &mut midi_out,
        32,
    );

    let status = node.process(&mut ctx).unwrap();
    assert_eq!(status, ProcessStatus::Ok);

    // Verify passthrough.
    for &s in output.iter() {
        assert!((s - 0.8).abs() < 1e-6);
    }

    // 4. Change parameter and process again.
    node.instance_mut()
        .bridge_mut()
        .set_parameter("gain", 0.0)
        .unwrap();

    let mut output2 = vec![0.0f32; 32];
    let mut output_refs2: Vec<&mut [f32]> = vec![&mut output2];
    let mut midi_out2 = Vec::new();

    let mut ctx2 = make_context(
        &input_refs,
        &mut output_refs2,
        &params,
        &transport,
        &mut midi_out2,
        32,
    );

    node.process(&mut ctx2).unwrap();
    for &s in output2.iter() {
        assert!(s.abs() < 1e-6, "expected silence, got {s}");
    }
}
