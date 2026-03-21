//! Graph compiler — topological sort, cycle detection, buffer allocation, parallel groups.

use crate::types::*;
use crate::Graph;
use std::collections::{HashMap, HashSet, VecDeque};

/// The graph compiler. Compiles a [`Graph`] into a [`CompiledGraph`].
///
/// The compiler performs the following steps:
/// 1. **Type checking** — validate all connections have compatible port data types.
/// 2. **Cycle detection** — identify back-edges and mark them as feedback edges (z^-1 delay).
/// 3. **Topological sort** — produce an execution order via Kahn's algorithm.
/// 4. **Parallel group detection** — find independent subgraphs that can execute on separate cores.
/// 5. **Buffer allocation** — minimize buffer count via graph coloring / interval scheduling.
/// 6. **Subgraph compilation** — recursively compile any nested subgraphs.
pub struct GraphCompiler;

impl GraphCompiler {
    /// Compile a graph into an execution order.
    ///
    /// Returns a [`CompiledGraph`] on success, or a [`CompileError`] if the graph is invalid.
    pub fn compile(graph: &Graph) -> Result<CompiledGraph, CompileError> {
        // Handle empty graph.
        if graph.is_empty() {
            return Ok(CompiledGraph {
                execution_order: Vec::new(),
                buffer_layout: BufferLayout {
                    buffer_count: 0,
                    assignments: HashMap::new(),
                },
                feedback_edges: Vec::new(),
                parallel_groups: Vec::new(),
                compiled_subgraphs: HashMap::new(),
            });
        }

        // Step 1: Type-check all connections.
        Self::type_check(graph)?;

        // Step 2: Detect cycles and identify feedback edges.
        let feedback_edges = Self::detect_cycles(graph);

        // Step 3: Topological sort via Kahn's algorithm, excluding feedback edges.
        let (execution_order, parallel_groups) =
            Self::topological_sort(graph, &feedback_edges)?;

        // Step 4: Buffer allocation.
        let buffer_layout =
            Self::allocate_buffers(graph, &execution_order, &feedback_edges);

        // Step 5: Compile subgraphs.
        let compiled_subgraphs = Self::compile_subgraphs(graph)?;

        Ok(CompiledGraph {
            execution_order,
            buffer_layout,
            feedback_edges,
            parallel_groups,
            compiled_subgraphs,
        })
    }

    /// Validate that all connections have matching port data types.
    fn type_check(graph: &Graph) -> Result<(), CompileError> {
        for conn in graph.connections() {
            let from_port = graph
                .find_output_port(&conn.from_node, &conn.from_port)
                .ok_or_else(|| {
                    CompileError::InvalidGraph(format!(
                        "Output port {} not found on node {}",
                        conn.from_port, conn.from_node
                    ))
                })?;

            let to_port = graph
                .find_input_port(&conn.to_node, &conn.to_port)
                .ok_or_else(|| {
                    CompileError::InvalidGraph(format!(
                        "Input port {} not found on node {}",
                        conn.to_port, conn.to_node
                    ))
                })?;

            if from_port.data_type != to_port.data_type {
                return Err(CompileError::TypeMismatch {
                    connection: conn.id,
                    expected: to_port.data_type,
                    got: from_port.data_type,
                });
            }
        }
        Ok(())
    }

    /// Detect cycles in the graph using DFS and return the set of back-edge connection IDs
    /// that should be treated as feedback (z^-1 delay) edges.
    fn detect_cycles(graph: &Graph) -> Vec<ConnectionId> {
        // Build adjacency list: node -> [(target_node, connection_id)]
        let mut adjacency: HashMap<NodeId, Vec<(NodeId, ConnectionId)>> = HashMap::new();
        for node_id in graph.nodes().keys() {
            adjacency.entry(*node_id).or_default();
        }
        for conn in graph.connections() {
            adjacency
                .entry(conn.from_node)
                .or_default()
                .push((conn.to_node, conn.id));
        }

        // DFS coloring: White = unvisited, Gray = in current path, Black = fully processed.
        #[derive(Clone, Copy, PartialEq)]
        enum Color {
            White,
            Gray,
            Black,
        }

        let mut color: HashMap<NodeId, Color> = graph
            .nodes()
            .keys()
            .map(|id| (*id, Color::White))
            .collect();

        let mut back_edges: Vec<ConnectionId> = Vec::new();

        fn dfs(
            node: NodeId,
            adjacency: &HashMap<NodeId, Vec<(NodeId, ConnectionId)>>,
            color: &mut HashMap<NodeId, Color>,
            back_edges: &mut Vec<ConnectionId>,
        ) {
            color.insert(node, Color::Gray);

            if let Some(neighbors) = adjacency.get(&node) {
                for &(target, conn_id) in neighbors {
                    match color.get(&target) {
                        Some(Color::Gray) => {
                            // Back edge — this forms a cycle.
                            back_edges.push(conn_id);
                        }
                        Some(Color::White) => {
                            dfs(target, adjacency, color, back_edges);
                        }
                        _ => {}
                    }
                }
            }

            color.insert(node, Color::Black);
        }

        // Process all nodes (handles disconnected subgraphs).
        let node_ids: Vec<NodeId> = graph.nodes().keys().copied().collect();
        for node_id in &node_ids {
            if color[node_id] == Color::White {
                dfs(*node_id, &adjacency, &mut color, &mut back_edges);
            }
        }

        back_edges
    }

