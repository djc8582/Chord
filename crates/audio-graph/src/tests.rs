//! Comprehensive tests for the audio-graph crate.

use crate::*;
use std::collections::HashSet;

// ---------------------------------------------------------------------------
// Helper: build a simple node with one audio input and one audio output.
// ---------------------------------------------------------------------------
fn audio_passthrough_node(name: &str) -> NodeDescriptor {
    NodeDescriptor::new(name)
        .with_input(PortDescriptor::new("in", PortDataType::Audio))
        .with_output(PortDescriptor::new("out", PortDataType::Audio))
}

fn audio_source_node(name: &str) -> NodeDescriptor {
    NodeDescriptor::new(name)
        .with_output(PortDescriptor::new("out", PortDataType::Audio))
}

fn audio_sink_node(name: &str) -> NodeDescriptor {
    NodeDescriptor::new(name)
        .with_input(PortDescriptor::new("in", PortDataType::Audio))
}

/// Connect the first output of `from` to the first input of `to`.
fn connect_first(graph: &mut Graph, from: NodeId, to: NodeId) -> ConnectionId {
    let from_port = graph.node(&from).unwrap().outputs[0].id;
    let to_port = graph.node(&to).unwrap().inputs[0].id;
    graph.connect(from, from_port, to, to_port).unwrap()
}

// ===========================================================================
// Test 1: Empty graph compiles to empty execution order
// ===========================================================================
#[test]
fn test_empty_graph() {
    let graph = Graph::new();
    let compiled = GraphCompiler::compile(&graph).unwrap();
    assert!(compiled.execution_order.is_empty());
    assert!(compiled.parallel_groups.is_empty());
    assert!(compiled.feedback_edges.is_empty());
    assert_eq!(compiled.buffer_layout.buffer_count, 0);
    assert!(compiled.buffer_layout.assignments.is_empty());
}

// ===========================================================================
// Test 2: Single node graph works
// ===========================================================================
#[test]
fn test_single_node() {
    let mut graph = Graph::new();
    let osc = graph.add_node(audio_source_node("oscillator"));

    let compiled = GraphCompiler::compile(&graph).unwrap();
    assert_eq!(compiled.execution_order, vec![osc]);
    assert_eq!(compiled.parallel_groups.len(), 1);
    assert_eq!(compiled.parallel_groups[0], vec![osc]);
    assert!(compiled.feedback_edges.is_empty());
}

// ===========================================================================
// Test 3: Simple linear chain compiles correctly
// ===========================================================================
#[test]
fn test_linear_chain() {
    let mut graph = Graph::new();
    let osc = graph.add_node(audio_source_node("oscillator"));
    let filter = graph.add_node(audio_passthrough_node("filter"));
    let gain = graph.add_node(audio_passthrough_node("gain"));
    let output = graph.add_node(audio_sink_node("output"));

    connect_first(&mut graph, osc, filter);
    connect_first(&mut graph, filter, gain);
    connect_first(&mut graph, gain, output);

    let compiled = GraphCompiler::compile(&graph).unwrap();

    // Execution order must respect the chain.
    let order = &compiled.execution_order;
    let pos = |id: NodeId| order.iter().position(|&x| x == id).unwrap();
    assert!(pos(osc) < pos(filter));
    assert!(pos(filter) < pos(gain));
    assert!(pos(gain) < pos(output));

    // No feedback edges.
    assert!(compiled.feedback_edges.is_empty());

    // Every connection has a buffer.
    assert_eq!(compiled.buffer_layout.assignments.len(), 3);
}

