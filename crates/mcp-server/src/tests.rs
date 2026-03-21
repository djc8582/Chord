//! Tests for the MCP server.

use serde_json::json;

use crate::ChordMcpServer;

// ────────────────────────────────────────────
// Tool discovery
// ────────────────────────────────────────────

#[test]
fn list_tools_returns_all_expected_tools() {
    let server = ChordMcpServer::new();
    let tools = server.list_tools();

    let expected_names = [
        "list_node_types",
        "create_patch",
        "add_node",
        "remove_node",
        "connect",
        "disconnect",
        "set_parameter",
        "get_patch",
        "compile_patch",
        "run_diagnostics",
        "export_patch",
    ];

    assert_eq!(tools.len(), expected_names.len());

    for expected in &expected_names {
        assert!(
            tools.iter().any(|t| t.name == *expected),
            "Missing tool: {expected}"
        );
    }

    // Every tool should have a non-empty description and valid input_schema.
    for tool in &tools {
        assert!(!tool.description.is_empty(), "Tool {} has empty description", tool.name);
        assert!(tool.input_schema.is_object(), "Tool {} has non-object schema", tool.name);
    }
}

// ────────────────────────────────────────────
// End-to-end: create → add → connect → compile
// ────────────────────────────────────────────

#[test]
fn create_add_connect_compile_end_to_end() {
    let mut server = ChordMcpServer::new();

    // Create a patch.
    let create_result = server.call_tool("create_patch", json!({})).unwrap();
    let patch_id = create_result["patch_id"].as_str().unwrap().to_string();

    // Add an oscillator.
    let osc_result = server
        .call_tool(
            "add_node",
            json!({
                "patch_id": patch_id,
                "node_type": "oscillator",
                "position": { "x": 100.0, "y": 200.0 }
            }),
        )
        .unwrap();
    let osc_id = osc_result["node_id"].as_u64().unwrap();
    let osc_out_port = osc_result["outputs"][0]["id"].as_u64().unwrap();

    // Add a gain node.
    let gain_result = server
        .call_tool(
            "add_node",
            json!({
                "patch_id": patch_id,
                "node_type": "gain",
            }),
        )
        .unwrap();
    let gain_id = gain_result["node_id"].as_u64().unwrap();
    let gain_in_port = gain_result["inputs"][0]["id"].as_u64().unwrap();
    let gain_out_port = gain_result["outputs"][0]["id"].as_u64().unwrap();

    // Add an output node.
    let output_result = server
        .call_tool(
            "add_node",
            json!({
                "patch_id": patch_id,
                "node_type": "output",
            }),
        )
        .unwrap();
    let output_id = output_result["node_id"].as_u64().unwrap();
    let output_in_port = output_result["inputs"][0]["id"].as_u64().unwrap();

    // Connect osc → gain.
    let conn1 = server
        .call_tool(
            "connect",
            json!({
                "patch_id": patch_id,
                "from_node": osc_id,
                "from_port": osc_out_port,
                "to_node": gain_id,
                "to_port": gain_in_port,
            }),
        )
        .unwrap();
    assert!(conn1.get("connection_id").is_some());

    // Connect gain → output.
    let conn2 = server
        .call_tool(
            "connect",
            json!({
                "patch_id": patch_id,
                "from_node": gain_id,
                "from_port": gain_out_port,
                "to_node": output_id,
                "to_port": output_in_port,
            }),
        )
        .unwrap();
    assert!(conn2.get("connection_id").is_some());

    // Compile the patch.
    let compile_result = server
        .call_tool("compile_patch", json!({ "patch_id": patch_id }))
        .unwrap();
    assert_eq!(compile_result["success"], true);

    let exec_order = compile_result["execution_order"].as_array().unwrap();
    assert_eq!(exec_order.len(), 3);

    // The oscillator should come before gain, and gain before output in execution order.
    let osc_pos = exec_order.iter().position(|v| v.as_u64().unwrap() == osc_id).unwrap();
    let gain_pos = exec_order.iter().position(|v| v.as_u64().unwrap() == gain_id).unwrap();
    let output_pos = exec_order
        .iter()
        .position(|v| v.as_u64().unwrap() == output_id)
        .unwrap();
    assert!(osc_pos < gain_pos);
    assert!(gain_pos < output_pos);
}

// ────────────────────────────────────────────
// set_parameter changes value
// ────────────────────────────────────────────

