//! Pre-export validation — checks that a graph is valid for a given export target.
//!
//! Validates that the graph compiles, contains no unsupported node types, and has
//! no critical diagnostic issues that would prevent a successful export.

use chord_audio_graph::{Graph, GraphCompiler};

use crate::types::{ExportError, ExportOptions, ExportTarget};

/// Node types that require network access and are not available in offline/embedded targets.
const NETWORK_ONLY_NODES: &[&str] = &["osc_send", "osc_receive", "http_request", "websocket"];

/// Node types that require a desktop windowing system.
const DESKTOP_ONLY_NODES: &[&str] = &["file_player", "recorder"];

/// Node types that require the plugin host (cannot be exported because they rely on
/// third-party VST3/CLAP plugins being present at runtime).
const PLUGIN_HOST_NODES: &[&str] = &["vst3_plugin", "clap_plugin", "au_plugin"];

/// Validate a graph for export to a specific target.
///
/// Returns `Ok(())` if the graph is valid for the target, or an appropriate
/// [`ExportError`] describing what is wrong.
pub fn validate_graph_for_export(
    graph: &Graph,
    options: &ExportOptions,
) -> Result<(), ExportError> {
    // 1. Reject empty graphs.
    if graph.is_empty() {
        return Err(ExportError::EmptyGraph);
    }

    // 2. Try to compile the graph.
    GraphCompiler::compile(graph).map_err(|e| ExportError::CompilationFailed(e.to_string()))?;

    // 3. Check for unsupported node types on the target.
    let unsupported = find_unsupported_nodes(graph, options.target);
    if !unsupported.is_empty() {
        return Err(ExportError::UnsupportedNodes {
            target: options.target,
            node_types: unsupported,
        });
    }

    Ok(())
}

/// Find node types in the graph that are not supported on the given target.
fn find_unsupported_nodes(graph: &Graph, target: ExportTarget) -> Vec<String> {
    let mut unsupported = Vec::new();

    for node in graph.nodes().values() {
        let node_type = node.node_type.as_str();

        // Plugin host nodes cannot be exported to any target (they depend on
        // third-party plugins being installed on the host machine).
        if PLUGIN_HOST_NODES.contains(&node_type) {
            unsupported.push(node_type.to_string());
            continue;
        }

        match target {
            ExportTarget::Web | ExportTarget::MobileFramework => {
                // Web and mobile do not support network-only or desktop-only nodes.
                if NETWORK_ONLY_NODES.contains(&node_type)
                    || DESKTOP_ONLY_NODES.contains(&node_type)
                {
                    unsupported.push(node_type.to_string());
                }
            }
            ExportTarget::GameEngine => {
                // Game engine targets do not support network or desktop-only nodes.
                if NETWORK_ONLY_NODES.contains(&node_type)
                    || DESKTOP_ONLY_NODES.contains(&node_type)
                {
                    unsupported.push(node_type.to_string());
                }
            }
            ExportTarget::VST3 | ExportTarget::CLAP => {
                // Plugin targets do not support network-only nodes.
                if NETWORK_ONLY_NODES.contains(&node_type) {
                    unsupported.push(node_type.to_string());
                }
            }
            ExportTarget::Desktop | ExportTarget::Standalone => {
                // Desktop/standalone supports everything except plugin host nodes
                // (already checked above).
            }
        }
    }

    unsupported.sort();
    unsupported.dedup();
    unsupported
}

/// List all node types present in a graph.
pub fn list_node_types(graph: &Graph) -> Vec<String> {
    let mut types: Vec<String> = graph
        .nodes()
        .values()
        .map(|n| n.node_type.clone())
        .collect();
    types.sort();
    types.dedup();
    types
}