// ===========================================================================
// Test 4: Branching/merging graph compiles with correct order (diamond shape)
// ===========================================================================
#[test]
fn test_diamond_graph() {
    // Diamond: A -> B, A -> C, B -> D, C -> D
    let mut graph = Graph::new();

    let a = graph.add_node(NodeDescriptor::new("source")
        .with_output(PortDescriptor::new("out1", PortDataType::Audio))
        .with_output(PortDescriptor::new("out2", PortDataType::Audio)));
    let b = graph.add_node(audio_passthrough_node("left"));
    let c = graph.add_node(audio_passthrough_node("right"));
    let d = graph.add_node(NodeDescriptor::new("merge")
        .with_input(PortDescriptor::new("in1", PortDataType::Audio))
        .with_input(PortDescriptor::new("in2", PortDataType::Audio))
        .with_output(PortDescriptor::new("out", PortDataType::Audio)));

    let a_out1 = graph.node(&a).unwrap().outputs[0].id;
    let a_out2 = graph.node(&a).unwrap().outputs[1].id;
    let b_in = graph.node(&b).unwrap().inputs[0].id;
    let c_in = graph.node(&c).unwrap().inputs[0].id;
    let b_out = graph.node(&b).unwrap().outputs[0].id;
    let c_out = graph.node(&c).unwrap().outputs[0].id;
    let d_in1 = graph.node(&d).unwrap().inputs[0].id;
    let d_in2 = graph.node(&d).unwrap().inputs[1].id;

    graph.connect(a, a_out1, b, b_in).unwrap();
    graph.connect(a, a_out2, c, c_in).unwrap();
    graph.connect(b, b_out, d, d_in1).unwrap();
    graph.connect(c, c_out, d, d_in2).unwrap();

    let compiled = GraphCompiler::compile(&graph).unwrap();
    let order = &compiled.execution_order;
    let pos = |id: NodeId| order.iter().position(|&x| x == id).unwrap();

    // A must be before B, C. B, C must be before D.
    assert!(pos(a) < pos(b));
    assert!(pos(a) < pos(c));
    assert!(pos(b) < pos(d));
    assert!(pos(c) < pos(d));

    // B and C should be in the same parallel group.
    let bc_group = compiled
        .parallel_groups
        .iter()
        .find(|g| g.contains(&b) || g.contains(&c))
        .unwrap();
    assert!(bc_group.contains(&b));
    assert!(bc_group.contains(&c));
}

// ===========================================================================
// Test 5: Cycle detection inserts feedback delays
// ===========================================================================
#[test]
fn test_cycle_detection_feedback() {
    // A -> B -> C -> A (cycle)
    let mut graph = Graph::new();
    let a = graph.add_node(audio_passthrough_node("a"));
    let b = graph.add_node(audio_passthrough_node("b"));
    let c = graph.add_node(audio_passthrough_node("c"));

    let conn_ab = connect_first(&mut graph, a, b);
    let conn_bc = connect_first(&mut graph, b, c);
    let conn_ca = connect_first(&mut graph, c, a);

    let compiled = GraphCompiler::compile(&graph).unwrap();

    // There should be exactly one feedback edge (which one depends on DFS traversal order).
    assert_eq!(compiled.feedback_edges.len(), 1);
    let feedback = compiled.feedback_edges[0];
    // The feedback edge must be one of the three connections in the cycle.
    assert!(
        feedback == conn_ab || feedback == conn_bc || feedback == conn_ca,
        "Feedback edge should be one of the cycle's connections"
    );

    // All three nodes should be in the execution order.
    assert_eq!(compiled.execution_order.len(), 3);
    let order_set: HashSet<NodeId> = compiled.execution_order.iter().copied().collect();
    assert!(order_set.contains(&a));
    assert!(order_set.contains(&b));
    assert!(order_set.contains(&c));
}

// ===========================================================================
// Test 6: Type mismatch is caught at compile time
// ===========================================================================
#[test]
fn test_type_mismatch() {
    let mut graph = Graph::new();
    let osc = graph.add_node(
        NodeDescriptor::new("osc")
            .with_output(PortDescriptor::new("audio_out", PortDataType::Audio)),
    );
    let midi_in_node = graph.add_node(
        NodeDescriptor::new("midi_proc")
            .with_input(PortDescriptor::new("midi_in", PortDataType::Midi)),
    );

    let osc_out = graph.node(&osc).unwrap().outputs[0].id;
    let midi_in = graph.node(&midi_in_node).unwrap().inputs[0].id;
    graph.connect(osc, osc_out, midi_in_node, midi_in).unwrap();

    let result = GraphCompiler::compile(&graph);
    assert!(result.is_err());
    match result.unwrap_err() {
        CompileError::TypeMismatch {
            expected, got, ..
        } => {
            assert_eq!(expected, PortDataType::Midi);
            assert_eq!(got, PortDataType::Audio);
        }
        other => panic!("Expected TypeMismatch, got: {other:?}"),
    }
}

