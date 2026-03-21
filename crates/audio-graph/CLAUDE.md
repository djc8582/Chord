# audio-graph

> **Tier 0** — No dependencies. Can be built immediately in parallel with other Tier 0 modules.

## What This Is

The abstract graph data structure and compiler. This crate knows nothing about audio — it only understands directed graphs with typed ports, topological sorting, cycle detection, and compilation into execution orders. It is the foundation everything else builds on.

## Public API

```rust
pub struct Graph {
    nodes: HashMap<NodeId, NodeDescriptor>,
    connections: Vec<Connection>,
}

pub struct NodeDescriptor {
    pub id: NodeId,
    pub node_type: String,
    pub inputs: Vec<PortDescriptor>,
    pub outputs: Vec<PortDescriptor>,
    pub parameters: Vec<ParameterDescriptor>,
    pub position: (f64, f64), // canvas position
}

pub struct PortDescriptor {
    pub id: PortId,
    pub name: String,
    pub data_type: PortDataType,
    pub default_value: Option<f64>,
}

pub enum PortDataType {
    Audio,    // multi-channel audio signal
    Control,  // single float control signal
    Trigger,  // boolean gate/trigger
    Midi,     // MIDI messages
    Osc,      // OSC messages
    Data,     // JSON/structured data
    Tensor,   // multi-dimensional arrays
    String,   // text
    Visual,   // visualization data
}

pub struct Connection {
    pub id: ConnectionId,
    pub from_node: NodeId,
    pub from_port: PortId,
    pub to_node: NodeId,
    pub to_port: PortId,
}

pub struct ParameterDescriptor {
    pub id: String,
    pub name: String,
    pub value: f64,
    pub min: f64,
    pub max: f64,
    pub default: f64,
    pub unit: String,
    pub automatable: bool,
}

// The compiler
pub struct GraphCompiler;

impl GraphCompiler {
    /// Compile graph into an execution order. Returns error if graph is invalid.
    pub fn compile(graph: &Graph) -> Result<CompiledGraph, CompileError>;
}

pub struct CompiledGraph {
    pub execution_order: Vec<NodeId>,
    pub buffer_layout: BufferLayout,
    pub feedback_edges: Vec<ConnectionId>, // edges where z^-1 delay was inserted
    pub parallel_groups: Vec<Vec<NodeId>>, // groups that can execute on separate cores
}

pub struct BufferLayout {
    pub buffer_count: usize,
    pub assignments: HashMap<ConnectionId, BufferIndex>,
}

pub enum CompileError {
    TypeMismatch { connection: ConnectionId, expected: PortDataType, got: PortDataType },
    DisconnectedRequired { node: NodeId, port: PortId },
    InvalidGraph(String),
}
```

## Implementation Details

- Topological sort via Kahn's algorithm (handles parallel group detection)
- Cycle detection: identify back-edges, insert implicit z^-1 delay nodes
- Buffer allocation: minimize buffer count via graph coloring (reuse buffers when lifetimes don't overlap)
- Type checking: validate all connections have compatible types
- Parallel group detection: identify independent subgraphs that can execute on separate cores
- Subgraph support: a node can contain an inner graph (for subpatches)

## Dependencies

None. Pure data structures and algorithms.

## Testing

```bash
cargo test -p audio-graph
```

Tests must cover:
- [ ] Simple linear chain compiles correctly
- [ ] Branching/merging graph compiles with correct order
- [ ] Cycle detection inserts feedback delays
- [ ] Type mismatch is caught at compile time
- [ ] Buffer allocation minimizes buffer count
- [ ] Parallel groups are correctly identified
- [ ] 1000+ node graph compiles in < 10ms
- [ ] Subgraph (nested graph) compiles correctly
- [ ] Empty graph compiles to empty execution order
- [ ] Single node graph works

## Definition of Done

- [ ] All public types implemented and documented
- [ ] GraphCompiler produces correct execution orders for all test cases
- [ ] Parallel group detection works (verified with a diamond-shaped graph)
- [ ] Feedback loop handling works (verified with a simple feedback chain)
- [ ] Performance: 1000-node graph compiles in < 10ms
- [ ] All tests pass
- [ ] No unsafe code
