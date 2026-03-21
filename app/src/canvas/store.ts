/**
 * Canvas Store
 *
 * Zustand store that bridges the Yjs document-model with React Flow's
 * internal state. All mutations go through document-model helpers,
 * and Yjs observation callbacks keep the React Flow nodes/edges in sync.
 */

import { create } from "zustand";
import type { Node, Edge, OnNodesChange, OnEdgesChange, Connection, XYPosition } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import * as Y from "yjs";
import type { NodeData, ConnectionData } from "@chord/document-model";
import {
  createPatchDocument,
  getPatchDocument,
  addNode as dmAddNode,
  removeNode as dmRemoveNode,
  connect as dmConnect,
  disconnect as dmDisconnect,
  setNodePosition as dmSetNodePosition,
} from "@chord/document-model";

// ---------------------------------------------------------------------------
// Port type definitions for node rendering
// ---------------------------------------------------------------------------

export interface PortDefinition {
  id: string;
  label: string;
  type: "audio" | "control" | "midi" | "trigger";
}

export interface NodeTypeDefinition {
  type: string;
  label: string;
  category: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}

// Built-in node type registry
export const NODE_TYPE_REGISTRY: Record<string, NodeTypeDefinition> = {
  oscillator: {
    type: "oscillator",
    label: "Oscillator",
    category: "generators",
    inputs: [
      { id: "frequency", label: "Freq", type: "control" },
      { id: "detune", label: "Detune", type: "control" },
    ],
    outputs: [{ id: "output", label: "Out", type: "audio" }],
  },
  filter: {
    type: "filter",
    label: "Filter",
    category: "effects",
    inputs: [
      { id: "input", label: "In", type: "audio" },
      { id: "cutoff", label: "Cutoff", type: "control" },
      { id: "resonance", label: "Res", type: "control" },
    ],
    outputs: [{ id: "output", label: "Out", type: "audio" }],
  },
  gain: {
    type: "gain",
    label: "Gain",
    category: "utilities",
    inputs: [
      { id: "input", label: "In", type: "audio" },
      { id: "gain", label: "Gain", type: "control" },
    ],
    outputs: [{ id: "output", label: "Out", type: "audio" }],
  },
  envelope: {
    type: "envelope",
    label: "Envelope",
    category: "modulators",
    inputs: [{ id: "trigger", label: "Trig", type: "trigger" }],
    outputs: [{ id: "output", label: "Out", type: "control" }],
  },
  lfo: {
    type: "lfo",
    label: "LFO",
    category: "modulators",
    inputs: [{ id: "rate", label: "Rate", type: "control" }],
    outputs: [{ id: "output", label: "Out", type: "control" }],
  },
  mixer: {
    type: "mixer",
    label: "Mixer",
    category: "utilities",
    inputs: [
      { id: "input1", label: "In 1", type: "audio" },
      { id: "input2", label: "In 2", type: "audio" },
      { id: "input3", label: "In 3", type: "audio" },
      { id: "input4", label: "In 4", type: "audio" },
    ],
    outputs: [{ id: "output", label: "Out", type: "audio" }],
  },
  output: {
    type: "output",
    label: "Output",
    category: "io",
    inputs: [
      { id: "left", label: "L", type: "audio" },
      { id: "right", label: "R", type: "audio" },
    ],
    outputs: [],
  },
  input: {
    type: "input",
    label: "Input",
    category: "io",
    inputs: [],
    outputs: [
      { id: "left", label: "L", type: "audio" },
      { id: "right", label: "R", type: "audio" },
    ],
  },
  delay: {
    type: "delay",
    label: "Delay",
    category: "effects",
    inputs: [
      { id: "input", label: "In", type: "audio" },
      { id: "time", label: "Time", type: "control" },
      { id: "feedback", label: "FB", type: "control" },
    ],
    outputs: [{ id: "output", label: "Out", type: "audio" }],
  },
  reverb: {
    type: "reverb",
    label: "Reverb",
    category: "effects",
    inputs: [
      { id: "input", label: "In", type: "audio" },
      { id: "size", label: "Size", type: "control" },
      { id: "damping", label: "Damp", type: "control" },
    ],
    outputs: [{ id: "output", label: "Out", type: "audio" }],
  },
  midi_in: {
    type: "midi_in",
    label: "MIDI In",
    category: "io",
    inputs: [],
    outputs: [
      { id: "note", label: "Note", type: "midi" },
      { id: "velocity", label: "Vel", type: "control" },
      { id: "gate", label: "Gate", type: "trigger" },
    ],
  },
  noise: {
    type: "noise",
    label: "Noise",
    category: "generators",
    inputs: [],
    outputs: [{ id: "output", label: "Out", type: "audio" }],
  },
};

