//! Localhost HTTP API server for external tool integration (MCP, scripts, etc.).
//!
//! Listens on `127.0.0.1:19475` and exposes the same graph operations as the
//! Tauri commands. After each mutation it emits a Tauri event so the frontend
//! canvas stays in sync.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::thread;

use chord_audio_graph::{GraphCompiler, NodeId, PatchFile};
use chord_audio_graph::patch_format::{ConnectionEntry, NodeEntry, Position};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::state::{build_node_descriptor, AppState};

/// Well-known port for the Chord API server.
const API_PORT: u16 = 19475;

/// Start the HTTP API server on a background thread.
///
/// The server shares `AppState` with the Tauri commands and emits events via
/// the `AppHandle` so the frontend can react to external mutations.
pub fn start(state: Arc<AppState>, handle: AppHandle) {
    thread::spawn(move || {
        let listener = match TcpListener::bind(format!("127.0.0.1:{API_PORT}")) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[chord::api] Failed to bind port {API_PORT}: {e}");
                return;
            }
        };

        println!("[chord::api] Listening on 127.0.0.1:{API_PORT}");

        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let state = Arc::clone(&state);
                    let handle = handle.clone();
                    thread::spawn(move || {
                        if let Err(e) = handle_connection(stream, &state, &handle) {
                            eprintln!("[chord::api] Request error: {e}");
                        }
                    });
                }
                Err(e) => {
                    eprintln!("[chord::api] Accept error: {e}");
                }
            }
        }
    });
}

// ---------------------------------------------------------------------------
// HTTP handling
// ---------------------------------------------------------------------------

fn handle_connection(
    stream: TcpStream,
    state: &AppState,
    handle: &AppHandle,
) -> Result<(), String> {
    let mut reader = BufReader::new(&stream);

    // Read request line.
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .map_err(|e| e.to_string())?;

    let parts: Vec<&str> = request_line.trim().split(' ').collect();
    if parts.len() < 2 {
        return send_response(&stream, 400, &json!({"error": "Bad request"}));
    }
    let method = parts[0];
    let path = parts[1];

    // Read headers (we only need Content-Length).
    let mut content_length: usize = 0;
    loop {
        let mut header = String::new();
        reader
            .read_line(&mut header)
            .map_err(|e| e.to_string())?;
        let trimmed = header.trim();
        if trimmed.is_empty() {
            break;
        }
        let lower = trimmed.to_lowercase();
        if let Some(val) = lower.strip_prefix("content-length:") {
            if let Ok(len) = val.trim().parse() {
                content_length = len;
            }
        }
    }

    // Read body.
    let body = if content_length > 0 {
        let mut buf = vec![0u8; content_length];
        reader.read_exact(&mut buf).map_err(|e| e.to_string())?;
        String::from_utf8_lossy(&buf).to_string()
    } else {
        String::new()
    };

    // Route POST requests.
    if method != "POST" {
        return send_response(&stream, 405, &json!({"error": "Method not allowed"}));
    }

    let args: Value = serde_json::from_str(&body).unwrap_or(json!({}));
    let result = route(path, args, state, handle);

    send_response(&stream, 200, &result)
}

fn send_response(stream: &TcpStream, status: u16, body: &Value) -> Result<(), String> {
    let body_str = body.to_string();
    let status_text = match status {
        200 => "OK",
        400 => "Bad Request",
        405 => "Method Not Allowed",
        _ => "Error",
    };
    let response = format!(
        "HTTP/1.1 {status} {status_text}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n\
         {body_str}",
        body_str.len()
    );

    let mut stream = stream;
    stream
        .write_all(response.as_bytes())
        .map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())
}

