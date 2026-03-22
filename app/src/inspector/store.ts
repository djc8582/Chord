/**
 * Inspector Store
 *
 * Zustand store that tracks which node is being inspected (derived from
 * canvas selection) and provides parameter definitions for the current
 * node type.
 *
 * The inspector reads from the canvas store's selectedNodeIds and the
 * Yjs document to determine what to display.
 */

import { create } from "zustand";
import type { NodeData } from "@chord/document-model";
import {
  getPatchDocument,
  setParameter as dmSetParameter,
} from "@chord/document-model";
import { useCanvasStore } from "../canvas/store.js";
import type { NodeTypeDefinition } from "../canvas/store.js";
import { NODE_TYPE_REGISTRY } from "../canvas/store.js";

// ---------------------------------------------------------------------------
// Parameter descriptor — describes a single tweakable parameter
// ---------------------------------------------------------------------------

export interface ParameterDescriptor {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: string;
}

// ---------------------------------------------------------------------------
// Built-in parameter definitions per node type
// ---------------------------------------------------------------------------

// These MUST match the backend `build_node_descriptor()` in state.rs exactly.
// Parameter id, min, max, and default must be identical.
export const PARAMETER_DEFINITIONS: Record<string, ParameterDescriptor[]> = {
  oscillator: [
    { id: "frequency", label: "Frequency", min: 0.1, max: 20000, step: 0.1, defaultValue: 440, unit: "Hz" },
    { id: "detune", label: "Detune", min: -1200, max: 1200, step: 1, defaultValue: 0, unit: "cents" },
    { id: "waveform", label: "Waveform", min: 0, max: 3, step: 1, defaultValue: 0, unit: "" },
  ],
  filter: [
    { id: "cutoff", label: "Cutoff", min: 20, max: 20000, step: 1, defaultValue: 1000, unit: "Hz" },
    { id: "resonance", label: "Resonance", min: 0.1, max: 30, step: 0.01, defaultValue: 0.707, unit: "" },
    { id: "mode", label: "Mode", min: 0, max: 2, step: 1, defaultValue: 0, unit: "" },
  ],
  gain: [
    { id: "gain", label: "Gain", min: 0, max: 10, step: 0.01, defaultValue: 1, unit: "" },
  ],
  envelope: [
    { id: "attack", label: "Attack", min: 0, max: 10, step: 0.001, defaultValue: 0.01, unit: "s" },
    { id: "decay", label: "Decay", min: 0, max: 10, step: 0.001, defaultValue: 0.1, unit: "s" },
    { id: "sustain", label: "Sustain", min: 0, max: 1, step: 0.01, defaultValue: 0.7, unit: "" },
    { id: "release", label: "Release", min: 0, max: 30, step: 0.001, defaultValue: 0.3, unit: "s" },
  ],
  lfo: [
    { id: "rate", label: "Rate", min: 0.01, max: 100, step: 0.01, defaultValue: 1, unit: "Hz" },
    { id: "depth", label: "Depth", min: 0, max: 1, step: 0.01, defaultValue: 1, unit: "" },
    { id: "waveform", label: "Waveform", min: 0, max: 3, step: 1, defaultValue: 0, unit: "" },
  ],
  mixer: [],
  delay: [
    { id: "time", label: "Delay Time", min: 0, max: 5, step: 0.001, defaultValue: 0.5, unit: "s" },
    { id: "feedback", label: "Feedback", min: 0, max: 0.99, step: 0.01, defaultValue: 0.3, unit: "" },
    { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
  ],
  reverb: [
    { id: "room_size", label: "Room Size", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
    { id: "damping", label: "Damping", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
    { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, defaultValue: 0.3, unit: "" },
  ],
  compressor: [
    { id: "threshold", label: "Threshold", min: -60, max: 0, step: 0.1, defaultValue: -20, unit: "dB" },
    { id: "ratio", label: "Ratio", min: 1, max: 20, step: 0.1, defaultValue: 4, unit: "" },
    { id: "attack", label: "Attack", min: 0.001, max: 1, step: 0.001, defaultValue: 0.01, unit: "s" },
    { id: "release", label: "Release", min: 0.01, max: 2, step: 0.01, defaultValue: 0.1, unit: "s" },
  ],
  eq: [
    { id: "low_gain", label: "Low Gain", min: -24, max: 24, step: 0.1, defaultValue: 0, unit: "dB" },
    { id: "mid_gain", label: "Mid Gain", min: -24, max: 24, step: 0.1, defaultValue: 0, unit: "dB" },
    { id: "high_gain", label: "High Gain", min: -24, max: 24, step: 0.1, defaultValue: 0, unit: "dB" },
  ],
  output: [],
  input: [],
  midi_in: [],
  midi_to_freq: [],
  noise: [
    { id: "color", label: "Color", min: 0, max: 2, step: 1, defaultValue: 0, unit: "" },
  ],
};

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface InspectorStore {
  /** The node ID currently being inspected (first selected node). */
  inspectedNodeId: string | null;

  /** Cached node data for the inspected node. */
  inspectedNode: NodeData | null;

  /** Parameter descriptors for the inspected node's type. */
  parameterDescriptors: ParameterDescriptor[];

  /** Node type definition (ports, label, etc.) from the canvas registry. */
  nodeTypeDef: NodeTypeDefinition | null;

  /**
   * Derive inspector state from the canvas store.
   * Should be called whenever canvas selection or document changes.
   */
  syncFromCanvas: () => void;

  /**
   * Update a parameter value on the inspected node.
   * Updates both the Yjs document and optionally calls the bridge.
   */
  setParameter: (param: string, value: number) => void;

  /**
   * Update the inspected node's name.
   */
  setNodeName: (name: string) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useInspectorStore = create<InspectorStore>((set, get) => ({
  inspectedNodeId: null,
  inspectedNode: null,
  parameterDescriptors: [],
  nodeTypeDef: null,

  syncFromCanvas: () => {
    const canvasState = useCanvasStore.getState();
    const selectedIds = canvasState.selectedNodeIds;

    if (selectedIds.length === 0) {
      set({
        inspectedNodeId: null,
        inspectedNode: null,
        parameterDescriptors: [],
        nodeTypeDef: null,
      });
      return;
    }

    // Inspect the first selected node
    const nodeId = selectedIds[0];
    const patch = getPatchDocument(canvasState.ydoc);
    const nodeData = patch.nodes.get(nodeId) ?? null;

    if (!nodeData) {
      set({
        inspectedNodeId: null,
        inspectedNode: null,
        parameterDescriptors: [],
        nodeTypeDef: null,
      });
      return;
    }

    const descriptors = PARAMETER_DEFINITIONS[nodeData.type] ?? [];
    const typeDef = NODE_TYPE_REGISTRY[nodeData.type] ?? null;

    set({
      inspectedNodeId: nodeId,
      inspectedNode: nodeData,
      parameterDescriptors: descriptors,
      nodeTypeDef: typeDef,
    });
  },

  setParameter: (param, value) => {
    const { inspectedNodeId, inspectedNode } = get();
    if (!inspectedNodeId || !inspectedNode) return;

    const canvasState = useCanvasStore.getState();
    dmSetParameter(canvasState.ydoc, inspectedNodeId, param, value);

    // Update local cached node data immediately for responsive UI
    set({
      inspectedNode: {
        ...inspectedNode,
        parameters: {
          ...inspectedNode.parameters,
          [param]: value,
        },
      },
    });
  },

  setNodeName: (name) => {
    const { inspectedNodeId, inspectedNode } = get();
    if (!inspectedNodeId || !inspectedNode) return;

    const canvasState = useCanvasStore.getState();
    const patch = getPatchDocument(canvasState.ydoc);
    const doc = canvasState.ydoc;

    doc.transact(() => {
      const existing = patch.nodes.get(inspectedNodeId);
      if (existing) {
        patch.nodes.set(inspectedNodeId, { ...existing, name });
      }
    });

    set({
      inspectedNode: { ...inspectedNode, name },
    });
  },
}));
