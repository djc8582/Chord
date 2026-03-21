//! Core type definitions for the audio graph.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};

/// Unique identifier for a node in the graph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
pub struct NodeId(pub u64);

/// Unique identifier for a port on a node.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PortId(pub u64);

/// Unique identifier for a connection between two ports.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ConnectionId(pub u64);

/// Index into the buffer pool.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BufferIndex(pub usize);

// Global ID generators — simple atomic counters.
static NEXT_NODE_ID: AtomicU64 = AtomicU64::new(1);
static NEXT_PORT_ID: AtomicU64 = AtomicU64::new(1);
static NEXT_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);

impl NodeId {
    /// Generate a new unique `NodeId`.
    pub fn new() -> Self {
        Self(NEXT_NODE_ID.fetch_add(1, Ordering::Relaxed))
    }
}

impl Default for NodeId {
    fn default() -> Self {
        Self::new()
    }
}

impl PortId {
    /// Generate a new unique `PortId`.
    pub fn new() -> Self {
        Self(NEXT_PORT_ID.fetch_add(1, Ordering::Relaxed))
    }
}

impl Default for PortId {
    fn default() -> Self {
        Self::new()
    }
}

impl ConnectionId {
    /// Generate a new unique `ConnectionId`.
    pub fn new() -> Self {
        Self(NEXT_CONNECTION_ID.fetch_add(1, Ordering::Relaxed))
    }
}

impl Default for ConnectionId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for NodeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Node({})", self.0)
    }
}

impl fmt::Display for PortId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Port({})", self.0)
    }
}

impl fmt::Display for ConnectionId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Connection({})", self.0)
    }
}

/// The data type carried by a port.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PortDataType {
    /// Multi-channel audio signal.
    Audio,
    /// Single float control signal.
    Control,
    /// Boolean gate/trigger.
    Trigger,
    /// MIDI messages.
    Midi,
    /// OSC messages.
    Osc,
    /// JSON/structured data.
    Data,
    /// Multi-dimensional arrays.
    Tensor,
    /// Text.
    String,
    /// Visualization data.
    Visual,
}

impl fmt::Display for PortDataType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Audio => write!(f, "Audio"),
            Self::Control => write!(f, "Control"),
            Self::Trigger => write!(f, "Trigger"),
            Self::Midi => write!(f, "Midi"),
            Self::Osc => write!(f, "Osc"),
            Self::Data => write!(f, "Data"),
            Self::Tensor => write!(f, "Tensor"),
            Self::String => write!(f, "String"),
            Self::Visual => write!(f, "Visual"),
        }
    }
}

/// Describes a port (input or output) on a node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortDescriptor {
    /// Unique identifier for this port.
    pub id: PortId,
    /// Human-readable name.
    pub name: String,
    /// The data type this port carries.
    pub data_type: PortDataType,
    /// Optional default value for unconnected inputs.
    pub default_value: Option<f64>,
}

impl PortDescriptor {
    /// Create a new port descriptor with an auto-generated ID.
    pub fn new(name: &str, data_type: PortDataType) -> Self {
        Self {
            id: PortId::new(),
            name: name.to_string(),
            data_type,
            default_value: None,
        }
    }

    /// Set the default value for this port.
    pub fn with_default(mut self, value: f64) -> Self {
        self.default_value = Some(value);
        self
    }
}

/// Describes a tunable parameter on a node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterDescriptor {
    /// Unique string identifier (e.g. "frequency").
    pub id: String,
    /// Human-readable name (e.g. "Frequency").
    pub name: String,
    /// Current value.
    pub value: f64,
    /// Minimum allowed value.
    pub min: f64,
    /// Maximum allowed value.
    pub max: f64,
    /// Default value.
    pub default: f64,
    /// Unit label (e.g. "Hz", "dB").
    pub unit: String,
    /// Whether this parameter can be automated.
    pub automatable: bool,
}

impl ParameterDescriptor {
    /// Create a new parameter with typical defaults.
    pub fn new(id: &str, name: &str, default: f64, min: f64, max: f64) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            value: default,
            min,
            max,
            default,
            unit: String::new(),
            automatable: true,
        }
    }

    /// Set the unit label.
    pub fn with_unit(mut self, unit: &str) -> Self {
        self.unit = unit.to_string();
        self
    }
}

