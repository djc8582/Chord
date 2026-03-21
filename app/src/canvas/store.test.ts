/**
 * Canvas Store Tests
 *
 * Tests covering the Definition of Done:
 * - Nodes render from Yjs document
 * - Drag nodes to move (position updates in Yjs)
 * - Draw connections between compatible ports
 * - Delete nodes and connections
 * - Node search palette spawns nodes
 * - Copy/paste works
 * - Rubber band selection works (via selectAll/clearSelection)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPatchDocument, getPatchDocument, addNode, connect } from "@chord/document-model";
import {
  useCanvasStore,
  nodeDataToFlowNode,
  connectionDataToFlowEdge,
  NODE_TYPE_REGISTRY,
  PORT_COLORS,
} from "./store";
import type { NodeData, ConnectionData } from "@chord/document-model";

// Reset store before each test
beforeEach(() => {
  const doc = createPatchDocument();
  useCanvasStore.getState().initDocument(doc);
});

// ---------------------------------------------------------------------------
// nodeDataToFlowNode
// ---------------------------------------------------------------------------

describe("nodeDataToFlowNode", () => {
  it("converts NodeData to a React Flow Node with correct fields", () => {
    const data: NodeData = {
      id: "n1",
      type: "oscillator",
      position: { x: 100, y: 200 },
      parameters: { frequency: 440 },
      name: "Osc 1",
    };

    const flowNode = nodeDataToFlowNode(data);

    expect(flowNode.id).toBe("n1");
    expect(flowNode.type).toBe("chordNode");
    expect(flowNode.position).toEqual({ x: 100, y: 200 });
    expect(flowNode.data.label).toBe("Osc 1");
    expect(flowNode.data.nodeType).toBe("oscillator");
    expect(flowNode.data.parameters).toEqual({ frequency: 440 });
  });

  it("includes port definitions from the NODE_TYPE_REGISTRY", () => {
    const data: NodeData = {
      id: "n1",
      type: "filter",
      position: { x: 0, y: 0 },
      parameters: {},
      name: "Filter",
    };

    const flowNode = nodeDataToFlowNode(data);
    expect(flowNode.data.inputs).toHaveLength(3); // input, cutoff, resonance
    expect(flowNode.data.outputs).toHaveLength(1); // output
  });

  it("handles unknown node types gracefully (empty ports)", () => {
    const data: NodeData = {
      id: "n1",
      type: "unknown_type",
      position: { x: 0, y: 0 },
      parameters: {},
      name: "Unknown",
    };

    const flowNode = nodeDataToFlowNode(data);
    expect(flowNode.data.inputs).toEqual([]);
    expect(flowNode.data.outputs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// connectionDataToFlowEdge
// ---------------------------------------------------------------------------

describe("connectionDataToFlowEdge", () => {
  it("converts ConnectionData to a React Flow Edge", () => {
    const data: ConnectionData = {
      id: "c1",
      fromNode: "n1",
      fromPort: "output",
      toNode: "n2",
      toPort: "input",
    };

    const edge = connectionDataToFlowEdge(data);

    expect(edge.id).toBe("c1");
    expect(edge.source).toBe("n1");
    expect(edge.sourceHandle).toBe("output");
    expect(edge.target).toBe("n2");
    expect(edge.targetHandle).toBe("input");
    expect(edge.type).toBe("smoothstep");
    expect(edge.animated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NODE_TYPE_REGISTRY
// ---------------------------------------------------------------------------

describe("NODE_TYPE_REGISTRY", () => {
  it("contains all expected node types", () => {
    const types = Object.keys(NODE_TYPE_REGISTRY);
    expect(types).toContain("oscillator");
    expect(types).toContain("filter");
    expect(types).toContain("gain");
    expect(types).toContain("envelope");
    expect(types).toContain("lfo");
    expect(types).toContain("mixer");
    expect(types).toContain("output");
    expect(types).toContain("input");
    expect(types).toContain("delay");
    expect(types).toContain("reverb");
    expect(types).toContain("midi_in");
    expect(types).toContain("noise");
  });

  it("each type has valid port definitions", () => {
    for (const [type, def] of Object.entries(NODE_TYPE_REGISTRY)) {
      expect(def.type).toBe(type);
      expect(def.label).toBeTruthy();
      expect(def.category).toBeTruthy();
      expect(Array.isArray(def.inputs)).toBe(true);
      expect(Array.isArray(def.outputs)).toBe(true);

      for (const port of [...def.inputs, ...def.outputs]) {
        expect(port.id).toBeTruthy();
        expect(port.label).toBeTruthy();
        expect(["audio", "control", "midi", "trigger"]).toContain(port.type);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// PORT_COLORS
// ---------------------------------------------------------------------------

describe("PORT_COLORS", () => {
  it("maps all four signal types to colors", () => {
    expect(PORT_COLORS.audio).toBeTruthy();
    expect(PORT_COLORS.control).toBeTruthy();
    expect(PORT_COLORS.midi).toBeTruthy();
    expect(PORT_COLORS.trigger).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Store: addNode / syncFromDocument (Nodes render from Yjs)
// ---------------------------------------------------------------------------

describe("store: nodes render from Yjs document", () => {
  it("starts with empty nodes and edges", () => {
    const state = useCanvasStore.getState();
    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
  });

  it("addNode creates a node in Yjs and syncs to React Flow nodes", () => {
    const store = useCanvasStore.getState();
    const id = store.addNode("oscillator", { x: 100, y: 200 }, "Osc 1");

    expect(id).toBeTruthy();

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].id).toBe(id);
    expect(state.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(state.nodes[0].data.label).toBe("Osc 1");
    expect(state.nodes[0].data.nodeType).toBe("oscillator");
  });

  it("adding multiple nodes reflects in store", () => {
    const store = useCanvasStore.getState();
    store.addNode("oscillator", { x: 0, y: 0 });
    store.addNode("filter", { x: 200, y: 0 });
    store.addNode("output", { x: 400, y: 0 });

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(3);
  });

  it("nodes match the underlying Yjs document data", () => {
    const store = useCanvasStore.getState();
    const id = store.addNode("gain", { x: 50, y: 75 }, "My Gain");

    const patch = getPatchDocument(store.ydoc);
    const yjsNode = patch.nodes.get(id);

    expect(yjsNode).toBeDefined();
    expect(yjsNode!.id).toBe(id);
    expect(yjsNode!.type).toBe("gain");
    expect(yjsNode!.position).toEqual({ x: 50, y: 75 });
    expect(yjsNode!.name).toBe("My Gain");
  });
});

// ---------------------------------------------------------------------------
// Store: updateNodePosition (Drag nodes — position updates in Yjs)
// ---------------------------------------------------------------------------

describe("store: drag nodes to move", () => {
  it("updateNodePosition updates position in both store and Yjs", () => {
    const store = useCanvasStore.getState();
    const id = store.addNode("oscillator", { x: 0, y: 0 });

    useCanvasStore.getState().updateNodePosition(id, { x: 300, y: 400 });

    // Check store
    const state = useCanvasStore.getState();
    const node = state.nodes.find((n) => n.id === id);
    expect(node?.position).toEqual({ x: 300, y: 400 });

    // Check Yjs
    const patch = getPatchDocument(state.ydoc);
    const yjsNode = patch.nodes.get(id);
    expect(yjsNode!.position).toEqual({ x: 300, y: 400 });
  });
});

// ---------------------------------------------------------------------------
// Store: connectPorts / disconnectEdge (Draw connections)
// ---------------------------------------------------------------------------

describe("store: draw connections between ports", () => {
  it("connectPorts creates an edge in both store and Yjs", () => {
    const store = useCanvasStore.getState();
    const n1 = store.addNode("oscillator", { x: 0, y: 0 });
    const n2 = store.addNode("filter", { x: 200, y: 0 });

    const connId = useCanvasStore.getState().connectPorts(n1, "output", n2, "input");
    expect(connId).toBeTruthy();

    const state = useCanvasStore.getState();
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0].source).toBe(n1);
    expect(state.edges[0].sourceHandle).toBe("output");
    expect(state.edges[0].target).toBe(n2);
    expect(state.edges[0].targetHandle).toBe("input");
  });

  it("connections are reflected in Yjs document", () => {
    const store = useCanvasStore.getState();
    const n1 = store.addNode("oscillator", { x: 0, y: 0 });
    const n2 = store.addNode("filter", { x: 200, y: 0 });

    const connId = useCanvasStore.getState().connectPorts(n1, "output", n2, "input");

    const patch = getPatchDocument(useCanvasStore.getState().ydoc);
    const connections = patch.connections.toArray();
    expect(connections).toHaveLength(1);
    expect(connections[0].id).toBe(connId);
    expect(connections[0].fromNode).toBe(n1);
    expect(connections[0].toNode).toBe(n2);
  });

  it("disconnectEdge removes the edge from store and Yjs", () => {
    const store = useCanvasStore.getState();
    const n1 = store.addNode("oscillator", { x: 0, y: 0 });
    const n2 = store.addNode("filter", { x: 200, y: 0 });
    const connId = useCanvasStore.getState().connectPorts(n1, "output", n2, "input");

    useCanvasStore.getState().disconnectEdge(connId);

    const state = useCanvasStore.getState();
    expect(state.edges).toHaveLength(0);

    const patch = getPatchDocument(state.ydoc);
    expect(patch.connections.toArray()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Store: removeNode / removeSelectedNodes (Delete nodes)
// ---------------------------------------------------------------------------

describe("store: delete nodes and connections", () => {
  it("removeNode removes a node and its connections", () => {
    const store = useCanvasStore.getState();
    const n1 = store.addNode("oscillator", { x: 0, y: 0 });
    const n2 = store.addNode("filter", { x: 200, y: 0 });
    useCanvasStore.getState().connectPorts(n1, "output", n2, "input");

    useCanvasStore.getState().removeNode(n1);

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].id).toBe(n2);
    expect(state.edges).toHaveLength(0);
  });

  it("removeSelectedNodes removes all selected nodes", () => {
    const store = useCanvasStore.getState();
    const n1 = store.addNode("oscillator", { x: 0, y: 0 });
    const n2 = store.addNode("filter", { x: 200, y: 0 });
    const n3 = store.addNode("output", { x: 400, y: 0 });

    // Manually set selection
    useCanvasStore.setState({ selectedNodeIds: [n1, n2] });
    useCanvasStore.getState().removeSelectedNodes();

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].id).toBe(n3);
  });
});

// ---------------------------------------------------------------------------
// Store: search palette
// ---------------------------------------------------------------------------

describe("store: node search palette", () => {
  it("openSearch/closeSearch toggles search state", () => {
    useCanvasStore.getState().openSearch();
    expect(useCanvasStore.getState().searchOpen).toBe(true);

    useCanvasStore.getState().closeSearch();
    expect(useCanvasStore.getState().searchOpen).toBe(false);
  });

  it("setSearchQuery updates the query", () => {
    useCanvasStore.getState().setSearchQuery("osc");
    expect(useCanvasStore.getState().searchQuery).toBe("osc");
  });

  it("addNode from search creates a node at the specified position", () => {
    const store = useCanvasStore.getState();
    const id = store.addNode("oscillator", { x: 250, y: 300 }, "Oscillator");

    const state = useCanvasStore.getState();
    const node = state.nodes.find((n) => n.id === id);
    expect(node).toBeDefined();
    expect(node!.position).toEqual({ x: 250, y: 300 });
    expect(node!.data.label).toBe("Oscillator");
  });
});

// ---------------------------------------------------------------------------
// Store: selection (rubber band / selectAll / clearSelection)
// ---------------------------------------------------------------------------

describe("store: selection", () => {
  it("selectAll selects all nodes", () => {
    const store = useCanvasStore.getState();
    store.addNode("oscillator", { x: 0, y: 0 });
    store.addNode("filter", { x: 200, y: 0 });
    store.addNode("output", { x: 400, y: 0 });

    useCanvasStore.getState().selectAll();

    const state = useCanvasStore.getState();
    expect(state.selectedNodeIds).toHaveLength(3);
    expect(state.nodes.every((n) => n.selected)).toBe(true);
  });

  it("clearSelection deselects all nodes", () => {
    const store = useCanvasStore.getState();
    store.addNode("oscillator", { x: 0, y: 0 });
    store.addNode("filter", { x: 200, y: 0 });

    useCanvasStore.getState().selectAll();
    useCanvasStore.getState().clearSelection();

    const state = useCanvasStore.getState();
    expect(state.selectedNodeIds).toHaveLength(0);
    expect(state.nodes.every((n) => !n.selected)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Store: copy/paste/duplicate
// ---------------------------------------------------------------------------

describe("store: copy/paste", () => {
  it("copySelected stores nodes in clipboard", () => {
    const store = useCanvasStore.getState();
    const n1 = store.addNode("oscillator", { x: 0, y: 0 });
    const n2 = store.addNode("filter", { x: 200, y: 0 });

    useCanvasStore.setState({ selectedNodeIds: [n1, n2] });
    useCanvasStore.getState().copySelected();

    const clip = useCanvasStore.getState().clipboard;
    expect(clip).not.toBeNull();
    expect(clip!.nodes).toHaveLength(2);
  });

  it("pasteClipboard creates new nodes at offset positions", () => {
    const store = useCanvasStore.getState();
    const n1 = store.addNode("oscillator", { x: 100, y: 100 });

    useCanvasStore.setState({ selectedNodeIds: [n1] });
    useCanvasStore.getState().copySelected();
    useCanvasStore.getState().pasteClipboard({ x: 50, y: 50 });

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(2);

    // The new node should be at offset position
    const newNode = state.nodes.find((n) => n.id !== n1);
    expect(newNode).toBeDefined();
    expect(newNode!.position.x).toBe(150); // 100 + 50
    expect(newNode!.position.y).toBe(150); // 100 + 50
  });

  it("pasteClipboard preserves internal connections", () => {
    const store = useCanvasStore.getState();
    const n1 = store.addNode("oscillator", { x: 0, y: 0 });
    const n2 = store.addNode("filter", { x: 200, y: 0 });
    useCanvasStore.getState().connectPorts(n1, "output", n2, "input");

    useCanvasStore.setState({ selectedNodeIds: [n1, n2] });
    useCanvasStore.getState().copySelected();
    useCanvasStore.getState().pasteClipboard({ x: 0, y: 200 });

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(4); // 2 original + 2 pasted
    expect(state.edges).toHaveLength(2); // 1 original + 1 pasted
  });

  it("duplicateSelected copies and pastes in one step", () => {
    const store = useCanvasStore.getState();
    const n1 = store.addNode("oscillator", { x: 100, y: 100 });

    useCanvasStore.setState({ selectedNodeIds: [n1] });
    useCanvasStore.getState().duplicateSelected();

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(2);
  });

  it("pasteClipboard does nothing with empty clipboard", () => {
    // Clear any leftover clipboard from prior tests
    useCanvasStore.setState({ clipboard: null });
    useCanvasStore.getState().pasteClipboard();
    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Store: initDocument syncs existing Yjs data
// ---------------------------------------------------------------------------

describe("store: initDocument", () => {
  it("syncs pre-existing nodes from a Yjs document", () => {
    const doc = createPatchDocument();
    addNode(doc, "oscillator", { x: 50, y: 50 }, "Pre-existing");

    useCanvasStore.getState().initDocument(doc);

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].data.label).toBe("Pre-existing");
  });

  it("syncs pre-existing connections from a Yjs document", () => {
    const doc = createPatchDocument();
    const n1 = addNode(doc, "oscillator", { x: 0, y: 0 });
    const n2 = addNode(doc, "filter", { x: 200, y: 0 });
    connect(doc, { nodeId: n1, port: "output" }, { nodeId: n2, port: "input" });

    useCanvasStore.getState().initDocument(doc);

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(2);
    expect(state.edges).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Store: Yjs observer-driven sync
// ---------------------------------------------------------------------------

describe("store: Yjs observer sync", () => {
  it("external Yjs mutation triggers sync to store", () => {
    const doc = createPatchDocument();
    useCanvasStore.getState().initDocument(doc);

    // Mutate Yjs directly (simulating a remote peer)
    addNode(doc, "reverb", { x: 300, y: 300 }, "Remote Reverb");

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].data.label).toBe("Remote Reverb");
  });
});
