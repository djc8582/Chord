//! The MCP server implementation — routes tool calls to graph operations.
//!
//! Supports two modes:
//! - **Standalone**: manages its own in-memory graphs (default)
//! - **Proxy**: forwards mutations to a running Chord app via HTTP on port 19475

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use chord_audio_graph::{
    CompileError, ConnectionId, Graph, GraphCompiler, NodeDescriptor, NodeId, ParameterDescriptor,
    PatchFile, PortDataType, PortDescriptor, PortId,
    patch_format::{ConnectionEntry, NodeEntry, Position},
};
use chord_diagnostics::{DiagnosticEngine, DiagnosticReport};
use chord_node_library::NodeRegistry;
use serde_json::{json, Value};

use crate::sound_planner;
use crate::tools::all_tool_definitions;
use crate::types::{McpError, McpResult, ToolDefinition};
use crate::vibe;

/// Well-known port for the Chord app's API server.
const APP_API_PORT: u16 = 19475;

/// Holds one patch (graph) along with its associated diagnostic engine.
struct PatchState {
    graph: Graph,
    diagnostics: DiagnosticEngine,
}

/// The MCP server that exposes Chord's audio graph tools to AI assistants.
///
/// Manages patches (audio graphs), routes tool calls, and returns JSON results.
/// Thread-safe access is the caller's responsibility; this struct is `Send` but not `Sync`.
///
/// When a running Chord app is detected on `localhost:19475`, the server
/// operates in **proxy mode**: graph mutations and transport commands are
/// forwarded to the app, so nodes appear on canvas and audio plays through
/// the app's audio engine.
pub struct ChordMcpServer {
    /// Active patches keyed by patch ID.
    patches: HashMap<String, PatchState>,
    /// Node registry for looking up node type information.
    registry: NodeRegistry,
    /// Counter for generating unique patch IDs.
    next_patch_id: u64,
    /// If true, the Chord app is running and we forward mutations to it.
    proxy_mode: bool,
    /// If true, never auto-detect proxy mode (for testing).
    proxy_detection_disabled: bool,
    /// Maps MCP node IDs (from standalone graph) to app node IDs (strings)
    /// returned by the running app. Used in proxy mode.
    app_node_ids: HashMap<u64, String>,
    /// Maps (app_node_id_numeric, port_id) → port_name from the app's add_node
    /// response. Used in proxy mode to resolve port names for connect calls.
    app_port_names: HashMap<(u64, u64), (String, bool)>,
}

impl Default for ChordMcpServer {
    fn default() -> Self {
        Self::new()
    }
}

impl ChordMcpServer {
    /// Create a new MCP server with the default Wave 1 node registry.
    ///
    /// Automatically detects whether the Chord app is running on the API port
    /// and enters proxy mode if so.
    pub fn new() -> Self {
        let proxy_mode = Self::check_app_running();
        if proxy_mode {
            eprintln!("[chord-mcp] App detected on port {APP_API_PORT} — proxy mode enabled");
        }
        Self {
            patches: HashMap::new(),
            registry: NodeRegistry::with_all(),
            next_patch_id: 1,
            proxy_mode,
            proxy_detection_disabled: false,
            app_node_ids: HashMap::new(),
            app_port_names: HashMap::new(),
        }
    }

    /// Create a new MCP server in standalone mode (no proxy), for testing.
    pub fn new_standalone() -> Self {
        Self {
            patches: HashMap::new(),
            registry: NodeRegistry::with_all(),
            next_patch_id: 1,
            proxy_mode: false,
            proxy_detection_disabled: true,
            app_node_ids: HashMap::new(),
            app_port_names: HashMap::new(),
        }
    }

    /// Check if the Chord app is running by attempting to connect to the API port.
    fn check_app_running() -> bool {
        TcpStream::connect_timeout(
            &format!("127.0.0.1:{APP_API_PORT}").parse().unwrap(),
            Duration::from_millis(200),
        )
        .is_ok()
    }

    /// Send a POST request to the running Chord app's API server.
    fn app_post(&self, endpoint: &str, body: &Value) -> McpResult<Value> {
        let body_str = body.to_string();
        let request = format!(
            "POST /api/v1/{endpoint} HTTP/1.1\r\n\
             Host: 127.0.0.1\r\n\
             Content-Type: application/json\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\
             \r\n\
             {body_str}",
            body_str.len()
        );

        let mut stream = TcpStream::connect(format!("127.0.0.1:{APP_API_PORT}"))
            .map_err(|e| McpError::Internal(format!("App connection failed: {e}")))?;
        stream.set_read_timeout(Some(Duration::from_secs(10))).ok();

        stream
            .write_all(request.as_bytes())
            .map_err(|e| McpError::Internal(format!("Write failed: {e}")))?;

        let mut response = String::new();
        stream
            .read_to_string(&mut response)
            .map_err(|e| McpError::Internal(format!("Read failed: {e}")))?;

        // Extract body after \r\n\r\n.
        let body = response
            .find("\r\n\r\n")
            .map(|idx| &response[idx + 4..])
            .unwrap_or(&response);

        serde_json::from_str(body.trim())
            .map_err(|e| McpError::Internal(format!("Invalid JSON response: {e}")))
    }

    /// Return all available tool definitions.
    pub fn list_tools(&self) -> Vec<ToolDefinition> {
        all_tool_definitions()
    }

