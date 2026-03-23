//! Portable JSON patch format for Chord.
//! A patch can be created by any interface (MCP, desktop, npm) and loaded by any other.

use serde::{Serialize, Deserialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatchFile {
    pub version: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_tempo")]
    pub tempo: f64,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub scale: String,
    pub nodes: Vec<NodeEntry>,
    pub connections: Vec<ConnectionEntry>,
    #[serde(default)]
    pub metadata: PatchMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub params: HashMap<String, f64>,
    #[serde(default)]
    pub position: Position,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionEntry {
    pub from: String,   // "nodeId:portName"
    pub to: String,     // "nodeId:portName"
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PatchMetadata {
    #[serde(default)]
    pub created_by: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

fn default_tempo() -> f64 { 120.0 }

impl PatchFile {
    pub fn new(name: &str) -> Self {
        Self {
            version: "1.0".into(),
            name: name.into(),
            description: String::new(),
            tempo: 120.0,
            key: "C".into(),
            scale: "minor".into(),
            nodes: Vec::new(),
            connections: Vec::new(),
            metadata: PatchMetadata {
                created_by: "chord".into(),
                created_at: String::new(),
                tags: Vec::new(),
            },
        }
    }

    pub fn add_node(&mut self, id: &str, node_type: &str, x: f64, y: f64) -> &mut NodeEntry {
        self.nodes.push(NodeEntry {
            id: id.into(),
            node_type: node_type.into(),
            params: HashMap::new(),
            position: Position { x, y },
            name: String::new(),
        });
        self.nodes.last_mut().unwrap()
    }

    pub fn connect(&mut self, from_node: &str, from_port: &str, to_node: &str, to_port: &str) {
        self.connections.push(ConnectionEntry {
            from: format!("{from_node}:{from_port}"),
            to: format!("{to_node}:{to_port}"),
        });
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }

    pub fn from_json(json: &str) -> Result<Self, String> {
        serde_json::from_str(json).map_err(|e| format!("Invalid patch JSON: {e}"))
    }
}

impl NodeEntry {
    pub fn set_param(&mut self, name: &str, value: f64) -> &mut Self {
        self.params.insert(name.into(), value);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_serialize() {
        let mut patch = PatchFile::new("Test Patch");
        patch.description = "A simple test".into();
        patch.add_node("osc1", "oscillator", 100.0, 200.0)
            .set_param("frequency", 440.0)
            .set_param("waveform", 1.0);
        patch.add_node("filt1", "filter", 300.0, 200.0)
            .set_param("cutoff", 2000.0);
        patch.add_node("out1", "output", 500.0, 200.0);
        patch.connect("osc1", "out", "filt1", "in");
        patch.connect("filt1", "out", "out1", "in");

        let json = patch.to_json();
        assert!(json.contains("oscillator"));
        assert!(json.contains("440"));
        assert!(json.contains("osc1:out"));

        // Round-trip
        let loaded = PatchFile::from_json(&json).unwrap();
        assert_eq!(loaded.name, "Test Patch");
        assert_eq!(loaded.nodes.len(), 3);
        assert_eq!(loaded.connections.len(), 2);
    }

    #[test]
    fn test_load_minimal() {
        let json = r#"{"version":"1.0","name":"Minimal","nodes":[],"connections":[]}"#;
        let patch = PatchFile::from_json(json).unwrap();
        assert_eq!(patch.name, "Minimal");
        assert_eq!(patch.tempo, 120.0); // default
    }
}