// ---------------------------------------------------------------------------
// Port type color mapping
// ---------------------------------------------------------------------------

export const PORT_COLORS: Record<string, string> = {
  audio: "#f97316",   // orange
  control: "#3b82f6", // blue
  midi: "#a855f7",    // purple
  trigger: "#22c55e", // green
};

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/** Convert a document-model NodeData to a React Flow Node. */
export function nodeDataToFlowNode(data: NodeData): Node {
  const typeDef = NODE_TYPE_REGISTRY[data.type];
  return {
    id: data.id,
    type: "chordNode",
    position: { x: data.position.x, y: data.position.y },
    data: {
      label: data.name,
      nodeType: data.type,
      parameters: data.parameters,
      color: data.color,
      collapsed: data.collapsed ?? false,
      inputs: typeDef?.inputs ?? [],
      outputs: typeDef?.outputs ?? [],
    },
    selected: false,
  };
}

/** Convert a document-model ConnectionData to a React Flow Edge. */
export function connectionDataToFlowEdge(data: ConnectionData): Edge {
  // Determine edge color from port type
  let strokeColor = PORT_COLORS.audio; // default

  // Try to get port type from registry — we check all node types' outputs
  for (const def of Object.values(NODE_TYPE_REGISTRY)) {
    const port = def.outputs.find((p) => p.id === data.fromPort);
    if (port) {
      strokeColor = PORT_COLORS[port.type] ?? PORT_COLORS.audio;
      break;
    }
  }

  return {
    id: data.id,
    source: data.fromNode,
    sourceHandle: data.fromPort,
    target: data.toNode,
    targetHandle: data.toPort,
    type: "smoothstep",
    animated: true,
    style: { stroke: strokeColor, strokeWidth: 2 },
  };
}

// ---------------------------------------------------------------------------
// Clipboard types
// ---------------------------------------------------------------------------