    /// Topological sort via Kahn's algorithm, ignoring feedback edges.
    /// Also computes parallel groups: sets of nodes that have the same "depth"
    /// and can be executed concurrently.
    fn topological_sort(
        graph: &Graph,
        feedback_edges: &[ConnectionId],
    ) -> Result<(Vec<NodeId>, Vec<Vec<NodeId>>), CompileError> {
        let feedback_set: HashSet<ConnectionId> =
            feedback_edges.iter().copied().collect();

        // Build in-degree map and adjacency, excluding feedback edges.
        let mut in_degree: HashMap<NodeId, usize> = HashMap::new();
        let mut adjacency: HashMap<NodeId, Vec<NodeId>> = HashMap::new();

        for node_id in graph.nodes().keys() {
            in_degree.entry(*node_id).or_insert(0);
            adjacency.entry(*node_id).or_default();
        }

        for conn in graph.connections() {
            if feedback_set.contains(&conn.id) {
                continue;
            }
            *in_degree.entry(conn.to_node).or_insert(0) += 1;
            adjacency
                .entry(conn.from_node)
                .or_default()
                .push(conn.to_node);
        }

        // Kahn's algorithm with level tracking for parallel groups.
        let mut queue: VecDeque<NodeId> = VecDeque::new();
        for (&node_id, &deg) in &in_degree {
            if deg == 0 {
                queue.push_back(node_id);
            }
        }

        let mut execution_order: Vec<NodeId> = Vec::new();
        let mut parallel_groups: Vec<Vec<NodeId>> = Vec::new();

        while !queue.is_empty() {
            // All nodes currently in the queue are at the same depth level
            // and can execute in parallel.
            let level_size = queue.len();
            let mut group: Vec<NodeId> = Vec::with_capacity(level_size);

            for _ in 0..level_size {
                let node = queue.pop_front().unwrap();
                group.push(node);
                execution_order.push(node);

                if let Some(neighbors) = adjacency.get(&node) {
                    for &neighbor in neighbors {
                        let deg = in_degree.get_mut(&neighbor).unwrap();
                        *deg -= 1;
                        if *deg == 0 {
                            queue.push_back(neighbor);
                        }
                    }
                }
            }

            // Sort the group for deterministic output.
            group.sort();
            parallel_groups.push(group);
        }

        // Check that we processed all nodes. If not, there's a cycle that we
        // didn't detect (shouldn't happen since we already removed feedback edges).
        if execution_order.len() != graph.node_count() {
            return Err(CompileError::InvalidGraph(
                "Topological sort failed: unresolvable cycle detected".to_string(),
            ));
        }

        // Re-sort execution_order to match the parallel group order (deterministic).
        let mut sorted_order = Vec::with_capacity(execution_order.len());
        for group in &parallel_groups {
            sorted_order.extend_from_slice(group);
        }

        Ok((sorted_order, parallel_groups))
    }

    /// Allocate buffers via interval-based graph coloring.
    ///
    /// Each connection needs a buffer. Two connections can share a buffer if their
    /// lifetimes don't overlap. A connection's lifetime starts when its source node
    /// is executed and ends when its destination node is executed.
    fn allocate_buffers(
        graph: &Graph,
        execution_order: &[NodeId],
        feedback_edges: &[ConnectionId],
    ) -> BufferLayout {
        let feedback_set: HashSet<ConnectionId> =
            feedback_edges.iter().copied().collect();

        // Map each node to its position in execution order.
        let position: HashMap<NodeId, usize> = execution_order
            .iter()
            .enumerate()
            .map(|(i, &id)| (id, i))
            .collect();

        // Collect non-feedback connections with their lifetimes (start, end).
        let mut intervals: Vec<(ConnectionId, usize, usize)> = Vec::new();

        for conn in graph.connections() {
            if feedback_set.contains(&conn.id) {
                continue;
            }
            if let (Some(&start), Some(&end)) =
                (position.get(&conn.from_node), position.get(&conn.to_node))
            {
                intervals.push((conn.id, start, end));
            }
        }

        // Sort by start position.
        intervals.sort_by_key(|&(_, start, _)| start);

        // Greedy interval coloring: assign the lowest-numbered buffer whose
        // previous interval has already ended.
        let mut assignments: HashMap<ConnectionId, BufferIndex> = HashMap::new();
        // For each buffer, track when it becomes free (end position of last assigned interval).
        let mut buffer_end_times: Vec<usize> = Vec::new();

        for (conn_id, start, end) in &intervals {
            // Find a buffer that is free (its end_time <= start).
            let mut best_buffer: Option<usize> = None;
            for (buf_idx, &buf_end) in buffer_end_times.iter().enumerate() {
                if buf_end <= *start {
                    best_buffer = Some(buf_idx);
                    break;
                }
            }

            match best_buffer {
                Some(buf_idx) => {
                    buffer_end_times[buf_idx] = *end;
                    assignments.insert(*conn_id, BufferIndex(buf_idx));
                }
                None => {
                    let buf_idx = buffer_end_times.len();
                    buffer_end_times.push(*end);
                    assignments.insert(*conn_id, BufferIndex(buf_idx));
                }
            }
        }

        // Feedback edges each get their own dedicated buffer (they persist across frames).
        for conn in graph.connections() {
            if feedback_set.contains(&conn.id) {
                let buf_idx = buffer_end_times.len();
                buffer_end_times.push(usize::MAX);
                assignments.insert(conn.id, BufferIndex(buf_idx));
            }
        }

        BufferLayout {
            buffer_count: buffer_end_times.len(),
            assignments,
        }
    }

    /// Recursively compile any subgraphs (nested graphs inside nodes).
    fn compile_subgraphs(
        graph: &Graph,
    ) -> Result<HashMap<NodeId, CompiledGraph>, CompileError> {
        let mut compiled = HashMap::new();

        for (node_id, descriptor) in graph.nodes() {
            if let Some(ref subgraph) = descriptor.subgraph {
                let compiled_sub = Self::compile(subgraph)?;
                compiled.insert(*node_id, compiled_sub);
            }
        }

        Ok(compiled)
    }
}
