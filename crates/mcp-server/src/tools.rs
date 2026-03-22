//! Tool definitions — describes all available MCP tools with their JSON schemas.

use crate::types::ToolDefinition;
use serde_json::json;

/// Returns the definitions for all MCP tools exposed by the Chord server.
pub fn all_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "list_node_types".to_string(),
            description: "Returns all available node types with their port and parameter info."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "create_patch".to_string(),
            description: "Creates a new empty patch (audio graph). Returns a patch_id."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "add_node".to_string(),
            description: "Adds a node of a given type to the current patch. Returns the node_id and port info.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch to add the node to."
                    },
                    "node_type": {
                        "type": "string",
                        "description": "The type of node to add (e.g. 'oscillator', 'gain', 'filter')."
                    },
                    "position": {
                        "type": "object",
                        "properties": {
                            "x": { "type": "number" },
                            "y": { "type": "number" }
                        },
                        "description": "Canvas position for the node."
                    }
                },
                "required": ["patch_id", "node_type"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "remove_node".to_string(),
            description: "Removes a node from the patch. Also removes all its connections."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch containing the node."
                    },
                    "node_id": {
                        "type": "integer",
                        "description": "The ID of the node to remove."
                    }
                },
                "required": ["patch_id", "node_id"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "connect".to_string(),
            description: "Connects an output port on one node to an input port on another node. Returns the connection_id.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch containing the nodes."
                    },
                    "from_node": {
                        "type": "integer",
                        "description": "Source node ID."
                    },
                    "from_port": {
                        "type": "integer",
                        "description": "Source output port ID."
                    },
                    "to_node": {
                        "type": "integer",
                        "description": "Destination node ID."
                    },
                    "to_port": {
                        "type": "integer",
                        "description": "Destination input port ID."
                    }
                },
                "required": ["patch_id", "from_node", "from_port", "to_node", "to_port"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "disconnect".to_string(),
            description: "Removes a connection from the patch.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch containing the connection."
                    },
                    "connection_id": {
                        "type": "integer",
                        "description": "The ID of the connection to remove."
                    }
                },
                "required": ["patch_id", "connection_id"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "set_parameter".to_string(),
            description: "Sets a parameter value on a node.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch containing the node."
                    },
                    "node_id": {
                        "type": "integer",
                        "description": "The node to set the parameter on."
                    },
                    "parameter": {
                        "type": "string",
                        "description": "The parameter ID (e.g. 'frequency', 'gain')."
                    },
                    "value": {
                        "type": "number",
                        "description": "The new parameter value."
                    }
                },
                "required": ["patch_id", "node_id", "parameter", "value"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "get_patch".to_string(),
            description:
                "Returns the current patch as JSON, including all nodes, connections, and parameters."
                    .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch to retrieve."
                    }
                },
                "required": ["patch_id"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "compile_patch".to_string(),
            description: "Compiles the graph and returns the compilation result (execution order, buffer layout) or errors.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch to compile."
                    }
                },
                "required": ["patch_id"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "run_diagnostics".to_string(),
            description: "Runs diagnostics on the current patch and returns a health report."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch to diagnose."
                    }
                },
                "required": ["patch_id"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "export_patch".to_string(),
            description: "Serializes the patch to JSON for save/load.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch to export."
                    }
                },
                "required": ["patch_id"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "get_signal_stats".to_string(),
            description: "Get real-time signal statistics for a specific node/port. Returns peak, rms, dc_offset, crest_factor, zero_crossing_rate, has_nan, has_inf, click_count, clip_count, silent_buffer_count.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch containing the node."
                    },
                    "node_id": {
                        "type": "integer",
                        "description": "The node to get stats for."
                    },
                    "port_id": {
                        "type": "integer",
                        "description": "The port to get stats for."
                    }
                },
                "required": ["patch_id", "node_id", "port_id"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "find_problems".to_string(),
            description: "List all detected problems in the patch with severity and suggested auto-fixes. Each problem includes category, severity, description, node_id, and an auto_fix suggestion.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch to check for problems."
                    }
                },
                "required": ["patch_id"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "get_cpu_profile".to_string(),
            description: "Get per-node CPU profiling data including DSP load percentage, per-node timing, underrun count, and spike count.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch to profile."
                    }
                },
                "required": ["patch_id"],
                "additionalProperties": false
            }),
        },
        ToolDefinition {
            name: "auto_fix".to_string(),
            description: "Apply a suggested fix for a detected problem. Fix types: InsertGain (adds a gain node), InsertDcBlocker (adds a DC blocker), InsertLimiter (adds a limiter), MuteNode (mutes a node), BypassNode (bypasses a node), IncreaseBufferSize (increases buffer size).".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "patch_id": {
                        "type": "string",
                        "description": "The patch to apply the fix to."
                    },
                    "fix": {
                        "type": "object",
                        "description": "The fix to apply. Must have a 'type' field: 'InsertGain' (with 'node_id' and 'gain'), 'InsertDcBlocker' (with 'node_id'), 'InsertLimiter' (with 'node_id'), 'MuteNode' (with 'node_id'), 'BypassNode' (with 'node_id'), or 'IncreaseBufferSize' (with 'size').",
                        "properties": {
                            "type": {
                                "type": "string",
                                "description": "Fix type: InsertGain, InsertDcBlocker, InsertLimiter, MuteNode, BypassNode, IncreaseBufferSize"
                            },
                            "node_id": {
                                "type": "integer",
                                "description": "The node to apply the fix to (required for node-level fixes)."
                            },
                            "gain": {
                                "type": "number",
                                "description": "Gain value for InsertGain fix."
                            },
                            "size": {
                                "type": "integer",
                                "description": "New buffer size for IncreaseBufferSize fix."
                            }
                        },
                        "required": ["type"]
                    }
                },
                "required": ["patch_id", "fix"],
                "additionalProperties": false
            }),
        },
    ]
}