#[test]
fn set_parameter_changes_node_parameter() {
    let mut server = ChordMcpServer::new();

    let create_result = server.call_tool("create_patch", json!({})).unwrap();
    let patch_id = create_result["patch_id"].as_str().unwrap().to_string();

    let osc_result = server
        .call_tool(
            "add_node",
            json!({ "patch_id": patch_id, "node_type": "oscillator" }),
        )
        .unwrap();
    let osc_id = osc_result["node_id"].as_u64().unwrap();

    // Set frequency to 880 Hz.
    let set_result = server
        .call_tool(
            "set_parameter",
            json!({
                "patch_id": patch_id,
                "node_id": osc_id,
                "parameter": "frequency",
                "value": 880.0,
            }),
        )
        .unwrap();
    assert_eq!(set_result["value"], 880.0);
    assert_eq!(set_result["clamped"], false);

    // Verify via get_patch.
    let patch_result = server
        .call_tool("get_patch", json!({ "patch_id": patch_id }))
        .unwrap();
    let nodes = patch_result["nodes"].as_array().unwrap();
    assert_eq!(nodes.len(), 1);

    let node = &nodes[0];
    let freq_param = node["parameters"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == "frequency")
        .unwrap();
    assert_eq!(freq_param["value"], 880.0);
}

#[test]
fn set_parameter_clamps_to_range() {
    let mut server = ChordMcpServer::new();

    let create_result = server.call_tool("create_patch", json!({})).unwrap();
    let patch_id = create_result["patch_id"].as_str().unwrap().to_string();

    let osc_result = server
        .call_tool(
            "add_node",
            json!({ "patch_id": patch_id, "node_type": "oscillator" }),
        )
        .unwrap();
    let osc_id = osc_result["node_id"].as_u64().unwrap();

    // Set frequency way above max (20000).
    let set_result = server
        .call_tool(
            "set_parameter",
            json!({
                "patch_id": patch_id,
                "node_id": osc_id,
                "parameter": "frequency",
                "value": 99999.0,
            }),
        )
        .unwrap();
    assert_eq!(set_result["value"], 20000.0);
    assert_eq!(set_result["clamped"], true);
}

// ────────────────────────────────────────────
// get_patch returns complete state
// ────────────────────────────────────────────

#[test]
fn get_patch_returns_complete_state() {
    let mut server = ChordMcpServer::new();

    let create_result = server.call_tool("create_patch", json!({})).unwrap();
    let patch_id = create_result["patch_id"].as_str().unwrap().to_string();

    // Add two nodes.
    let osc = server
        .call_tool(
            "add_node",
            json!({ "patch_id": patch_id, "node_type": "oscillator" }),
        )
        .unwrap();
    let osc_id = osc["node_id"].as_u64().unwrap();
    let osc_out = osc["outputs"][0]["id"].as_u64().unwrap();

    let gain = server
        .call_tool(
            "add_node",
            json!({ "patch_id": patch_id, "node_type": "gain" }),
        )
        .unwrap();
    let gain_id = gain["node_id"].as_u64().unwrap();
    let gain_in = gain["inputs"][0]["id"].as_u64().unwrap();

    // Connect them.
    server
        .call_tool(
            "connect",
            json!({
                "patch_id": patch_id,
                "from_node": osc_id,
                "from_port": osc_out,
                "to_node": gain_id,
                "to_port": gain_in,
            }),
        )
        .unwrap();

    // Get patch.
    let patch = server
        .call_tool("get_patch", json!({ "patch_id": patch_id }))
        .unwrap();

    assert_eq!(patch["patch_id"], patch_id);
    assert_eq!(patch["node_count"], 2);
    assert_eq!(patch["connection_count"], 1);
    assert_eq!(patch["nodes"].as_array().unwrap().len(), 2);
    assert_eq!(patch["connections"].as_array().unwrap().len(), 1);

    // Check connection details.
    let conn = &patch["connections"][0];
    assert_eq!(conn["from_node"], osc_id);
    assert_eq!(conn["to_node"], gain_id);
}

// ────────────────────────────────────────────
// Error handling: unknown tool
// ────────────────────────────────────────────

#[test]
fn unknown_tool_returns_error() {
    let mut server = ChordMcpServer::new();

    let result = server.call_tool("nonexistent_tool", json!({}));
    assert!(result.is_err());

    match result.unwrap_err() {
        crate::McpError::UnknownTool(name) => assert_eq!(name, "nonexistent_tool"),
        other => panic!("Expected UnknownTool, got: {other:?}"),
    }
}