fn route(path: &str, args: Value, state: &AppState, handle: &AppHandle) -> Value {
    match path {
        "/api/v1/add_node" => api_add_node(args, state, handle),
        "/api/v1/remove_node" => api_remove_node(args, state, handle),
        "/api/v1/connect" => api_connect(args, state, handle),
        "/api/v1/disconnect" => api_disconnect(args, state, handle),
        "/api/v1/set_parameter" => api_set_parameter(args, state, handle),
        "/api/v1/play" => api_play(state),
        "/api/v1/stop" => api_stop(state),
        "/api/v1/compile" => api_compile(state),
        "/api/v1/get_patch" => api_get_patch(state),
        "/api/v1/get_waveform_data" => api_get_waveform_data(state),
        "/api/v1/get_signal_stats" => api_get_signal_stats(state),
        "/api/v1/add_modulation" => api_add_modulation(args, state),
        "/api/v1/remove_modulation" => api_remove_modulation(args, state),
        "/api/v1/load_audio_file" => api_load_audio_file(args, state),
        "/api/v1/save_patch_file" => api_save_patch_file(state),
        "/api/v1/load_patch_file" => api_load_patch_file(args, state, handle),
        _ => json!({"error": format!("Unknown endpoint: {path}")}),
    }
}

// ---------------------------------------------------------------------------
// API handlers — these mirror the Tauri commands but operate on &AppState
// directly and emit events to the frontend.
// ---------------------------------------------------------------------------

fn api_add_node(args: Value, state: &AppState, handle: &AppHandle) -> Value {
    let node_type = match args.get("node_type").and_then(|v| v.as_str()) {
        Some(t) => t.to_string(),
        None => return json!({"error": "Missing 'node_type'"}),
    };

    let x = args
        .get("position")
        .and_then(|p| p.get("x"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let y = args
        .get("position")
        .and_then(|p| p.get("y"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    // Build descriptor.
    let mut descriptor = build_node_descriptor(&node_type);
    descriptor.position = (x, y);
    let node_id = descriptor.id;

    // Collect port info before moving descriptor.
    let inputs: Vec<Value> = descriptor
        .inputs
        .iter()
        .map(|p| json!({"name": p.name, "id": p.id.0}))
        .collect();
    let outputs: Vec<Value> = descriptor
        .outputs
        .iter()
        .map(|p| json!({"name": p.name, "id": p.id.0}))
        .collect();

    // Add to graph.
    {
        let mut graph = match state.graph.lock() {
            Ok(g) => g,
            Err(e) => return json!({"error": e.to_string()}),
        };
        graph.add_node(descriptor);
    }

    // Create DSP instance and register with engine.
    if let Some(audio_node) = state.registry.create(&node_type) {
        let desc = build_node_descriptor(&node_type);
        let mut engine = state.engine.lock().unwrap();
        for param in &desc.parameters {
            engine.set_parameter(node_id, &param.id, param.default);
        }

        // If playing, register immediately so the node is live.
        if engine.transport().playing {
            engine.register_node(node_id, audio_node);
        } else {
            let mut instances = state.node_instances.lock().unwrap();
            instances.insert(node_id, audio_node);
        }
    }

    // Recompile so the new node is in the execution order.
    let _ = recompile_and_swap(state);

    // Emit event to frontend so canvas can update.
    let emit_result = handle.emit(
        "mcp-node-added",
        json!({
            "nodeId": node_id.0.to_string(),
            "nodeType": node_type,
            "position": {"x": x, "y": y},
        }),
    );
    println!("[chord::api] emit mcp-node-added: {:?}", emit_result);

    json!({
        "node_id": node_id.0.to_string(),
        "node_type": node_type,
        "inputs": inputs,
        "outputs": outputs,
    })
}

fn api_remove_node(args: Value, state: &AppState, handle: &AppHandle) -> Value {
    let id_str = match args.get("id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'id'"}),
    };
    let node_id = match id_str.parse::<u64>() {
        Ok(n) => NodeId(n),
        Err(_) => return json!({"error": "Invalid node ID"}),
    };

    {
        let mut graph = state.graph.lock().unwrap();
        graph.remove_node(&node_id);
    }
    {
        let mut instances = state.node_instances.lock().unwrap();
        instances.remove(&node_id);
    }
    {
        let mut engine = state.engine.lock().unwrap();
        engine.remove_node(&node_id);
    }

    let _ = recompile_and_swap(state);
    let _ = handle.emit("mcp-node-removed", json!({"nodeId": id_str}));

    json!({"removed": id_str})
}

fn api_connect(args: Value, state: &AppState, handle: &AppHandle) -> Value {
    let from_node_str = match args.get("from_node").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'from_node'"}),
    };
    let from_port_name = match args.get("from_port").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'from_port'"}),
    };
    let to_node_str = match args.get("to_node").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'to_node'"}),
    };
    let to_port_name = match args.get("to_port").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'to_port'"}),
    };

    let from_node_id = match from_node_str.parse::<u64>() {
        Ok(n) => NodeId(n),
        Err(_) => return json!({"error": "Invalid from_node ID"}),
    };
    let to_node_id = match to_node_str.parse::<u64>() {
        Ok(n) => NodeId(n),
        Err(_) => return json!({"error": "Invalid to_node ID"}),
    };

    let conn_id = {
        let mut graph = state.graph.lock().unwrap();

        // Look up port IDs by name.
        let from_port_id = match graph
            .node(&from_node_id)
            .and_then(|n| n.outputs.iter().find(|p| p.name == from_port_name))
            .map(|p| p.id)
        {
            Some(id) => id,
            None => {
                return json!({"error": format!("Output port '{}' not found on node {}", from_port_name, from_node_str)})
            }
        };
        let to_port_id = match graph
            .node(&to_node_id)
            .and_then(|n| n.inputs.iter().find(|p| p.name == to_port_name))
            .map(|p| p.id)
        {
            Some(id) => id,
            None => {
                return json!({"error": format!("Input port '{}' not found on node {}", to_port_name, to_node_str)})
            }
        };

        match graph.connect(from_node_id, from_port_id, to_node_id, to_port_id) {
            Ok(id) => id,
            Err(e) => return json!({"error": e.to_string()}),
        }
    };

    // Store connection ID mapping.
    let conn_id_str = conn_id.0.to_string();
    {
        let mut conn_ids = state.connection_ids.lock().unwrap();
        conn_ids.insert(conn_id_str.clone(), conn_id);
    }

    let _ = recompile_and_swap(state);

    let _ = handle.emit(
        "mcp-connected",
        json!({
            "connectionId": conn_id_str,
            "fromNode": from_node_str,
            "fromPort": from_port_name,
            "toNode": to_node_str,
            "toPort": to_port_name,
        }),
    );

    json!({
        "connection_id": conn_id_str,
        "from_node": from_node_str,
        "to_node": to_node_str,
    })
}