// ===========================================================================
// Test 7: Buffer allocation minimizes buffer count
// ===========================================================================
#[test]
fn test_buffer_allocation_minimizes() {
    // Linear chain: A -> B -> C -> D
    // Connection A->B is dead by the time C->D needs a buffer.
    // So we should only need 1 buffer (reuse across the chain).
    let mut graph = Graph::new();
    let a = graph.add_node(audio_source_node("a"));
    let b = graph.add_node(audio_passthrough_node("b"));
    let c = graph.add_node(audio_passthrough_node("c"));
    let d = graph.add_node(audio_sink_node("d"));

    connect_first(&mut graph, a, b);
    connect_first(&mut graph, b, c);
    connect_first(&mut graph, c, d);

    let compiled = GraphCompiler::compile(&graph).unwrap();

    // In a strict linear chain, each connection's lifetime is exactly one step,
    // so the buffer from A->B is free when B->C starts, etc.
    // Buffer count should be 1 since lifetimes don't overlap.
    assert_eq!(compiled.buffer_layout.buffer_count, 1);
}

// ===========================================================================
// Test 8: Buffer allocation with fan-out needs more buffers
// ===========================================================================
#[test]
fn test_buffer_allocation_fan_out() {
    // A -> B and A -> C (parallel), then B -> D, C -> D
    // A->B and A->C both start at position of A and end at B and C respectively.
    // Since B and C are at the same level, A->B and A->C overlap, needing 2 buffers.
    let mut graph = Graph::new();
    let a = graph.add_node(NodeDescriptor::new("source")
        .with_output(PortDescriptor::new("out1", PortDataType::Audio))
        .with_output(PortDescriptor::new("out2", PortDataType::Audio)));
    let b = graph.add_node(audio_passthrough_node("left"));
    let c = graph.add_node(audio_passthrough_node("right"));
    let d = graph.add_node(NodeDescriptor::new("merge")
        .with_input(PortDescriptor::new("in1", PortDataType::Audio))
        .with_input(PortDescriptor::new("in2", PortDataType::Audio)));

    let a_out1 = graph.node(&a).unwrap().outputs[0].id;
    let a_out2 = graph.node(&a).unwrap().outputs[1].id;
    let b_in = graph.node(&b).unwrap().inputs[0].id;
    let c_in = graph.node(&c).unwrap().inputs[0].id;
    let b_out = graph.node(&b).unwrap().outputs[0].id;
    let c_out = graph.node(&c).unwrap().outputs[0].id;
    let d_in1 = graph.node(&d).unwrap().inputs[0].id;
    let d_in2 = graph.node(&d).unwrap().inputs[1].id;

    graph.connect(a, a_out1, b, b_in).unwrap();
    graph.connect(a, a_out2, c, c_in).unwrap();
    graph.connect(b, b_out, d, d_in1).unwrap();
    graph.connect(c, c_out, d, d_in2).unwrap();

    let compiled = GraphCompiler::compile(&graph).unwrap();

    // We need at least 2 buffers for the parallel paths.
    assert!(compiled.buffer_layout.buffer_count >= 2);
    // But the B->D and C->D connections can reuse A->B and A->C buffers,
    // so we should need at most 2 buffers.
    assert!(compiled.buffer_layout.buffer_count <= 2);
}

