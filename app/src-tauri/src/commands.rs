//! Tauri commands — the bridge between the frontend and the Chord audio engine.
//!
//! Every command accesses shared [`AppState`] via Tauri's managed state system.
//! The critical audio path is: add_node -> connect_ports -> play().

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use chord_audio_graph::{ConnectionId, Graph, GraphCompiler, NodeId, PortId};
// AudioStream import needed so the compiler can infer Mutex<Option<AudioStream>> types.
#[allow(unused_imports)]
use chord_audio_io::AudioStream;
use chord_audio_io::StreamConfig;

use crate::state::{build_node_descriptor, AppState};

/// Shorthand: all commands receive `State<'_, Arc<AppState>>` because the
/// AppState is shared with the API server thread via `Arc`.
type AppArc = Arc<AppState>;

// ---------------------------------------------------------------------------
// Types mirroring the frontend BridgeCommands interface
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortRef {
    pub node_id: String,
    pub port: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalStats {
    pub peak: f64,
    pub rms: f64,
    pub clipping: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticReport {
    pub cpu_usage: f64,
    pub buffer_underruns: u32,
    pub node_count: u32,
    pub sample_rate: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub optimize: bool,
    pub target_sample_rate: Option<u32>,
}

// ---------------------------------------------------------------------------
// Tauri Commands — Graph Manipulation
// ---------------------------------------------------------------------------

/// Add a node of the given type at the given canvas position.
///
/// Creates both the graph-level descriptor (ports, parameters) and the DSP-level
/// AudioNode instance. Returns the node ID as a string.
#[tauri::command]
pub fn add_node(
    node_type: String,
    position: Vec2,
    state: State<'_, AppArc>,
) -> Result<String, String> {
    log::info(
        "add_node",
        &format!(
            "type={node_type} pos=({}, {})",
            position.x, position.y
        ),
    );

    // 1. Build the graph-level descriptor with correct ports/params.
    let mut descriptor = build_node_descriptor(&node_type);
    descriptor.position = (position.x, position.y);
    let node_id = descriptor.id;

    // 2. Add to the abstract graph.
    {
        let mut graph = state.graph.lock().map_err(|e| e.to_string())?;
        graph.add_node(descriptor);
    }

    // 3. Instantiate the DSP AudioNode via the registry.
    let audio_node = state
        .registry
        .create(&node_type)
        .ok_or_else(|| format!("Unknown node type: {node_type}"))?;

    // 4. Set default parameter values and register with the engine.
    {
        let desc = build_node_descriptor(&node_type);
        let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
        for param in &desc.parameters {
            engine.set_parameter(node_id, &param.id, param.default);
        }

        // If transport is playing, register the node directly with the engine
        // so it's available immediately. Otherwise, store it for later.
        if engine.transport().playing {
            engine.register_node(node_id, audio_node);
        } else {
            let mut instances = state.node_instances.lock().map_err(|e| e.to_string())?;
            instances.insert(node_id, audio_node);
        }
    }

    // Recompile so the new node is included in the execution order.
    recompile_and_swap(state.inner())?;

    Ok(node_id.0.to_string())
}

/// Remove a node from the graph and clean up its DSP instance.
#[tauri::command]
pub fn remove_node(id: String, state: State<'_, AppArc>) -> Result<(), String> {
    log::info("remove_node", &format!("id={id}"));

    let node_id = parse_node_id(&id)?;

    // Remove from graph (also removes all connections to/from this node).
    {
        let mut graph = state.graph.lock().map_err(|e| e.to_string())?;
        graph.remove_node(&node_id);
    }

    // Remove the DSP node instance.
    {
        let mut instances = state.node_instances.lock().map_err(|e| e.to_string())?;
        instances.remove(&node_id);
    }

    // Remove from the engine.
    {
        let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
        engine.remove_node(&node_id);
    }

    // Recompile and hot-swap if currently playing.
    recompile_and_swap(state.inner())?;

    Ok(())
}

/// Connect an output port on one node to an input port on another.
///
/// Looks up ports by name, connects them in the graph, recompiles, and hot-swaps
/// the engine graph so the new connection is immediately audible.
#[tauri::command]
pub fn connect_ports(from: PortRef, to: PortRef, state: State<'_, AppArc>) -> Result<String, String> {
    log::info(
        "connect_ports",
        &format!("{}:{} -> {}:{}", from.node_id, from.port, to.node_id, to.port),
    );

    let from_node_id = parse_node_id(&from.node_id)?;
    let to_node_id = parse_node_id(&to.node_id)?;

    let conn_id: ConnectionId;
    {
        let mut graph = state.graph.lock().map_err(|e| e.to_string())?;

        // Look up port IDs by name.
        let from_port_id = find_output_port_by_name(&graph, &from_node_id, &from.port)?;
        let to_port_id = find_input_port_by_name(&graph, &to_node_id, &to.port)?;

        conn_id = graph
            .connect(from_node_id, from_port_id, to_node_id, to_port_id)
            .map_err(|e| e.to_string())?;
    }

    // Store the connection ID mapping.
    let conn_id_str = conn_id.0.to_string();
    {
        let mut conn_ids = state.connection_ids.lock().map_err(|e| e.to_string())?;
        conn_ids.insert(conn_id_str.clone(), conn_id);
    }

    // Recompile and hot-swap.
    recompile_and_swap(state.inner())?;

    Ok(conn_id_str)
}

/// Disconnect (remove) a connection by its ID string.
#[tauri::command]
pub fn disconnect(id: String, state: State<'_, AppArc>) -> Result<(), String> {
    log::info("disconnect", &format!("id={id}"));

    let conn_id = {
        let conn_ids = state.connection_ids.lock().map_err(|e| e.to_string())?;
        conn_ids
            .get(&id)
            .copied()
            .ok_or_else(|| format!("Unknown connection ID: {id}"))?
    };

    {
        let mut graph = state.graph.lock().map_err(|e| e.to_string())?;
        graph.disconnect(&conn_id);
    }

    // Remove from our mapping.
    {
        let mut conn_ids = state.connection_ids.lock().map_err(|e| e.to_string())?;
        conn_ids.remove(&id);
    }

    // Recompile and hot-swap.
    recompile_and_swap(state.inner())?;

    Ok(())
}

/// Set a parameter value on a node. The change is sent lock-free via ring buffer
/// to the audio thread, where it is smoothed to avoid clicks.
#[tauri::command]
pub fn set_parameter(
    node_id: String,
    param: String,
    value: f64,
    state: State<'_, AppArc>,
) -> Result<(), String> {
    log::info(
        "set_parameter",
        &format!("node={node_id} param={param} value={value}"),
    );

    let nid = parse_node_id(&node_id)?;

    // Send the parameter change to the engine (lock-free ring buffer push).
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.set_parameter(nid, &param, value);

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri Commands — Transport
// ---------------------------------------------------------------------------

/// Start audio playback.
///
/// This is the critical path for hearing sound:
/// 1. Compile the graph into an execution order.
/// 2. Register all node instances into the engine.
/// 3. Swap the compiled graph into the engine.
/// 4. Open a CPAL audio stream that calls engine.process() in its callback.
#[tauri::command]
pub fn play(state: State<'_, AppArc>) -> Result<(), String> {
    log::info("play", "transport started");

    // 1. Compile the graph and compute routing.
    let (compiled, routing) = {
        let graph = state.graph.lock().map_err(|e| e.to_string())?;
        let compiled = GraphCompiler::compile(&graph).map_err(|e| e.to_string())?;
        let routing = compute_routing(&graph);
        (compiled, routing)
    };

    // 2. Move all node instances into the engine.
    {
        let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
        let mut instances = state.node_instances.lock().map_err(|e| e.to_string())?;

        // Register each node instance with the engine.
        let node_ids: Vec<NodeId> = instances.keys().copied().collect();
        for nid in node_ids {
            if let Some(node) = instances.remove(&nid) {
                engine.register_node(nid, node);
            }
        }

        // Start the transport.
        engine.transport_mut().play();

        // 3. Swap in the compiled graph with proper port routing.
        engine.swap_graph_with_routing(compiled, routing);
    }

    // 4. Open an audio stream (if not already running).
    {
        let mut stream_guard = state.audio_stream.lock().map_err(|e| e.to_string())?;

        // If a stream is already running, stop it first.
        if let Some(existing) = stream_guard.take() {
            existing.stop();
        }

        let audio_host = state.audio_host.lock().map_err(|e| e.to_string())?;
        let stream_config = StreamConfig::default();
        let stream = audio_host
            .open_stream(stream_config, Arc::clone(&state.engine))
            .map_err(|e| format!("Failed to open audio stream: {e}"))?;

        *stream_guard = Some(stream);
    }

    Ok(())
}

/// Stop audio playback.
#[tauri::command]
pub fn stop(state: State<'_, AppArc>) -> Result<(), String> {
    log::info("stop", "transport stopped");

    // Stop the transport.
    {
        let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
        engine.transport_mut().stop();
        engine.reset_all_nodes();
    }

    // Stop the audio stream.
    {
        let mut stream_guard = state.audio_stream.lock().map_err(|e| e.to_string())?;
        if let Some(stream) = stream_guard.take() {
            stream.stop();
        }
    }

    // Move node instances back out of the engine so they can be re-registered on next play().
    {
        let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
        let graph = state.graph.lock().map_err(|e| e.to_string())?;
        let mut instances = state.node_instances.lock().map_err(|e| e.to_string())?;

        for nid in graph.nodes().keys() {
            if let Some(node) = engine.remove_node(nid) {
                instances.insert(*nid, node);
            }
        }
    }

    Ok(())
}

/// Set the transport tempo in beats per minute.
#[tauri::command]
pub fn set_tempo(bpm: f64, state: State<'_, AppArc>) -> Result<(), String> {
    log::info("set_tempo", &format!("bpm={bpm}"));

    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.transport_mut().set_tempo(bpm);

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri Commands — Audio Engine / Diagnostics
// ---------------------------------------------------------------------------

/// Get signal statistics (peak, RMS, clipping) for a specific node and port.
#[tauri::command]
pub fn get_signal_stats(
    node_id: String,
    port: String,
    state: State<'_, AppArc>,
) -> Result<SignalStats, String> {
    log::info("get_signal_stats", &format!("node={node_id} port={port}"));

    let nid = parse_node_id(&node_id)?;

    // Try to find the port ID by name.
    let port_id = {
        let graph = state.graph.lock().map_err(|e| e.to_string())?;
        let node_desc = graph
            .node(&nid)
            .ok_or_else(|| format!("Node not found: {node_id}"))?;
        node_desc
            .outputs
            .iter()
            .chain(node_desc.inputs.iter())
            .find(|p| p.name == port)
            .map(|p| p.id)
            .unwrap_or(PortId(0))
    };

    let diagnostics = state.diagnostics.lock().map_err(|e| e.to_string())?;
    match diagnostics.get_signal_stats(nid, port_id) {
        Some(stats) => Ok(SignalStats {
            peak: stats.peak as f64,
            rms: stats.rms as f64,
            clipping: stats.clip_count > 0,
        }),
        None => Ok(SignalStats {
            peak: 0.0,
            rms: 0.0,
            clipping: false,
        }),
    }
}

/// Run a full diagnostic report on the audio engine.
#[tauri::command]
pub fn run_diagnostics(state: State<'_, AppArc>) -> Result<DiagnosticReport, String> {
    log::info("run_diagnostics", "running");

    let graph = state.graph.lock().map_err(|e| e.to_string())?;
    let mut diagnostics = state.diagnostics.lock().map_err(|e| e.to_string())?;
    let report = diagnostics.run_full_diagnostic();

    Ok(DiagnosticReport {
        cpu_usage: report.cpu_profile.dsp_load_percent,
        buffer_underruns: report.cpu_profile.underrun_count as u32,
        node_count: graph.node_count() as u32,
        sample_rate: 48000,
    })
}

// ---------------------------------------------------------------------------
// Tauri Commands — File / State
// ---------------------------------------------------------------------------

/// Load a patch (graph) from a JSON file.
#[tauri::command]
pub fn load_patch(path: String, state: State<'_, AppArc>) -> Result<(), String> {
    log::info("load_patch", &format!("path={path}"));

    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {e}"))?;
    let loaded_graph: Graph =
        serde_json::from_str(&contents).map_err(|e| format!("Failed to parse patch: {e}"))?;

    // Replace the current graph.
    {
        let mut graph = state.graph.lock().map_err(|e| e.to_string())?;
        *graph = loaded_graph;
    }

    // Clear existing node instances and recreate from the loaded graph.
    {
        let graph = state.graph.lock().map_err(|e| e.to_string())?;
        let mut instances = state.node_instances.lock().map_err(|e| e.to_string())?;
        instances.clear();

        for (node_id, descriptor) in graph.nodes() {
            if let Some(audio_node) = state.registry.create(&descriptor.node_type) {
                instances.insert(*node_id, audio_node);
            }
        }
    }

    Ok(())
}

/// Save the current patch (graph) to a JSON file.
#[tauri::command]
pub fn save_patch(path: String, state: State<'_, AppArc>) -> Result<(), String> {
    log::info("save_patch", &format!("path={path}"));

    let graph = state.graph.lock().map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&*graph)
        .map_err(|e| format!("Failed to serialize patch: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(())
}

/// Export the current patch to a target format.
#[tauri::command]
pub fn export_patch(
    target: String,
    options: ExportOptions,
    state: State<'_, AppArc>,
) -> Result<String, String> {
    log::info(
        "export_patch",
        &format!("target={target} optimize={}", options.optimize),
    );

    // For now, export as JSON to a file. A full implementation would use the export-engine crate.
    let graph = state.graph.lock().map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&*graph)
        .map_err(|e| format!("Failed to serialize patch: {e}"))?;

    let export_path = format!("/tmp/chord_export_{target}.json");
    std::fs::write(&export_path, json).map_err(|e| format!("Failed to write export: {e}"))?;

    Ok(export_path)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse a node ID string (e.g., "42") into a `NodeId`.
fn parse_node_id(id: &str) -> Result<NodeId, String> {
    let n: u64 = id
        .parse()
        .map_err(|_| format!("Invalid node ID: {id}"))?;
    Ok(NodeId(n))
}

/// Find an output port by name on a given node.
fn find_output_port_by_name(
    graph: &Graph,
    node_id: &NodeId,
    port_name: &str,
) -> Result<PortId, String> {
    let node = graph
        .node(node_id)
        .ok_or_else(|| format!("Node {} not found", node_id.0))?;
    node.outputs
        .iter()
        .find(|p| p.name == port_name)
        .map(|p| p.id)
        .ok_or_else(|| {
            format!(
                "Output port '{}' not found on node {} (available: {})",
                port_name,
                node_id.0,
                node.outputs
                    .iter()
                    .map(|p| p.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })
}

/// Find an input port by name on a given node.
fn find_input_port_by_name(
    graph: &Graph,
    node_id: &NodeId,
    port_name: &str,
) -> Result<PortId, String> {
    let node = graph
        .node(node_id)
        .ok_or_else(|| format!("Node {} not found", node_id.0))?;
    node.inputs
        .iter()
        .find(|p| p.name == port_name)
        .map(|p| p.id)
        .ok_or_else(|| {
            format!(
                "Input port '{}' not found on node {} (available: {})",
                port_name,
                node_id.0,
                node.inputs
                    .iter()
                    .map(|p| p.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })
}

/// Recompile the graph and hot-swap it into the engine.
///
/// Called after any graph mutation (connect, disconnect, remove_node) to keep
/// the engine's execution order in sync with the graph. If the graph is empty
/// or compilation fails, the engine continues with its current graph.
fn recompile_and_swap(state: &AppState) -> Result<(), String> {
    let graph = state.graph.lock().map_err(|e| e.to_string())?;

    if graph.is_empty() {
        return Ok(());
    }

    match GraphCompiler::compile(&graph) {
        Ok(compiled) => {
            let routing = compute_routing(&graph);
            let engine = state.engine.lock().map_err(|e| e.to_string())?;
            engine.swap_graph_with_routing(compiled, routing);
            Ok(())
        }
        Err(e) => {
            // Log but don't fail — the engine keeps running with the old graph.
            log::info("recompile", &format!("compilation warning: {e}"));
            Ok(())
        }
    }
}

/// Compute routing tuples from the graph's connections and node descriptors.
///
/// Maps each connection's `PortId` to the port's positional index in the
/// node's input/output list. This is critical for multi-port nodes like
/// the oscillator (FM=0, AM=1).
fn compute_routing(graph: &Graph) -> Vec<(NodeId, usize, NodeId, usize)> {
    graph
        .connections()
        .iter()
        .map(|c| {
            // Find the source port's index in the source node's output list.
            let from_idx = graph
                .node(&c.from_node)
                .and_then(|n| n.outputs.iter().position(|p| p.id == c.from_port))
                .unwrap_or(0);

            // Find the dest port's index in the dest node's input list.
            let to_idx = graph
                .node(&c.to_node)
                .and_then(|n| n.inputs.iter().position(|p| p.id == c.to_port))
                .unwrap_or(0);

            (c.from_node, from_idx, c.to_node, to_idx)
        })
        .collect()
}

/// Minimal logging helper (keeps commands clean).
mod log {
    pub fn info(cmd: &str, msg: &str) {
        println!("[chord::{cmd}] {msg}");
    }
}
