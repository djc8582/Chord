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
  createUndoManager,
} from "@chord/document-model";
import type { BridgeCommands } from "../bridge/types.js";

// ---------------------------------------------------------------------------
// Bridge for Tauri backend sync
// ---------------------------------------------------------------------------
let _bridge: BridgeCommands | null = null;

/** Set the bridge so canvas mutations also notify the Rust backend. */
export function setCanvasBridge(b: BridgeCommands) {
  _bridge = b;
}

/**
 * Pending backend ID promises — when addNode is called, the bridge call
 * is async. Connections drawn before it resolves need to wait.
 */
const _pendingBackendIds = new Map<string, Promise<string>>();

/** Resolve the backend ID for a Yjs node ID, waiting if the bridge call is still pending. */
export async function resolveBackendId(yjsId: string): Promise<string> {
  const pending = _pendingBackendIds.get(yjsId);
  if (pending) return pending;
  const store = useCanvasStore.getState();
  return store.backendIds.get(yjsId) ?? yjsId;
}

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
// Port IDs MUST match the backend port names in state.rs build_node_descriptor().
// If these don't match, connections drawn on canvas will silently fail to reach
// the Rust audio engine.
export const NODE_TYPE_REGISTRY: Record<string, NodeTypeDefinition> = {
  oscillator: {
    type: "oscillator",
    label: "Oscillator",
    category: "generators",
    inputs: [
      { id: "fm", label: "FM", type: "audio" },
      { id: "am", label: "AM", type: "audio" },
      { id: "freq", label: "Freq", type: "audio" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  filter: {
    type: "filter",
    label: "Filter",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "cutoff_mod", label: "Cut", type: "control" },
      { id: "resonance_mod", label: "Res", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  gain: {
    type: "gain",
    label: "Gain",
    category: "utilities",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "gain_mod", label: "Gain", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  envelope: {
    type: "envelope",
    label: "Envelope",
    category: "modulators",
    inputs: [
      { id: "gate", label: "Gate", type: "audio" },
      { id: "attack_mod", label: "Atk", type: "control" },
      { id: "decay_mod", label: "Dec", type: "control" },
      { id: "sustain_mod", label: "Sus", type: "control" },
      { id: "release_mod", label: "Rel", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  lfo: {
    type: "lfo",
    label: "LFO",
    category: "modulators",
    inputs: [
      { id: "rate_mod", label: "Rate", type: "control" },
      { id: "depth_mod", label: "Dep", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  mixer: {
    type: "mixer",
    label: "Mixer",
    category: "utilities",
    inputs: [
      { id: "in1", label: "In 1", type: "audio" },
      { id: "in2", label: "In 2", type: "audio" },
      { id: "in3", label: "In 3", type: "audio" },
      { id: "in4", label: "In 4", type: "audio" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  output: {
    type: "output",
    label: "Output",
    category: "io",
    inputs: [
      { id: "in", label: "In", type: "audio" },
    ],
    outputs: [],
  },
  input: {
    type: "input",
    label: "Input",
    category: "io",
    inputs: [],
    outputs: [
      { id: "out", label: "Out", type: "audio" },
    ],
  },
  delay: {
    type: "delay",
    label: "Delay",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "time_mod", label: "Time", type: "control" },
      { id: "feedback_mod", label: "FB", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  reverb: {
    type: "reverb",
    label: "Reverb",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "room_mod", label: "Room", type: "control" },
      { id: "mix_mod", label: "Mix", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  compressor: {
    type: "compressor",
    label: "Compressor",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "threshold_mod", label: "Thr", type: "control" },
      { id: "ratio_mod", label: "Rat", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  eq: {
    type: "eq",
    label: "EQ",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "low_mod", label: "Low", type: "control" },
      { id: "mid_mod", label: "Mid", type: "control" },
      { id: "high_mod", label: "High", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  midi_to_freq: {
    type: "midi_to_freq",
    label: "MIDI→Freq",
    category: "midi",
    inputs: [
      { id: "midi", label: "MIDI", type: "midi" },
    ],
    outputs: [
      { id: "freq", label: "Freq", type: "control" },
      { id: "gate", label: "Gate", type: "control" },
    ],
  },
  noise: {
    type: "noise",
    label: "Noise",
    category: "generators",
    inputs: [],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  // --- Sequencers ---
  step_sequencer: {
    type: "step_sequencer",
    label: "Step Sequencer",
    category: "sequencers",
    inputs: [{ id: "clock", label: "Clock", type: "audio" }],
    outputs: [
      { id: "freq", label: "Freq", type: "audio" },
      { id: "gate", label: "Gate", type: "audio" },
    ],
  },
  gravity_sequencer: {
    type: "gravity_sequencer",
    label: "Gravity Sequencer",
    category: "sequencers",
    inputs: [{ id: "clock", label: "Clock", type: "audio" }],
    outputs: [
      { id: "freq", label: "Freq", type: "audio" },
      { id: "gate", label: "Gate", type: "audio" },
    ],
  },
  game_of_life_sequencer: {
    type: "game_of_life_sequencer",
    label: "Game of Life",
    category: "sequencers",
    inputs: [{ id: "clock", label: "Clock", type: "audio" }],
    outputs: [
      { id: "freq", label: "Freq", type: "audio" },
      { id: "gate", label: "Gate", type: "audio" },
    ],
  },
  markov_sequencer: {
    type: "markov_sequencer",
    label: "Markov Chain",
    category: "sequencers",
    inputs: [{ id: "clock", label: "Clock", type: "audio" }],
    outputs: [
      { id: "freq", label: "Freq", type: "audio" },
      { id: "gate", label: "Gate", type: "audio" },
    ],
  },
  polyrhythm: {
    type: "polyrhythm",
    label: "Polyrhythm",
    category: "sequencers",
    inputs: [{ id: "clock", label: "Clock", type: "audio" }],
    outputs: [
      { id: "a", label: "A", type: "audio" },
      { id: "b", label: "B", type: "audio" },
      { id: "c", label: "C", type: "audio" },
    ],
  },
  euclidean: {
    type: "euclidean",
    label: "Euclidean",
    category: "sequencers",
    inputs: [{ id: "clock", label: "Clock", type: "audio" }],
    outputs: [
      { id: "freq", label: "Freq", type: "audio" },
      { id: "gate", label: "Gate", type: "audio" },
    ],
  },
  // --- Additional effects ---
  chorus: {
    type: "chorus",
    label: "Chorus",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "rate_mod", label: "Rate", type: "control" },
      { id: "depth_mod", label: "Dep", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  phaser: {
    type: "phaser",
    label: "Phaser",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "rate_mod", label: "Rate", type: "control" },
      { id: "depth_mod", label: "Dep", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  waveshaper: {
    type: "waveshaper",
    label: "Waveshaper",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "drive_mod", label: "Drv", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  ring_modulator: {
    type: "ring_modulator",
    label: "Ring Mod",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "mod", label: "Mod", type: "audio" },
      { id: "mix_mod", label: "Mix", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  pitch_shifter: {
    type: "pitch_shifter",
    label: "Pitch Shifter",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "semitones_mod", label: "Semi", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  limiter: {
    type: "limiter",
    label: "Limiter",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "ceiling_mod", label: "Ceil", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  gate: {
    type: "gate",
    label: "Gate",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "threshold_mod", label: "Thr", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  crossfader: {
    type: "crossfader",
    label: "Crossfader",
    category: "utilities",
    inputs: [
      { id: "a", label: "A", type: "audio" },
      { id: "b", label: "B", type: "audio" },
      { id: "position_mod", label: "Pos", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  // --- Utility ---
  sample_and_hold: {
    type: "sample_and_hold",
    label: "S&H",
    category: "utilities",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "trigger", label: "Trig", type: "audio" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  quantizer: {
    type: "quantizer",
    label: "Quantizer",
    category: "utilities",
    inputs: [{ id: "in", label: "In", type: "audio" }],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  stereo: {
    type: "stereo",
    label: "Stereo",
    category: "utilities",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "width_mod", label: "Wid", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  expression: {
    type: "expression",
    label: "Expression",
    category: "generators",
    inputs: [{ id: "in", label: "In", type: "audio" }],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  note_to_freq: {
    type: "note_to_freq",
    label: "Note→Freq",
    category: "utilities",
    inputs: [{ id: "in", label: "Note", type: "audio" }],
    outputs: [{ id: "freq", label: "Freq", type: "audio" }],
  },
  dc_blocker: {
    type: "dc_blocker",
    label: "DC Blocker",
    category: "utilities",
    inputs: [{ id: "in", label: "In", type: "audio" }],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  granular: {
    type: "granular",
    label: "Granular",
    category: "generators",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "pitch_mod", label: "Pit", type: "control" },
      { id: "grain_size_mod", label: "Grn", type: "control" },
      { id: "scatter_mod", label: "Sct", type: "control" },
      { id: "density_mod", label: "Den", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  vocoder: {
    type: "vocoder",
    label: "Vocoder",
    category: "effects",
    inputs: [
      { id: "carrier", label: "Carrier", type: "audio" },
      { id: "modulator", label: "Mod", type: "audio" },
      { id: "mix_mod", label: "Mix", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  convolution_reverb: {
    type: "convolution_reverb",
    label: "Convolution Reverb",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "mix_mod", label: "Mix", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  spectral: {
    type: "spectral",
    label: "Spectral",
    category: "effects",
    inputs: [
      { id: "in", label: "In", type: "audio" },
      { id: "shift_mod", label: "Shft", type: "control" },
      { id: "mix_mod", label: "Mix", type: "control" },
    ],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  kick_drum: {
    type: "kick_drum",
    label: "Kick",
    category: "generators",
    inputs: [{ id: "trigger", label: "Trig", type: "trigger" }],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  snare_drum: {
    type: "snare_drum",
    label: "Snare",
    category: "generators",
    inputs: [{ id: "trigger", label: "Trig", type: "trigger" }],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  hi_hat: {
    type: "hi_hat",
    label: "Hi-Hat",
    category: "generators",
    inputs: [{ id: "trigger", label: "Trig", type: "trigger" }],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  clap: {
    type: "clap",
    label: "Clap",
    category: "generators",
    inputs: [{ id: "trigger", label: "Trig", type: "trigger" }],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
  tom: {
    type: "tom",
    label: "Tom",
    category: "generators",
    inputs: [{ id: "trigger", label: "Trig", type: "trigger" }],
    outputs: [{ id: "out", label: "Out", type: "audio" }],
  },
};

// ---------------------------------------------------------------------------
// Port type color mapping
// ---------------------------------------------------------------------------

export const PORT_COLORS: Record<string, string> = {
  audio: "#ff6b6b",   // coral red
  control: "#7c3aed", // purple
  midi: "#f472b6",    // pink
  trigger: "#c8ff00", // lime green
};

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

// Map sequencer node types to their custom React Flow node type identifiers.
// These keys correspond to the nodeTypes registered in Canvas.tsx.
const CUSTOM_NODE_TYPE_MAP: Record<string, string> = {
  step_sequencer: "stepSequencerNode",
  gravity_sequencer: "gravitySequencerNode",
  game_of_life_sequencer: "gameOfLifeNode",
  markov_sequencer: "markovChainNode",
  polyrhythm: "polyrhythmNode",
};

/** Convert a document-model NodeData to a React Flow Node. */
export function nodeDataToFlowNode(data: NodeData): Node {
  const typeDef = NODE_TYPE_REGISTRY[data.type];
  const flowNodeType = CUSTOM_NODE_TYPE_MAP[data.type] ?? "chordNode";
  return {
    id: data.id,
    type: flowNodeType,
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
    selectable: true,
    interactionWidth: 20,
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

  // Yjs UndoManager for undo/redo on nodes and connections
  undoManager: Y.UndoManager | null;

  // Maps frontend Yjs node IDs to backend numeric IDs (returned by Rust).
  // Without this mapping, bridge calls like setParameter silently fail because
  // the backend can't parse Yjs-style IDs as u64.
  backendIds: Map<string, string>;

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

  // Undo/Redo
  undo: () => void;
  redo: () => void;

  // Sync: rebuild from Yjs doc
  syncFromDocument: () => void;

  // Initialize with a Y.Doc
  initDocument: (doc: Y.Doc) => void;

  // Look up the backend numeric ID for a frontend Yjs ID.
  // Returns the Yjs ID as fallback if no mapping exists (e.g. MCP-created nodes
  // where the Yjs ID IS the numeric ID).
  getBackendId: (yjsId: string) => string;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  ydoc: createPatchDocument(),
  undoManager: null,
  backendIds: new Map<string, string>(),
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
        // Notify backend so audio engine removes the node
        _bridge?.removeNode(change.id).catch(() => {});
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
        // Notify backend so audio engine disconnects
        _bridge?.disconnect(change.id).catch(() => {});
      }
    }
  },

  onConnect: (connection) => {
    if (!connection.source || !connection.target) return;
    const store = get();
    const fromPort = connection.sourceHandle ?? "out";
    const toPort = connection.targetHandle ?? "in";

    console.log(`[chord] onConnect called: ${connection.source}:${fromPort} → ${connection.target}:${toPort}`);
    console.log(`[chord] _bridge exists: ${!!_bridge}`);

    dmConnect(
      store.ydoc,
      { nodeId: connection.source, port: fromPort },
      { nodeId: connection.target, port: toPort },
    );
    store.syncFromDocument();

    if (!_bridge) {
      console.error("[chord] NO BRIDGE — connection won't reach backend");
      return;
    }

    // Wait for any pending addNode calls to complete before connecting.
    const pending1 = _pendingBackendIds.get(connection.source);
    const pending2 = _pendingBackendIds.get(connection.target);
    console.log(`[chord] pending source: ${!!pending1}, pending target: ${!!pending2}`);

    const doConnect = () => {
      console.log(`[chord] doConnect firing: ${connection.source}:${fromPort} → ${connection.target}:${toPort}`);
      _bridge!.connect(
        { nodeId: connection.source, port: fromPort },
        { nodeId: connection.target, port: toPort },
      ).then((r) => console.log("[chord] connect SUCCESS:", r))
       .catch((e) => console.error("[chord] connect FAILED:", e));
    };

    const waitFor = [pending1, pending2].filter(Boolean);
    if (waitFor.length > 0) {
      console.log(`[chord] waiting for ${waitFor.length} pending addNode(s)...`);
      Promise.all(waitFor).then(() => {
        console.log("[chord] pending resolved, connecting...");
        doConnect();
      }).catch((e) => console.error("[chord] pending FAILED:", e));
    } else {
      doConnect();
    }
  },

  addNode: (type, position, name) => {
    const store = get();
    const id = dmAddNode(store.ydoc, type, { x: position.x, y: position.y }, name);
    store.syncFromDocument();
    // Pass the frontend Yjs ID to the backend so it can map it.
    // Store the promise so connect() can await it if needed.
    if (_bridge) {
      const p = _bridge.addNode(type, { x: position.x, y: position.y }, id).catch(() => {});
      _pendingBackendIds.set(id, p.then(() => id));
    }
    return id;
  },

  removeNode: (nodeId) => {
    const store = get();
    dmRemoveNode(store.ydoc, nodeId);
    store.syncFromDocument();
    _bridge?.removeNode(nodeId).catch(() => {});
  },

  removeSelectedNodes: () => {
    const store = get();
    const selected = store.selectedNodeIds;
    for (const id of selected) {
      dmRemoveNode(store.ydoc, id);
      // Notify backend so audio engine removes the node
      _bridge?.removeNode(id).catch(() => {});
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
    const waitFor = [
      _pendingBackendIds.get(fromNodeId),
      _pendingBackendIds.get(toNodeId),
    ].filter(Boolean);

    const doConnect = () => {
      _bridge?.connect(
        { nodeId: fromNodeId, port: fromPort },
        { nodeId: toNodeId, port: toPort },
      ).catch(() => {});
    };

    if (waitFor.length > 0) {
      Promise.all(waitFor).then(doConnect);
    } else {
      doConnect();
    }
    return id;
  },

  disconnectEdge: (edgeId) => {
    const store = get();
    dmDisconnect(store.ydoc, edgeId);
    store.syncFromDocument();
    _bridge?.disconnect(edgeId).catch(() => {});
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

  undo: () => {
    const um = get().undoManager;
    if (um) {
      um.undo();
      get().syncFromDocument();
    }
  },

  redo: () => {
    const um = get().undoManager;
    if (um) {
      um.redo();
      get().syncFromDocument();
    }
  },

  syncFromDocument: () => {
    const store = get();
    const patch = getPatchDocument(store.ydoc);

    // Build a set of currently selected node IDs so we can preserve
    // selection state across rebuilds (e.g. when a parameter changes).
    const selectedSet = new Set(store.selectedNodeIds);

    const nodes: Node[] = [];
    patch.nodes.forEach((nodeData) => {
      const node = nodeDataToFlowNode(nodeData);
      // Preserve selection state — without this, any Yjs change
      // (including parameter updates from the inspector) would
      // deselect all nodes and close the inspector.
      if (selectedSet.has(node.id)) {
        node.selected = true;
      }
      nodes.push(node);
    });

    const edges: Edge[] = [];
    const connArray = patch.connections.toArray();
    for (const conn of connArray) {
      edges.push(connectionDataToFlowEdge(conn));
    }

    set({ nodes, edges });
  },

  getBackendId: (yjsId) => {
    return get().backendIds.get(yjsId) ?? yjsId;
  },

  initDocument: (doc) => {
    const um = createUndoManager(doc);
    set({ ydoc: doc, undoManager: um });
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
