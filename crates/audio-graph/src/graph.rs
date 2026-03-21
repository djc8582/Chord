//! Graph data structure — the container for nodes and connections.

use crate::types::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// The main graph data structure.
///
/// A `Graph` holds a set of [`NodeDescriptor`]s and [`Connection`]s between their ports.
/// It provides methods to add/remove nodes and connections, and can be compiled into an
/// execution order via [`GraphCompiler`](crate::GraphCompiler).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Graph {
    nodes: HashMap<NodeId, NodeDescriptor>,
    connections: Vec<Connection>,
}

impl Default for Graph {
    fn default() -> Self {
        Self::new()
    }
}

impl Graph {
    /// Create a new empty graph.
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            connections: Vec::new(),
        }
    }

    /// Add a node to the graph. Returns the node's ID.
    pub fn add_node(&mut self, descriptor: NodeDescriptor) -> NodeId {
        let id = descriptor.id;
        self.nodes.insert(id, descriptor);
        id
    }

    /// Remove a node and all its connections from the graph.
    pub fn remove_node(&mut self, id: &NodeId) -> Option<NodeDescriptor> {
        self.connections
            .retain(|c| c.from_node != *id && c.to_node != *id);
        self.nodes.remove(id)
    }

    /// Get a reference to a node by ID.
    pub fn node(&self, id: &NodeId) -> Option<&NodeDescriptor> {
        self.nodes.get(id)
    }

    /// Get a mutable reference to a node by ID.
    pub fn node_mut(&mut self, id: &NodeId) -> Option<&mut NodeDescriptor> {
        self.nodes.get_mut(id)
    }

    /// Get all nodes in the graph.
    pub fn nodes(&self) -> &HashMap<NodeId, NodeDescriptor> {
        &self.nodes
    }

    /// Get all connections in the graph.
    pub fn connections(&self) -> &[Connection] {
        &self.connections
    }

    /// Connect an output port on one node to an input port on another node.
    ///
    /// Returns the `ConnectionId` on success, or a `CompileError` if the nodes or ports
    /// don't exist.
    pub fn connect(
        &mut self,
        from_node: NodeId,
        from_port: PortId,
        to_node: NodeId,
        to_port: PortId,
    ) -> Result<ConnectionId, CompileError> {
        // Validate that both nodes exist.
        if !self.nodes.contains_key(&from_node) {
            return Err(CompileError::InvalidGraph(format!(
                "Source node {from_node} does not exist"
            )));
        }
        if !self.nodes.contains_key(&to_node) {
            return Err(CompileError::InvalidGraph(format!(
                "Destination node {to_node} does not exist"
            )));
        }

        // Validate that the ports exist on their respective nodes.
        let from_descriptor = &self.nodes[&from_node];
        if !from_descriptor.outputs.iter().any(|p| p.id == from_port) {
            return Err(CompileError::InvalidGraph(format!(
                "Output port {from_port} does not exist on node {from_node}"
            )));
        }

        let to_descriptor = &self.nodes[&to_node];
        if !to_descriptor.inputs.iter().any(|p| p.id == to_port) {
            return Err(CompileError::InvalidGraph(format!(
                "Input port {to_port} does not exist on node {to_node}"
            )));
        }

        let conn_id = ConnectionId::new();
        self.connections.push(Connection {
            id: conn_id,
            from_node,
            from_port,
            to_node,
            to_port,
        });

        Ok(conn_id)
    }

    /// Disconnect (remove) a connection by ID.
    pub fn disconnect(&mut self, id: &ConnectionId) -> bool {
        let len_before = self.connections.len();
        self.connections.retain(|c| c.id != *id);
        self.connections.len() < len_before
    }

    /// Get the number of nodes in the graph.
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    /// Get the number of connections in the graph.
    pub fn connection_count(&self) -> usize {
        self.connections.len()
    }

    /// Check if the graph is empty (no nodes).
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    /// Find the port descriptor for a given port ID on a given node.
    pub fn find_port(&self, node_id: &NodeId, port_id: &PortId) -> Option<&PortDescriptor> {
        let node = self.nodes.get(node_id)?;
        node.inputs
            .iter()
            .chain(node.outputs.iter())
            .find(|p| p.id == *port_id)
    }

    /// Find an output port descriptor on a node.
    pub fn find_output_port(
        &self,
        node_id: &NodeId,
        port_id: &PortId,
    ) -> Option<&PortDescriptor> {
        let node = self.nodes.get(node_id)?;
        node.outputs.iter().find(|p| p.id == *port_id)
    }

    /// Find an input port descriptor on a node.
    pub fn find_input_port(
        &self,
        node_id: &NodeId,
        port_id: &PortId,
    ) -> Option<&PortDescriptor> {
        let node = self.nodes.get(node_id)?;
        node.inputs.iter().find(|p| p.id == *port_id)
    }
}
