/**
 * Comprehensive tests for @chord/document-model
 *
 * Covers every item in the Definition of Done:
 *  1. Schema types defined and exported
 *  2. createPatchDocument returns a valid empty document
 *  3. addNode / removeNode / connect / setParameter work correctly
 *  4. Serialize -> deserialize roundtrip preserves all data
 *  5. Two Yjs documents sync changes correctly (basic CRDT test)
 *  6. UndoManager tracks changes per-user
 */

import { describe, it, expect } from "vitest";
import * as Y from "yjs";

import {
  // Types (imported for type-level assertions — used in runtime checks)
  NODES_KEY,
  CONNECTIONS_KEY,
  TIMELINE_KEY,
  METADATA_KEY,
  SETTINGS_KEY,
  // Document lifecycle
  createPatchDocument,
  getPatchDocument,
  // Mutation helpers
  addNode,
  removeNode,
  connect,
  disconnect,
  setParameter,
  setNodePosition,
  // Serialization
  serializePatch,
  deserializePatch,
  // UndoManager
  createUndoManager,
  // Sync helpers
  syncDocuments,
  encodeDocumentState,
  applyDocumentUpdate,
} from "./index.js";

import type {
  Vec2,
  PortRef,
  NodeData,
  ConnectionData,
  PatchDocument,
  SerializedPatch,
} from "./index.js";

// -----------------------------------------------------------------------
// 1. Schema types defined and exported
// -----------------------------------------------------------------------

describe("Schema types", () => {
  it("exports all type interfaces (compile-time check)", () => {
    // If this file compiles, the types exist. We perform a runtime sanity
    // check that type-narrowing works as expected.
    const node: NodeData = {
      id: "n1",
      type: "osc",
      position: { x: 0, y: 0 },
      parameters: { freq: 440 },
      name: "Oscillator",
    };
    expect(node.id).toBe("n1");
    expect(node.parameters.freq).toBe(440);
  });

  it("exports ConnectionData type", () => {
    const conn: ConnectionData = {
      id: "c1",
      fromNode: "n1",
      fromPort: "out",
      toNode: "n2",
      toPort: "in",
    };
    expect(conn.fromNode).toBe("n1");
  });

  it("exports Vec2 and PortRef types", () => {
    const pos: Vec2 = { x: 10, y: 20 };
    const port: PortRef = { nodeId: "n1", port: "out" };
    expect(pos.x).toBe(10);
    expect(port.port).toBe("out");
  });

  it("exports PatchDocument type", () => {
    const doc = createPatchDocument();
    const patch: PatchDocument = getPatchDocument(doc);
    expect(patch.doc).toBeInstanceOf(Y.Doc);
    expect(patch.nodes).toBeInstanceOf(Y.Map);
    expect(patch.connections).toBeInstanceOf(Y.Array);
  });

  it("exports map key constants", () => {
    expect(NODES_KEY).toBe("nodes");
    expect(CONNECTIONS_KEY).toBe("connections");
    expect(TIMELINE_KEY).toBe("timeline");
    expect(METADATA_KEY).toBe("metadata");
    expect(SETTINGS_KEY).toBe("settings");
  });
});

// -----------------------------------------------------------------------
// 2. createPatchDocument returns a valid empty document
// -----------------------------------------------------------------------

describe("createPatchDocument", () => {
  it("returns a Y.Doc", () => {
    const doc = createPatchDocument();
    expect(doc).toBeInstanceOf(Y.Doc);
  });

  it("has an empty nodes map", () => {
    const doc = createPatchDocument();
    const nodes = doc.getMap("nodes");
    expect(nodes.size).toBe(0);
  });

  it("has an empty connections array", () => {
    const doc = createPatchDocument();
    const conns = doc.getArray("connections");
    expect(conns.length).toBe(0);
  });

  it("has empty timeline, metadata, and settings maps", () => {
    const doc = createPatchDocument();
    expect(doc.getMap("timeline").size).toBe(0);
    expect(doc.getMap("metadata").size).toBe(0);
    expect(doc.getMap("settings").size).toBe(0);
  });

  it("getPatchDocument wraps the doc with typed accessors", () => {
    const doc = createPatchDocument();
    const patch = getPatchDocument(doc);
    expect(patch.doc).toBe(doc);
    expect(patch.nodes).toBe(doc.getMap("nodes"));
    expect(patch.connections).toBe(doc.getArray("connections"));
    expect(patch.timeline).toBe(doc.getMap("timeline"));
    expect(patch.metadata).toBe(doc.getMap("metadata"));
    expect(patch.settings).toBe(doc.getMap("settings"));
  });
});