/// Describes a node in the graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeDescriptor {
    /// Unique identifier for this node.
    pub id: NodeId,
    /// The type of node (e.g. "oscillator", "gain", "filter").
    pub node_type: String,
    /// Input ports.
    pub inputs: Vec<PortDescriptor>,
    /// Output ports.
    pub outputs: Vec<PortDescriptor>,
    /// Tunable parameters.
    pub parameters: Vec<ParameterDescriptor>,
    /// Canvas position (x, y) for UI purposes.
    pub position: (f64, f64),
    /// Optional inner subgraph (for subpatch/nested graph support).
    pub subgraph: Option<Box<crate::Graph>>,
}

impl NodeDescriptor {
    /// Create a new node descriptor with an auto-generated ID.
    pub fn new(node_type: &str) -> Self {
        Self {
            id: NodeId::new(),
            node_type: node_type.to_string(),
            inputs: Vec::new(),
            outputs: Vec::new(),
            parameters: Vec::new(),
            position: (0.0, 0.0),
            subgraph: None,
        }
    }

    /// Add an input port to this node.
    pub fn with_input(mut self, port: PortDescriptor) -> Self {
        self.inputs.push(port);
        self
    }

    /// Add an output port to this node.
    pub fn with_output(mut self, port: PortDescriptor) -> Self {
        self.outputs.push(port);
        self
    }

    /// Add a parameter to this node.
    pub fn with_parameter(mut self, param: ParameterDescriptor) -> Self {
        self.parameters.push(param);
        self
    }

    /// Set the canvas position.
    pub fn at_position(mut self, x: f64, y: f64) -> Self {
        self.position = (x, y);
        self
    }

    /// Attach a subgraph (nested graph) to this node.
    pub fn with_subgraph(mut self, graph: crate::Graph) -> Self {
        self.subgraph = Some(Box::new(graph));
        self
    }
}

/// A connection (edge) between an output port on one node and an input port on another.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    /// Unique identifier for this connection.
    pub id: ConnectionId,
    /// Source node.
    pub from_node: NodeId,
    /// Source port on the source node.
    pub from_port: PortId,
    /// Destination node.
    pub to_node: NodeId,
    /// Destination port on the destination node.
    pub to_port: PortId,
}

/// Errors that can occur during graph compilation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CompileError {
    /// Two connected ports have incompatible data types.
    TypeMismatch {
        connection: ConnectionId,
        expected: PortDataType,
        got: PortDataType,
    },
    /// A required input port has no connection and no default value.
    DisconnectedRequired {
        node: NodeId,
        port: PortId,
    },
    /// The graph structure is invalid for some reason.
    InvalidGraph(String),
}

impl fmt::Display for CompileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TypeMismatch {
                connection,
                expected,
                got,
            } => write!(
                f,
                "Type mismatch on {connection}: expected {expected}, got {got}"
            ),
            Self::DisconnectedRequired { node, port } => {
                write!(f, "Required port {port} on {node} is not connected")
            }
            Self::InvalidGraph(msg) => write!(f, "Invalid graph: {msg}"),
        }
    }
}

impl std::error::Error for CompileError {}

/// The layout of buffers after compilation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BufferLayout {
    /// Total number of buffers required.
    pub buffer_count: usize,
    /// Maps each connection to the buffer index it should use.
    pub assignments: std::collections::HashMap<ConnectionId, BufferIndex>,
}

/// The result of compiling a graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompiledGraph {
    /// The order in which nodes should be processed.
    pub execution_order: Vec<NodeId>,
    /// Buffer allocation layout.
    pub buffer_layout: BufferLayout,
    /// Connections where a z^-1 feedback delay was inserted to break a cycle.
    pub feedback_edges: Vec<ConnectionId>,
    /// Groups of nodes that can execute in parallel on separate cores.
    /// Each inner `Vec<NodeId>` is one parallel group (all nodes in it are independent).
    pub parallel_groups: Vec<Vec<NodeId>>,
    /// Compiled subgraphs, keyed by the node that contains them.
    pub compiled_subgraphs: std::collections::HashMap<NodeId, CompiledGraph>,
}
