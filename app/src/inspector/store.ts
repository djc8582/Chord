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
    { id: "time", label: "Delay Time", min: 0.001, max: 2, step: 0.001, defaultValue: 0.5, unit: "s" },
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
  step_sequencer: [
    { id: "steps", label: "Steps", min: 1, max: 32, step: 1, defaultValue: 8, unit: "" },
    { id: "gate_length", label: "Gate Length", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
  ],
  gravity_sequencer: [
    { id: "gravity", label: "Gravity", min: 0.01, max: 10, step: 0.01, defaultValue: 1, unit: "" },
    { id: "num_particles", label: "Particles", min: 1, max: 16, step: 1, defaultValue: 4, unit: "" },
    { id: "scale", label: "Scale", min: 0, max: 11, step: 1, defaultValue: 0, unit: "" },
  ],
  game_of_life_sequencer: [
    { id: "width", label: "Width", min: 4, max: 32, step: 1, defaultValue: 16, unit: "" },
    { id: "height", label: "Height", min: 4, max: 16, step: 1, defaultValue: 8, unit: "" },
    { id: "density", label: "Density", min: 0, max: 1, step: 0.01, defaultValue: 0.3, unit: "" },
  ],
  markov_sequencer: [
    { id: "randomness", label: "Randomness", min: 0, max: 1, step: 0.01, defaultValue: 0.3, unit: "" },
    { id: "root_note", label: "Root Note", min: 0, max: 127, step: 1, defaultValue: 60, unit: "" },
    { id: "scale_type", label: "Scale", min: 0, max: 3, step: 1, defaultValue: 0, unit: "" },
  ],
  polyrhythm: [
    { id: "pattern_a", label: "Pattern A", min: 2, max: 16, step: 1, defaultValue: 3, unit: "" },
    { id: "pattern_b", label: "Pattern B", min: 2, max: 16, step: 1, defaultValue: 4, unit: "" },
    { id: "pattern_c", label: "Pattern C", min: 2, max: 16, step: 1, defaultValue: 5, unit: "" },
  ],
  euclidean: [
    { id: "steps", label: "Steps", min: 1, max: 32, step: 1, defaultValue: 16, unit: "" },
    { id: "pulses", label: "Pulses", min: 0, max: 32, step: 1, defaultValue: 4, unit: "" },
    { id: "rotation", label: "Rotation", min: 0, max: 31, step: 1, defaultValue: 0, unit: "" },
  ],
  chorus: [
    { id: "rate", label: "Rate", min: 0.1, max: 10, step: 0.01, defaultValue: 1, unit: "Hz" },
    { id: "depth", label: "Depth", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
    { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
  ],
  phaser: [
    { id: "rate", label: "Rate", min: 0.1, max: 10, step: 0.01, defaultValue: 0.5, unit: "Hz" },
    { id: "depth", label: "Depth", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
    { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
  ],
  waveshaper: [
    { id: "drive", label: "Drive", min: 0, max: 10, step: 0.01, defaultValue: 1, unit: "" },
    { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, defaultValue: 1, unit: "" },
  ],
  ring_modulator: [
    { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, defaultValue: 1, unit: "" },
  ],
  pitch_shifter: [
    { id: "semitones", label: "Semitones", min: -24, max: 24, step: 0.1, defaultValue: 0, unit: "st" },
    { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, defaultValue: 1, unit: "" },
  ],
  limiter: [
    { id: "ceiling", label: "Ceiling", min: -24, max: 0, step: 0.1, defaultValue: -0.3, unit: "dB" },
    { id: "release", label: "Release", min: 0.01, max: 2, step: 0.01, defaultValue: 0.1, unit: "s" },
  ],
  gate: [
    { id: "threshold", label: "Threshold", min: -80, max: 0, step: 0.1, defaultValue: -40, unit: "dB" },
    { id: "attack", label: "Attack", min: 0, max: 1, step: 0.001, defaultValue: 0.001, unit: "s" },
    { id: "hold", label: "Hold", min: 0, max: 1, step: 0.001, defaultValue: 0.01, unit: "s" },
    { id: "release", label: "Release", min: 0, max: 2, step: 0.01, defaultValue: 0.1, unit: "s" },
  ],
  crossfader: [
    { id: "position", label: "Position", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
  ],
  sample_and_hold: [],
  quantizer: [
    { id: "scale", label: "Scale", min: 0, max: 11, step: 1, defaultValue: 0, unit: "" },
  ],
  stereo: [
    { id: "width", label: "Width", min: 0, max: 2, step: 0.01, defaultValue: 1, unit: "" },
  ],
  expression: [
    { id: "preset", label: "Preset", min: 0, max: 7, step: 1, defaultValue: 0, unit: "" },
    { id: "freq", label: "Frequency", min: 0.1, max: 20000, step: 0.1, defaultValue: 440, unit: "Hz" },
    { id: "param1", label: "Param 1", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
    { id: "param2", label: "Param 2", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
  ],
  note_to_freq: [
    { id: "a4_freq", label: "Concert A", min: 400, max: 480, step: 0.1, defaultValue: 440, unit: "Hz" },
  ],
  dc_blocker: [],
  granular: [
    { id: "grain_size", label: "Grain Size", min: 0.01, max: 0.2, step: 0.001, defaultValue: 0.05, unit: "s" },
    { id: "density", label: "Density", min: 1, max: 50, step: 0.1, defaultValue: 10, unit: "/s" },
    { id: "pitch", label: "Pitch", min: -24, max: 24, step: 0.1, defaultValue: 0, unit: "st" },
    { id: "scatter", label: "Scatter", min: 0, max: 1, step: 0.01, defaultValue: 0, unit: "" },
    { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, defaultValue: 1, unit: "" },
  ],
  vocoder: [
    { id: "bands", label: "Bands", min: 1, max: 16, step: 1, defaultValue: 16, unit: "" },
    { id: "attack", label: "Attack", min: 1, max: 100, step: 0.1, defaultValue: 5, unit: "ms" },
    { id: "release", label: "Release", min: 10, max: 500, step: 1, defaultValue: 50, unit: "ms" },
    { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, defaultValue: 1, unit: "" },
  ],
  convolution_reverb: [
    { id: "decay", label: "Decay", min: 0.1, max: 5, step: 0.01, defaultValue: 1.5, unit: "s" },
    { id: "brightness", label: "Brightness", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
    { id: "predelay", label: "Pre-delay", min: 0, max: 100, step: 1, defaultValue: 10, unit: "ms" },
    { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, defaultValue: 0.3, unit: "" },
  ],
  spectral: [
    { id: "freeze", label: "Freeze", min: 0, max: 1, step: 1, defaultValue: 0, unit: "" },
    { id: "blur", label: "Blur", min: 0, max: 1, step: 0.01, defaultValue: 0, unit: "" },
    { id: "shift", label: "Shift", min: -512, max: 512, step: 1, defaultValue: 0, unit: "bins" },
    { id: "mix", label: "Mix", min: 0, max: 1, step: 0.01, defaultValue: 1, unit: "" },
  ],
  kick_drum: [
    { id: "pitch_start", label: "Pitch Start", min: 50, max: 500, step: 1, defaultValue: 150, unit: "Hz" },
    { id: "pitch_end", label: "Pitch End", min: 20, max: 200, step: 1, defaultValue: 45, unit: "Hz" },
    { id: "pitch_decay", label: "Pitch Decay", min: 0.01, max: 0.3, step: 0.01, defaultValue: 0.05, unit: "s" },
    { id: "decay", label: "Decay", min: 0.05, max: 2, step: 0.01, defaultValue: 0.3, unit: "s" },
    { id: "click", label: "Click", min: 0, max: 1, step: 0.01, defaultValue: 0.3, unit: "" },
    { id: "drive", label: "Drive", min: 0, max: 1, step: 0.01, defaultValue: 0.2, unit: "" },
  ],
  snare_drum: [
    { id: "tone_freq", label: "Tone Freq", min: 80, max: 400, step: 1, defaultValue: 180, unit: "Hz" },
    { id: "noise_color", label: "Noise Color", min: 500, max: 8000, step: 1, defaultValue: 2000, unit: "Hz" },
    { id: "tone_mix", label: "Tone Mix", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
    { id: "decay", label: "Decay", min: 0.03, max: 1, step: 0.01, defaultValue: 0.15, unit: "s" },
    { id: "snap", label: "Snap", min: 0, max: 1, step: 0.01, defaultValue: 0.7, unit: "" },
    { id: "snappy", label: "Snappy", min: 0, max: 1, step: 0.01, defaultValue: 0.3, unit: "" },
  ],
  hi_hat: [
    { id: "color", label: "Color", min: 2000, max: 16000, step: 1, defaultValue: 8000, unit: "Hz" },
    { id: "decay", label: "Decay", min: 0.01, max: 0.5, step: 0.01, defaultValue: 0.05, unit: "s" },
    { id: "open", label: "Open", min: 0, max: 1, step: 0.01, defaultValue: 0, unit: "" },
    { id: "tone", label: "Tone", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
  ],
  clap: [
    { id: "color", label: "Color", min: 400, max: 6000, step: 1, defaultValue: 1200, unit: "Hz" },
    { id: "decay", label: "Decay", min: 0.03, max: 0.5, step: 0.01, defaultValue: 0.12, unit: "s" },
    { id: "spread", label: "Spread", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
    { id: "tone", label: "Tone", min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "" },
  ],
  tom: [
    { id: "pitch", label: "Pitch", min: 40, max: 400, step: 1, defaultValue: 120, unit: "Hz" },
    { id: "decay", label: "Decay", min: 0.05, max: 1, step: 0.01, defaultValue: 0.25, unit: "s" },
    { id: "sweep", label: "Sweep", min: 0, max: 1, step: 0.01, defaultValue: 0.3, unit: "" },
    { id: "tone", label: "Tone", min: 0, max: 1, step: 0.01, defaultValue: 0.7, unit: "" },
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