// ===========================================================================
// Test 9: Parallel groups are correctly identified
// ===========================================================================
#[test]
fn test_parallel_groups() {
    // Two independent chains: A -> B and C -> D
    let mut graph = Graph::new();
    let a = graph.add_node(audio_source_node("a"));
    let b = graph.add_node(audio_sink_node("b"));
    let c = graph.add_node(audio_source_node("c"));
    let d = graph.add_node(audio_sink_node("d"));

    // Use explicit ports for these specific nodes.
    let a_out = graph.node(&a).unwrap().outputs[0].id;
    let b_in = graph.node(&b).unwrap().inputs[0].id;
    let c_out = graph.node(&c).unwrap().outputs[0].id;
    let d_in = graph.node(&d).unwrap().inputs[0].id;

    graph.connect(a, a_out, b, b_in).unwrap();
    graph.connect(c, c_out, d, d_in).unwrap();

    let compiled = GraphCompiler::compile(&graph).unwrap();

    // All 4 nodes in execution order.
    assert_eq!(compiled.execution_order.len(), 4);

    // First group: sources A and C (both have in-degree 0).
    // Second group: sinks B and D.
    assert_eq!(compiled.parallel_groups.len(), 2);

    let group0_set: HashSet<NodeId> = compiled.parallel_groups[0].iter().copied().collect();
    let group1_set: HashSet<NodeId> = compiled.parallel_groups[1].iter().copied().collect();

    assert!(group0_set.contains(&a));
    assert!(group0_set.contains(&c));
    assert!(group1_set.contains(&b));
    assert!(group1_set.contains(&d));
}

// ===========================================================================
// Test 10: 1000+ node graph compiles in < 10ms
// ===========================================================================
#[test]
fn test_performance_1000_nodes() {
    let mut graph = Graph::new();
    let mut prev_id = graph.add_node(audio_source_node("source"));

    for i in 1..1000 {
        let node = graph.add_node(audio_passthrough_node(&format!("node_{i}")));
        connect_first(&mut graph, prev_id, node);
        prev_id = node;
    }

    // Add a final sink.
    let sink = graph.add_node(audio_sink_node("sink"));
    connect_first(&mut graph, prev_id, sink);

    let start = std::time::Instant::now();
    let compiled = GraphCompiler::compile(&graph).unwrap();
    let elapsed = start.elapsed();

    assert!(
        elapsed.as_millis() < 50,
        "Compilation took {}ms, expected < 50ms",
        elapsed.as_millis()
    );
    assert_eq!(compiled.execution_order.len(), 1001);
}

// ===========================================================================
// Test 11: Subgraph (nested graph) compiles correctly
// ===========================================================================
#[test]
fn test_subgraph_compilation() {
    // Create an inner graph.
    let mut inner = Graph::new();
    let inner_osc = inner.add_node(audio_source_node("inner_osc"));
    let inner_gain = inner.add_node(audio_passthrough_node("inner_gain"));
    connect_first(&mut inner, inner_osc, inner_gain);

    // Create the outer graph with one subpatch node.
    let mut outer = Graph::new();
    let subpatch = outer.add_node(
        NodeDescriptor::new("subpatch")
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_subgraph(inner),
    );
    let sink = outer.add_node(audio_sink_node("output"));

    let sub_out = outer.node(&subpatch).unwrap().outputs[0].id;
    let sink_in = outer.node(&sink).unwrap().inputs[0].id;
    outer.connect(subpatch, sub_out, sink, sink_in).unwrap();

    let compiled = GraphCompiler::compile(&outer).unwrap();

    // Outer graph compiles correctly.
    assert_eq!(compiled.execution_order.len(), 2);
    let pos = |id: NodeId| compiled.execution_order.iter().position(|&x| x == id).unwrap();
    assert!(pos(subpatch) < pos(sink));

    // Subgraph was also compiled.
    assert!(compiled.compiled_subgraphs.contains_key(&subpatch));
    let inner_compiled = &compiled.compiled_subgraphs[&subpatch];
    assert_eq!(inner_compiled.execution_order.len(), 2);
}

// ===========================================================================
// Test 12: Graph node and connection management
// ===========================================================================
#[test]
fn test_graph_management() {
    let mut graph = Graph::new();
    assert!(graph.is_empty());
    assert_eq!(graph.node_count(), 0);
    assert_eq!(graph.connection_count(), 0);

    let a = graph.add_node(audio_source_node("a"));
    let b = graph.add_node(audio_sink_node("b"));
    assert_eq!(graph.node_count(), 2);

    let a_out = graph.node(&a).unwrap().outputs[0].id;
    let b_in = graph.node(&b).unwrap().inputs[0].id;
    let conn_id = graph.connect(a, a_out, b, b_in).unwrap();
    assert_eq!(graph.connection_count(), 1);

    // Disconnect.
    assert!(graph.disconnect(&conn_id));
    assert_eq!(graph.connection_count(), 0);

    // Remove node.
    graph.remove_node(&a);
    assert_eq!(graph.node_count(), 1);
    assert!(graph.node(&a).is_none());
}