interface ClipboardData {
  nodes: NodeData[];
  connections: ConnectionData[];
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface CanvasStore {
  // Yjs document reference
  ydoc: Y.Doc;

  // React Flow state
  nodes: Node[];
  edges: Edge[];
  selectedNodeIds: string[];

  // Search palette
  searchOpen: boolean;
  searchQuery: string;

  // Clipboard
  clipboard: ClipboardData | null;

  // React Flow event handlers
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;

  // Document mutation actions
  addNode: (type: string, position: XYPosition, name?: string) => string;
  removeNode: (nodeId: string) => void;
  removeSelectedNodes: () => void;
  connectPorts: (
    fromNodeId: string,
    fromPort: string,
    toNodeId: string,
    toPort: string,
  ) => string;
  disconnectEdge: (edgeId: string) => void;
  updateNodePosition: (nodeId: string, position: XYPosition) => void;

  // Selection
  setSelectedNodeIds: (ids: string[]) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Search palette
  openSearch: () => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;

  // Clipboard
  copySelected: () => void;
  pasteClipboard: (offset?: XYPosition) => void;
  duplicateSelected: () => void;

  // Sync: rebuild from Yjs doc
  syncFromDocument: () => void;

  // Initialize with a Y.Doc
  initDocument: (doc: Y.Doc) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  ydoc: createPatchDocument(),
  nodes: [],
  edges: [],
  selectedNodeIds: [],
  searchOpen: false,
  searchQuery: "",
  clipboard: null,

  onNodesChange: (changes) => {
    // Apply visual changes (selection, dragging) locally via React Flow
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }));

    // Persist position changes to Yjs
    const store = get();
    for (const change of changes) {
      if (change.type === "position" && change.position && !change.dragging) {
        dmSetNodePosition(store.ydoc, change.id, {
          x: change.position.x,
          y: change.position.y,
        });
      }
      if (change.type === "remove") {
        dmRemoveNode(store.ydoc, change.id);
      }
    }

    // Track selection
    const selectedIds = get()
      .nodes.filter((n) => n.selected)
      .map((n) => n.id);
    set({ selectedNodeIds: selectedIds });
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));

    // Persist removals to Yjs
    const store = get();
    for (const change of changes) {
      if (change.type === "remove") {
        dmDisconnect(store.ydoc, change.id);
      }
    }
  },

  onConnect: (connection) => {
    if (!connection.source || !connection.target) return;
    const store = get();
    dmConnect(
      store.ydoc,
      {
        nodeId: connection.source,
        port: connection.sourceHandle ?? "output",
      },
      {
        nodeId: connection.target,
        port: connection.targetHandle ?? "input",
      },
    );
    // The Yjs observer will update the edges
    store.syncFromDocument();
  },

  addNode: (type, position, name) => {
    const store = get();
    const id = dmAddNode(store.ydoc, type, { x: position.x, y: position.y }, name);
    store.syncFromDocument();
    return id;
  },

  removeNode: (nodeId) => {
    const store = get();
    dmRemoveNode(store.ydoc, nodeId);
    store.syncFromDocument();
  },

  removeSelectedNodes: () => {
    const store = get();
    const selected = store.selectedNodeIds;
    for (const id of selected) {
      dmRemoveNode(store.ydoc, id);
    }
    store.syncFromDocument();
  },

  connectPorts: (fromNodeId, fromPort, toNodeId, toPort) => {
    const store = get();
    const id = dmConnect(
      store.ydoc,
      { nodeId: fromNodeId, port: fromPort },
      { nodeId: toNodeId, port: toPort },
    );
    store.syncFromDocument();
    return id;
  },

  disconnectEdge: (edgeId) => {
    const store = get();
    dmDisconnect(store.ydoc, edgeId);
    store.syncFromDocument();
  },

  updateNodePosition: (nodeId, position) => {
    const store = get();
    dmSetNodePosition(store.ydoc, nodeId, { x: position.x, y: position.y });
    // Don't full sync - just update the position locally for perf
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, position: { x: position.x, y: position.y } } : n,
      ),
    }));
  },

  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),

  selectAll: () => {
    set((state) => ({
      nodes: state.nodes.map((n) => ({ ...n, selected: true })),
      selectedNodeIds: state.nodes.map((n) => n.id),
    }));
  },

  clearSelection: () => {
    set((state) => ({
      nodes: state.nodes.map((n) => ({ ...n, selected: false })),
      selectedNodeIds: [],
    }));
  },

  openSearch: () => set({ searchOpen: true, searchQuery: "" }),
  closeSearch: () => set({ searchOpen: false, searchQuery: "" }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  copySelected: () => {
    const store = get();
    const patch = getPatchDocument(store.ydoc);

    const selectedIds = new Set(store.selectedNodeIds);
    const copiedNodes: NodeData[] = [];
    const copiedConnections: ConnectionData[] = [];

    patch.nodes.forEach((node) => {
      if (selectedIds.has(node.id)) {
        copiedNodes.push({ ...node });
      }
    });

    // Only copy connections that are fully inside the selection
    const connArray = patch.connections.toArray();
    for (const conn of connArray) {
      if (selectedIds.has(conn.fromNode) && selectedIds.has(conn.toNode)) {
        copiedConnections.push({ ...conn });
      }
    }

    set({ clipboard: { nodes: copiedNodes, connections: copiedConnections } });
  },

  pasteClipboard: (offset) => {
    const store = get();
    const clip = store.clipboard;
    if (!clip || clip.nodes.length === 0) return;

    const pasteOffset = offset ?? { x: 50, y: 50 };
    const idMap = new Map<string, string>();

    // Create new nodes with offset positions
    for (const node of clip.nodes) {
      const newId = dmAddNode(
        store.ydoc,
        node.type,
        {
          x: node.position.x + pasteOffset.x,
          y: node.position.y + pasteOffset.y,
        },
        node.name,
      );
      idMap.set(node.id, newId);
    }

    // Recreate connections with new ids
    for (const conn of clip.connections) {
      const newFrom = idMap.get(conn.fromNode);
      const newTo = idMap.get(conn.toNode);
      if (newFrom && newTo) {
        dmConnect(
          store.ydoc,
          { nodeId: newFrom, port: conn.fromPort },
          { nodeId: newTo, port: conn.toPort },
        );
      }
    }

    store.syncFromDocument();
  },

  duplicateSelected: () => {
    const store = get();
    store.copySelected();
    store.pasteClipboard({ x: 50, y: 50 });
  },

  syncFromDocument: () => {
    const store = get();
    const patch = getPatchDocument(store.ydoc);

    const nodes: Node[] = [];
    patch.nodes.forEach((nodeData) => {
      nodes.push(nodeDataToFlowNode(nodeData));
    });

    const edges: Edge[] = [];
    const connArray = patch.connections.toArray();
    for (const conn of connArray) {
      edges.push(connectionDataToFlowEdge(conn));
    }

    set({ nodes, edges });
  },

  initDocument: (doc) => {
    set({ ydoc: doc });
    const store = get();
    store.syncFromDocument();

    // Set up Yjs observers to keep in sync
    const patch = getPatchDocument(doc);
    patch.nodes.observe(() => {
      get().syncFromDocument();
    });
    patch.connections.observe(() => {
      get().syncFromDocument();
    });
  },
}));
