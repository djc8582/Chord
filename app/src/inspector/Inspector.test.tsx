/**
 * Inspector Component Tests
 *
 * Tests covering:
 * - Empty state (no node selected) renders appropriate message
 * - Slider/Knob components render with correct min/max/value
 * - Node name and type are displayed
 * - Port information is shown
 * - Parameter controls render for selected node type
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createPatchDocument, getPatchDocument } from "@chord/document-model";
import { useCanvasStore } from "../canvas/store.js";
import { useInspectorStore } from "./store.js";
import { Inspector, setInspectorBridge } from "./Inspector.js";
import { Slider } from "./Slider.js";
import { Knob } from "./Knob.js";
import { NumberInput } from "./NumberInput.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  const doc = createPatchDocument();
  useCanvasStore.getState().initDocument(doc);
  useInspectorStore.setState({
    inspectedNodeId: null,
    inspectedNode: null,
    parameterDescriptors: [],
    nodeTypeDef: null,
  });
  setInspectorBridge(null);
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("Inspector: empty state", () => {
  it("shows 'No node selected' when nothing is selected", () => {
    render(<Inspector />);
    expect(screen.getByTestId("inspector-empty")).toBeDefined();
    expect(screen.getByTestId("inspector-empty").textContent).toContain(
      "No node selected",
    );
  });

  it("renders the inspector container even when empty", () => {
    render(<Inspector />);
    expect(screen.getByTestId("inspector")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Node selected — basic display
// ---------------------------------------------------------------------------

describe("Inspector: selected node display", () => {
  it("shows node name and type when a node is selected", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 }, "My Osc");
    useCanvasStore.setState({ selectedNodeIds: [id] });

    render(<Inspector />);

    const nameInput = screen.getByTestId("inspector-name") as HTMLInputElement;
    expect(nameInput.value).toBe("My Osc");

    const typeLabel = screen.getByTestId("inspector-type");
    expect(typeLabel.textContent).toContain("Oscillator");
  });

  it("shows parameters for an oscillator node", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("oscillator", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });

    render(<Inspector />);

    // Oscillator should have frequency, detune, waveform, gain params
    expect(screen.getByTestId("inspector-parameters")).toBeDefined();
    expect(screen.getByTestId("inspector-param-frequency")).toBeDefined();
    expect(screen.getByTestId("inspector-param-detune")).toBeDefined();
    expect(screen.getByTestId("inspector-param-waveform")).toBeDefined();
    expect(screen.getByTestId("inspector-param-gain")).toBeDefined();
  });

  it("shows port information for a filter node", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("filter", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });

    render(<Inspector />);

    expect(screen.getByTestId("inspector-ports")).toBeDefined();
    // Filter has input, cutoff, resonance inputs
    expect(screen.getByTestId("inspector-port-in-input")).toBeDefined();
    expect(screen.getByTestId("inspector-port-in-cutoff")).toBeDefined();
    expect(screen.getByTestId("inspector-port-in-resonance")).toBeDefined();
    // Filter has output
    expect(screen.getByTestId("inspector-port-out-output")).toBeDefined();
  });

  it("transitions from empty to showing node when selection changes", () => {
    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("gain", { x: 0, y: 0 }, "Gain 1");

    // Initially no selection
    const { rerender } = render(<Inspector />);
    expect(screen.getByTestId("inspector-empty")).toBeDefined();

    // Select the node
    useCanvasStore.setState({ selectedNodeIds: [id] });
    rerender(<Inspector />);

    expect(screen.queryByTestId("inspector-empty")).toBeNull();
    const nameInput = screen.getByTestId("inspector-name") as HTMLInputElement;
    expect(nameInput.value).toBe("Gain 1");
  });
});

// ---------------------------------------------------------------------------
// Parameter change via bridge
// ---------------------------------------------------------------------------

describe("Inspector: parameter changes call bridge", () => {
  it("calls bridge.setParameter when a parameter is changed", async () => {
    const mockBridge = {
      clearGraph: vi.fn().mockResolvedValue(undefined),
      addNode: vi.fn().mockResolvedValue(""),
      removeNode: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(""),
      disconnect: vi.fn().mockResolvedValue(undefined),
      setParameter: vi.fn().mockResolvedValue(undefined),
      syncAndPlay: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      setTempo: vi.fn().mockResolvedValue(undefined),
      sendMidiNoteOn: vi.fn().mockResolvedValue(undefined),
      sendMidiNoteOff: vi.fn().mockResolvedValue(undefined),
      getSignalStats: vi.fn().mockResolvedValue({ peak: 0, rms: 0, clipping: false }),
      runDiagnostics: vi.fn().mockResolvedValue({ cpu_usage: 0, buffer_underruns: 0, node_count: 0, sample_rate: 44100 }),
      getWaveformData: vi.fn().mockResolvedValue([]),
      loadAudioFile: vi.fn().mockResolvedValue({ ok: true, samples: 0, duration: 0 }),
      addModulation: vi.fn().mockResolvedValue(""),
      removeModulation: vi.fn().mockResolvedValue(undefined),
      loadPatch: vi.fn().mockResolvedValue(undefined),
      savePatch: vi.fn().mockResolvedValue(undefined),
      exportPatch: vi.fn().mockResolvedValue(""),
    };
    setInspectorBridge(mockBridge);

    const canvas = useCanvasStore.getState();
    const id = canvas.addNode("gain", { x: 0, y: 0 });
    useCanvasStore.setState({ selectedNodeIds: [id] });

    render(<Inspector />);

    // Find the slider range input for gain
    const rangeInput = screen.getByTestId("inspector-param-gain-range") as HTMLInputElement;
    fireEvent.change(rangeInput, { target: { value: "0.75" } });

    expect(mockBridge.setParameter).toHaveBeenCalledWith(id, "gain", 0.75);

    // Also check Yjs document was updated
    const patch = getPatchDocument(canvas.ydoc);
    const nodeData = patch.nodes.get(id);
    expect(nodeData!.parameters.gain).toBe(0.75);
  });
});

// ---------------------------------------------------------------------------
// Standalone control components
// ---------------------------------------------------------------------------

describe("Slider component", () => {
  it("renders with correct min/max/value", () => {
    const onChange = vi.fn();
    render(
      <Slider
        label="Frequency"
        value={440}
        min={20}
        max={20000}
        step={1}
        unit="Hz"
        onChange={onChange}
        data-testid="freq-slider"
      />,
    );

    const rangeInput = screen.getByTestId("freq-slider-range") as HTMLInputElement;
    expect(rangeInput.type).toBe("range");
    expect(rangeInput.min).toBe("20");
    expect(rangeInput.max).toBe("20000");
    expect(rangeInput.step).toBe("1");
    expect(rangeInput.value).toBe("440");
  });

  it("calls onChange when slider value changes", () => {
    const onChange = vi.fn();
    render(
      <Slider
        label="Volume"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onChange={onChange}
        data-testid="vol-slider"
      />,
    );

    const rangeInput = screen.getByTestId("vol-slider-range");
    fireEvent.change(rangeInput, { target: { value: "0.75" } });

    expect(onChange).toHaveBeenCalledWith(0.75);
  });

  it("renders a label", () => {
    render(
      <Slider
        label="Cutoff"
        value={1000}
        min={20}
        max={20000}
        step={1}
        onChange={vi.fn()}
        data-testid="cutoff"
      />,
    );

    expect(screen.getByText("Cutoff")).toBeDefined();
  });
});

describe("Knob component", () => {
  it("renders with correct ARIA attributes", () => {
    const onChange = vi.fn();
    render(
      <Knob
        label="Waveform"
        value={1}
        min={0}
        max={3}
        step={1}
        onChange={onChange}
        data-testid="wave-knob"
      />,
    );

    const dial = screen.getByTestId("wave-knob-dial");
    expect(dial.getAttribute("role")).toBe("slider");
    expect(dial.getAttribute("aria-valuemin")).toBe("0");
    expect(dial.getAttribute("aria-valuemax")).toBe("3");
    expect(dial.getAttribute("aria-valuenow")).toBe("1");
  });

  it("renders a label", () => {
    render(
      <Knob
        label="Waveform"
        value={0}
        min={0}
        max={3}
        step={1}
        onChange={vi.fn()}
        data-testid="wave"
      />,
    );

    expect(screen.getByText("Waveform")).toBeDefined();
  });
});

describe("NumberInput component", () => {
  it("renders with the current value", () => {
    render(
      <NumberInput
        value={440}
        min={20}
        max={20000}
        step={1}
        unit="Hz"
        onChange={vi.fn()}
        data-testid="freq-num"
      />,
    );

    const input = screen.getByTestId("freq-num-input") as HTMLInputElement;
    expect(input.value).toBe("440");
  });

  it("displays unit text", () => {
    render(
      <NumberInput
        value={440}
        min={20}
        max={20000}
        step={1}
        unit="Hz"
        onChange={vi.fn()}
        data-testid="freq-num"
      />,
    );

    expect(screen.getByText("Hz")).toBeDefined();
  });

  it("calls onChange on blur with clamped value", () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={440}
        min={20}
        max={20000}
        step={1}
        onChange={onChange}
        data-testid="freq-num"
      />,
    );

    const input = screen.getByTestId("freq-num-input") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "99999" } });
    fireEvent.blur(input);

    // Should clamp to max
    expect(onChange).toHaveBeenCalledWith(20000);
  });

  it("clamps low values to min", () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={440}
        min={20}
        max={20000}
        step={1}
        onChange={onChange}
        data-testid="freq-num"
      />,
    );

    const input = screen.getByTestId("freq-num-input") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(20);
  });

  it("reverts to previous value on NaN input", () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={440}
        min={20}
        max={20000}
        step={1}
        onChange={onChange}
        data-testid="freq-num"
      />,
    );

    const input = screen.getByTestId("freq-num-input") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);

    // Should not call onChange with NaN — just revert
    expect(onChange).not.toHaveBeenCalled();
  });
});