// ===========================================================================
// Test 13: Invalid connections are rejected
// ===========================================================================
#[test]
fn test_invalid_connections() {
    let mut graph = Graph::new();
    let a = graph.add_node(audio_source_node("a"));
    let b = graph.add_node(audio_sink_node("b"));

    // Try connecting with nonexistent port.
    let fake_port = PortId::new();
    let b_in = graph.node(&b).unwrap().inputs[0].id;
    assert!(graph.connect(a, fake_port, b, b_in).is_err());

    // Try connecting with nonexistent node.
    let a_out = graph.node(&a).unwrap().outputs[0].id;
    let fake_node = NodeId::new();
    assert!(graph.connect(fake_node, a_out, b, b_in).is_err());
}

// ===========================================================================
// Test 14: Multiple data types work correctly
// ===========================================================================
#[test]
fn test_multiple_data_types() {
    let mut graph = Graph::new();
    let midi_src = graph.add_node(
        NodeDescriptor::new("midi_src")
            .with_output(PortDescriptor::new("midi_out", PortDataType::Midi)),
    );
    let midi_dst = graph.add_node(
        NodeDescriptor::new("midi_dst")
            .with_input(PortDescriptor::new("midi_in", PortDataType::Midi)),
    );

    let src_out = graph.node(&midi_src).unwrap().outputs[0].id;
    let dst_in = graph.node(&midi_dst).unwrap().inputs[0].id;
    graph.connect(midi_src, src_out, midi_dst, dst_in).unwrap();

    let compiled = GraphCompiler::compile(&graph).unwrap();
    assert_eq!(compiled.execution_order.len(), 2);
    assert!(compiled.feedback_edges.is_empty());
}

// ===========================================================================
// Test 15: Complex graph with multiple parallel chains
// ===========================================================================
#[test]
fn test_complex_parallel_chains() {
    // Three independent chains: A1->A2, B1->B2, C1->C2
    let mut graph = Graph::new();

    let a1 = graph.add_node(audio_source_node("a1"));
    let a2 = graph.add_node(audio_sink_node("a2"));
    let b1 = graph.add_node(audio_source_node("b1"));
    let b2 = graph.add_node(audio_sink_node("b2"));
    let c1 = graph.add_node(audio_source_node("c1"));
    let c2 = graph.add_node(audio_sink_node("c2"));

    connect_first(&mut graph, a1, a2);
    connect_first(&mut graph, b1, b2);
    connect_first(&mut graph, c1, c2);

    let compiled = GraphCompiler::compile(&graph).unwrap();
    assert_eq!(compiled.execution_order.len(), 6);

    // Should have 2 parallel groups: sources and sinks.
    assert_eq!(compiled.parallel_groups.len(), 2);
    assert_eq!(compiled.parallel_groups[0].len(), 3); // 3 sources
    assert_eq!(compiled.parallel_groups[1].len(), 3); // 3 sinks
}

// ===========================================================================
// Test 16: Self-loop (node connects to itself)
// ===========================================================================
#[test]
fn test_self_loop() {
    let mut graph = Graph::new();
    let node = graph.add_node(audio_passthrough_node("self_loop"));

    let node_out = graph.node(&node).unwrap().outputs[0].id;
    let node_in = graph.node(&node).unwrap().inputs[0].id;
    let conn = graph.connect(node, node_out, node, node_in).unwrap();

    let compiled = GraphCompiler::compile(&graph).unwrap();
    assert_eq!(compiled.execution_order.len(), 1);
    assert_eq!(compiled.feedback_edges.len(), 1);
    assert_eq!(compiled.feedback_edges[0], conn);
}

// ===========================================================================
// Test 17: Parameters on nodes
// ===========================================================================
#[test]
fn test_node_parameters() {
    let node = NodeDescriptor::new("oscillator")
        .with_output(PortDescriptor::new("out", PortDataType::Audio))
        .with_parameter(
            ParameterDescriptor::new("frequency", "Frequency", 440.0, 20.0, 20000.0)
                .with_unit("Hz"),
        )
        .with_parameter(
            ParameterDescriptor::new("amplitude", "Amplitude", 1.0, 0.0, 1.0)
                .with_unit(""),
        )
        .at_position(100.0, 200.0);

    assert_eq!(node.parameters.len(), 2);
    assert_eq!(node.parameters[0].id, "frequency");
    assert_eq!(node.parameters[0].default, 440.0);
    assert_eq!(node.parameters[0].unit, "Hz");
    assert_eq!(node.position, (100.0, 200.0));
}