    /// Get mutable access to a patch's diagnostic engine.
    ///
    /// Used by the runtime to feed signal data, and by tests to simulate processing.
    pub fn diagnostics_mut(&mut self, patch_id: &str) -> McpResult<&mut DiagnosticEngine> {
        let patch = self
            .patches
            .get_mut(patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.to_string()))?;
        Ok(&mut patch.diagnostics)
    }

    /// Dispatch a tool call by name with the given JSON arguments.
    ///
    /// In proxy mode, mutation and transport tools are forwarded to the running
    /// Chord app. Read-only tools (list_node_types, get_patch, diagnostics)
    /// are also forwarded when the app is running.
    pub fn call_tool(&mut self, name: &str, args: Value) -> McpResult<Value> {
        // Re-check for the app on each call (it may have started after us).
        if !self.proxy_mode && !self.proxy_detection_disabled {
            self.proxy_mode = Self::check_app_running();
            if self.proxy_mode {
                eprintln!("[chord-mcp] App detected on port {APP_API_PORT} — proxy mode enabled");
            }
        }

        // In proxy mode, forward supported tools to the app.
        if self.proxy_mode {
            match name {
                "create_patch" => {
                    // Create a local patch so diagnostics/export tools work.
                    self.patches.insert(
                        "app".to_string(),
                        PatchState {
                            graph: Graph::new(),
                            diagnostics: DiagnosticEngine::default(),
                        },
                    );
                    return Ok(json!({
                        "patch_id": "app",
                        "message": "Using running Chord app (proxy mode). Patch is managed by the app."
                    }));
                }
                "add_node" => return self.proxy_add_node(&args),
                "remove_node" => return self.proxy_remove_node(&args),
                "connect" => return self.proxy_connect(&args),
                "disconnect" => return self.proxy_disconnect(&args),
                "set_parameter" => return self.proxy_set_parameter(&args),
                "compile_patch" => return self.app_post("compile", &json!({})),
                "get_patch" => return self.app_post("get_patch", &json!({})),
                // list_node_types falls through to local handling (same data).
                _ => {}
            }
        }

        match name {
            "list_node_types" => self.tool_list_node_types(),
            "create_patch" => self.tool_create_patch(),
            "add_node" => self.tool_add_node(&args),
            "remove_node" => self.tool_remove_node(&args),
            "connect" => self.tool_connect(&args),
            "disconnect" => self.tool_disconnect(&args),
            "set_parameter" => self.tool_set_parameter(&args),
            "get_patch" => self.tool_get_patch(&args),
            "compile_patch" => self.tool_compile_patch(&args),
            "run_diagnostics" => self.tool_run_diagnostics(&args),
            "export_patch" => self.tool_export_patch(&args),
            "get_signal_stats" => self.tool_get_signal_stats(&args),
            "find_problems" => self.tool_find_problems(&args),
            "get_cpu_profile" => self.tool_get_cpu_profile(&args),
            "auto_fix" => self.tool_auto_fix(&args),
            "create_from_description" => self.tool_create_from_description(&args),
            "modify_patch" => self.tool_modify_patch(&args),
            "save_patch_file" => self.tool_save_patch_file(&args),
            "load_patch_file" => self.tool_load_patch_file(&args),
            "recreate_sound" => self.tool_recreate_sound(&args),
            _ => Err(McpError::UnknownTool(name.to_string())),
        }
    }

    // ────────────────────────────────────────────
    // Proxy mode tool handlers
    // ────────────────────────────────────────────

    fn proxy_add_node(&mut self, args: &Value) -> McpResult<Value> {
        let node_type = get_string(args, "node_type")?;
        let position = args.get("position").cloned().unwrap_or(json!({"x": 0, "y": 0}));

        let result = self.app_post("add_node", &json!({
            "node_type": node_type,
            "position": position,
        }))?;

        // Store the app's node ID so we can map MCP numeric IDs in subsequent calls.
        if let Some(app_id) = result.get("node_id").and_then(|v| v.as_str()) {
            // Cache port ID → name mappings from the app response so proxy_connect
            // can resolve port names without relying on the local graph (whose
            // PortIds differ due to the global atomic counter).
            if let Ok(node_num) = app_id.parse::<u64>() {
                if let Some(inputs) = result.get("inputs").and_then(|v| v.as_array()) {
                    for port in inputs {
                        if let (Some(pid), Some(name)) = (
                            port.get("id").and_then(|v| v.as_u64()),
                            port.get("name").and_then(|v| v.as_str()),
                        ) {
                            // false = input port
                            self.app_port_names.insert((node_num, pid), (name.to_string(), false));
                        }
                    }
                }
                if let Some(outputs) = result.get("outputs").and_then(|v| v.as_array()) {
                    for port in outputs {
                        if let (Some(pid), Some(name)) = (
                            port.get("id").and_then(|v| v.as_u64()),
                            port.get("name").and_then(|v| v.as_str()),
                        ) {
                            // true = output port
                            self.app_port_names.insert((node_num, pid), (name.to_string(), true));
                        }
                    }
                }
            }

            // Also run the local standalone logic so diagnostics/export still work.
            let local_result = self.tool_add_node(args);
            if let Ok(ref local) = local_result {
                if let Some(local_id) = local.get("node_id").and_then(|v| v.as_u64()) {
                    self.app_node_ids.insert(local_id, app_id.to_string());
                }
            }
        }

        Ok(result)
    }

    fn proxy_remove_node(&mut self, args: &Value) -> McpResult<Value> {
        let node_id_val = get_u64(args, "node_id")?;
        let app_id = self
            .app_node_ids
            .get(&node_id_val)
            .cloned()
            .unwrap_or_else(|| node_id_val.to_string());

        let result = self.app_post("remove_node", &json!({"id": app_id}))?;
        // Also remove from local graph.
        let _ = self.tool_remove_node(args);
        self.app_node_ids.remove(&node_id_val);
        // Clean up port name cache for removed node.
        self.app_port_names.retain(|&(nid, _), _| nid != node_id_val);

        Ok(result)
    }

    fn proxy_connect(&mut self, args: &Value) -> McpResult<Value> {
        let from_node = get_u64(args, "from_node")?;
        let to_node = get_u64(args, "to_node")?;
        let from_port_id = get_u64(args, "from_port")?;
        let to_port_id = get_u64(args, "to_port")?;

        // Map MCP numeric IDs to app IDs.
        let from_app_id = self
            .app_node_ids
            .get(&from_node)
            .cloned()
            .unwrap_or_else(|| from_node.to_string());
        let to_app_id = self
            .app_node_ids
            .get(&to_node)
            .cloned()
            .unwrap_or_else(|| to_node.to_string());

        // Parse the app node IDs as numbers to look up cached port names.
        let from_node_num = from_app_id.parse::<u64>().unwrap_or(from_node);
        let to_node_num = to_app_id.parse::<u64>().unwrap_or(to_node);

        // Resolve port names from the cached app response (not the local graph,
        // whose PortIds differ due to the global atomic counter).
        let from_port_name = self
            .app_port_names
            .get(&(from_node_num, from_port_id))
            .map(|(name, _)| name.clone())
            .unwrap_or_else(|| format!("{from_port_id}"));

        let to_port_name = self
            .app_port_names
            .get(&(to_node_num, to_port_id))
            .map(|(name, _)| name.clone())
            .unwrap_or_else(|| format!("{to_port_id}"));

        let result = self.app_post(
            "connect",
            &json!({
                "from_node": from_app_id,
                "from_port": from_port_name,
                "to_node": to_app_id,
                "to_port": to_port_name,
            }),
        )?;

        // Also connect in local graph.
        let _ = self.tool_connect(args);

        Ok(result)
    }

    fn proxy_disconnect(&mut self, args: &Value) -> McpResult<Value> {
        let conn_id = get_u64(args, "connection_id")?;
        let result = self.app_post("disconnect", &json!({"id": conn_id.to_string()}))?;
        let _ = self.tool_disconnect(args);
        Ok(result)
    }

    fn proxy_set_parameter(&mut self, args: &Value) -> McpResult<Value> {
        let node_id_val = get_u64(args, "node_id")?;
        let param = get_string(args, "parameter")?;
        let value = get_f64(args, "value")?;

        let app_id = self
            .app_node_ids
            .get(&node_id_val)
            .cloned()
            .unwrap_or_else(|| node_id_val.to_string());

        let result = self.app_post(
            "set_parameter",
            &json!({
                "node_id": app_id,
                "param": param,
                "value": value,
            }),
        )?;

        // Also update local graph.
        let _ = self.tool_set_parameter(args);

        Ok(result)
    }

    /// Handle the full MCP protocol request/response format.
    ///
    /// Input: `{ "tool": "name", "arguments": { ... } }`
    /// Output: `{ "result": ... }` or `{ "error": "message" }`
    pub fn handle_request(&mut self, request: &Value) -> Value {
        let tool_name = match request.get("tool").and_then(|v| v.as_str()) {
            Some(name) => name,
            None => {
                return json!({
                    "error": "Missing 'tool' field in request"
                });
            }
        };

        let arguments = request
            .get("arguments")
            .cloned()
            .unwrap_or_else(|| json!({}));

        match self.call_tool(tool_name, arguments) {
            Ok(result) => json!({ "result": result }),
            Err(e) => json!({ "error": e.to_string() }),
        }
    }

    // ────────────────────────────────────────────
    // Tool implementations
    // ────────────────────────────────────────────

    /// `list_node_types` — Returns all registered node types with their port/parameter info.
    fn tool_list_node_types(&self) -> McpResult<Value> {
        let mut node_types: Vec<Value> = Vec::new();

        let mut types = self.registry.registered_types();
        types.sort();

        for type_name in types {
            let descriptor = build_node_descriptor(type_name);
            let inputs: Vec<Value> = descriptor
                .inputs
                .iter()
                .map(|p| {
                    json!({
                        "id": p.id.0,
                        "name": p.name,
                        "data_type": format!("{}", p.data_type),
                        "default_value": p.default_value,
                    })
                })
                .collect();
            let outputs: Vec<Value> = descriptor
                .outputs
                .iter()
                .map(|p| {
                    json!({
                        "id": p.id.0,
                        "name": p.name,
                        "data_type": format!("{}", p.data_type),
                        "default_value": p.default_value,
                    })
                })
                .collect();
            let parameters: Vec<Value> = descriptor
                .parameters
                .iter()
                .map(|p| {
                    json!({
                        "id": p.id,
                        "name": p.name,
                        "default": p.default,
                        "min": p.min,
                        "max": p.max,
                        "unit": p.unit,
                        "automatable": p.automatable,
                    })
                })
                .collect();

            node_types.push(json!({
                "type": type_name,
                "inputs": inputs,
                "outputs": outputs,
                "parameters": parameters,
            }));
        }

        Ok(json!({ "node_types": node_types }))
    }

    /// `create_patch` — Creates a new empty patch.
    fn tool_create_patch(&mut self) -> McpResult<Value> {
        let patch_id = format!("patch_{}", self.next_patch_id);
        self.next_patch_id += 1;

        self.patches.insert(
            patch_id.clone(),
            PatchState {
                graph: Graph::new(),
                diagnostics: DiagnosticEngine::default(),
            },
        );

        Ok(json!({
            "patch_id": patch_id,
            "message": "Empty patch created."
        }))
    }

    /// `add_node` — Adds a node of a given type to the patch.
    fn tool_add_node(&mut self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;
        let node_type = get_string(args, "node_type")?;

        // Verify node type exists in registry.
        if !self.registry.has_type(&node_type) {
            return Err(McpError::UnknownNodeType(node_type));
        }

        let patch = self
            .patches
            .get_mut(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        // Build the full node descriptor with typed ports and parameters.
        let mut descriptor = build_node_descriptor(&node_type);

        // Apply optional position.
        if let Some(pos) = args.get("position") {
            let x = pos.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let y = pos.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
            descriptor = descriptor.at_position(x, y);
        }

        let node_id = descriptor.id;

        // Collect port/param info before moving the descriptor.
        let inputs_json: Vec<Value> = descriptor
            .inputs
            .iter()
            .map(|p| {
                json!({
                    "id": p.id.0,
                    "name": p.name,
                    "data_type": format!("{}", p.data_type),
                })
            })
            .collect();
        let outputs_json: Vec<Value> = descriptor
            .outputs
            .iter()
            .map(|p| {
                json!({
                    "id": p.id.0,
                    "name": p.name,
                    "data_type": format!("{}", p.data_type),
                })
            })
            .collect();
        let params_json: Vec<Value> = descriptor
            .parameters
            .iter()
            .map(|p| {
                json!({
                    "id": p.id,
                    "name": p.name,
                    "value": p.value,
                    "min": p.min,
                    "max": p.max,
                })
            })
            .collect();

        patch.graph.add_node(descriptor);

        Ok(json!({
            "node_id": node_id.0,
            "node_type": node_type,
            "inputs": inputs_json,
            "outputs": outputs_json,
            "parameters": params_json,
        }))
    }

    /// `remove_node` — Removes a node and its connections from the patch.
    fn tool_remove_node(&mut self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;
        let node_id_val = get_u64(args, "node_id")?;
        let node_id = NodeId(node_id_val);

        let patch = self
            .patches
            .get_mut(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        match patch.graph.remove_node(&node_id) {
            Some(_) => Ok(json!({
                "removed": node_id_val,
                "message": "Node and its connections removed."
            })),
            None => Err(McpError::NodeNotFound(format!("{node_id_val}"))),
        }
    }

    /// `connect` — Connects two ports.
    fn tool_connect(&mut self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;
        let from_node = NodeId(get_u64(args, "from_node")?);
        let from_port = PortId(get_u64(args, "from_port")?);
        let to_node = NodeId(get_u64(args, "to_node")?);
        let to_port = PortId(get_u64(args, "to_port")?);

        let patch = self
            .patches
            .get_mut(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        let conn_id = patch
            .graph
            .connect(from_node, from_port, to_node, to_port)
            .map_err(|e| match e {
                CompileError::InvalidGraph(msg) => McpError::InvalidArguments(msg),
                CompileError::TypeMismatch {
                    expected, got, ..
                } => McpError::InvalidArguments(format!(
                    "Type mismatch: expected {expected}, got {got}"
                )),
                CompileError::DisconnectedRequired { node, port } => {
                    McpError::PortNotFound(format!("{port} on {node}"))
                }
            })?;

        Ok(json!({
            "connection_id": conn_id.0,
            "from_node": from_node.0,
            "from_port": from_port.0,
            "to_node": to_node.0,
            "to_port": to_port.0,
        }))
    }

    /// `disconnect` — Removes a connection.
    fn tool_disconnect(&mut self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;
        let conn_id_val = get_u64(args, "connection_id")?;
        let conn_id = ConnectionId(conn_id_val);

        let patch = self
            .patches
            .get_mut(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        if patch.graph.disconnect(&conn_id) {
            Ok(json!({
                "removed": conn_id_val,
                "message": "Connection removed."
            }))
        } else {
            Err(McpError::ConnectionNotFound(format!("{conn_id_val}")))
        }
    }

    /// `set_parameter` — Sets a node parameter value.
    fn tool_set_parameter(&mut self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;
        let node_id_val = get_u64(args, "node_id")?;
        let node_id = NodeId(node_id_val);
        let param_name = get_string(args, "parameter")?;
        let value = get_f64(args, "value")?;

        let patch = self
            .patches
            .get_mut(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        let node = patch
            .graph
            .node_mut(&node_id)
            .ok_or_else(|| McpError::NodeNotFound(format!("{node_id_val}")))?;

        // Find the parameter and validate.
        let param = node
            .parameters
            .iter_mut()
            .find(|p| p.id == param_name)
            .ok_or_else(|| McpError::ParameterNotFound(param_name.clone()))?;

        // Clamp to valid range.
        let clamped = value.clamp(param.min, param.max);
        param.value = clamped;

        Ok(json!({
            "node_id": node_id_val,
            "parameter": param_name,
            "value": clamped,
            "clamped": (clamped - value).abs() > f64::EPSILON,
        }))
    }

    /// `get_patch` — Returns the full patch as JSON.
    fn tool_get_patch(&self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;

        let patch = self
            .patches
            .get(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        Ok(serialize_graph(&patch.graph, &patch_id))
    }

    /// `compile_patch` — Compiles the graph and returns compilation result or errors.
    fn tool_compile_patch(&self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;

        let patch = self
            .patches
            .get(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        match GraphCompiler::compile(&patch.graph) {
            Ok(compiled) => {
                let exec_order: Vec<u64> =
                    compiled.execution_order.iter().map(|n| n.0).collect();
                let parallel_groups: Vec<Vec<u64>> = compiled
                    .parallel_groups
                    .iter()
                    .map(|g| g.iter().map(|n| n.0).collect())
                    .collect();
                let feedback_edges: Vec<u64> =
                    compiled.feedback_edges.iter().map(|c| c.0).collect();

                Ok(json!({
                    "success": true,
                    "execution_order": exec_order,
                    "parallel_groups": parallel_groups,
                    "feedback_edges": feedback_edges,
                    "buffer_count": compiled.buffer_layout.buffer_count,
                }))
            }
            Err(e) => Err(McpError::CompilationFailed(e.to_string())),
        }
    }

    /// `run_diagnostics` — Runs diagnostics on the current patch.
    fn tool_run_diagnostics(&mut self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;

        let patch = self
            .patches
            .get_mut(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        let report: DiagnosticReport = patch.diagnostics.run_full_diagnostic();

        let report_json = serde_json::to_value(&report).map_err(|e| {
            McpError::Internal(format!("Failed to serialize diagnostic report: {e}"))
        })?;

        Ok(json!({
            "patch_id": patch_id,
            "report": report_json,
        }))
    }

    /// `export_patch` — Serializes the patch to JSON for save/load.
    fn tool_export_patch(&self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;

        let patch = self
            .patches
            .get(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        let graph_json = serde_json::to_value(&patch.graph).map_err(|e| {
            McpError::Internal(format!("Failed to serialize patch: {e}"))
        })?;

        Ok(json!({
            "patch_id": patch_id,
            "graph": graph_json,
        }))
    }

    /// `get_signal_stats` — Get real-time signal statistics for a specific node/port.
    fn tool_get_signal_stats(&self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;
        let node_id_val = get_u64(args, "node_id")?;
        let port_id_val = get_u64(args, "port_id")?;

        let patch = self
            .patches
            .get(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        let node_id = NodeId(node_id_val);
        let port_id = PortId(port_id_val);

        match patch.diagnostics.get_signal_stats(node_id, port_id) {
            Some(stats) => {
                let stats_json = serde_json::to_value(&stats).map_err(|e| {
                    McpError::Internal(format!("Failed to serialize signal stats: {e}"))
                })?;
                Ok(json!({
                    "node_id": node_id_val,
                    "port_id": port_id_val,
                    "stats": stats_json,
                }))
            }
            None => Ok(json!({
                "node_id": node_id_val,
                "port_id": port_id_val,
                "stats": null,
                "message": "No signal stats available for this node/port. The node may not have been processed yet."
            })),
        }
    }

    /// `find_problems` — List all detected problems with severity and suggested fixes.
    fn tool_find_problems(&mut self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;

        let patch = self
            .patches
            .get_mut(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        let problems = patch.diagnostics.get_problems();

        let problems_json = serde_json::to_value(&problems).map_err(|e| {
            McpError::Internal(format!("Failed to serialize problems: {e}"))
        })?;

        Ok(json!({
            "patch_id": patch_id,
            "problem_count": problems.len(),
            "problems": problems_json,
        }))
    }

    /// `get_cpu_profile` — Get per-node CPU profiling data.
    fn tool_get_cpu_profile(&self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;

        let patch = self
            .patches
            .get(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        let profile = patch.diagnostics.get_cpu_profile();

        let profile_json = serde_json::to_value(&profile).map_err(|e| {
            McpError::Internal(format!("Failed to serialize CPU profile: {e}"))
        })?;

        Ok(json!({
            "patch_id": patch_id,
            "profile": profile_json,
        }))
    }

    /// `auto_fix` — Apply a suggested fix for a detected problem.
    fn tool_auto_fix(&mut self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;
        let fix_obj = args.get("fix").ok_or_else(|| {
            McpError::InvalidArguments("Missing 'fix' field".to_string())
        })?;

        let fix_type = fix_obj
            .get("type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                McpError::InvalidArguments("Missing 'type' field in fix object".to_string())
            })?;

        // Verify patch exists.
        if !self.patches.contains_key(&patch_id) {
            return Err(McpError::PatchNotFound(patch_id));
        }

        match fix_type {
            "InsertGain" => {
                let node_id_val = fix_obj
                    .get("node_id")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| {
                        McpError::InvalidArguments(
                            "InsertGain fix requires 'node_id'".to_string(),
                        )
                    })?;
                let gain = fix_obj
                    .get("gain")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.5);

                self.apply_insert_gain(&patch_id, NodeId(node_id_val), gain)
            }
            "InsertDcBlocker" => {
                let node_id_val = fix_obj
                    .get("node_id")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| {
                        McpError::InvalidArguments(
                            "InsertDcBlocker fix requires 'node_id'".to_string(),
                        )
                    })?;

                self.apply_insert_node_after(&patch_id, NodeId(node_id_val), "dc_blocker", "InsertDcBlocker")
            }
            "InsertLimiter" => {
                let node_id_val = fix_obj
                    .get("node_id")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| {
                        McpError::InvalidArguments(
                            "InsertLimiter fix requires 'node_id'".to_string(),
                        )
                    })?;

                self.apply_insert_node_after(&patch_id, NodeId(node_id_val), "limiter", "InsertLimiter")
            }
            "MuteNode" => {
                let node_id_val = fix_obj
                    .get("node_id")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| {
                        McpError::InvalidArguments(
                            "MuteNode fix requires 'node_id'".to_string(),
                        )
                    })?;

                self.apply_mute_node(&patch_id, NodeId(node_id_val))
            }
            "BypassNode" => {
                let node_id_val = fix_obj
                    .get("node_id")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| {
                        McpError::InvalidArguments(
                            "BypassNode fix requires 'node_id'".to_string(),
                        )
                    })?;

                self.apply_bypass_node(&patch_id, NodeId(node_id_val))
            }
            "IncreaseBufferSize" => {
                let _size = fix_obj
                    .get("size")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(512) as u32;

                Ok(json!({
                    "applied": false,
                    "description": "Manual fix needed: IncreaseBufferSize requires restarting the audio engine with a larger buffer size."
                }))
            }
            other => Err(McpError::InvalidArguments(format!(
                "Unknown fix type: '{other}'. Valid types: InsertGain, InsertDcBlocker, InsertLimiter, MuteNode, BypassNode, IncreaseBufferSize"
            ))),
        }
    }

    // ────────────────────────────────────────────
    // Auto-fix helpers
    // ────────────────────────────────────────────

    /// Insert a gain node after the target node and set its gain parameter.
    fn apply_insert_gain(
        &mut self,
        patch_id: &str,
        target_node_id: NodeId,
        gain: f64,
    ) -> McpResult<Value> {
        let patch = self
            .patches
            .get_mut(patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.to_string()))?;

        // Verify target node exists.
        if patch.graph.node(&target_node_id).is_none() {
            return Err(McpError::NodeNotFound(format!("{}", target_node_id.0)));
        }

        // Create the gain node descriptor.
        let mut gain_desc = build_node_descriptor("gain");
        let gain_node_id = gain_desc.id;
        let gain_in_port = gain_desc.inputs[0].id;
        let gain_out_port = gain_desc.outputs[0].id;

        // Set the gain parameter.
        if let Some(param) = gain_desc.parameters.iter_mut().find(|p| p.id == "gain") {
            param.value = gain.clamp(param.min, param.max);
        }

        // Find connections originating from the target node.
        let outgoing: Vec<_> = patch
            .graph
            .connections()
            .iter()
            .filter(|c| c.from_node == target_node_id)
            .map(|c| (c.id, c.from_port, c.to_node, c.to_port))
            .collect();

        // Add the gain node.
        patch.graph.add_node(gain_desc);

        // Rewire: for each outgoing connection from the target, reconnect through the gain node.
        if outgoing.is_empty() {
            // No outgoing connections — just connect target → gain.
            let target_out = patch
                .graph
                .node(&target_node_id)
                .and_then(|n| n.outputs.first().map(|p| p.id));
            if let Some(out_port) = target_out {
                let _ = patch.graph.connect(target_node_id, out_port, gain_node_id, gain_in_port);
            }
        } else {
            for (conn_id, from_port, to_node, to_port) in outgoing {
                // Remove old connection.
                patch.graph.disconnect(&conn_id);
                // Connect target → gain.
                let _ = patch.graph.connect(target_node_id, from_port, gain_node_id, gain_in_port);
                // Connect gain → original destination.
                let _ = patch.graph.connect(gain_node_id, gain_out_port, to_node, to_port);
            }
        }

        Ok(json!({
            "applied": true,
            "description": format!("Inserted gain node ({}) after node {} with gain={:.4}", gain_node_id.0, target_node_id.0, gain),
            "new_node_id": gain_node_id.0,
        }))
    }

    /// Insert a pass-through node (dc_blocker, limiter, etc.) after the target node.
    /// Uses the "fallback" descriptor which has "in" and "out" ports.
    fn apply_insert_node_after(
        &mut self,
        patch_id: &str,
        target_node_id: NodeId,
        node_type: &str,
        fix_name: &str,
    ) -> McpResult<Value> {
        let patch = self
            .patches
            .get_mut(patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.to_string()))?;

        if patch.graph.node(&target_node_id).is_none() {
            return Err(McpError::NodeNotFound(format!("{}", target_node_id.0)));
        }

        let new_desc = build_node_descriptor(node_type);
        let new_node_id = new_desc.id;
        let new_in_port = new_desc.inputs[0].id;
        let new_out_port = new_desc.outputs[0].id;

        // Find outgoing connections from the target node.
        let outgoing: Vec<_> = patch
            .graph
            .connections()
            .iter()
            .filter(|c| c.from_node == target_node_id)
            .map(|c| (c.id, c.from_port, c.to_node, c.to_port))
            .collect();

        patch.graph.add_node(new_desc);

        if outgoing.is_empty() {
            let target_out = patch
                .graph
                .node(&target_node_id)
                .and_then(|n| n.outputs.first().map(|p| p.id));
            if let Some(out_port) = target_out {
                let _ = patch.graph.connect(target_node_id, out_port, new_node_id, new_in_port);
            }
        } else {
            for (conn_id, from_port, to_node, to_port) in outgoing {
                patch.graph.disconnect(&conn_id);
                let _ = patch.graph.connect(target_node_id, from_port, new_node_id, new_in_port);
                let _ = patch.graph.connect(new_node_id, new_out_port, to_node, to_port);
            }
        }

        Ok(json!({
            "applied": true,
            "description": format!("{}: inserted {} node ({}) after node {}", fix_name, node_type, new_node_id.0, target_node_id.0),
            "new_node_id": new_node_id.0,
        }))
    }

    /// Mute a node by inserting a gain node set to 0.
    fn apply_mute_node(
        &mut self,
        patch_id: &str,
        target_node_id: NodeId,
    ) -> McpResult<Value> {
        self.apply_insert_gain(patch_id, target_node_id, 0.0)
            .map(|mut v| {
                // Override description.
                if let Some(obj) = v.as_object_mut() {
                    obj.insert(
                        "description".to_string(),
                        json!(format!("Muted node {} by inserting a gain node at 0.0", target_node_id.0)),
                    );
                }
                v
            })
    }

    // ────────────────────────────────────────────
    // Vibe-to-Sound tools
    // ────────────────────────────────────────────

    /// `create_from_description` — Create a patch from a natural language description.
    fn tool_create_from_description(&mut self, args: &Value) -> McpResult<Value> {
        let description = get_string(args, "description")?;
        let recipe = vibe::translate(&description);

        // Create a new patch.
        let create_result = self.tool_create_patch()?;
        let patch_id = create_result["patch_id"]
            .as_str()
            .ok_or_else(|| McpError::Internal("Failed to get patch_id".into()))?
            .to_string();

        // Build the patch from the recipe.
        let build_result = self.build_patch_from_recipe(&patch_id, &recipe)?;

        Ok(json!({
            "patch_id": patch_id,
            "name": recipe.name,
            "description": recipe.description,
            "tempo": recipe.tempo,
            "layers": recipe.layers.len(),
            "node_count": build_result["node_count"],
            "suggestions": [
                "Try: modify this patch with 'make it darker'",
                "Try: modify this patch with 'add more reverb'",
                "Try: modify this patch with 'speed it up'",
            ]
        }))
    }

    /// `modify_patch` — Modify an existing patch using natural language.
    fn tool_modify_patch(&mut self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;
        let description = get_string(args, "description")?;
        let changes = vibe::translate_modification(&description);

        if changes.is_empty() {
            return Ok(json!({
                "modified": 0,
                "message": "No recognized modifications in the description. Try: 'darker', 'brighter', 'more reverb', 'faster', 'louder', etc."
            }));
        }

        // Verify patch exists.
        if !self.patches.contains_key(&patch_id) {
            return Err(McpError::PatchNotFound(patch_id));
        }

        let mut applied = 0;
        let mut applied_changes: Vec<Value> = Vec::new();

        for (target_hint, param, value) in &changes {
            // Collect node IDs that match the target hint.
            let matching_node_ids: Vec<(u64, String)> = {
                let patch = self.patches.get(&patch_id).unwrap();
                patch
                    .graph
                    .nodes()
                    .iter()
                    .filter(|(_, desc)| {
                        desc.node_type.contains(target_hint.as_str())
                            || (target_hint == "master" && desc.node_type == "gain")
                            || (target_hint == "clock" && desc.node_type == "lfo")
                            || (target_hint == "bass" && desc.node_type == "gain")
                    })
                    .map(|(id, desc)| (id.0, desc.node_type.clone()))
                    .collect()
            };

            for (node_id, node_type) in &matching_node_ids {
                let set_result = self.tool_set_parameter(&json!({
                    "patch_id": patch_id,
                    "node_id": node_id,
                    "parameter": param,
                    "value": value
                }));
                if set_result.is_ok() {
                    applied += 1;
                    applied_changes.push(json!({
                        "node_id": node_id,
                        "node_type": node_type,
                        "parameter": param,
                        "value": value,
                    }));
                }
            }
        }

        Ok(json!({
            "modified": applied,
            "changes": applied_changes
        }))
    }

    /// `recreate_sound` — Recreate a sound through synthesis from a description.
    fn tool_recreate_sound(&mut self, args: &Value) -> McpResult<Value> {
        let description = get_string(args, "description")?;

        // 1. Classify the sound
        let category = sound_planner::classify_sound(&description);

        // 2. Get expert recipe for this category
        let recipe = sound_planner::get_expert_recipe(category, &description);

        // 3. Create a new patch
        let create_result = self.tool_create_patch()?;
        let patch_id = create_result["patch_id"]
            .as_str()
            .ok_or_else(|| McpError::Internal("Failed to get patch_id".into()))?
            .to_string();

        // 4. Build the patch from the recipe
        let build_result = self.build_patch_from_recipe(&patch_id, &recipe)?;

        Ok(json!({
            "patch_id": patch_id,
            "category": format!("{:?}", category),
            "name": recipe.name,
            "description": recipe.description,
            "layers": recipe.layers.len(),
            "node_count": build_result["node_count"],
            "approach": recipe.description,
        }))
    }

    /// Build a complete patch from a `PatchRecipe`.
    ///
    /// Creates a clock LFO, builds each layer, routes through a mixer,
    /// adds delay/reverb/gain effects chain, and connects to output.
    fn build_patch_from_recipe(
        &mut self,
        patch_id: &str,
        recipe: &vibe::PatchRecipe,
    ) -> McpResult<Value> {
        // Clock LFO (tempo source)
        let clock_rate = recipe.tempo / 60.0 * 2.0;
        let clock_result = self.tool_add_node(&json!({
            "patch_id": patch_id,
            "node_type": "lfo",
            "position": {"x": 50, "y": 400}
        }))?;
        let clock_id = clock_result["node_id"].as_u64().unwrap();
        let clock_out_port = clock_result["outputs"][0]["id"].as_u64().unwrap();

        self.tool_set_parameter(&json!({
            "patch_id": patch_id, "node_id": clock_id,
            "parameter": "rate", "value": clock_rate
        }))?;
        self.tool_set_parameter(&json!({
            "patch_id": patch_id, "node_id": clock_id,
            "parameter": "waveform", "value": 2.0 // square wave
        }))?;

        // Build each layer.
        let mut layer_output_ids: Vec<(u64, u64)> = Vec::new(); // (node_id, out_port_id)
        for (i, layer) in recipe.layers.iter().enumerate() {
            let y = 100 + i as i32 * 250;
            let (output_id, output_port) =
                self.build_layer(patch_id, layer, clock_id, clock_out_port, &recipe.key, y)?;
            layer_output_ids.push((output_id, output_port));
        }

        // Mixer
        let mixer_result = self.tool_add_node(&json!({
            "patch_id": patch_id, "node_type": "mixer",
            "position": {"x": 1200, "y": 400}
        }))?;
        let mixer_id = mixer_result["node_id"].as_u64().unwrap();
        let mixer_inputs: Vec<u64> = mixer_result["inputs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p["id"].as_u64().unwrap())
            .collect();
        let mixer_out_port = mixer_result["outputs"][0]["id"].as_u64().unwrap();

        // Connect layers to mixer (max 4 inputs).
        for (i, &(output_id, output_port)) in layer_output_ids.iter().take(4).enumerate() {
            let _ = self.tool_connect(&json!({
                "patch_id": patch_id,
                "from_node": output_id, "from_port": output_port,
                "to_node": mixer_id, "to_port": mixer_inputs[i]
            }));
        }

        // If we have more than 4 layers, add a second mixer and feed it into the first.
        if layer_output_ids.len() > 4 {
            let mixer2_result = self.tool_add_node(&json!({
                "patch_id": patch_id, "node_type": "mixer",
                "position": {"x": 1100, "y": 700}
            }))?;
            let mixer2_id = mixer2_result["node_id"].as_u64().unwrap();
            let mixer2_inputs: Vec<u64> = mixer2_result["inputs"]
                .as_array()
                .unwrap()
                .iter()
                .map(|p| p["id"].as_u64().unwrap())
                .collect();
            let mixer2_out_port = mixer2_result["outputs"][0]["id"].as_u64().unwrap();

            for (i, &(output_id, output_port)) in
                layer_output_ids.iter().skip(4).take(4).enumerate()
            {
                let _ = self.tool_connect(&json!({
                    "patch_id": patch_id,
                    "from_node": output_id, "from_port": output_port,
                    "to_node": mixer2_id, "to_port": mixer2_inputs[i]
                }));
            }

            // Connect second mixer to last input of first mixer.
            let last_mixer_input = mixer_inputs[3];
            let _ = self.tool_connect(&json!({
                "patch_id": patch_id,
                "from_node": mixer2_id, "from_port": mixer2_out_port,
                "to_node": mixer_id, "to_port": last_mixer_input
            }));
        }

        // Delay
        let delay_result = self.tool_add_node(&json!({
            "patch_id": patch_id, "node_type": "delay",
            "position": {"x": 1400, "y": 400}
        }))?;
        let delay_id = delay_result["node_id"].as_u64().unwrap();
        let delay_in_port = delay_result["inputs"][0]["id"].as_u64().unwrap();
        let delay_out_port = delay_result["outputs"][0]["id"].as_u64().unwrap();

        self.tool_set_parameter(&json!({
            "patch_id": patch_id, "node_id": delay_id,
            "parameter": "time", "value": recipe.delay_time
        }))?;
        self.tool_set_parameter(&json!({
            "patch_id": patch_id, "node_id": delay_id,
            "parameter": "feedback", "value": recipe.delay_feedback
        }))?;
        self.tool_set_parameter(&json!({
            "patch_id": patch_id, "node_id": delay_id,
            "parameter": "mix", "value": recipe.delay_mix
        }))?;

        // Reverb
        let reverb_result = self.tool_add_node(&json!({
            "patch_id": patch_id, "node_type": "reverb",
            "position": {"x": 1600, "y": 400}
        }))?;
        let reverb_id = reverb_result["node_id"].as_u64().unwrap();
        let reverb_in_port = reverb_result["inputs"][0]["id"].as_u64().unwrap();
        let reverb_out_port = reverb_result["outputs"][0]["id"].as_u64().unwrap();

        self.tool_set_parameter(&json!({
            "patch_id": patch_id, "node_id": reverb_id,
            "parameter": "room_size", "value": recipe.reverb_size
        }))?;
        self.tool_set_parameter(&json!({
            "patch_id": patch_id, "node_id": reverb_id,
            "parameter": "mix", "value": recipe.reverb_mix
        }))?;

        // Master gain
        let gain_result = self.tool_add_node(&json!({
            "patch_id": patch_id, "node_type": "gain",
            "position": {"x": 1800, "y": 400}
        }))?;
        let gain_id = gain_result["node_id"].as_u64().unwrap();
        let gain_in_port = gain_result["inputs"][0]["id"].as_u64().unwrap();
        let gain_out_port = gain_result["outputs"][0]["id"].as_u64().unwrap();

        self.tool_set_parameter(&json!({
            "patch_id": patch_id, "node_id": gain_id,
            "parameter": "gain", "value": recipe.master_gain
        }))?;

        // Output
        let out_result = self.tool_add_node(&json!({
            "patch_id": patch_id, "node_type": "output",
            "position": {"x": 2000, "y": 400}
        }))?;
        let out_id = out_result["node_id"].as_u64().unwrap();
        let out_in_port = out_result["inputs"][0]["id"].as_u64().unwrap();

        // Connect chain: mixer → delay → reverb → gain → output
        self.tool_connect(&json!({
            "patch_id": patch_id,
            "from_node": mixer_id, "from_port": mixer_out_port,
            "to_node": delay_id, "to_port": delay_in_port
        }))?;
        self.tool_connect(&json!({
            "patch_id": patch_id,
            "from_node": delay_id, "from_port": delay_out_port,
            "to_node": reverb_id, "to_port": reverb_in_port
        }))?;
        self.tool_connect(&json!({
            "patch_id": patch_id,
            "from_node": reverb_id, "from_port": reverb_out_port,
            "to_node": gain_id, "to_port": gain_in_port
        }))?;
        self.tool_connect(&json!({
            "patch_id": patch_id,
            "from_node": gain_id, "from_port": gain_out_port,
            "to_node": out_id, "to_port": out_in_port
        }))?;

        // Count nodes: clock + layers (variable) + mixer + delay + reverb + gain + output = layers*N + 5 + clock
        let patch = self.patches.get(patch_id).unwrap();
        let node_count = patch.graph.node_count();

        Ok(json!({
            "built": true,
            "node_count": node_count,
            "layers": recipe.layers.len()
        }))
    }

    /// Build a single layer from a `LayerRecipe`.
    ///
    /// Returns `(output_node_id, output_port_id)` — the final gain node's output
    /// that should be connected to the mixer.
    fn build_layer(
        &mut self,
        patch_id: &str,
        layer: &vibe::LayerRecipe,
        clock_id: u64,
        clock_out_port: u64,
        key: &vibe::Key,
        y: i32,
    ) -> McpResult<(u64, u64)> {
        match layer.role {
            vibe::LayerRole::Rhythm => {
                // Drum: clock → sequencer → drum_node → gain
                let seq_type = layer.sequencer.as_deref().unwrap_or("euclidean");

                let seq_result = self.tool_add_node(&json!({
                    "patch_id": patch_id, "node_type": seq_type,
                    "position": {"x": 200, "y": y}
                }))?;
                let seq_id = seq_result["node_id"].as_u64().unwrap();
                let seq_clock_port = seq_result["inputs"][0]["id"].as_u64().unwrap();

                // Find the gate output port on the sequencer.
                let seq_gate_port = seq_result["outputs"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|p| p["name"] == "gate")
                    .or_else(|| seq_result["outputs"].as_array().unwrap().first())
                    .map(|p| p["id"].as_u64().unwrap())
                    .unwrap();

                // Set sequencer params.
                for (k, v) in &layer.sequencer_params {
                    let _ = self.tool_set_parameter(&json!({
                        "patch_id": patch_id, "node_id": seq_id,
                        "parameter": k, "value": v
                    }));
                }

                // Drum node.
                let drum_result = self.tool_add_node(&json!({
                    "patch_id": patch_id, "node_type": layer.node_type,
                    "position": {"x": 450, "y": y}
                }))?;
                let drum_id = drum_result["node_id"].as_u64().unwrap();
                let drum_trigger_port = drum_result["inputs"][0]["id"].as_u64().unwrap();
                let drum_out_port = drum_result["outputs"][0]["id"].as_u64().unwrap();

                // Gain node.
                let gain_result = self.tool_add_node(&json!({
                    "patch_id": patch_id, "node_type": "gain",
                    "position": {"x": 700, "y": y}
                }))?;
                let gain_id = gain_result["node_id"].as_u64().unwrap();
                let gain_in_port = gain_result["inputs"][0]["id"].as_u64().unwrap();
                let gain_out_port = gain_result["outputs"][0]["id"].as_u64().unwrap();

                self.tool_set_parameter(&json!({
                    "patch_id": patch_id, "node_id": gain_id,
                    "parameter": "gain", "value": layer.volume
                }))?;

                // Connect: clock → sequencer
                self.tool_connect(&json!({
                    "patch_id": patch_id,
                    "from_node": clock_id, "from_port": clock_out_port,
                    "to_node": seq_id, "to_port": seq_clock_port
                }))?;

                // Connect: sequencer gate → drum trigger
                self.tool_connect(&json!({
                    "patch_id": patch_id,
                    "from_node": seq_id, "from_port": seq_gate_port,
                    "to_node": drum_id, "to_port": drum_trigger_port
                }))?;

                // Connect: drum → gain
                self.tool_connect(&json!({
                    "patch_id": patch_id,
                    "from_node": drum_id, "from_port": drum_out_port,
                    "to_node": gain_id, "to_port": gain_in_port
                }))?;

                Ok((gain_id, gain_out_port))
            }
            _ => {
                // Melodic/pad/texture: [clock → sequencer →] source → filter → gain
                let last_id;
                let last_out_port;

                // Optionally add a sequencer.
                if let Some(seq_type) = &layer.sequencer {
                    let seq_result = self.tool_add_node(&json!({
                        "patch_id": patch_id, "node_type": seq_type,
                        "position": {"x": 200, "y": y}
                    }))?;
                    let seq_id = seq_result["node_id"].as_u64().unwrap();
                    let seq_clock_port = seq_result["inputs"][0]["id"].as_u64().unwrap();

                    // Find the freq output port.
                    let seq_freq_port = seq_result["outputs"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|p| p["name"] == "freq")
                        .or_else(|| seq_result["outputs"].as_array().unwrap().first())
                        .map(|p| p["id"].as_u64().unwrap())
                        .unwrap();

                    // Set sequencer params.
                    for (k, v) in &layer.sequencer_params {
                        let _ = self.tool_set_parameter(&json!({
                            "patch_id": patch_id, "node_id": seq_id,
                            "parameter": k, "value": v
                        }));
                    }

                    // Connect clock → sequencer.
                    self.tool_connect(&json!({
                        "patch_id": patch_id,
                        "from_node": clock_id, "from_port": clock_out_port,
                        "to_node": seq_id, "to_port": seq_clock_port
                    }))?;

                    // Source node.
                    if layer.node_type == "noise" {
                        let noise_result = self.tool_add_node(&json!({
                            "patch_id": patch_id, "node_type": "noise",
                            "position": {"x": 450, "y": y}
                        }))?;
                        last_id = noise_result["node_id"].as_u64().unwrap();
                        last_out_port = noise_result["outputs"][0]["id"].as_u64().unwrap();
                    } else {
                        let osc_result = self.tool_add_node(&json!({
                            "patch_id": patch_id, "node_type": "oscillator",
                            "position": {"x": 450, "y": y}
                        }))?;
                        last_id = osc_result["node_id"].as_u64().unwrap();
                        last_out_port = osc_result["outputs"][0]["id"].as_u64().unwrap();

                        self.tool_set_parameter(&json!({
                            "patch_id": patch_id, "node_id": last_id,
                            "parameter": "waveform", "value": layer.waveform as f64
                        }))?;

                        // Set frequency based on octave + key.
                        let base_freq =
                            vibe::key_to_freq(*key) * 2.0f64.powi(layer.octave - 4);
                        self.tool_set_parameter(&json!({
                            "patch_id": patch_id, "node_id": last_id,
                            "parameter": "frequency", "value": base_freq
                        }))?;

                        // Connect sequencer freq → oscillator freq input.
                        // The oscillator has a "freq" input port (index 2).
                        let osc_freq_in = osc_result["inputs"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .find(|p| p["name"] == "freq")
                            .map(|p| p["id"].as_u64().unwrap());
                        if let Some(freq_port) = osc_freq_in {
                            let _ = self.tool_connect(&json!({
                                "patch_id": patch_id,
                                "from_node": seq_id, "from_port": seq_freq_port,
                                "to_node": last_id, "to_port": freq_port
                            }));
                        }
                    }
                } else {
                    // No sequencer — direct source.
                    if layer.node_type == "noise" {
                        let noise_result = self.tool_add_node(&json!({
                            "patch_id": patch_id, "node_type": "noise",
                            "position": {"x": 450, "y": y}
                        }))?;
                        last_id = noise_result["node_id"].as_u64().unwrap();
                        last_out_port = noise_result["outputs"][0]["id"].as_u64().unwrap();
                    } else {
                        let osc_result = self.tool_add_node(&json!({
                            "patch_id": patch_id, "node_type": "oscillator",
                            "position": {"x": 450, "y": y}
                        }))?;
                        last_id = osc_result["node_id"].as_u64().unwrap();
                        last_out_port = osc_result["outputs"][0]["id"].as_u64().unwrap();

                        self.tool_set_parameter(&json!({
                            "patch_id": patch_id, "node_id": last_id,
                            "parameter": "waveform", "value": layer.waveform as f64
                        }))?;

                        let base_freq =
                            vibe::key_to_freq(*key) * 2.0f64.powi(layer.octave - 4);
                        self.tool_set_parameter(&json!({
                            "patch_id": patch_id, "node_id": last_id,
                            "parameter": "frequency", "value": base_freq
                        }))?;
                    }
                }

                // Filter
                let filt_result = self.tool_add_node(&json!({
                    "patch_id": patch_id, "node_type": "filter",
                    "position": {"x": 700, "y": y}
                }))?;
                let filt_id = filt_result["node_id"].as_u64().unwrap();
                let filt_in_port = filt_result["inputs"][0]["id"].as_u64().unwrap();
                let filt_out_port = filt_result["outputs"][0]["id"].as_u64().unwrap();

                self.tool_set_parameter(&json!({
                    "patch_id": patch_id, "node_id": filt_id,
                    "parameter": "cutoff", "value": layer.filter_cutoff
                }))?;
                self.tool_set_parameter(&json!({
                    "patch_id": patch_id, "node_id": filt_id,
                    "parameter": "resonance", "value": layer.filter_resonance
                }))?;

                // Gain
                let gain_result = self.tool_add_node(&json!({
                    "patch_id": patch_id, "node_type": "gain",
                    "position": {"x": 950, "y": y}
                }))?;
                let gain_id = gain_result["node_id"].as_u64().unwrap();
                let gain_in_port = gain_result["inputs"][0]["id"].as_u64().unwrap();
                let gain_out_port = gain_result["outputs"][0]["id"].as_u64().unwrap();

                self.tool_set_parameter(&json!({
                    "patch_id": patch_id, "node_id": gain_id,
                    "parameter": "gain", "value": layer.volume
                }))?;

                // Connect: source → filter → gain
                self.tool_connect(&json!({
                    "patch_id": patch_id,
                    "from_node": last_id, "from_port": last_out_port,
                    "to_node": filt_id, "to_port": filt_in_port
                }))?;
                self.tool_connect(&json!({
                    "patch_id": patch_id,
                    "from_node": filt_id, "from_port": filt_out_port,
                    "to_node": gain_id, "to_port": gain_in_port
                }))?;

                Ok((gain_id, gain_out_port))
            }
        }
    }

    // ────────────────────────────────────────────
    // Auto-fix helpers
    // ────────────────────────────────────────────

    /// Bypass a node by disconnecting it and reconnecting its inputs to its outputs.
    fn apply_bypass_node(
        &mut self,
        patch_id: &str,
        target_node_id: NodeId,
    ) -> McpResult<Value> {
        let patch = self
            .patches
            .get_mut(patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.to_string()))?;

        if patch.graph.node(&target_node_id).is_none() {
            return Err(McpError::NodeNotFound(format!("{}", target_node_id.0)));
        }

        // Find incoming and outgoing connections.
        let incoming: Vec<_> = patch
            .graph
            .connections()
            .iter()
            .filter(|c| c.to_node == target_node_id)
            .map(|c| (c.id, c.from_node, c.from_port))
            .collect();

        let outgoing: Vec<_> = patch
            .graph
            .connections()
            .iter()
            .filter(|c| c.from_node == target_node_id)
            .map(|c| (c.id, c.to_node, c.to_port))
            .collect();

        // Remove all connections to/from the target node.
        let mut removed_ids = Vec::new();
        for (conn_id, _, _) in &incoming {
            patch.graph.disconnect(conn_id);
            removed_ids.push(conn_id.0);
        }
        for (conn_id, _, _) in &outgoing {
            patch.graph.disconnect(conn_id);
            removed_ids.push(conn_id.0);
        }

        // Reconnect: wire each incoming source directly to each outgoing destination.
        let mut new_connections = Vec::new();
        for (_, from_node, from_port) in &incoming {
            for (_, to_node, to_port) in &outgoing {
                if let Ok(conn_id) = patch.graph.connect(*from_node, *from_port, *to_node, *to_port) {
                    new_connections.push(conn_id.0);
                }
            }
        }

        Ok(json!({
            "applied": true,
            "description": format!("Bypassed node {} — reconnected {} input(s) to {} output(s)", target_node_id.0, incoming.len(), outgoing.len()),
            "removed_connections": removed_ids,
            "new_connections": new_connections,
        }))
    }

    // ────────────────────────────────────────────
    // Portable patch file tools
    // ────────────────────────────────────────────

    /// `save_patch_file` — Serialize the current patch to the portable JSON format.
    fn tool_save_patch_file(&self, args: &Value) -> McpResult<Value> {
        let patch_id = get_string(args, "patch_id")?;

        let patch_state = self.patches.get(&patch_id)
            .ok_or_else(|| McpError::PatchNotFound(patch_id.clone()))?;

        let mut patch_file = PatchFile::new(&patch_id);

        // Serialize all nodes.
        for (node_id, desc) in patch_state.graph.nodes() {
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
        for conn in patch_state.graph.connections() {
            let from_port_name = patch_state.graph.node(&conn.from_node)
                .and_then(|n| n.outputs.iter().find(|p| p.id == conn.from_port).map(|p| p.name.clone()))
                .unwrap_or_else(|| conn.from_port.0.to_string());
            let to_port_name = patch_state.graph.node(&conn.to_node)
                .and_then(|n| n.inputs.iter().find(|p| p.id == conn.to_port).map(|p| p.name.clone()))
                .unwrap_or_else(|| conn.to_port.0.to_string());

            patch_file.connections.push(ConnectionEntry {
                from: format!("{}:{}", conn.from_node.0, from_port_name),
                to: format!("{}:{}", conn.to_node.0, to_port_name),
            });
        }

        patch_file.metadata.created_by = "chord-mcp".into();

        Ok(json!({
            "patch_json": patch_file.to_json(),
            "node_count": patch_file.nodes.len(),
            "connection_count": patch_file.connections.len(),
        }))
    }

    /// `load_patch_file` — Load a patch from the portable JSON format and rebuild it.
    fn tool_load_patch_file(&mut self, args: &Value) -> McpResult<Value> {
        let json_str = get_string(args, "patch_json")?;
        let patch_file = PatchFile::from_json(&json_str)
            .map_err(McpError::InvalidArguments)?;

        // Create a new patch.
        let patch_id = format!("patch_{}", self.next_patch_id);
        self.next_patch_id += 1;
        self.patches.insert(patch_id.clone(), PatchState {
            graph: Graph::new(),
            diagnostics: DiagnosticEngine::default(),
        });

        // Add all nodes, tracking old ID → new node_id mapping.
        let mut id_map: HashMap<String, u64> = HashMap::new();
        for node_entry in &patch_file.nodes {
            let add_result = self.tool_add_node(&json!({
                "patch_id": patch_id,
                "node_type": node_entry.node_type,
                "position": {"x": node_entry.position.x, "y": node_entry.position.y}
            }))?;
            if let Some(nid) = add_result.get("node_id").and_then(|v| v.as_u64()) {
                id_map.insert(node_entry.id.clone(), nid);
                // Set parameters.
                for (param, value) in &node_entry.params {
                    let _ = self.tool_set_parameter(&json!({
                        "patch_id": patch_id,
                        "node_id": nid,
                        "parameter": param,
                        "value": value
                    }));
                }
            }
        }

        // Add connections using port names — resolve to port IDs via the graph.
        let mut connections_loaded = 0;
        for conn in &patch_file.connections {
            let (from_id_str, from_port_name) = conn.from.split_once(':').unwrap_or(("", ""));
            let (to_id_str, to_port_name) = conn.to.split_once(':').unwrap_or(("", ""));

            if let (Some(&from_nid), Some(&to_nid)) = (id_map.get(from_id_str), id_map.get(to_id_str)) {
                let from_node_id = NodeId(from_nid);
                let to_node_id = NodeId(to_nid);

                // Resolve port names to port IDs.
                let patch = self.patches.get(&patch_id).unwrap();
                let from_port_id = patch.graph.node(&from_node_id)
                    .and_then(|n| n.outputs.iter().find(|p| p.name == from_port_name).map(|p| p.id));
                let to_port_id = patch.graph.node(&to_node_id)
                    .and_then(|n| n.inputs.iter().find(|p| p.name == to_port_name).map(|p| p.id));

                if let (Some(from_port), Some(to_port)) = (from_port_id, to_port_id) {
                    let _ = self.tool_connect(&json!({
                        "patch_id": patch_id,
                        "from_node": from_nid,
                        "from_port": from_port.0,
                        "to_node": to_nid,
                        "to_port": to_port.0
                    }));
                    connections_loaded += 1;
                }
            }
        }

        Ok(json!({
            "patch_id": patch_id,
            "name": patch_file.name,
            "nodes_loaded": id_map.len(),
            "connections_loaded": connections_loaded,
        }))
    }
}

// ────────────────────────────────────────────
// Helper functions
// ────────────────────────────────────────────

/// Extract a required string field from a JSON object.
fn get_string(args: &Value, field: &str) -> McpResult<String> {
    args.get(field)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| McpError::InvalidArguments(format!("Missing or invalid '{field}' field")))
}

/// Extract a required u64 field from a JSON object.
fn get_u64(args: &Value, field: &str) -> McpResult<u64> {
    args.get(field)
        .and_then(|v| v.as_u64())
        .ok_or_else(|| McpError::InvalidArguments(format!("Missing or invalid '{field}' field")))
}

/// Extract a required f64 field from a JSON object.
fn get_f64(args: &Value, field: &str) -> McpResult<f64> {
    args.get(field)
        .and_then(|v| v.as_f64())
        .ok_or_else(|| McpError::InvalidArguments(format!("Missing or invalid '{field}' field")))
}

/// Build a `NodeDescriptor` for a known node type, including all ports and parameters.
///
/// This is the canonical mapping from node type string to the graph-level descriptor.
/// Each node type gets the correct input/output ports and parameter descriptors
/// matching what the runtime nodes expect.
fn build_node_descriptor(node_type: &str) -> NodeDescriptor {
    match node_type {
        "oscillator" => NodeDescriptor::new("oscillator")
            .with_input(PortDescriptor::new("fm", PortDataType::Audio))
            .with_input(PortDescriptor::new("am", PortDataType::Audio))
            .with_input(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("frequency", "Frequency", 440.0, 0.1, 20000.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("detune", "Detune", 0.0, -1200.0, 1200.0).with_unit("cents"))
            .with_parameter(ParameterDescriptor::new("waveform", "Waveform", 0.0, 0.0, 3.0))
            .with_parameter(ParameterDescriptor::new("gain", "Gain", 1.0, 0.0, 2.0))
            .with_parameter(ParameterDescriptor::new("pulse_width", "Pulse Width", 0.5, 0.01, 0.99)),

        "filter" => NodeDescriptor::new("filter")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("cutoff_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("resonance_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("cutoff", "Cutoff", 1000.0, 20.0, 20000.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("resonance", "Resonance", 0.707, 0.1, 30.0))
            .with_parameter(ParameterDescriptor::new("mode", "Mode", 0.0, 0.0, 3.0)),

        "gain" => NodeDescriptor::new("gain")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("gain_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("gain", "Gain", 1.0, 0.0, 10.0)),

        "envelope" => NodeDescriptor::new("envelope")
            .with_input(PortDescriptor::new("gate", PortDataType::Audio))
            .with_input(PortDescriptor::new("attack_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("decay_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("sustain_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("release_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("attack", "Attack", 0.01, 0.0, 10.0).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("decay", "Decay", 0.1, 0.0, 10.0).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("sustain", "Sustain", 0.7, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("release", "Release", 0.3, 0.0, 30.0).with_unit("s")),

        "lfo" => NodeDescriptor::new("lfo")
            .with_input(PortDescriptor::new("rate_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("depth_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("rate", "Rate", 1.0, 0.01, 100.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("depth", "Depth", 1.0, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("waveform", "Waveform", 0.0, 0.0, 3.0)),

        "mixer" => NodeDescriptor::new("mixer")
            .with_input(PortDescriptor::new("in1", PortDataType::Audio))
            .with_input(PortDescriptor::new("in2", PortDataType::Audio))
            .with_input(PortDescriptor::new("in3", PortDataType::Audio))
            .with_input(PortDescriptor::new("in4", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),

        "output" => NodeDescriptor::new("output")
            .with_input(PortDescriptor::new("in", PortDataType::Audio)),

        "midi_to_freq" => NodeDescriptor::new("midi_to_freq")
            .with_input(PortDescriptor::new("midi", PortDataType::Midi))
            .with_output(PortDescriptor::new("freq", PortDataType::Control))
            .with_output(PortDescriptor::new("gate", PortDataType::Control)),

        "delay" => NodeDescriptor::new("delay")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("time_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("feedback_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("time", "Delay Time", 0.5, 0.0, 5.0).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("feedback", "Feedback", 0.3, 0.0, 0.99))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 0.5, 0.0, 1.0)),

        "reverb" => NodeDescriptor::new("reverb")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("room_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("mix_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("room_size", "Room Size", 0.5, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("damping", "Damping", 0.5, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 0.3, 0.0, 1.0)),

        "compressor" => NodeDescriptor::new("compressor")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("threshold_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("ratio_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("threshold", "Threshold", -20.0, -60.0, 0.0).with_unit("dB"))
            .with_parameter(ParameterDescriptor::new("ratio", "Ratio", 4.0, 1.0, 20.0))
            .with_parameter(ParameterDescriptor::new("attack", "Attack", 0.01, 0.001, 1.0).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("release", "Release", 0.1, 0.01, 2.0).with_unit("s")),

        "eq" => NodeDescriptor::new("eq")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("low_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("mid_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("high_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("low_gain", "Low Gain", 0.0, -24.0, 24.0).with_unit("dB"))
            .with_parameter(ParameterDescriptor::new("mid_gain", "Mid Gain", 0.0, -24.0, 24.0).with_unit("dB"))
            .with_parameter(ParameterDescriptor::new("high_gain", "High Gain", 0.0, -24.0, 24.0).with_unit("dB")),

        "expression" => NodeDescriptor::new("expression")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("freq", "Frequency", 440.0, 0.1, 20000.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("param1", "Param 1", 0.5, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("param2", "Param 2", 0.5, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("preset", "Preset", 0.0, 0.0, 7.0)),

        "note_to_freq" => NodeDescriptor::new("note_to_freq")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("a4_freq", "Concert A", 440.0, 400.0, 480.0).with_unit("Hz")),

        "noise" => NodeDescriptor::new("noise")
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("color", "Color", 0.0, 0.0, 2.0)),

        "step_sequencer" => NodeDescriptor::new("step_sequencer")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("steps", "Steps", 8.0, 1.0, 32.0))
            .with_parameter(ParameterDescriptor::new("gate_length", "Gate Length", 0.5, 0.0, 1.0)),

        "euclidean" => NodeDescriptor::new("euclidean")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("steps", "Steps", 16.0, 1.0, 32.0))
            .with_parameter(ParameterDescriptor::new("pulses", "Pulses", 4.0, 0.0, 32.0))
            .with_parameter(ParameterDescriptor::new("rotation", "Rotation", 0.0, 0.0, 31.0)),

        "gravity_sequencer" => NodeDescriptor::new("gravity_sequencer")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("gravity", "Gravity", 1.0, 0.01, 10.0))
            .with_parameter(ParameterDescriptor::new("num_particles", "Particles", 4.0, 1.0, 16.0))
            .with_parameter(ParameterDescriptor::new("scale", "Scale", 0.0, 0.0, 11.0)),

        "game_of_life_sequencer" => NodeDescriptor::new("game_of_life_sequencer")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("width", "Width", 16.0, 4.0, 32.0))
            .with_parameter(ParameterDescriptor::new("height", "Height", 8.0, 4.0, 16.0))
            .with_parameter(ParameterDescriptor::new("density", "Density", 0.3, 0.0, 1.0)),

        "markov_sequencer" => NodeDescriptor::new("markov_sequencer")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("freq", PortDataType::Audio))
            .with_output(PortDescriptor::new("gate", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("randomness", "Randomness", 0.3, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("root_note", "Root Note", 60.0, 0.0, 127.0))
            .with_parameter(ParameterDescriptor::new("scale_type", "Scale", 0.0, 0.0, 3.0)),

        "polyrhythm" => NodeDescriptor::new("polyrhythm")
            .with_input(PortDescriptor::new("clock", PortDataType::Audio))
            .with_output(PortDescriptor::new("a", PortDataType::Audio))
            .with_output(PortDescriptor::new("b", PortDataType::Audio))
            .with_output(PortDescriptor::new("c", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("pattern_a", "Pattern A", 3.0, 2.0, 16.0))
            .with_parameter(ParameterDescriptor::new("pattern_b", "Pattern B", 4.0, 2.0, 16.0))
            .with_parameter(ParameterDescriptor::new("pattern_c", "Pattern C", 5.0, 2.0, 16.0)),

        "granular" => NodeDescriptor::new("granular")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("pitch_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("grain_size_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("scatter_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("density_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("grain_size", "Grain Size", 0.05, 0.01, 0.2).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("density", "Density", 10.0, 1.0, 50.0))
            .with_parameter(ParameterDescriptor::new("pitch", "Pitch", 0.0, -24.0, 24.0).with_unit("st"))
            .with_parameter(ParameterDescriptor::new("scatter", "Scatter", 0.0, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 1.0, 0.0, 1.0)),

        "vocoder" => NodeDescriptor::new("vocoder")
            .with_input(PortDescriptor::new("carrier", PortDataType::Audio))
            .with_input(PortDescriptor::new("modulator", PortDataType::Audio))
            .with_input(PortDescriptor::new("mix_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("bands", "Bands", 16.0, 1.0, 16.0))
            .with_parameter(ParameterDescriptor::new("attack", "Attack", 5.0, 1.0, 100.0).with_unit("ms"))
            .with_parameter(ParameterDescriptor::new("release", "Release", 50.0, 10.0, 500.0).with_unit("ms"))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 1.0, 0.0, 1.0)),

        "chorus" => NodeDescriptor::new("chorus")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("rate_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("depth_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("rate", "Rate", 1.0, 0.1, 10.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("depth", "Depth", 0.5, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 0.5, 0.0, 1.0)),

        "phaser" => NodeDescriptor::new("phaser")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("rate_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("depth_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("rate", "Rate", 0.5, 0.1, 10.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("depth", "Depth", 0.5, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 0.5, 0.0, 1.0)),

        "waveshaper" => NodeDescriptor::new("waveshaper")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("drive_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("drive", "Drive", 1.0, 0.0, 10.0))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 1.0, 0.0, 1.0)),

        "ring_modulator" => NodeDescriptor::new("ring_modulator")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("mix_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 1.0, 0.0, 1.0)),

        "crossfader" => NodeDescriptor::new("crossfader")
            .with_input(PortDescriptor::new("a", PortDataType::Audio))
            .with_input(PortDescriptor::new("b", PortDataType::Audio))
            .with_input(PortDescriptor::new("position_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("position", "Position", 0.5, 0.0, 1.0)),

        "pitch_shifter" => NodeDescriptor::new("pitch_shifter")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("semitones_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("semitones", "Semitones", 0.0, -24.0, 24.0).with_unit("st"))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 1.0, 0.0, 1.0)),

        "limiter" => NodeDescriptor::new("limiter")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("ceiling_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("ceiling", "Ceiling", -0.3, -24.0, 0.0).with_unit("dB"))
            .with_parameter(ParameterDescriptor::new("release", "Release", 0.1, 0.01, 2.0).with_unit("s")),

        "gate" => NodeDescriptor::new("gate")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("threshold_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("threshold", "Threshold", -40.0, -80.0, 0.0).with_unit("dB"))
            .with_parameter(ParameterDescriptor::new("attack", "Attack", 0.001, 0.0, 1.0).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("hold", "Hold", 0.01, 0.0, 1.0).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("release", "Release", 0.1, 0.0, 2.0).with_unit("s")),

        "stereo" => NodeDescriptor::new("stereo")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("width_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("width", "Width", 1.0, 0.0, 2.0)),

        "convolution_reverb" => NodeDescriptor::new("convolution_reverb")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("mix_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("decay", "Decay", 1.5, 0.1, 5.0).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("brightness", "Brightness", 0.5, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("predelay", "Pre-delay", 10.0, 0.0, 100.0).with_unit("ms"))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 0.3, 0.0, 1.0)),

        "spectral" => NodeDescriptor::new("spectral")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("shift_mod", PortDataType::Audio))
            .with_input(PortDescriptor::new("mix_mod", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("freeze", "Freeze", 0.0, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("blur", "Blur", 0.0, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("shift", "Shift", 0.0, -512.0, 512.0).with_unit("bins"))
            .with_parameter(ParameterDescriptor::new("mix", "Mix", 1.0, 0.0, 1.0)),

        "sample_and_hold" => NodeDescriptor::new("sample_and_hold")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_input(PortDescriptor::new("trigger", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),

        "quantizer" => NodeDescriptor::new("quantizer")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("scale", "Scale", 0.0, 0.0, 11.0)),

        "dc_blocker" => NodeDescriptor::new("dc_blocker")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),

        "kick_drum" => NodeDescriptor::new("kick_drum")
            .with_input(PortDescriptor::new("trigger", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("pitch_start", "Pitch Start", 150.0, 50.0, 500.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("pitch_end", "Pitch End", 45.0, 20.0, 200.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("pitch_decay", "Pitch Decay", 0.05, 0.01, 0.3).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("decay", "Decay", 0.3, 0.05, 2.0).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("click", "Click", 0.3, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("drive", "Drive", 0.2, 0.0, 1.0)),

        "snare_drum" => NodeDescriptor::new("snare_drum")
            .with_input(PortDescriptor::new("trigger", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("tone", "Tone", 200.0, 100.0, 400.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("decay", "Decay", 0.15, 0.05, 1.0).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("snappy", "Snappy", 0.5, 0.0, 1.0)),

        "hi_hat" => NodeDescriptor::new("hi_hat")
            .with_input(PortDescriptor::new("trigger", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("decay", "Decay", 0.05, 0.01, 0.5).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("tone", "Tone", 8000.0, 2000.0, 16000.0).with_unit("Hz")),

        "clap" => NodeDescriptor::new("clap")
            .with_input(PortDescriptor::new("trigger", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("decay", "Decay", 0.15, 0.05, 0.5).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("tone", "Tone", 1000.0, 500.0, 4000.0).with_unit("Hz")),

        "tom" => NodeDescriptor::new("tom")
            .with_input(PortDescriptor::new("trigger", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("pitch", "Pitch", 100.0, 40.0, 300.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("decay", "Decay", 0.2, 0.05, 1.0).with_unit("s")),

        // Fallback for unknown types — creates a minimal pass-through descriptor.
        other => NodeDescriptor::new(other)
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio)),
    }
}

/// Serialize a `Graph` into a human-friendly JSON representation.
fn serialize_graph(graph: &Graph, patch_id: &str) -> Value {
    let nodes: Vec<Value> = graph
        .nodes()
        .iter()
        .map(|(id, desc)| {
            let inputs: Vec<Value> = desc
                .inputs
                .iter()
                .map(|p| {
                    json!({
                        "id": p.id.0,
                        "name": p.name,
                        "data_type": format!("{}", p.data_type),
                    })
                })
                .collect();
            let outputs: Vec<Value> = desc
                .outputs
                .iter()
                .map(|p| {
                    json!({
                        "id": p.id.0,
                        "name": p.name,
                        "data_type": format!("{}", p.data_type),
                    })
                })
                .collect();
            let parameters: Vec<Value> = desc
                .parameters
                .iter()
                .map(|p| {
                    json!({
                        "id": p.id,
                        "name": p.name,
                        "value": p.value,
                        "min": p.min,
                        "max": p.max,
                        "unit": p.unit,
                    })
                })
                .collect();

            json!({
                "node_id": id.0,
                "node_type": desc.node_type,
                "position": { "x": desc.position.0, "y": desc.position.1 },
                "inputs": inputs,
                "outputs": outputs,
                "parameters": parameters,
            })
        })
        .collect();

    let connections: Vec<Value> = graph
        .connections()
        .iter()
        .map(|c| {
            json!({
                "connection_id": c.id.0,
                "from_node": c.from_node.0,
                "from_port": c.from_port.0,
                "to_node": c.to_node.0,
                "to_port": c.to_port.0,
            })
        })
        .collect();

    json!({
        "patch_id": patch_id,
        "node_count": graph.node_count(),
        "connection_count": graph.connection_count(),
        "nodes": nodes,
        "connections": connections,
    })
}