fn api_disconnect(args: Value, state: &AppState, handle: &AppHandle) -> Value {
    let id = match args.get("id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'id'"}),
    };

    let conn_id = {
        let conn_ids = state.connection_ids.lock().unwrap();
        match conn_ids.get(&id).copied() {
            Some(c) => c,
            None => return json!({"error": format!("Unknown connection ID: {id}")}),
        }
    };

    {
        let mut graph = state.graph.lock().unwrap();
        graph.disconnect(&conn_id);
    }
    {
        let mut conn_ids = state.connection_ids.lock().unwrap();
        conn_ids.remove(&id);
    }

    let _ = recompile_and_swap(state);
    let _ = handle.emit("mcp-disconnected", json!({"connectionId": id}));

    json!({"removed": id})
}

fn api_set_parameter(args: Value, state: &AppState, handle: &AppHandle) -> Value {
    let node_id_str = match args.get("node_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'node_id'"}),
    };
    let param = match args.get("param").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'param'"}),
    };
    let value = match args.get("value").and_then(|v| v.as_f64()) {
        Some(v) => v,
        None => return json!({"error": "Missing 'value'"}),
    };

    let node_id = match node_id_str.parse::<u64>() {
        Ok(n) => NodeId(n),
        Err(_) => return json!({"error": "Invalid node ID"}),
    };

    let engine = state.engine.lock().unwrap();
    engine.set_parameter(node_id, &param, value);

    let _ = handle.emit(
        "mcp-parameter-set",
        json!({
            "nodeId": node_id_str,
            "param": param,
            "value": value,
        }),
    );

    json!({"ok": true})
}