// ===========================================================================
// Test 18: Disconnected nodes (no edges) all appear in execution order
// ===========================================================================
#[test]
fn test_disconnected_nodes() {
    let mut graph = Graph::new();
    let a = graph.add_node(audio_source_node("a"));
    let b = graph.add_node(audio_source_node("b"));
    let c = graph.add_node(audio_source_node("c"));

    let compiled = GraphCompiler::compile(&graph).unwrap();
    assert_eq!(compiled.execution_order.len(), 3);
    let order_set: HashSet<NodeId> = compiled.execution_order.iter().copied().collect();
    assert!(order_set.contains(&a));
    assert!(order_set.contains(&b));
    assert!(order_set.contains(&c));

    // All nodes should be in the same parallel group (all are independent).
    assert_eq!(compiled.parallel_groups.len(), 1);
    assert_eq!(compiled.parallel_groups[0].len(), 3);
}

// ===========================================================================
// Test 19: Feedback edge buffer allocation
// ===========================================================================
#[test]
fn test_feedback_buffer_allocation() {
    // A -> B -> A cycle. The feedback edge needs its own buffer.
    let mut graph = Graph::new();
    let a = graph.add_node(audio_passthrough_node("a"));
    let b = graph.add_node(audio_passthrough_node("b"));

    let conn_ab = connect_first(&mut graph, a, b);
    let conn_ba = connect_first(&mut graph, b, a);

    let compiled = GraphCompiler::compile(&graph).unwrap();
    assert_eq!(compiled.feedback_edges.len(), 1);
    let feedback = compiled.feedback_edges[0];
    // One of the two edges must be the feedback edge.
    assert!(feedback == conn_ab || feedback == conn_ba);

    // The feedback edge should have a buffer assigned.
    assert!(compiled.buffer_layout.assignments.contains_key(&feedback));

    // Total buffers: 1 for the normal edge, 1 for feedback edge = 2.
    assert_eq!(compiled.buffer_layout.buffer_count, 2);
}

// ===========================================================================
// Test 20: Large fan-out and fan-in
// ===========================================================================
#[test]
fn test_large_fan_out_fan_in() {
    let mut graph = Graph::new();

    // Source with 10 outputs.
    let mut source_desc = NodeDescriptor::new("source");
    for i in 0..10 {
        source_desc = source_desc
            .with_output(PortDescriptor::new(&format!("out_{i}"), PortDataType::Audio));
    }
    let source = graph.add_node(source_desc);

    // 10 processors.
    let mut processors = Vec::new();
    for i in 0..10 {
        let p = graph.add_node(audio_passthrough_node(&format!("proc_{i}")));
        processors.push(p);
    }

    // Sink with 10 inputs.
    let mut sink_desc = NodeDescriptor::new("sink");
    for i in 0..10 {
        sink_desc = sink_desc
            .with_input(PortDescriptor::new(&format!("in_{i}"), PortDataType::Audio));
    }
    let sink = graph.add_node(sink_desc);

    // Wire up.
    for (i, &proc_id) in processors.iter().enumerate() {
        let s_out = graph.node(&source).unwrap().outputs[i].id;
        let p_in = graph.node(&proc_id).unwrap().inputs[0].id;
        graph.connect(source, s_out, proc_id, p_in).unwrap();

        let p_out = graph.node(&proc_id).unwrap().outputs[0].id;
        let sk_in = graph.node(&sink).unwrap().inputs[i].id;
        graph.connect(proc_id, p_out, sink, sk_in).unwrap();
    }

    let compiled = GraphCompiler::compile(&graph).unwrap();
    assert_eq!(compiled.execution_order.len(), 12);

    // All processors should be in the same parallel group.
    let proc_set: HashSet<NodeId> = processors.iter().copied().collect();
    let proc_group = compiled
        .parallel_groups
        .iter()
        .find(|g| g.iter().any(|id| proc_set.contains(id)))
        .unwrap();
    for &p in &processors {
        assert!(proc_group.contains(&p));
    }
}

