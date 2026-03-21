//! MCP protocol types — tool definitions, error handling, and result types.

use serde::{Deserialize, Serialize};

/// Describes a single MCP tool that an AI can call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    /// Unique tool name (e.g., "add_node").
    pub name: String,
    /// Human-readable description of what the tool does.
    pub description: String,
    /// JSON Schema describing the tool's input parameters.
    pub input_schema: serde_json::Value,
}

/// Errors that can occur when processing MCP tool calls.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum McpError {
    /// The requested tool does not exist.
    UnknownTool(String),
    /// The arguments provided to the tool are invalid.
    InvalidArguments(String),
    /// The referenced patch does not exist.
    PatchNotFound(String),
    /// The referenced node does not exist in the patch.
    NodeNotFound(String),
    /// The referenced connection does not exist in the patch.
    ConnectionNotFound(String),
    /// The referenced node type is not registered.
    UnknownNodeType(String),
    /// The referenced port does not exist on the node.
    PortNotFound(String),
    /// The referenced parameter does not exist on the node.
    ParameterNotFound(String),
    /// Graph compilation failed.
    CompilationFailed(String),
    /// An internal error occurred.
    Internal(String),
}

impl std::fmt::Display for McpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownTool(name) => write!(f, "Unknown tool: {name}"),
            Self::InvalidArguments(msg) => write!(f, "Invalid arguments: {msg}"),
            Self::PatchNotFound(id) => write!(f, "Patch not found: {id}"),
            Self::NodeNotFound(id) => write!(f, "Node not found: {id}"),
            Self::ConnectionNotFound(id) => write!(f, "Connection not found: {id}"),
            Self::UnknownNodeType(t) => write!(f, "Unknown node type: {t}"),
            Self::PortNotFound(id) => write!(f, "Port not found: {id}"),
            Self::ParameterNotFound(name) => write!(f, "Parameter not found: {name}"),
            Self::CompilationFailed(msg) => write!(f, "Compilation failed: {msg}"),
            Self::Internal(msg) => write!(f, "Internal error: {msg}"),
        }
    }
}

impl std::error::Error for McpError {}

/// Result type for MCP tool calls.
pub type McpResult<T> = Result<T, McpError>;
