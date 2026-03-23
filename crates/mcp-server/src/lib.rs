//! # chord-mcp-server
//!
//! MCP (Model Context Protocol) server for the Chord audio programming environment.
//!
//! Exposes the entire Chord environment to Claude Code and other AI tools via a tool-based
//! JSON protocol. Every feature is programmable: create patches, add nodes, connect ports,
//! set parameters, compile, run diagnostics, and export.
//!
//! ## Protocol
//!
//! Requests: `{ "tool": "name", "arguments": { ... } }`
//! Responses: `{ "result": ... }` or `{ "error": "message" }`
//!
//! ## Example
//!
//! ```
//! use chord_mcp_server::ChordMcpServer;
//! use serde_json::json;
//!
//! let mut server = ChordMcpServer::new();
//! let tools = server.list_tools();
//! assert!(!tools.is_empty());
//!
//! let result = server.call_tool("create_patch", json!({})).unwrap();
//! assert!(result.get("patch_id").is_some());
//! ```

mod server;
pub mod sound_planner;
mod tools;
mod types;
pub mod vibe;

pub use server::ChordMcpServer;
pub use types::{McpError, McpResult, ToolDefinition};

#[cfg(test)]
mod tests;