// -----------------------------------------------------------------------
// 3. addNode / removeNode / connect / setParameter work correctly
// -----------------------------------------------------------------------

describe("addNode", () => {
  it("adds a node to the nodes map and returns its id", () => {
    const doc = createPatchDocument();
    const id = addNode(doc, "oscillator", { x: 100, y: 200 });

    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const nodes = doc.getMap<NodeData>("nodes");
    expect(nodes.size).toBe(1);
    expect(nodes.has(id)).toBe(true);
  });

  it("stores the correct node data", () => {
    const doc = createPatchDocument();
    const id = addNode(doc, "filter", { x: 50, y: 75 }, "My Filter");

    const node = doc.getMap<NodeData>("nodes").get(id)!;
    expect(node.id).toBe(id);
    expect(node.type).toBe("filter");
    expect(node.position).toEqual({ x: 50, y: 75 });
    expect(node.parameters).toEqual({});
    expect(node.name).toBe("My Filter");
  });

  it("defaults the name to the type when not provided", () => {
    const doc = createPatchDocument();
    const id = addNode(doc, "reverb", { x: 0, y: 0 });
    const node = doc.getMap<NodeData>("nodes").get(id)!;
    expect(node.name).toBe("reverb");
  });

  it("can add multiple nodes", () => {
    const doc = createPatchDocument();
    const id1 = addNode(doc, "osc", { x: 0, y: 0 });
    const id2 = addNode(doc, "filter", { x: 100, y: 0 });
    const id3 = addNode(doc, "output", { x: 200, y: 0 });

    const nodes = doc.getMap<NodeData>("nodes");
    expect(nodes.size).toBe(3);
    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
  });
});

describe("removeNode", () => {
  it("removes a node from the nodes map", () => {
    const doc = createPatchDocument();
    const id = addNode(doc, "osc", { x: 0, y: 0 });
    expect(doc.getMap("nodes").size).toBe(1);

    removeNode(doc, id);
    expect(doc.getMap("nodes").size).toBe(0);
  });

  it("removes all connections referencing the removed node", () => {
    const doc = createPatchDocument();
    const n1 = addNode(doc, "osc", { x: 0, y: 0 });
    const n2 = addNode(doc, "filter", { x: 100, y: 0 });
    const n3 = addNode(doc, "output", { x: 200, y: 0 });

    connect(doc, { nodeId: n1, port: "out" }, { nodeId: n2, port: "in" });
    connect(doc, { nodeId: n2, port: "out" }, { nodeId: n3, port: "in" });

    expect(doc.getArray("connections").length).toBe(2);

    removeNode(doc, n2);

    // Both connections should be gone because n2 was in both.
    expect(doc.getArray("connections").length).toBe(0);
    // n1 and n3 should remain.
    expect(doc.getMap("nodes").size).toBe(2);
  });

  it("does not affect unrelated connections when removing a node", () => {
    const doc = createPatchDocument();
    const n1 = addNode(doc, "osc", { x: 0, y: 0 });
    const n2 = addNode(doc, "filter", { x: 100, y: 0 });
    const n3 = addNode(doc, "output", { x: 200, y: 0 });
    const n4 = addNode(doc, "gain", { x: 300, y: 0 });

    connect(doc, { nodeId: n1, port: "out" }, { nodeId: n2, port: "in" });
    connect(doc, { nodeId: n3, port: "out" }, { nodeId: n4, port: "in" });

    removeNode(doc, n1);

    // Only the n1->n2 connection should be removed.
    const conns = doc.getArray<ConnectionData>("connections");
    expect(conns.length).toBe(1);
    expect(conns.get(0).fromNode).toBe(n3);
    expect(conns.get(0).toNode).toBe(n4);
  });
});