// ────────────────────────────────────────────
// Error handling: invalid arguments
// ────────────────────────────────────────────

#[test]
fn add_node_missing_patch_id_returns_error() {
    let mut server = ChordMcpServer::new();

    let result = server.call_tool("add_node", json!({ "node_type": "oscillator" }));
    assert!(result.is_err());
    match result.unwrap_err() {
        crate::McpError::InvalidArguments(msg) => assert!(msg.contains("patch_id")),
        other => panic!("Expected InvalidArguments, got: {other:?}"),
    }
}

#[test]
fn add_node_unknown_type_returns_error() {
    let mut server = ChordMcpServer::new();

    let create_result = server.call_tool("create_patch", json!({})).unwrap();
    let patch_id = create_result["patch_id"].as_str().unwrap().to_string();

    let result = server.call_tool(
        "add_node",
        json!({ "patch_id": patch_id, "node_type": "quantum_processor" }),
    );
    assert!(result.is_err());
    match result.unwrap_err() {
        crate::McpError::UnknownNodeType(t) => assert_eq!(t, "quantum_processor"),
        other => panic!("Expected UnknownNodeType, got: {other:?}"),
    }
}

#[test]
fn set_parameter_nonexistent_param_returns_error() {
    let mut server = ChordMcpServer::new();

    let create_result = server.call_tool("create_patch", json!({})).unwrap();
    let patch_id = create_result["patch_id"].as_str().unwrap().to_string();

    let osc_result = server
        .call_tool(
            "add_node",
            json!({ "patch_id": patch_id, "node_type": "oscillator" }),
        )
        .unwrap();
    let osc_id = osc_result["node_id"].as_u64().unwrap();

    let result = server.call_tool(
        "set_parameter",
        json!({
            "patch_id": patch_id,
            "node_id": osc_id,
            "parameter": "nonexistent_param",
            "value": 42.0,
        }),
    );
    assert!(result.is_err());
    match result.unwrap_err() {
        crate::McpError::ParameterNotFound(name) => assert_eq!(name, "nonexistent_param"),
        other => panic!("Expected ParameterNotFound, got: {other:?}"),
    }
}

#[test]
fn remove_node_nonexistent_returns_error() {
    let mut server = ChordMcpServer::new();

    let create_result = server.call_tool("create_patch", json!({})).unwrap();
    let patch_id = create_result["patch_id"].as_str().unwrap().to_string();

    let result = server.call_tool(
        "remove_node",
        json!({ "patch_id": patch_id, "node_id": 99999 }),
    );
    assert!(result.is_err());
    match result.unwrap_err() {
        crate::McpError::NodeNotFound(_) => {}
        other => panic!("Expected NodeNotFound, got: {other:?}"),
    }
}

#[test]
fn disconnect_nonexistent_returns_error() {
    let mut server = ChordMcpServer::new();

    let create_result = server.call_tool("create_patch", json!({})).unwrap();
    let patch_id = create_result["patch_id"].as_str().unwrap().to_string();

    let result = server.call_tool(
        "disconnect",
        json!({ "patch_id": patch_id, "connection_id": 99999 }),
    );
    assert!(result.is_err());
    match result.unwrap_err() {
        crate::McpError::ConnectionNotFound(_) => {}
        other => panic!("Expected ConnectionNotFound, got: {other:?}"),
    }
}

#[test]
fn connect_to_nonexistent_patch_returns_error() {
    let mut server = ChordMcpServer::new();

    let result = server.call_tool(
        "connect",
        json!({
            "patch_id": "nonexistent_patch",
            "from_node": 1,
            "from_port": 1,
            "to_node": 2,
            "to_port": 2,
        }),
    );
    assert!(result.is_err());
    match result.unwrap_err() {
        crate::McpError::PatchNotFound(_) => {}
        other => panic!("Expected PatchNotFound, got: {other:?}"),
    }
}

// ────────────────────────────────────────────
// Round-trip: create → export → verify
// ────────────────────────────────────────────

