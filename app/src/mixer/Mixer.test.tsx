/**
 * Mixer Component Tests
 *
 * Tests covering:
 * - Channel strip renders all controls (name, fader, pan, mute, solo, meter)
 * - Mixer renders channel strips for audio-producing nodes
 * - Master strip always renders
 * - Fader component renders with correct range
 * - LevelMeter component maps signal stats to visual height
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createPatchDocument } from "@chord/document-model";
import { useCanvasStore } from "../canvas/store.js";
import { useMixerStore } from "./store.js";
import { Mixer } from "./Mixer.js";
import { ChannelStrip } from "./ChannelStrip.js";
import { Fader } from "./Fader.js";
import { LevelMeter } from "./LevelMeter.js";
import type { MixerChannel } from "./store.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  const doc = createPatchDocument();
  useCanvasStore.getState().initDocument(doc);
  useMixerStore.setState({
    channels: [],
    master: {
      nodeId: "__master__",
      name: "Master",
      type: "master",
      volumeDb: 0,
      pan: 0,
      muted: false,
      soloed: false,
      peakDb: -Infinity,
      rmsDb: -Infinity,
      clipping: false,
    },
  });
});

// ---------------------------------------------------------------------------
// ChannelStrip component
// ---------------------------------------------------------------------------

describe("ChannelStrip", () => {
  const baseChannel: MixerChannel = {
    nodeId: "ch1",
    name: "Osc 1",
    type: "oscillator",
    volumeDb: 0,
    pan: 0,
    muted: false,
    soloed: false,
    color: "#f97316",
    peakDb: -12,
    rmsDb: -18,
    clipping: false,
  };

  it("renders channel name", () => {
    render(
      <ChannelStrip
        channel={baseChannel}
        anySoloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        data-testid="strip"
      />,
    );

    expect(screen.getByTestId("strip-name").textContent).toBe("Osc 1");
  });

  it("renders fader", () => {
    render(
      <ChannelStrip
        channel={baseChannel}
        anySoloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        data-testid="strip"
      />,
    );

    expect(screen.getByTestId("strip-fader")).toBeDefined();
    expect(screen.getByTestId("strip-fader-input")).toBeDefined();
  });

  it("renders pan control", () => {
    render(
      <ChannelStrip
        channel={baseChannel}
        anySoloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        data-testid="strip"
      />,
    );

    const pan = screen.getByTestId("strip-pan") as HTMLInputElement;
    expect(pan.type).toBe("range");
    expect(pan.value).toBe("0");
  });

  it("renders mute button", () => {
    render(
      <ChannelStrip
        channel={baseChannel}
        anySoloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        data-testid="strip"
      />,
    );

    const mute = screen.getByTestId("strip-mute");
    expect(mute.textContent).toBe("M");
  });

  it("renders solo button", () => {
    render(
      <ChannelStrip
        channel={baseChannel}
        anySoloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        data-testid="strip"
      />,
    );

    const solo = screen.getByTestId("strip-solo");
    expect(solo.textContent).toBe("S");
  });

  it("renders level meter", () => {
    render(
      <ChannelStrip
        channel={baseChannel}
        anySoloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        data-testid="strip"
      />,
    );

    expect(screen.getByTestId("strip-meter")).toBeDefined();
  });

  it("renders color indicator", () => {
    render(
      <ChannelStrip
        channel={baseChannel}
        anySoloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        data-testid="strip"
      />,
    );

    expect(screen.getByTestId("strip-color")).toBeDefined();
  });

  it("calls onToggleMute when mute button clicked", () => {
    const onMute = vi.fn();
    render(
      <ChannelStrip
        channel={baseChannel}
        anySoloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={onMute}
        onToggleSolo={vi.fn()}
        data-testid="strip"
      />,
    );

    fireEvent.click(screen.getByTestId("strip-mute"));
    expect(onMute).toHaveBeenCalledWith("ch1");
  });

  it("calls onToggleSolo when solo button clicked", () => {
    const onSolo = vi.fn();
    render(
      <ChannelStrip
        channel={baseChannel}
        anySoloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={onSolo}
        data-testid="strip"
      />,
    );

    fireEvent.click(screen.getByTestId("strip-solo"));
    expect(onSolo).toHaveBeenCalledWith("ch1");
  });

  it("marks channel as non-audible when muted", () => {
    const mutedChannel = { ...baseChannel, muted: true };
    render(
      <ChannelStrip
        channel={mutedChannel}
        anySoloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        data-testid="strip"
      />,
    );

    expect(screen.getByTestId("strip").getAttribute("data-audible")).toBe("false");
  });

  it("marks non-soloed channel as non-audible when another is soloed", () => {
    render(
      <ChannelStrip
        channel={baseChannel}
        anySoloed={true}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        data-testid="strip"
      />,
    );

    expect(screen.getByTestId("strip").getAttribute("data-audible")).toBe("false");
  });

  it("displays center pan as 'C'", () => {
    render(
      <ChannelStrip
        channel={baseChannel}
        anySoloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        data-testid="strip"
      />,
    );

    expect(screen.getByTestId("strip-pan-display").textContent).toBe("C");
  });

  it("displays left pan correctly", () => {
    const leftPan = { ...baseChannel, pan: -0.5 };
    render(
      <ChannelStrip
        channel={leftPan}
        anySoloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        data-testid="strip"
      />,
    );

    expect(screen.getByTestId("strip-pan-display").textContent).toBe("L50");
  });
});

// ---------------------------------------------------------------------------
// Fader component
// ---------------------------------------------------------------------------

describe("Fader", () => {
  it("renders a range input", () => {
    render(
      <Fader valueDb={0} onChange={vi.fn()} data-testid="vol-fader" />,
    );

    const input = screen.getByTestId("vol-fader-input") as HTMLInputElement;
    expect(input.type).toBe("range");
    expect(input.min).toBe("0");
    expect(input.max).toBe("1");
  });

  it("displays dB value", () => {
    render(
      <Fader valueDb={0} onChange={vi.fn()} data-testid="vol-fader" />,
    );

    expect(screen.getByTestId("vol-fader-display").textContent).toContain("+0.0");
  });

  it("displays -inf for -Infinity dB", () => {
    render(
      <Fader valueDb={-Infinity} onChange={vi.fn()} data-testid="vol-fader" />,
    );

    expect(screen.getByTestId("vol-fader-display").textContent).toContain("-inf");
  });

  it("calls onChange with dB value when slider changes", () => {
    const onChange = vi.fn();
    render(
      <Fader valueDb={0} onChange={onChange} data-testid="vol-fader" />,
    );

    const input = screen.getByTestId("vol-fader-input");
    fireEvent.change(input, { target: { value: "0.5" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    // The value should be a dB number
    const dbValue = onChange.mock.calls[0][0];
    expect(typeof dbValue).toBe("number");
    expect(isFinite(dbValue)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LevelMeter component
// ---------------------------------------------------------------------------

describe("LevelMeter", () => {
  it("renders with peak and rms data attributes", () => {
    render(
      <LevelMeter peakDb={-12} rmsDb={-18} data-testid="meter" />,
    );

    const meter = screen.getByTestId("meter");
    expect(meter.getAttribute("data-peak-db")).toBe("-12.0");
    expect(meter.getAttribute("data-rms-db")).toBe("-18.0");
  });

  it("renders rms bar and peak indicator", () => {
    render(
      <LevelMeter peakDb={-6} rmsDb={-12} data-testid="meter" />,
    );

    expect(screen.getByTestId("meter-rms")).toBeDefined();
    expect(screen.getByTestId("meter-peak")).toBeDefined();
  });

  it("shows clip indicator when clipping", () => {
    render(
      <LevelMeter peakDb={3} rmsDb={1} clipping={true} data-testid="meter" />,
    );

    expect(screen.getByTestId("meter-clip")).toBeDefined();
    expect(screen.getByTestId("meter").getAttribute("data-clipping")).toBe("true");
  });

  it("does not show clip indicator when not clipping", () => {
    render(
      <LevelMeter peakDb={-12} rmsDb={-18} clipping={false} data-testid="meter" />,
    );

    expect(screen.queryByTestId("meter-clip")).toBeNull();
  });

  it("rms bar uses green zone for low levels", () => {
    render(
      <LevelMeter peakDb={-20} rmsDb={-30} data-testid="meter" />,
    );

    expect(screen.getByTestId("meter-rms").getAttribute("data-zone")).toBe("green");
  });

  it("peak uses red zone for high levels", () => {
    render(
      <LevelMeter peakDb={3} rmsDb={-6} data-testid="meter" />,
    );

    expect(screen.getByTestId("meter-peak").getAttribute("data-zone")).toBe("red");
  });

  it("handles -Infinity dB gracefully", () => {
    render(
      <LevelMeter peakDb={-Infinity} rmsDb={-Infinity} data-testid="meter" />,
    );

    expect(screen.getByTestId("meter").getAttribute("data-peak-db")).toBe("-inf");
    expect(screen.getByTestId("meter").getAttribute("data-rms-db")).toBe("-inf");
  });
});

// ---------------------------------------------------------------------------
// Mixer component (integration)
// ---------------------------------------------------------------------------

describe("Mixer", () => {
  it("renders the mixer container", () => {
    render(<Mixer />);
    expect(screen.getByTestId("mixer")).toBeDefined();
  });

  it("renders a master strip", () => {
    render(<Mixer />);
    expect(screen.getByTestId("mixer-master")).toBeDefined();
    expect(screen.getByTestId("mixer-master-name").textContent).toBe("Master");
  });

  it("renders channel strips for audio-producing nodes", () => {
    const canvas = useCanvasStore.getState();
    const id1 = canvas.addNode("oscillator", { x: 0, y: 0 }, "Osc 1");
    const id2 = canvas.addNode("filter", { x: 100, y: 0 }, "Filter 1");
    // Also add a non-audio node that should NOT appear
    canvas.addNode("output", { x: 200, y: 0 }, "Out");

    // Sync mixer
    useMixerStore.getState().syncFromDocument();

    render(<Mixer />);

    expect(screen.getByTestId(`mixer-channel-${id1}`)).toBeDefined();
    expect(screen.getByTestId(`mixer-channel-${id2}`)).toBeDefined();
    expect(screen.getByTestId(`mixer-channel-${id1}-name`).textContent).toBe("Osc 1");
    expect(screen.getByTestId(`mixer-channel-${id2}-name`).textContent).toBe("Filter 1");
  });
});
