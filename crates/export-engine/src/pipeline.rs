//! Export pipeline — the main entry point for exporting a graph.
//!
//! Orchestrates the validation, code generation, and artifact collection phases.

use chord_audio_graph::{Graph, GraphCompiler};

use crate::codegen::generate_artifacts;
use crate::manifest::ExportManifest;
use crate::types::{ExportArtifact, ExportError, ExportOptions, ExportResult};
use crate::validate::validate_graph_for_export;

/// The export pipeline. Takes a graph and options, runs validation and code generation,
/// and produces an [`ExportResult`] with all generated artifacts.
pub struct ExportPipeline;

impl ExportPipeline {
    /// Run the full export pipeline.
    ///
    /// 1. Validate the graph for the target.
    /// 2. Compile the graph.
    /// 3. Generate target-specific code artifacts.
    /// 4. Produce the export manifest.
    /// 5. Return the result.
    pub fn run(graph: &Graph, options: &ExportOptions) -> Result<ExportResult, ExportError> {
        // Phase 1: Validation.
        validate_graph_for_export(graph, options)?;

        // Phase 2: Compilation.
        let compiled = GraphCompiler::compile(graph)
            .map_err(|e| ExportError::CompilationFailed(e.to_string()))?;

        // Phase 3: Code generation.
        let mut artifacts = generate_artifacts(graph, &compiled, options)?;

        // Phase 4: Manifest.
        let graph_hash = compute_graph_hash(graph);
        let file_list: Vec<String> = artifacts.iter().map(|a| a.filename.clone()).collect();

        let manifest = ExportManifest::new(
            &options.name,
            options.target,
            options.sample_rate,
            options.buffer_size,
            &graph_hash,
            file_list,
        );

        // Add the manifest itself as an artifact.
        let manifest_json = manifest
            .to_json()
            .map_err(|e| ExportError::CodegenFailed(format!("Failed to serialize manifest: {e}")))?;

        artifacts.push(ExportArtifact {
            filename: "chord-export-manifest.json".to_string(),
            content: manifest_json,
        });

        Ok(ExportResult {
            artifacts,
            manifest,
        })
    }

    /// Validate a graph for a specific export target without generating code.
    ///
    /// Useful for pre-flight checks in the UI before starting a full export.
    pub fn validate(graph: &Graph, options: &ExportOptions) -> Result<(), ExportError> {
        validate_graph_for_export(graph, options)
    }

    /// List all available export targets.
    pub fn available_targets() -> Vec<crate::types::ExportTarget> {
        crate::types::ExportTarget::all()
    }
}

/// Compute a simple hash of the graph for cache invalidation.
///
/// Uses a deterministic serialization of node types and connections to produce
/// a hex string. This is not cryptographic — just a fingerprint.
fn compute_graph_hash(graph: &Graph) -> String {
    let mut hasher: u64 = 0xcbf29ce484222325; // FNV-1a offset basis

    // Hash node types in sorted order (for determinism).
    let mut node_types: Vec<(&chord_audio_graph::NodeId, &str)> = graph
        .nodes()
        .iter()
        .map(|(id, n)| (id, n.node_type.as_str()))
        .collect();
    node_types.sort_by_key(|(id, _)| id.0);

    for (id, node_type) in &node_types {
        for byte in id.0.to_le_bytes() {
            hasher ^= byte as u64;
            hasher = hasher.wrapping_mul(0x100000001b3);
        }
        for byte in node_type.bytes() {
            hasher ^= byte as u64;
            hasher = hasher.wrapping_mul(0x100000001b3);
        }
    }

    // Hash connections.
    for conn in graph.connections() {
        for byte in conn.from_node.0.to_le_bytes() {
            hasher ^= byte as u64;
            hasher = hasher.wrapping_mul(0x100000001b3);
        }
        for byte in conn.to_node.0.to_le_bytes() {
            hasher ^= byte as u64;
            hasher = hasher.wrapping_mul(0x100000001b3);
        }
    }

    format!("{hasher:016x}")
}
