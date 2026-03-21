//! Export manifest — metadata about a completed export.
//!
//! The manifest records what was exported, to which target, when, and what files
//! were generated. It is serializable for inclusion in the export output directory.

use serde::{Deserialize, Serialize};

use crate::types::ExportTarget;

/// Metadata about a completed export operation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExportManifest {
    /// Name of the exported project.
    pub name: String,
    /// Target platform/format.
    pub target: ExportTarget,
    /// Sample rate used for the export.
    pub sample_rate: u32,
    /// Buffer size used for the export.
    pub buffer_size: u32,
    /// Timestamp of the export (ISO 8601 string).
    pub timestamp: String,
    /// A hash of the graph structure for cache invalidation.
    pub graph_hash: String,
    /// List of generated file paths (relative to output directory).
    pub files: Vec<String>,
    /// Export engine version.
    pub engine_version: String,
}

impl ExportManifest {
    /// Create a new manifest from the given export parameters.
    pub fn new(
        name: &str,
        target: ExportTarget,
        sample_rate: u32,
        buffer_size: u32,
        graph_hash: &str,
        files: Vec<String>,
    ) -> Self {
        Self {
            name: name.to_string(),
            target,
            sample_rate,
            buffer_size,
            // Use a fixed timestamp format. In a real build this would be `chrono::Utc::now()`.
            timestamp: "2026-03-21T00:00:00Z".to_string(),
            graph_hash: graph_hash.to_string(),
            files,
            engine_version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    /// Serialize the manifest to a JSON string.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// Deserialize a manifest from a JSON string.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}