fn api_play(state: &AppState) -> Value {
    // Compile the graph and compute proper port routing.
    let (compiled, routing, mod_routes) = {
        let graph = match state.graph.lock() {
            Ok(g) => g,
            Err(e) => return json!({"error": e.to_string()}),
        };
        let compiled = match GraphCompiler::compile(&graph) {
            Ok(c) => c,
            Err(e) => return json!({"error": e.to_string()}),
        };
        let routing = compute_routing(&graph);
        let mod_routes = state
            .modulation_routes
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        (compiled, routing, mod_routes)
    };

    // Move node instances into the engine.
    {
        let mut engine = state.engine.lock().unwrap();
        let mut instances = state.node_instances.lock().unwrap();

        let node_ids: Vec<NodeId> = instances.keys().copied().collect();
        for nid in node_ids {
            if let Some(node) = instances.remove(&nid) {
                engine.register_node(nid, node);
            }
        }

        engine.transport_mut().play();
        engine.swap_graph_with_routing_and_modulation(compiled, routing, mod_routes);
    }

    // Open audio stream.
    {
        let mut stream_guard = state.audio_stream.lock().unwrap();
        if let Some(existing) = stream_guard.take() {
            existing.stop();
        }

        let audio_host = state.audio_host.lock().unwrap();
        let stream_config = chord_audio_io::StreamConfig::default();
        match audio_host.open_stream(stream_config, Arc::clone(&state.engine)) {
            Ok(stream) => {
                *stream_guard = Some(stream);
            }
            Err(e) => return json!({"error": format!("Failed to open audio stream: {e}")}),
        }
    }

    json!({"ok": true, "message": "Playback started"})
}

fn api_stop(state: &AppState) -> Value {
    {
        let mut engine = state.engine.lock().unwrap();
        engine.transport_mut().stop();
        engine.reset_all_nodes();
    }
    {
        let mut stream_guard = state.audio_stream.lock().unwrap();
        if let Some(stream) = stream_guard.take() {
            stream.stop();
        }
    }
    // Move nodes back out of engine.
    {
        let mut engine = state.engine.lock().unwrap();
        let graph = state.graph.lock().unwrap();
        let mut instances = state.node_instances.lock().unwrap();
        for nid in graph.nodes().keys() {
            if let Some(node) = engine.remove_node(nid) {
                instances.insert(*nid, node);
            }
        }
    }

    json!({"ok": true, "message": "Playback stopped"})
}

fn api_compile(state: &AppState) -> Value {
    let graph = match state.graph.lock() {
        Ok(g) => g,
        Err(e) => return json!({"error": e.to_string()}),
    };

    match GraphCompiler::compile(&graph) {
        Ok(compiled) => {
            let exec_order: Vec<u64> = compiled.execution_order.iter().map(|n| n.0).collect();
            json!({
                "success": true,
                "execution_order": exec_order,
                "buffer_count": compiled.buffer_layout.buffer_count,
            })
        }
        Err(e) => json!({"error": e.to_string()}),
    }
}