describe("connect", () => {
  it("creates a connection and returns its id", () => {
    const doc = createPatchDocument();
    const n1 = addNode(doc, "osc", { x: 0, y: 0 });
    const n2 = addNode(doc, "filter", { x: 100, y: 0 });

    const connId = connect(
      doc,
      { nodeId: n1, port: "out" },
      { nodeId: n2, port: "in" },
    );

    expect(typeof connId).toBe("string");
    expect(connId.length).toBeGreaterThan(0);

    const conns = doc.getArray<ConnectionData>("connections");
    expect(conns.length).toBe(1);
    expect(conns.get(0).id).toBe(connId);
    expect(conns.get(0).fromNode).toBe(n1);
    expect(conns.get(0).fromPort).toBe("out");
    expect(conns.get(0).toNode).toBe(n2);
    expect(conns.get(0).toPort).toBe("in");
  });
});

describe("disconnect", () => {
  it("removes a connection by id", () => {
    const doc = createPatchDocument();
    const n1 = addNode(doc, "osc", { x: 0, y: 0 });
    const n2 = addNode(doc, "filter", { x: 100, y: 0 });
    const connId = connect(
      doc,
      { nodeId: n1, port: "out" },
      { nodeId: n2, port: "in" },
    );

    expect(doc.getArray("connections").length).toBe(1);
    disconnect(doc, connId);
    expect(doc.getArray("connections").length).toBe(0);
  });

  it("does not throw if the connection id does not exist", () => {
    const doc = createPatchDocument();
    expect(() => disconnect(doc, "non-existent")).not.toThrow();
  });
});

describe("setParameter", () => {
  it("sets a parameter on an existing node", () => {
    const doc = createPatchDocument();
    const id = addNode(doc, "osc", { x: 0, y: 0 });

    setParameter(doc, id, "frequency", 440);

    const node = doc.getMap<NodeData>("nodes").get(id)!;
    expect(node.parameters.frequency).toBe(440);
  });

  it("can set multiple parameters", () => {
    const doc = createPatchDocument();
    const id = addNode(doc, "filter", { x: 0, y: 0 });

    setParameter(doc, id, "cutoff", 1000);
    setParameter(doc, id, "resonance", 0.7);

    const node = doc.getMap<NodeData>("nodes").get(id)!;
    expect(node.parameters.cutoff).toBe(1000);
    expect(node.parameters.resonance).toBe(0.7);
  });

  it("overwrites an existing parameter value", () => {
    const doc = createPatchDocument();
    const id = addNode(doc, "osc", { x: 0, y: 0 });

    setParameter(doc, id, "frequency", 440);
    setParameter(doc, id, "frequency", 880);

    const node = doc.getMap<NodeData>("nodes").get(id)!;
    expect(node.parameters.frequency).toBe(880);
  });

  it("throws when the node does not exist", () => {
    const doc = createPatchDocument();
    expect(() => setParameter(doc, "missing", "x", 1)).toThrow(
      /node "missing" not found/,
    );
  });
});

describe("setNodePosition", () => {
  it("updates the position of a node", () => {
    const doc = createPatchDocument();
    const id = addNode(doc, "osc", { x: 0, y: 0 });

    setNodePosition(doc, id, { x: 42, y: 99 });

    const node = doc.getMap<NodeData>("nodes").get(id)!;
    expect(node.position).toEqual({ x: 42, y: 99 });
  });

  it("throws when the node does not exist", () => {
    const doc = createPatchDocument();
    expect(() => setNodePosition(doc, "nope", { x: 0, y: 0 })).toThrow(
      /node "nope" not found/,
    );
  });
});