#[test]
fn round_trip_export_preserves_structure() {
    let mut server = ChordMcpServer::new();

    // Build a patch with two nodes and a connection.
    let create_result = server.call_tool("create_patch", json!({})).unwrap();
    let patch_id = create_result["patch_id"].as_str().unwrap().to_string();

    let osc = server
        .call_tool(
            "add_node",
            json!({
                "patch_id": patch_id,
                "node_type": "oscillator",
                "position": { "x": 50.0, "y": 100.0 }
            }),
        )
        .unwrap();
    let osc_id = osc["node_id"].as_u64().unwrap();
    let osc_out = osc["outputs"][0]["id"].as_u64().unwrap();

    // Set a parameter.
    server
        .call_tool(
            "set_parameter",
            json!({
                "patch_id": patch_id,
                "node_id": osc_id,
                "parameter": "frequency",
                "value": 660.0,
            }),
        )
        .unwrap();

    let gain = server
        .call_tool(
            "add_node",
            json!({ "patch_id": patch_id, "node_type": "gain" }),
        )
        .unwrap();
    let gain_in = gain["inputs"][0]["id"].as_u64().unwrap();
    let gain_id = gain["node_id"].as_u64().unwrap();

    server
        .call_tool(
            "connect",
            json!({
                "patch_id": patch_id,
                "from_node": osc_id,
                "from_port": osc_out,
                "to_node": gain_id,
                "to_port": gain_in,
            }),
        )
        .unwrap();

    // Export the patch.
    let export_result = server
        .call_tool("export_patch", json!({ "patch_id": patch_id }))
        .unwrap();

    // Verify the exported JSON contains all the expected structure.
    let graph = &export_result["graph"];
    assert!(graph.is_object(), "Exported graph should be a JSON object");

    // The graph should be valid JSON containing nodes and connections.
    let exported_str = serde_json::to_string(&graph).unwrap();
    let reimported: serde_json::Value = serde_json::from_str(&exported_str).unwrap();

    // Verify the reimported data has the right structure.
    assert!(reimported.get("nodes").is_some());
    assert!(reimported.get("connections").is_some());

    // Verify connections are present.
    let connections = reimported["connections"].as_array().unwrap();
    assert_eq!(connections.len(), 1);

    // Verify the frequency parameter was preserved in the exported data.
    // The nodes map uses NodeId as key; we need to find our oscillator.
    let nodes = reimported["nodes"].as_object().unwrap();
    assert_eq!(nodes.len(), 2);

    // Find the oscillator node and check its frequency parameter.
    let osc_node = nodes
        .values()
        .find(|n| n["node_type"] == "oscillator")
        .expect("Should find oscillator node");
    let freq_param = osc_node["parameters"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == "frequency")
        .expect("Should find frequency parameter");
    assert_eq!(freq_param["value"], 660.0);
}

// ────────────────────────────────────────────
// handle_request protocol format
// ────────────────────────────────────────────

#[test]
fn handle_request_success_format() {
    let mut server = ChordMcpServer::new();

    let response = server.handle_request(&json!({
        "tool": "create_patch",
        "arguments": {}
    }));

    assert!(response.get("result").is_some());
    assert!(response.get("error").is_none());
    assert!(response["result"]["patch_id"].as_str().is_some());
}

#[test]
fn handle_request_error_format() {
    let mut server = ChordMcpServer::new();

    let response = server.handle_request(&json!({
        "tool": "nonexistent_tool",
        "arguments": {}
    }));

    assert!(response.get("error").is_some());
    assert!(response.get("result").is_none());
}

#[test]
fn handle_request_missing_tool_field() {
    let mut server = ChordMcpServer::new();

    let response = server.handle_request(&json!({
        "arguments": {}
    }));

    assert!(response.get("error").is_some());
    assert!(response["error"].as_str().unwrap().contains("tool"));
}

// ────────────────────────────────────────────
// Node type listing
// ────────────────────────────────────────────

#[test]
fn list_node_types_returns_wave1_nodes() {
    let mut server = ChordMcpServer::new();

    let result = server.call_tool("list_node_types", json!({})).unwrap();
    let node_types = result["node_types"].as_array().unwrap();

    let expected_types = [
        "envelope",
        "filter",
        "gain",
        "lfo",
        "midi_to_freq",
        "mixer",
        "oscillator",
        "output",
    ];

    let type_names: Vec<&str> = node_types
        .iter()
        .map(|t| t["type"].as_str().unwrap())
        .collect();

    for expected in &expected_types {
        assert!(
            type_names.contains(expected),
            "Missing node type: {expected}"
        );
    }

    // Oscillator should have frequency, detune, waveform parameters.
    let osc = node_types
        .iter()
        .find(|t| t["type"] == "oscillator")
        .unwrap();
    let params: Vec<&str> = osc["parameters"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["id"].as_str().unwrap())
        .collect();
    assert!(params.contains(&"frequency"));
    assert!(params.contains(&"detune"));
    assert!(params.contains(&"waveform"));
}

