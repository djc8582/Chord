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
#[serde(rename_all = "camelCase")]
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
    #[allow(non_snake_case)]
    frontendId: Option<String>,
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

    // Store frontend ID → backend NodeId mapping if provided.
    if let Some(ref fid) = frontendId {
        let mut id_map = state.frontend_id_map.lock().map_err(|e| e.to_string())?;
        id_map.insert(fid.clone(), node_id);
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

    let node_id = resolve_node_id(&id, &state)?;

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

    let from_node_id = resolve_node_id(&from.node_id, &state)?;
    let to_node_id = resolve_node_id(&to.node_id, &state)?;

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

    let nid = resolve_node_id(&node_id, &state)?;

    // Send the parameter change to the engine (lock-free ring buffer push).
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.set_parameter(nid, &param, value);

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri Commands — Transport
// ---------------------------------------------------------------------------

/// Clear all nodes and connections from the graph. Called on app init
/// to ensure the backend starts fresh and matches the empty canvas.
#[tauri::command]
pub fn clear_graph(state: State<'_, AppArc>) -> Result<(), String> {
    log::info("clear_graph", "clearing all nodes and connections");

    // Stop playback first.
    {
        let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
        engine.transport_mut().stop();
        engine.reset_all_nodes();
    }
    {
        let mut stream_guard = state.audio_stream.lock().map_err(|e| e.to_string())?;
        if let Some(stream) = stream_guard.take() {
            stream.stop();
        }
    }

    // Clear the graph.
    {
        let mut graph = state.graph.lock().map_err(|e| e.to_string())?;
        *graph = Graph::new();
    }

    // Clear node instances and connection mappings.
    {
        let mut instances = state.node_instances.lock().map_err(|e| e.to_string())?;
        instances.clear();
    }
    {
        let mut conn_ids = state.connection_ids.lock().map_err(|e| e.to_string())?;
        conn_ids.clear();
    }

    Ok(())
}

/// Rebuild the backend graph from frontend state and start playback.
///
/// This is the nuclear option for sync: the frontend sends its entire
/// document state (all nodes and connections) and the backend rebuilds
/// everything from scratch. Guarantees the backend matches the canvas.
#[tauri::command]
pub fn sync_and_play(
    nodes: Vec<SyncNode>,
    connections: Vec<SyncConnection>,
    state: State<'_, AppArc>,
) -> Result<(), String> {
    log::info("sync_and_play", &format!("{} nodes, {} connections", nodes.len(), connections.len()));

    // Stop current playback.
    {
        let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
        engine.transport_mut().stop();
        engine.reset_all_nodes();
    }
    {
        let mut stream_guard = state.audio_stream.lock().map_err(|e| e.to_string())?;
        if let Some(stream) = stream_guard.take() {
            stream.stop();
        }
    }

    // Clear everything.
    {
        let mut graph = state.graph.lock().map_err(|e| e.to_string())?;
        *graph = Graph::new();
    }
    {
        let mut instances = state.node_instances.lock().map_err(|e| e.to_string())?;
        instances.clear();
    }
    {
        let mut conn_ids = state.connection_ids.lock().map_err(|e| e.to_string())?;
        conn_ids.clear();
    }
    {
        let mut id_map = state.frontend_id_map.lock().map_err(|e| e.to_string())?;
        id_map.clear();
    }

    // Rebuild: add all nodes.
    for n in &nodes {
        let mut descriptor = build_node_descriptor(&n.node_type);
        descriptor.position = (n.x, n.y);
        let node_id = descriptor.id;

        {
            let mut graph = state.graph.lock().map_err(|e| e.to_string())?;
            graph.add_node(descriptor);
        }

        // Store frontend ID mapping.
        {
            let mut id_map = state.frontend_id_map.lock().map_err(|e| e.to_string())?;
            id_map.insert(n.id.clone(), node_id);
        }

        // Create DSP instance.
        if let Some(audio_node) = state.registry.create(&n.node_type) {
            let mut instances = state.node_instances.lock().map_err(|e| e.to_string())?;
            instances.insert(node_id, audio_node);
        }

        // Set default parameters + any provided values.
        {
            let desc = build_node_descriptor(&n.node_type);
            let engine = state.engine.lock().map_err(|e| e.to_string())?;
            for param in &desc.parameters {
                engine.set_parameter(node_id, &param.id, param.default);
            }
            for (k, v) in &n.parameters {
                engine.set_parameter(node_id, k, *v);
            }
        }
    }

    // Rebuild: add all connections.
    for c in &connections {
        let from_nid = resolve_node_id(&c.from_node, &state)?;
        let to_nid = resolve_node_id(&c.to_node, &state)?;

        let mut graph = state.graph.lock().map_err(|e| e.to_string())?;
        let from_port_id = find_output_port_by_name(&graph, &from_nid, &c.from_port)?;
        let to_port_id = find_input_port_by_name(&graph, &to_nid, &c.to_port)?;
        let _ = graph.connect(from_nid, from_port_id, to_nid, to_port_id);
    }

    // Now play (same as the play command).
    let (compiled, routing, mod_routes) = {
        let graph = state.graph.lock().map_err(|e| e.to_string())?;
        let compiled = GraphCompiler::compile(&graph).map_err(|e| e.to_string())?;
        let routing = compute_routing(&graph);
        let mod_routes = state
            .modulation_routes
            .lock()
            .map_err(|e| e.to_string())?
            .clone();
        (compiled, routing, mod_routes)
    };

    {
        let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
        let mut instances = state.node_instances.lock().map_err(|e| e.to_string())?;
        let node_ids: Vec<NodeId> = instances.keys().copied().collect();
        for nid in node_ids {
            if let Some(node) = instances.remove(&nid) {
                engine.register_node(nid, node);
            }
        }
        engine.transport_mut().play();
        engine.swap_graph_with_routing_and_modulation(compiled, routing, mod_routes);
    }

    {
        let mut stream_guard = state.audio_stream.lock().map_err(|e| e.to_string())?;
        if let Some(existing) = stream_guard.take() {
            existing.stop();
        }
        let audio_host = state.audio_host.lock().map_err(|e| e.to_string())?;
        let stream_config = chord_audio_io::StreamConfig::default();
        let stream = audio_host
            .open_stream(stream_config, Arc::clone(&state.engine))
            .map_err(|e| format!("Failed to open audio stream: {e}"))?;
        *stream_guard = Some(stream);
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncNode {
    pub id: String,
    pub node_type: String,
    pub x: f64,
    pub y: f64,
    pub parameters: std::collections::HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConnection {
    pub from_node: String,
    pub from_port: String,
    pub to_node: String,
    pub to_port: String,
}

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
    let (compiled, routing, mod_routes) = {
        let graph = state.graph.lock().map_err(|e| e.to_string())?;
        let compiled = GraphCompiler::compile(&graph).map_err(|e| e.to_string())?;
        let routing = compute_routing(&graph);
        let mod_routes = state
            .modulation_routes
            .lock()
            .map_err(|e| e.to_string())?
            .clone();
        (compiled, routing, mod_routes)
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

        // 3. Swap in the compiled graph with proper port routing and modulation.
        engine.swap_graph_with_routing_and_modulation(compiled, routing, mod_routes);
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

/// Send a MIDI note-on event to the audio engine.
#[tauri::command]
pub fn send_midi_note_on(note: u8, velocity: u8, state: State<'_, AppArc>) -> Result<(), String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.send_note_on(note, velocity);
    Ok(())
}

/// Send a MIDI note-off event to the audio engine.
#[tauri::command]
pub fn send_midi_note_off(note: u8, state: State<'_, AppArc>) -> Result<(), String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.send_note_off(note);
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri Commands — Modulation Routing
// ---------------------------------------------------------------------------

/// Add a modulation route: map an audio output signal to a parameter on any node.
///
/// Returns a unique modulation route ID that can be used with `remove_modulation`.
#[tauri::command]
pub fn add_modulation(
    source_node: String,
    source_port: String,
    target_node: String,
    target_param: String,
    amount: f64,
    offset: f64,
    state: State<'_, AppArc>,
) -> Result<String, String> {
    log::info(
        "add_modulation",
        &format!("src={source_node}:{source_port} -> {target_node}:{target_param} amount={amount} offset={offset}"),
    );

    let src_nid = resolve_node_id(&source_node, &state)?;
    let tgt_nid = resolve_node_id(&target_node, &state)?;

    // Resolve the source port name to a port index.
    let src_port_idx = {
        let graph = state.graph.lock().map_err(|e| e.to_string())?;
        let node_desc = graph
            .node(&src_nid)
            .ok_or_else(|| format!("Source node not found: {source_node}"))?;
        node_desc
            .outputs
            .iter()
            .position(|p| p.name == source_port)
            .ok_or_else(|| {
                format!(
                    "Output port '{}' not found on node {} (available: {})",
                    source_port,
                    source_node,
                    node_desc.outputs.iter().map(|p| p.name.as_str()).collect::<Vec<_>>().join(", ")
                )
            })?
    };

    // Generate a unique ID for this modulation route.
    let mod_id = format!("mod-{}", uuid_v4());

    let route = chord_dsp_runtime::ModulationRoute {
        id: mod_id.clone(),
        source_node: src_nid,
        source_port: src_port_idx,
        target_node: tgt_nid,
        target_param,
        amount,
        offset,
    };

    {
        let mut mod_routes = state.modulation_routes.lock().map_err(|e| e.to_string())?;
        mod_routes.push(route);
    }

    // Recompile and swap so the modulation is active.
    recompile_and_swap(state.inner())?;

    Ok(mod_id)
}

/// Remove a modulation route by its ID.
#[tauri::command]
pub fn remove_modulation(id: String, state: State<'_, AppArc>) -> Result<(), String> {
    log::info("remove_modulation", &format!("id={id}"));

    {
        let mut mod_routes = state.modulation_routes.lock().map_err(|e| e.to_string())?;
        let before_len = mod_routes.len();
        mod_routes.retain(|r| r.id != id);
        if mod_routes.len() == before_len {
            return Err(format!("Modulation route not found: {id}"));
        }
    }

    // Recompile and swap to remove the modulation from the engine.
    recompile_and_swap(state.inner())?;

    Ok(())
}

/// Load an audio file (WAV) into a node's sample buffer.
///
/// Opens a file dialog if `path` is empty, otherwise loads the specified path.
/// The audio data is resampled to mono and fed to the node via `load_audio_data`.
#[tauri::command]
pub fn load_audio_file(
    node_id: String,
    path: String,
    state: State<'_, AppArc>,
) -> Result<serde_json::Value, String> {
    log::info("load_audio_file", &format!("node={node_id} path={path}"));

    let nid = resolve_node_id(&node_id, &state)?;

    // Read WAV file.
    let reader = hound::WavReader::open(&path)
        .map_err(|e| format!("Failed to open audio file: {e}"))?;

    let spec = reader.spec();
    let sample_rate = spec.sample_rate as f64;

    // Convert all samples to mono f32.
    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => {
            let all: Vec<f32> = reader
                .into_samples::<f32>()
                .filter_map(|s| s.ok())
                .collect();
            // Mix to mono if stereo.
            if spec.channels > 1 {
                let ch = spec.channels as usize;
                all.chunks(ch)
                    .map(|frame| frame.iter().sum::<f32>() / ch as f32)
                    .collect()
            } else {
                all
            }
        }
        hound::SampleFormat::Int => {
            let bits = spec.bits_per_sample;
            let max_val = (1i64 << (bits - 1)) as f32;
            let all: Vec<f32> = reader
                .into_samples::<i32>()
                .filter_map(|s| s.ok())
                .map(|s| s as f32 / max_val)
                .collect();
            if spec.channels > 1 {
                let ch = spec.channels as usize;
                all.chunks(ch)
                    .map(|frame| frame.iter().sum::<f32>() / ch as f32)
                    .collect()
            } else {
                all
            }
        }
    };

    let sample_count = samples.len();

    // Try loading into the engine's live node first (if playing).
    {
        let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
        if engine.load_audio_into_node(nid, &samples, sample_rate) {
            return Ok(serde_json::json!({
                "ok": true,
                "samples": sample_count,
                "sample_rate": sample_rate,
                "duration": sample_count as f64 / sample_rate,
            }));
        }
    }

    // Otherwise try the pending instances.
    {
        let mut instances = state.node_instances.lock().map_err(|e| e.to_string())?;
        if let Some(node) = instances.get_mut(&nid) {
            if node.load_audio_data(&samples, sample_rate) {
                return Ok(serde_json::json!({
                    "ok": true,
                    "samples": sample_count,
                    "sample_rate": sample_rate,
                    "duration": sample_count as f64 / sample_rate,
                }));
            }
        }
    }

    Err(format!("Node {node_id} does not support audio loading"))
}

/// Open a native file dialog, pick a WAV file, and load it into a node.
#[tauri::command]
pub fn pick_and_load_audio(
    node_id: String,
    state: State<'_, AppArc>,
) -> Result<serde_json::Value, String> {
    let path = rfd::FileDialog::new()
        .add_filter("Audio", &["wav", "wave", "aif", "aiff"])
        .set_title("Load Audio File")
        .pick_file()
        .ok_or_else(|| "No file selected".to_string())?;

    let path_str = path.to_string_lossy().to_string();

    // Reuse load_audio_file logic
    let nid = resolve_node_id(&node_id, &state)?;

    let reader = hound::WavReader::open(&path)
        .map_err(|e| format!("Failed to open: {e}"))?;
    let spec = reader.spec();
    let sample_rate = spec.sample_rate as f64;

    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => {
            let all: Vec<f32> = reader.into_samples::<f32>().filter_map(|s| s.ok()).collect();
            if spec.channels > 1 {
                let ch = spec.channels as usize;
                all.chunks(ch).map(|f| f.iter().sum::<f32>() / ch as f32).collect()
            } else { all }
        }
        hound::SampleFormat::Int => {
            let max_val = (1i64 << (spec.bits_per_sample - 1)) as f32;
            let all: Vec<f32> = reader.into_samples::<i32>().filter_map(|s| s.ok()).map(|s| s as f32 / max_val).collect();
            if spec.channels > 1 {
                let ch = spec.channels as usize;
                all.chunks(ch).map(|f| f.iter().sum::<f32>() / ch as f32).collect()
            } else { all }
        }
    };

    let sample_count = samples.len();

    // Try engine first
    {
        let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
        if engine.load_audio_into_node(nid, &samples, sample_rate) {
            return Ok(serde_json::json!({
                "ok": true, "path": path_str,
                "samples": sample_count, "duration": sample_count as f64 / sample_rate,
            }));
        }
    }
    // Try pending instances
    {
        let mut instances = state.node_instances.lock().map_err(|e| e.to_string())?;
        if let Some(node) = instances.get_mut(&nid) {
            if node.load_audio_data(&samples, sample_rate) {
                return Ok(serde_json::json!({
                    "ok": true, "path": path_str,
                    "samples": sample_count, "duration": sample_count as f64 / sample_rate,
                }));
            }
        }
    }

    Err(format!("Node {node_id} does not support audio loading"))
}

/// Generate a simple UUID-like ID.
fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}-{:x}", nanos, nanos.wrapping_mul(6364136223846793005).wrapping_add(1))
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

    let nid = resolve_node_id(&node_id, &state)?;

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

/// Get the last output buffer for the visualizer.
#[tauri::command]
pub fn get_waveform_data(state: State<'_, AppArc>) -> Result<Vec<f32>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.get_last_output_buffer())
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

/// Resolve a node ID string to a `NodeId`.
/// Accepts either a numeric string ("42") or a frontend Yjs ID ("mn26z15d-0-7bzmz1").
/// Frontend IDs are looked up in the `frontend_id_map`.
#[allow(dead_code)]
fn parse_node_id(id: &str) -> Result<NodeId, String> {
    // Try numeric parse first (fast path for API calls).
    if let Ok(n) = id.parse::<u64>() {
        return Ok(NodeId(n));
    }
    // Not numeric — must be resolved via the state's frontend_id_map.
    // This function doesn't have state access, so the caller must use resolve_node_id instead.
    Err(format!("Invalid node ID: {id} (use resolve_node_id for frontend IDs)"))
}

/// Resolve a frontend or numeric node ID to a `NodeId` using the state's ID map.
fn resolve_node_id(id: &str, state: &AppState) -> Result<NodeId, String> {
    // Try numeric parse first.
    if let Ok(n) = id.parse::<u64>() {
        return Ok(NodeId(n));
    }
    // Look up in frontend ID map.
    let id_map = state.frontend_id_map.lock().map_err(|e| e.to_string())?;
    id_map
        .get(id)
        .copied()
        .ok_or_else(|| format!("Unknown node ID: {id}"))
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
///
/// Also passes the current modulation routes to the engine so audio-rate
/// modulation stays in sync with graph changes.
fn recompile_and_swap(state: &AppState) -> Result<(), String> {
    let graph = state.graph.lock().map_err(|e| e.to_string())?;

    if graph.is_empty() {
        return Ok(());
    }

    match GraphCompiler::compile(&graph) {
        Ok(compiled) => {
            let routing = compute_routing(&graph);
            let mod_routes = state
                .modulation_routes
                .lock()
                .map_err(|e| e.to_string())?
                .clone();
            let engine = state.engine.lock().map_err(|e| e.to_string())?;
            engine.swap_graph_with_routing_and_modulation(compiled, routing, mod_routes);
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