// -----------------------------------------------------------------------
// 4. Serialize -> deserialize roundtrip preserves all data
// -----------------------------------------------------------------------

describe("Serialization roundtrip", () => {
  it("serializes an empty document", () => {
    const doc = createPatchDocument();
    const json = serializePatch(doc);
    const parsed: SerializedPatch = JSON.parse(json);

    expect(parsed.nodes).toEqual({});
    expect(parsed.connections).toEqual([]);
    expect(parsed.timeline).toEqual({});
    expect(parsed.metadata).toEqual({});
    expect(parsed.settings).toEqual({});
  });

  it("round-trips a document with nodes, connections, and parameters", () => {
    const doc = createPatchDocument();
    const n1 = addNode(doc, "osc", { x: 10, y: 20 }, "Oscillator");
    const n2 = addNode(doc, "filter", { x: 100, y: 200 }, "LPF");
    setParameter(doc, n1, "frequency", 440);
    setParameter(doc, n1, "detune", 0);
    setParameter(doc, n2, "cutoff", 1000);
    connect(doc, { nodeId: n1, port: "out" }, { nodeId: n2, port: "audio" });

    const json = serializePatch(doc);
    const restored = deserializePatch(json);

    const nodes = restored.getMap<NodeData>("nodes");
    expect(nodes.size).toBe(2);

    const restoredN1 = nodes.get(n1)!;
    expect(restoredN1.type).toBe("osc");
    expect(restoredN1.position).toEqual({ x: 10, y: 20 });
    expect(restoredN1.name).toBe("Oscillator");
    expect(restoredN1.parameters.frequency).toBe(440);
    expect(restoredN1.parameters.detune).toBe(0);

    const restoredN2 = nodes.get(n2)!;
    expect(restoredN2.type).toBe("filter");
    expect(restoredN2.parameters.cutoff).toBe(1000);

    const conns = restored.getArray<ConnectionData>("connections");
    expect(conns.length).toBe(1);
    expect(conns.get(0).fromNode).toBe(n1);
    expect(conns.get(0).fromPort).toBe("out");
    expect(conns.get(0).toNode).toBe(n2);
    expect(conns.get(0).toPort).toBe("audio");
  });

  it("round-trips metadata and settings", () => {
    const doc = createPatchDocument();
    const patch = getPatchDocument(doc);

    doc.transact(() => {
      patch.metadata.set("author", "dylan");
      patch.metadata.set("version", 1);
      patch.metadata.set("draft", true);
      patch.settings.set("sampleRate", 44100);
      patch.settings.set("theme", "dark");
    });

    const json = serializePatch(doc);
    const restored = deserializePatch(json);
    const rPatch = getPatchDocument(restored);

    expect(rPatch.metadata.get("author")).toBe("dylan");
    expect(rPatch.metadata.get("version")).toBe(1);
    expect(rPatch.metadata.get("draft")).toBe(true);
    expect(rPatch.settings.get("sampleRate")).toBe(44100);
    expect(rPatch.settings.get("theme")).toBe("dark");
  });

  it("produces valid JSON", () => {
    const doc = createPatchDocument();
    addNode(doc, "osc", { x: 0, y: 0 });
    const json = serializePatch(doc);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("deserializePatch creates a working Y.Doc that can be further mutated", () => {
    const doc = createPatchDocument();
    const n1 = addNode(doc, "osc", { x: 0, y: 0 });
    const json = serializePatch(doc);

    const restored = deserializePatch(json);
    // Add a new node to the restored document
    const n2 = addNode(restored, "filter", { x: 100, y: 0 });
    connect(
      restored,
      { nodeId: n1, port: "out" },
      { nodeId: n2, port: "in" },
    );

    expect(restored.getMap("nodes").size).toBe(2);
    expect(restored.getArray("connections").length).toBe(1);
  });
});

// -----------------------------------------------------------------------
// 5. Two Yjs documents sync changes correctly (basic CRDT test)
// -----------------------------------------------------------------------

describe("CRDT sync", () => {
  it("syncs a node added on docA to docB", () => {
    const docA = createPatchDocument();
    const docB = createPatchDocument();

    const nodeId = addNode(docA, "osc", { x: 10, y: 20 });

    syncDocuments(docA, docB);

    const nodesB = docB.getMap<NodeData>("nodes");
    expect(nodesB.size).toBe(1);
    expect(nodesB.get(nodeId)!.type).toBe("osc");
    expect(nodesB.get(nodeId)!.position).toEqual({ x: 10, y: 20 });
  });

  it("syncs connections between documents", () => {
    const docA = createPatchDocument();
    const docB = createPatchDocument();

    const n1 = addNode(docA, "osc", { x: 0, y: 0 });
    const n2 = addNode(docA, "filter", { x: 100, y: 0 });
    connect(docA, { nodeId: n1, port: "out" }, { nodeId: n2, port: "in" });

    syncDocuments(docA, docB);

    const connsB = docB.getArray<ConnectionData>("connections");
    expect(connsB.length).toBe(1);
    expect(connsB.get(0).fromNode).toBe(n1);
    expect(connsB.get(0).toNode).toBe(n2);
  });

  it("merges concurrent additions from two documents", () => {
    const docA = createPatchDocument();
    const docB = createPatchDocument();

    // Sync initial empty state so both docs share the same origin.
    syncDocuments(docA, docB);

    // Both sides add a node concurrently (before syncing).
    const nA = addNode(docA, "osc", { x: 0, y: 0 });
    const nB = addNode(docB, "filter", { x: 100, y: 0 });

    // Sync again — both docs should have both nodes.
    syncDocuments(docA, docB);

    const nodesA = docA.getMap<NodeData>("nodes");
    const nodesB = docB.getMap<NodeData>("nodes");

    expect(nodesA.size).toBe(2);
    expect(nodesB.size).toBe(2);
    expect(nodesA.has(nA)).toBe(true);
    expect(nodesA.has(nB)).toBe(true);
    expect(nodesB.has(nA)).toBe(true);
    expect(nodesB.has(nB)).toBe(true);
  });

  it("syncs parameter changes", () => {
    const docA = createPatchDocument();
    const docB = createPatchDocument();

    const nodeId = addNode(docA, "osc", { x: 0, y: 0 });
    syncDocuments(docA, docB);

    setParameter(docA, nodeId, "frequency", 880);
    syncDocuments(docA, docB);

    const nodeB = docB.getMap<NodeData>("nodes").get(nodeId)!;
    expect(nodeB.parameters.frequency).toBe(880);
  });

  it("syncs using encodeDocumentState / applyDocumentUpdate", () => {
    const docA = createPatchDocument();
    const docB = createPatchDocument();

    addNode(docA, "osc", { x: 5, y: 10 });

    const update = encodeDocumentState(docA);
    applyDocumentUpdate(docB, update);

    expect(docB.getMap<NodeData>("nodes").size).toBe(1);
  });

  it("syncs node removal across documents", () => {
    const docA = createPatchDocument();
    const docB = createPatchDocument();

    const nodeId = addNode(docA, "osc", { x: 0, y: 0 });
    syncDocuments(docA, docB);
    expect(docB.getMap("nodes").size).toBe(1);

    removeNode(docA, nodeId);
    syncDocuments(docA, docB);
    expect(docB.getMap("nodes").size).toBe(0);
  });
});

// -----------------------------------------------------------------------
// 6. UndoManager tracks changes per-user
// -----------------------------------------------------------------------

describe("UndoManager", () => {
  it("can undo a node addition", () => {
    const doc = createPatchDocument();
    const undoManager = createUndoManager(doc);

    addNode(doc, "osc", { x: 0, y: 0 });
    expect(doc.getMap("nodes").size).toBe(1);

    undoManager.undo();
    expect(doc.getMap("nodes").size).toBe(0);
  });

  it("can redo a node addition", () => {
    const doc = createPatchDocument();
    const undoManager = createUndoManager(doc);

    const id = addNode(doc, "osc", { x: 0, y: 0 });
    undoManager.undo();
    expect(doc.getMap("nodes").size).toBe(0);

    undoManager.redo();
    expect(doc.getMap("nodes").size).toBe(1);
    // The id should be the same after redo.
    expect(doc.getMap<NodeData>("nodes").has(id)).toBe(true);
  });

  it("can undo a connection", () => {
    const doc = createPatchDocument();
    const undoManager = createUndoManager(doc);

    const n1 = addNode(doc, "osc", { x: 0, y: 0 });
    const n2 = addNode(doc, "filter", { x: 100, y: 0 });

    // Stop capturing so the connect is a separate undo step.
    undoManager.stopCapturing();

    connect(doc, { nodeId: n1, port: "out" }, { nodeId: n2, port: "in" });
    expect(doc.getArray("connections").length).toBe(1);

    undoManager.undo();
    expect(doc.getArray("connections").length).toBe(0);
    // Nodes should still be there.
    expect(doc.getMap("nodes").size).toBe(2);
  });

  it("can undo a parameter change", () => {
    const doc = createPatchDocument();
    const undoManager = createUndoManager(doc);

    const id = addNode(doc, "osc", { x: 0, y: 0 });

    undoManager.stopCapturing();
    setParameter(doc, id, "frequency", 440);

    expect(doc.getMap<NodeData>("nodes").get(id)!.parameters.frequency).toBe(
      440,
    );

    undoManager.undo();

    // After undo, the parameter change should be reverted.
    const node = doc.getMap<NodeData>("nodes").get(id);
    // The node still exists but the parameter should be back to its pre-change state.
    expect(node).toBeDefined();
    expect(node!.parameters.frequency).toBeUndefined();
  });

  it("only tracks local changes (not remote)", () => {
    const docA = createPatchDocument();
    const docB = createPatchDocument();

    // UndoManager for docA — tracks changes originating from null (local).
    const undoManagerA = createUndoManager(docA);

    // Make a change on docA.
    addNode(docA, "local-osc", { x: 0, y: 0 });

    // Sync docA -> docB, then make a change on docB.
    syncDocuments(docA, docB);

    // Make a remote change on docB.
    const remoteId = addNode(docB, "remote-filter", { x: 100, y: 0 });

    // Sync docB -> docA. This update arrives with a non-null origin.
    const updateB = encodeDocumentState(docB);
    Y.applyUpdate(docA, updateB, "remote-peer");

    // docA should now have 2 nodes.
    expect(docA.getMap("nodes").size).toBe(2);

    // Undo on docA should only undo the local node, not the remote one.
    undoManagerA.undo();
    expect(docA.getMap("nodes").size).toBe(1);
    expect(docA.getMap<NodeData>("nodes").has(remoteId)).toBe(true);
  });

  it("supports custom capture timeout for grouping changes", () => {
    const doc = createPatchDocument();
    // Very short timeout — each operation should be a separate undo step.
    const undoManager = createUndoManager(doc, 0);

    const id1 = addNode(doc, "osc", { x: 0, y: 0 });
    undoManager.stopCapturing();
    const id2 = addNode(doc, "filter", { x: 100, y: 0 });

    expect(doc.getMap("nodes").size).toBe(2);

    // Undo the second add.
    undoManager.undo();
    expect(doc.getMap("nodes").size).toBe(1);
    expect(doc.getMap<NodeData>("nodes").has(id1)).toBe(true);
    expect(doc.getMap<NodeData>("nodes").has(id2)).toBe(false);

    // Undo the first add.
    undoManager.undo();
    expect(doc.getMap("nodes").size).toBe(0);
  });

  it("undo stack is empty after undoing all operations", () => {
    const doc = createPatchDocument();
    const undoManager = createUndoManager(doc);

    addNode(doc, "osc", { x: 0, y: 0 });
    undoManager.undo();

    // Should not throw and should be a no-op.
    undoManager.undo();
    expect(doc.getMap("nodes").size).toBe(0);
  });
});