fn api_get_patch(state: &AppState) -> Value {
    let graph = match state.graph.lock() {
        Ok(g) => g,
        Err(e) => return json!({"error": e.to_string()}),
    };

    let nodes: Vec<Value> = graph
        .nodes()
        .iter()
        .map(|(id, desc)| {
            let params: HashMap<&str, f64> =
                desc.parameters.iter().map(|p| (p.id.as_str(), p.value)).collect();
            json!({
                "node_id": id.0.to_string(),
                "node_type": desc.node_type,
                "position": {"x": desc.position.0, "y": desc.position.1},
                "parameters": params,
                "inputs": desc.inputs.iter().map(|p| json!({"name": p.name, "id": p.id.0})).collect::<Vec<_>>(),
                "outputs": desc.outputs.iter().map(|p| json!({"name": p.name, "id": p.id.0})).collect::<Vec<_>>(),
            })
        })
        .collect();

    let connections: Vec<Value> = graph
        .connections()
        .iter()
        .map(|c| {
            json!({
                "connection_id": c.id.0.to_string(),
                "from_node": c.from_node.0.to_string(),
                "from_port": c.from_port.0,
                "to_node": c.to_node.0.to_string(),
                "to_port": c.to_port.0,
            })
        })
        .collect();

    json!({
        "node_count": graph.node_count(),
        "connection_count": graph.connection_count(),
        "nodes": nodes,
        "connections": connections,
    })
}

fn api_get_waveform_data(state: &AppState) -> Value {
    let engine = state.engine.lock().unwrap();
    let buffer = engine.get_last_output_buffer();
    json!(buffer)
}

fn api_get_signal_stats(state: &AppState) -> Value {
    let engine = state.engine.lock().unwrap();
    let buffer = engine.get_last_output_buffer();

    if buffer.is_empty() {
        return json!({
            "rms": 0.0,
            "peak": 0.0,
            "min": 0.0,
            "max": 0.0,
            "dc_offset": 0.0,
            "is_silent": true,
            "has_nan": false,
            "sample_count": 0,
        });
    }

    let mut sum = 0.0f64;
    let mut sum_sq = 0.0f64;
    let mut peak = 0.0f32;
    let mut min_val = f32::MAX;
    let mut max_val = f32::MIN;
    let mut has_nan = false;

    for &s in &buffer {
        if s.is_nan() || s.is_infinite() {
            has_nan = true;
            continue;
        }
        sum += s as f64;
        sum_sq += (s as f64) * (s as f64);
        if s.abs() > peak {
            peak = s.abs();
        }
        if s < min_val {
            min_val = s;
        }
        if s > max_val {
            max_val = s;
        }
    }

    let n = buffer.len() as f64;
    let rms = (sum_sq / n).sqrt();
    let dc_offset = sum / n;

    json!({
        "rms": rms,
        "peak": peak,
        "min": min_val,
        "max": max_val,
        "dc_offset": dc_offset,
        "is_silent": peak < 1e-6,
        "has_nan": has_nan,
        "sample_count": buffer.len(),
    })
}

fn api_add_modulation(args: Value, state: &AppState) -> Value {
    let source_node_str = match args.get("source_node").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'source_node'"}),
    };
    let source_port = match args.get("source_port").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'source_port'"}),
    };
    let target_node_str = match args.get("target_node").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'target_node'"}),
    };
    let target_param = match args.get("target_param").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'target_param'"}),
    };
    let amount = args.get("amount").and_then(|v| v.as_f64()).unwrap_or(1.0);
    let offset = args.get("offset").and_then(|v| v.as_f64()).unwrap_or(0.0);

    let src_nid = match source_node_str.parse::<u64>() {
        Ok(n) => NodeId(n),
        Err(_) => return json!({"error": "Invalid source_node ID"}),
    };
    let tgt_nid = match target_node_str.parse::<u64>() {
        Ok(n) => NodeId(n),
        Err(_) => return json!({"error": "Invalid target_node ID"}),
    };

    // Resolve the source port name to a port index.
    let src_port_idx = {
        let graph = state.graph.lock().unwrap();
        let node_desc = match graph.node(&src_nid) {
            Some(d) => d,
            None => return json!({"error": format!("Source node not found: {source_node_str}")}),
        };
        match node_desc.outputs.iter().position(|p| p.name == source_port) {
            Some(idx) => idx,
            None => {
                return json!({"error": format!(
                    "Output port '{}' not found on node {}",
                    source_port, source_node_str
                )})
            }
        }
    };

    // Generate unique ID.
    let mod_id = format!("mod-{:x}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos());

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
        let mut mod_routes = state.modulation_routes.lock().unwrap();
        mod_routes.push(route);
    }

    let _ = recompile_and_swap(state);

    json!({"modulation_id": mod_id})
}

