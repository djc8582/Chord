//! The MCP server implementation — routes tool calls to graph operations.

use std::collections::HashMap;

use chord_audio_graph::{
    CompileError, ConnectionId, Graph, GraphCompiler, NodeDescriptor, NodeId, ParameterDescriptor,
    PortDataType, PortDescriptor, PortId,
};
use chord_diagnostics::{DiagnosticEngine, DiagnosticReport};
use chord_node_library::NodeRegistry;
use serde_json::{json, Value};

use crate::tools::all_tool_definitions;
use crate::types::{McpError, McpResult, ToolDefinition};

/// Holds one patch (graph) along with its associated diagnostic engine.
struct PatchState {
    graph: Graph,
    diagnostics: DiagnosticEngine,
}

/// The MCP server that exposes Chord's audio graph tools to AI assistants.
///
/// Manages patches (audio graphs), routes tool calls, and returns JSON results.
/// Thread-safe access is the caller's responsibility; this struct is `Send` but not `Sync`.
pub struct ChordMcpServer {
    /// Active patches keyed by patch ID.
    patches: HashMap<String, PatchState>,
    /// Node registry for looking up node type information.
    registry: NodeRegistry,
    /// Counter for generating unique patch IDs.
    next_patch_id: u64,
}

impl Default for ChordMcpServer {
    fn default() -> Self {
        Self::new()
    }
}

impl ChordMcpServer {
    /// Create a new MCP server with the default Wave 1 node registry.
    pub fn new() -> Self {
        Self {
            patches: HashMap::new(),
            registry: NodeRegistry::with_wave1(),
            next_patch_id: 1,
        }
    }

    /// Return all available tool definitions.
    pub fn list_tools(&self) -> Vec<ToolDefinition> {
        all_tool_definitions()
    }

    /// Dispatch a tool call by name with the given JSON arguments.
    ///
    /// Returns `Ok(Value)` on success or `Err(McpError)` on failure.
    pub fn call_tool(&mut self, name: &str, args: Value) -> McpResult<Value> {
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
            _ => Err(McpError::UnknownTool(name.to_string())),
        }
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
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("frequency", "Frequency", 440.0, 0.1, 20000.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("detune", "Detune", 0.0, -1200.0, 1200.0).with_unit("cents"))
            .with_parameter(ParameterDescriptor::new("waveform", "Waveform", 0.0, 0.0, 3.0)),

        "filter" => NodeDescriptor::new("filter")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("cutoff", "Cutoff", 1000.0, 20.0, 20000.0).with_unit("Hz"))
            .with_parameter(ParameterDescriptor::new("resonance", "Resonance", 0.707, 0.1, 30.0))
            .with_parameter(ParameterDescriptor::new("mode", "Mode", 0.0, 0.0, 2.0)),

        "gain" => NodeDescriptor::new("gain")
            .with_input(PortDescriptor::new("in", PortDataType::Audio))
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_parameter(ParameterDescriptor::new("gain", "Gain", 1.0, 0.0, 10.0)),

        "envelope" => NodeDescriptor::new("envelope")
            .with_input(PortDescriptor::new("gate", PortDataType::Control))
            .with_output(PortDescriptor::new("out", PortDataType::Control))
            .with_parameter(ParameterDescriptor::new("attack", "Attack", 0.01, 0.0, 10.0).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("decay", "Decay", 0.1, 0.0, 10.0).with_unit("s"))
            .with_parameter(ParameterDescriptor::new("sustain", "Sustain", 0.7, 0.0, 1.0))
            .with_parameter(ParameterDescriptor::new("release", "Release", 0.3, 0.0, 30.0).with_unit("s")),

        "lfo" => NodeDescriptor::new("lfo")
            .with_output(PortDescriptor::new("out", PortDataType::Control))
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
