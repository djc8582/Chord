/**
 * Inspector Store Tests
 *
 * Tests covering:
 * - Inspector store correctly tracks selected node
 * - Parameter changes propagate to document model
 * - Empty state (no node selected) resets inspector
 * - Node type determines which parameters are shown
 * - Node name editing propagates to document
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createPatchDocument,
  getPatchDocument,
  addNode as _addNode,
  setParameter as _dmSetParameter,
} from "@chord/document-model";
import { useCanvasStore } from "../canvas/store.js";
import { useInspectorStore, PARAMETER_DEFINITIONS } from "./store.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  const doc = createPatchDocument();
  useCanvasStore.getState().initDocument(doc);
  // Reset inspector
  useInspectorStore.setState({
    inspectedNodeId: null,
    inspectedNode: null,
    parameterDescriptors: [],
    nodeTypeDef: null,
  });
});

// ---------------------------------------------------------------------------
// Tracking selected node
// ---------------------------------------------------------------------------

describe("inspector store: tracks selected node", () => {
  it("starts with no inspected node", () => {
    const state = useInspectorStore.getState();
    expect(state.inspectedNodeId).toBeNull();
    expect(state.inspectedNode).toBeNull();
    expect(state.parameterDescriptors).toEqual([]);
    expect(state.nodeTypeDef).toBeNull();
  });

  it("syncFromCanvas picks up the first selected node", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc 1");
    useCanvasStore.setState({ selectedNodeIds: [id] });

    useInspectorStore.getState().syncFromCanvas();

    const state = useInspectorStore.getState();
    expect(state.inspectedNodeId).toBe(id);
    expect(state.inspectedNode).not.toBeNull();
    expect(state.inspectedNode!.name).toBe("Osc 1");
    expect(state.inspectedNode!.type).toBe("oscillator");
  });

  it("syncFromCanvas clears when selection is empty", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });
    useInspectorStore.getState().syncFromCanvas();

    // Now clear selection
    useCanvasStore.setState({ selectedNodeIds: [] });
    useInspectorStore.getState().syncFromCanvas();

    const state = useInspectorStore.getState();
    expect(state.inspectedNodeId).toBeNull();
    expect(state.inspectedNode).toBeNull();
  });

  it("syncFromCanvas handles deleted node gracefully", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });

    // Delete the node but keep its ID in selection (edge case)
    canvas.removeNode(id);
    useInspectorStore.getState().syncFromCanvas();

    const state = useInspectorStore.getState();
    expect(state.inspectedNodeId).toBeNull();
    expect(state.inspectedNode).toBeNull();
  });

  it("with multi-selection, inspects the first node", () => {
    const canvas = useCanvasStore.getState();
    const id1 = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc A");
    const id2 = canvas.addNode("filter", { x: 200, y: 0 }, "Filt B");
    useCanvasStore.setState({ selectedNodeIds: [id1, id2] });

    useInspectorStore.getState().syncFromCanvas();

    const state = useInspectorStore.getState();
    expect(state.inspectedNodeId).toBe(id1);
    expect(state.inspectedNode!.name).toBe("Osc A");
  });
});

// ---------------------------------------------------------------------------
// Node type determines parameters
// ---------------------------------------------------------------------------

describe("inspector store: node type determines parameters", () => {
  it("oscillator shows frequency, detune, waveform, gain parameters", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });
    useInspectorStore.getState().syncFromCanvas();

    const { parameterDescriptors } = useInspectorStore.getState();
    const paramIds = parameterDescriptors.map((d) => d.id);
    expect(paramIds).toContain("frequency");
    expect(paramIds).toContain("detune");
    expect(paramIds).toContain("waveform");
    expect(paramIds).toContain("gain");
  });

  it("filter shows cutoff, resonance, type parameters", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("filter", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });
    useInspectorStore.getState().syncFromCanvas();

    const { parameterDescriptors } = useInspectorStore.getState();
    const paramIds = parameterDescriptors.map((d) => d.id);
    expect(paramIds).toContain("cutoff");
    expect(paramIds).toContain("resonance");
    expect(paramIds).toContain("type");
  });

  it("gain shows single gain parameter", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("gain", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });
    useInspectorStore.getState().syncFromCanvas();

    const { parameterDescriptors } = useInspectorStore.getState();
    expect(parameterDescriptors).toHaveLength(1);
    expect(parameterDescriptors[0].id).toBe("gain");
  });

  it("envelope shows ADSR parameters", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("envelope", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });
    useInspectorStore.getState().syncFromCanvas();

    const { parameterDescriptors } = useInspectorStore.getState();
    const paramIds = parameterDescriptors.map((d) => d.id);
    expect(paramIds).toEqual(["attack", "decay", "sustain", "release"]);
  });

  it("unknown node type shows empty parameters", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("totally_custom", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });
    useInspectorStore.getState().syncFromCanvas();

    const { parameterDescriptors } = useInspectorStore.getState();
    expect(parameterDescriptors).toEqual([]);
  });

  it("provides node type definition with port info", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("filter", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });
    useInspectorStore.getState().syncFromCanvas();

    const { nodeTypeDef } = useInspectorStore.getState();
    expect(nodeTypeDef).not.toBeNull();
    expect(nodeTypeDef!.label).toBe("Filter");
    expect(nodeTypeDef!.inputs).toHaveLength(3);
    expect(nodeTypeDef!.outputs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Parameter changes propagate to document model
// ---------------------------------------------------------------------------

describe("inspector store: parameter changes propagate", () => {
  it("setParameter updates the Yjs document", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });
    useInspectorStore.getState().syncFromCanvas();

    useInspectorStore.getState().setParameter("frequency", 880);

    // Check Yjs document
    const patch = getPatchDocument(canvas.ydoc);
    const nodeData = patch.nodes.get(id);
    expect(nodeData!.parameters.frequency).toBe(880);
  });

  it("setParameter updates local cached node data", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });
    useInspectorStore.getState().syncFromCanvas();

    useInspectorStore.getState().setParameter("frequency", 880);

    const { inspectedNode } = useInspectorStore.getState();
    expect(inspectedNode!.parameters.frequency).toBe(880);
  });

  it("setParameter does nothing when no node is inspected", () => {
    // No node selected
    useInspectorStore.getState().setParameter("frequency", 880);
    // Should not throw
    expect(useInspectorStore.getState().inspectedNode).toBeNull();
  });

  it("multiple parameter changes accumulate correctly", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });
    useInspectorStore.getState().syncFromCanvas();

    useInspectorStore.getState().setParameter("frequency", 880);
    useInspectorStore.getState().setParameter("detune", 50);
    useInspectorStore.getState().setParameter("gain", 0.5);

    const patch = getPatchDocument(canvas.ydoc);
    const nodeData = patch.nodes.get(id);
    expect(nodeData!.parameters.frequency).toBe(880);
    expect(nodeData!.parameters.detune).toBe(50);
    expect(nodeData!.parameters.gain).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Node name editing
// ---------------------------------------------------------------------------

describe("inspector store: node name editing", () => {
  it("setNodeName updates the Yjs document", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc 1");
    useCanvasStore.setState({ selectedNodeIds: [id] });
    useInspectorStore.getState().syncFromCanvas();

    useInspectorStore.getState().setNodeName("My Oscillator");

    const patch = getPatchDocument(canvas.ydoc);
    const nodeData = patch.nodes.get(id);
    expect(nodeData!.name).toBe("My Oscillator");
  });

  it("setNodeName updates local cached node", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc 1");
    useCanvasStore.setState({ selectedNodeIds: [id] });
    useInspectorStore.getState().syncFromCanvas();

    useInspectorStore.getState().setNodeName("Renamed");

    const { inspectedNode } = useInspectorStore.getState();
    expect(inspectedNode!.name).toBe("Renamed");
  });

  it("setNodeName does nothing when no node is inspected", () => {
    useInspectorStore.getState().setNodeName("Something");
    expect(useInspectorStore.getState().inspectedNode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PARAMETER_DEFINITIONS registry
// ---------------------------------------------------------------------------

describe("PARAMETER_DEFINITIONS", () => {
  it("has entries for all standard node types", () => {
    const types = Object.keys(PARAMETER_DEFINITIONS);
    expect(types).toContain("oscillator");
    expect(types).toContain("filter");
    expect(types).toContain("gain");
    expect(types).toContain("envelope");
    expect(types).toContain("lfo");
    expect(types).toContain("mixer");
    expect(types).toContain("delay");
    expect(types).toContain("reverb");
    expect(types).toContain("output");
    expect(types).toContain("input");
    expect(types).toContain("noise");
  });

  it("each descriptor has valid min <= defaultValue <= max", () => {
    for (const [_type, descriptors] of Object.entries(PARAMETER_DEFINITIONS)) {
      for (const desc of descriptors) {
        expect(desc.min).toBeLessThanOrEqual(desc.defaultValue);
        expect(desc.defaultValue).toBeLessThanOrEqual(desc.max);
        expect(desc.step).toBeGreaterThan(0);
        expect(desc.label).toBeTruthy();
        expect(desc.id).toBeTruthy();
      }
    }
  });
});