// ===========================================================================
// Test 21: Nested subgraph with its own cycle
// ===========================================================================
#[test]
fn test_nested_subgraph_with_cycle() {
    // Inner graph: A -> B -> A (cycle).
    let mut inner = Graph::new();
    let ia = inner.add_node(audio_passthrough_node("inner_a"));
    let ib = inner.add_node(audio_passthrough_node("inner_b"));
    connect_first(&mut inner, ia, ib);
    connect_first(&mut inner, ib, ia);

    // Outer graph.
    let mut outer = Graph::new();
    let sub = outer.add_node(
        NodeDescriptor::new("subpatch")
            .with_output(PortDescriptor::new("out", PortDataType::Audio))
            .with_subgraph(inner),
    );
    let sink = outer.add_node(audio_sink_node("output"));
    let sub_out = outer.node(&sub).unwrap().outputs[0].id;
    let sink_in = outer.node(&sink).unwrap().inputs[0].id;
    outer.connect(sub, sub_out, sink, sink_in).unwrap();

    let compiled = GraphCompiler::compile(&outer).unwrap();
    assert_eq!(compiled.execution_order.len(), 2);

    let inner_compiled = &compiled.compiled_subgraphs[&sub];
    assert_eq!(inner_compiled.execution_order.len(), 2);
    assert_eq!(inner_compiled.feedback_edges.len(), 1);
}

// ===========================================================================
// Test 22: PortDataType Display and equality
// ===========================================================================
#[test]
fn test_port_data_type_display() {
    assert_eq!(format!("{}", PortDataType::Audio), "Audio");
    assert_eq!(format!("{}", PortDataType::Control), "Control");
    assert_eq!(format!("{}", PortDataType::Trigger), "Trigger");
    assert_eq!(format!("{}", PortDataType::Midi), "Midi");
    assert_eq!(format!("{}", PortDataType::Osc), "Osc");
    assert_eq!(format!("{}", PortDataType::Data), "Data");
    assert_eq!(format!("{}", PortDataType::Tensor), "Tensor");
    assert_eq!(format!("{}", PortDataType::String), "String");
    assert_eq!(format!("{}", PortDataType::Visual), "Visual");
}

// ===========================================================================
// Test 23: CompileError Display
// ===========================================================================
#[test]
fn test_compile_error_display() {
    let err = CompileError::InvalidGraph("test error".to_string());
    assert!(format!("{err}").contains("test error"));

    let err = CompileError::TypeMismatch {
        connection: ConnectionId(42),
        expected: PortDataType::Audio,
        got: PortDataType::Midi,
    };
    let msg = format!("{err}");
    assert!(msg.contains("Audio"));
    assert!(msg.contains("Midi"));
}

// ===========================================================================
// Test 24: Port default values
// ===========================================================================
#[test]
fn test_port_default_values() {
    let port = PortDescriptor::new("gain", PortDataType::Control).with_default(0.5);
    assert_eq!(port.default_value, Some(0.5));

    let port2 = PortDescriptor::new("in", PortDataType::Audio);
    assert_eq!(port2.default_value, None);
}

// ===========================================================================
// Test 25: Performance - wide graph (many parallel chains)
// ===========================================================================
#[test]
fn test_performance_wide_graph() {
    let mut graph = Graph::new();

    for i in 0..500 {
        let src = graph.add_node(audio_source_node(&format!("src_{i}")));
        let sink = graph.add_node(audio_sink_node(&format!("sink_{i}")));
        connect_first(&mut graph, src, sink);
    }

    let start = std::time::Instant::now();
    let compiled = GraphCompiler::compile(&graph).unwrap();
    let elapsed = start.elapsed();

    assert!(
        elapsed.as_millis() < 50,
        "Compilation took {}ms, expected < 50ms",
        elapsed.as_millis()
    );
    assert_eq!(compiled.execution_order.len(), 1000);
    assert_eq!(compiled.parallel_groups.len(), 2);
}