fn api_remove_modulation(args: Value, state: &AppState) -> Value {
    let id = match args.get("id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'id'"}),
    };

    {
        let mut mod_routes = state.modulation_routes.lock().unwrap();
        let before_len = mod_routes.len();
        mod_routes.retain(|r| r.id != id);
        if mod_routes.len() == before_len {
            return json!({"error": format!("Modulation route not found: {id}")});
        }
    }

    let _ = recompile_and_swap(state);

    json!({"removed": id})
}

fn api_load_audio_file(args: Value, state: &AppState) -> Value {
    let node_id_str = match args.get("node_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'node_id'"}),
    };
    let path = match args.get("path").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'path'"}),
    };

    let node_id = match node_id_str.parse::<u64>() {
        Ok(n) => NodeId(n),
        Err(_) => return json!({"error": "Invalid node ID"}),
    };

    // Read WAV file.
    let reader = match hound::WavReader::open(&path) {
        Ok(r) => r,
        Err(e) => return json!({"error": format!("Failed to open: {e}")}),
    };

    let spec = reader.spec();
    let sample_rate = spec.sample_rate as f64;

    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => {
            let all: Vec<f32> = reader.into_samples::<f32>().filter_map(|s| s.ok()).collect();
            if spec.channels > 1 {
                let ch = spec.channels as usize;
                all.chunks(ch).map(|f| f.iter().sum::<f32>() / ch as f32).collect()
            } else {
                all
            }
        }
        hound::SampleFormat::Int => {
            let max_val = (1i64 << (spec.bits_per_sample - 1)) as f32;
            let all: Vec<f32> = reader.into_samples::<i32>().filter_map(|s| s.ok()).map(|s| s as f32 / max_val).collect();
            if spec.channels > 1 {
                let ch = spec.channels as usize;
                all.chunks(ch).map(|f| f.iter().sum::<f32>() / ch as f32).collect()
            } else {
                all
            }
        }
    };

    let sample_count = samples.len();

    // Try engine nodes first (if playing).
    {
        let mut engine = state.engine.lock().unwrap();
        if engine.load_audio_into_node(node_id, &samples, sample_rate) {
            return json!({
                "ok": true,
                "samples": sample_count,
                "sample_rate": sample_rate,
                "duration": sample_count as f64 / sample_rate,
            });
        }
    }

    // Try pending instances.
    {
        let mut instances = state.node_instances.lock().unwrap();
        if let Some(node) = instances.get_mut(&node_id) {
            if node.load_audio_data(&samples, sample_rate) {
                return json!({
                    "ok": true,
                    "samples": sample_count,
                    "sample_rate": sample_rate,
                    "duration": sample_count as f64 / sample_rate,
                });
            }
        }
    }

    json!({"error": format!("Node {} does not support audio loading", node_id_str)})
}

// ---------------------------------------------------------------------------
// Portable patch file endpoints
// ---------------------------------------------------------------------------

fn api_save_patch_file(state: &AppState) -> Value {
    let graph = match state.graph.lock() {
        Ok(g) => g,
        Err(e) => return json!({"error": e.to_string()}),
    };

    let mut patch_file = PatchFile::new("patch");

    // Serialize all nodes.
    for (node_id, desc) in graph.nodes() {
        let entry = NodeEntry {
            id: node_id.0.to_string(),
            node_type: desc.node_type.clone(),
            params: desc.parameters.iter().map(|p| (p.id.clone(), p.value)).collect(),
            position: Position { x: desc.position.0, y: desc.position.1 },
            name: String::new(),
        };
        patch_file.nodes.push(entry);
    }

    // Serialize connections using port names for portability.
    for conn in graph.connections() {
        let from_port_name = graph.node(&conn.from_node)
            .and_then(|n| n.outputs.iter().find(|p| p.id == conn.from_port).map(|p| p.name.clone()))
            .unwrap_or_else(|| conn.from_port.0.to_string());
        let to_port_name = graph.node(&conn.to_node)
            .and_then(|n| n.inputs.iter().find(|p| p.id == conn.to_port).map(|p| p.name.clone()))
            .unwrap_or_else(|| conn.to_port.0.to_string());

        patch_file.connections.push(ConnectionEntry {
            from: format!("{}:{}", conn.from_node.0, from_port_name),
            to: format!("{}:{}", conn.to_node.0, to_port_name),
        });
    }

    patch_file.metadata.created_by = "chord-app".into();

    json!({
        "patch_json": patch_file.to_json(),
        "node_count": patch_file.nodes.len(),
        "connection_count": patch_file.connections.len(),
    })
}

