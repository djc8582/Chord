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
    ]
}