// ────────────────────────────────────────────
// Diagnostics
// ────────────────────────────────────────────

#[test]
fn run_diagnostics_returns_report() {
    let mut server = ChordMcpServer::new();

    let create_result = server.call_tool("create_patch", json!({})).unwrap();
    let patch_id = create_result["patch_id"].as_str().unwrap().to_string();

    let diag_result = server
        .call_tool("run_diagnostics", json!({ "patch_id": patch_id }))
        .unwrap();

    assert_eq!(diag_result["patch_id"], patch_id);
    assert!(diag_result["report"].is_object());
    assert!(diag_result["report"]["summary"].is_object());
    assert_eq!(diag_result["report"]["summary"]["health_score"], 1.0);
}

// ────────────────────────────────────────────
// Remove node also removes connections
// ────────────────────────────────────────────

#[test]
fn remove_node_also_removes_connections() {
    let mut server = ChordMcpServer::new();

    let create_result = server.call_tool("create_patch", json!({})).unwrap();
    let patch_id = create_result["patch_id"].as_str().unwrap().to_string();

    let osc = server
        .call_tool(
            "add_node",
            json!({ "patch_id": patch_id, "node_type": "oscillator" }),
        )
        .unwrap();
    let osc_id = osc["node_id"].as_u64().unwrap();
    let osc_out = osc["outputs"][0]["id"].as_u64().unwrap();

    let gain = server
        .call_tool(
            "add_node",
            json!({ "patch_id": patch_id, "node_type": "gain" }),
        )
        .unwrap();
    let gain_id = gain["node_id"].as_u64().unwrap();
    let gain_in = gain["inputs"][0]["id"].as_u64().unwrap();

    server
        .call_tool(
            "connect",
            json!({
                "patch_id": patch_id,
                "from_node": osc_id,
                "from_port": osc_out,
                "to_node": gain_id,
                "to_port": gain_in,
            }),
        )
        .unwrap();

    // Verify connection exists.
    let patch = server.call_tool("get_patch", json!({ "patch_id": patch_id })).unwrap();
    assert_eq!(patch["connection_count"], 1);

    // Remove the oscillator.
    server
        .call_tool(
            "remove_node",
            json!({ "patch_id": patch_id, "node_id": osc_id }),
        )
        .unwrap();

    // Verify connection was also removed.
    let patch = server.call_tool("get_patch", json!({ "patch_id": patch_id })).unwrap();
    assert_eq!(patch["node_count"], 1);
    assert_eq!(patch["connection_count"], 0);
}

// ────────────────────────────────────────────
// Compile empty patch
// ────────────────────────────────────────────

#[test]
fn compile_empty_patch_succeeds() {
    let mut server = ChordMcpServer::new();

    let create_result = server.call_tool("create_patch", json!({})).unwrap();
    let patch_id = create_result["patch_id"].as_str().unwrap().to_string();

    let compile_result = server
        .call_tool("compile_patch", json!({ "patch_id": patch_id }))
        .unwrap();

    assert_eq!(compile_result["success"], true);
    assert_eq!(compile_result["execution_order"].as_array().unwrap().len(), 0);
    assert_eq!(compile_result["buffer_count"], 0);
}

// ────────────────────────────────────────────
// Multiple patches are independent
// ────────────────────────────────────────────

#[test]
fn multiple_patches_are_independent() {
    let mut server = ChordMcpServer::new();

    let patch1 = server.call_tool("create_patch", json!({})).unwrap();
    let pid1 = patch1["patch_id"].as_str().unwrap().to_string();

    let patch2 = server.call_tool("create_patch", json!({})).unwrap();
    let pid2 = patch2["patch_id"].as_str().unwrap().to_string();

    assert_ne!(pid1, pid2);

    // Add a node to patch1 only.
    server
        .call_tool(
            "add_node",
            json!({ "patch_id": pid1, "node_type": "oscillator" }),
        )
        .unwrap();

    // Patch1 should have 1 node, patch2 should have 0.
    let p1 = server.call_tool("get_patch", json!({ "patch_id": pid1 })).unwrap();
    let p2 = server.call_tool("get_patch", json!({ "patch_id": pid2 })).unwrap();
    assert_eq!(p1["node_count"], 1);
    assert_eq!(p2["node_count"], 0);
}