fn api_load_patch_file(args: Value, state: &AppState, handle: &AppHandle) -> Value {
    let json_str = match args.get("patch_json").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({"error": "Missing 'patch_json'"}),
    };

    let patch_file = match PatchFile::from_json(&json_str) {
        Ok(pf) => pf,
        Err(e) => return json!({"error": e}),
    };

    // Clear the existing graph.
    {
        let mut graph = state.graph.lock().unwrap();
        *graph = chord_audio_graph::Graph::new();
    }
    {
        let mut instances = state.node_instances.lock().unwrap();
        instances.clear();
    }
    {
        let mut conn_ids = state.connection_ids.lock().unwrap();
        conn_ids.clear();
    }

    // Add all nodes, tracking old ID -> new node ID mapping.
    let mut id_map: std::collections::HashMap<String, NodeId> = std::collections::HashMap::new();
    for node_entry in &patch_file.nodes {
        let result = api_add_node(
            json!({
                "node_type": node_entry.node_type,
                "position": {"x": node_entry.position.x, "y": node_entry.position.y}
            }),
            state,
            handle,
        );
        if let Some(nid_str) = result.get("node_id").and_then(|v| v.as_str()) {
            if let Ok(nid) = nid_str.parse::<u64>() {
                id_map.insert(node_entry.id.clone(), NodeId(nid));
                // Set parameters.
                for (param, value) in &node_entry.params {
                    api_set_parameter(
                        json!({
                            "node_id": nid_str,
                            "param": param,
                            "value": value
                        }),
                        state,
                        handle,
                    );
                }
            }
        }
    }

    // Add connections using port names.
    let mut connections_loaded = 0;
    for conn in &patch_file.connections {
        let (from_id_str, from_port_name) = conn.from.split_once(':').unwrap_or(("", ""));
        let (to_id_str, to_port_name) = conn.to.split_once(':').unwrap_or(("", ""));

        if let (Some(&from_nid), Some(&to_nid)) = (id_map.get(from_id_str), id_map.get(to_id_str)) {
            let result = api_connect(
                json!({
                    "from_node": from_nid.0.to_string(),
                    "from_port": from_port_name,
                    "to_node": to_nid.0.to_string(),
                    "to_port": to_port_name
                }),
                state,
                handle,
            );
            if result.get("error").is_none() {
                connections_loaded += 1;
            }
        }
    }

    json!({
        "name": patch_file.name,
        "nodes_loaded": id_map.len(),
        "connections_loaded": connections_loaded,
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
        Err(_) => Ok(()),
    }
}

/// Compute routing tuples from the graph's connections and node descriptors.
fn compute_routing(graph: &chord_audio_graph::Graph) -> Vec<(NodeId, usize, NodeId, usize)> {
    graph
        .connections()
        .iter()
        .map(|c| {
            let from_idx = graph
                .node(&c.from_node)
                .and_then(|n| n.outputs.iter().position(|p| p.id == c.from_port))
                .unwrap_or(0);
            let to_idx = graph
                .node(&c.to_node)
                .and_then(|n| n.inputs.iter().position(|p| p.id == c.to_port))
                .unwrap_or(0);
            (c.from_node, from_idx, c.to_node, to_idx)
        })
        .collect()
}
