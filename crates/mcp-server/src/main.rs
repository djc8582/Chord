//! MCP server binary — headless JSON-RPC 2.0 over stdio.
//!
//! Reads JSON-RPC requests (one per line) from stdin, dispatches them via
//! `ChordMcpServer`, and writes JSON-RPC responses to stdout.
//!
//! Supports the MCP protocol methods:
//! - `initialize` — returns server capabilities
//! - `tools/list` — returns all available tools
//! - `tools/call` — dispatches a tool call
//!
//! This binary runs headless (no UI) and embeds its own audio graph for
//! testing patches via the MCP tool interface.

use std::io::{self, BufRead, Write};

use chord_mcp_server::ChordMcpServer;
use serde_json::{json, Value};

fn main() {
    let mut server = ChordMcpServer::new();

    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut stdout_lock = stdout.lock();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let request: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                let err_response = json!({
                    "jsonrpc": "2.0",
                    "id": null,
                    "error": {
                        "code": -32700,
                        "message": format!("Parse error: {e}")
                    }
                });
                let _ = writeln!(stdout_lock, "{}", err_response);
                let _ = stdout_lock.flush();
                continue;
            }
        };

        let id = request.get("id").cloned().unwrap_or(Value::Null);
        let method = request
            .get("method")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let response = match method {
            "initialize" => {
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {
                            "tools": {}
                        },
                        "serverInfo": {
                            "name": "chord-mcp-server",
                            "version": env!("CARGO_PKG_VERSION")
                        }
                    }
                })
            }

            "tools/list" => {
                let tools = server.list_tools();
                let tools_json: Vec<Value> = tools
                    .into_iter()
                    .map(|t| {
                        json!({
                            "name": t.name,
                            "description": t.description,
                            "inputSchema": t.input_schema,
                        })
                    })
                    .collect();

                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "tools": tools_json
                    }
                })
            }

            "tools/call" => {
                let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
                let tool_name = params
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let arguments = params
                    .get("arguments")
                    .cloned()
                    .unwrap_or_else(|| json!({}));

                // Wrap into the format handle_request expects.
                let internal_request = json!({
                    "tool": tool_name,
                    "arguments": arguments,
                });
                let internal_response = server.handle_request(&internal_request);

                if let Some(result) = internal_response.get("result") {
                    json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "content": [{
                                "type": "text",
                                "text": serde_json::to_string(result).unwrap_or_default()
                            }]
                        }
                    })
                } else {
                    let error_msg = internal_response
                        .get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown error");
                    json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "content": [{
                                "type": "text",
                                "text": error_msg
                            }],
                            "isError": true
                        }
                    })
                }
            }

            // Notifications (no response required)
            "notifications/initialized" | "notifications/cancelled" => {
                continue;
            }

            _ => {
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": {
                        "code": -32601,
                        "message": format!("Method not found: {method}")
                    }
                })
            }
        };

        let _ = writeln!(stdout_lock, "{}", response);
        let _ = stdout_lock.flush();
    }
}
