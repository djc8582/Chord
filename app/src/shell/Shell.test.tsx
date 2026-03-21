/**
 * Integration tests for the Shell component.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Shell, resetPanelInit } from "./Shell.js";
import { useShellStore } from "./store.js";

// Mock the bridge so Tauri invoke doesn't throw in tests
vi.mock("../bridge/bridge.js", () => ({
  bridge: {
    addNode: vi.fn().mockResolvedValue("node_mock"),
    removeNode: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue("conn_mock"),
    disconnect: vi.fn().mockResolvedValue(undefined),
    setParameter: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    setTempo: vi.fn().mockResolvedValue(undefined),
    getSignalStats: vi.fn().mockResolvedValue({ peak: 0, rms: 0, clipping: false }),
    runDiagnostics: vi.fn().mockResolvedValue({ cpu_usage: 0, buffer_underruns: 0, node_count: 0, sample_rate: 44100 }),
    loadPatch: vi.fn().mockResolvedValue(undefined),
    savePatch: vi.fn().mockResolvedValue(undefined),
    exportPatch: vi.fn().mockResolvedValue("/tmp/test.bin"),
  },
  useBridge: () => ({
    addNode: vi.fn().mockResolvedValue("node_mock"),
    removeNode: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue("conn_mock"),
    disconnect: vi.fn().mockResolvedValue(undefined),
    setParameter: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    setTempo: vi.fn().mockResolvedValue(undefined),
    getSignalStats: vi.fn().mockResolvedValue({ peak: 0, rms: 0, clipping: false }),
    runDiagnostics: vi.fn().mockResolvedValue({ cpu_usage: 0, buffer_underruns: 0, node_count: 0, sample_rate: 44100 }),
    loadPatch: vi.fn().mockResolvedValue(undefined),
    savePatch: vi.fn().mockResolvedValue(undefined),
    exportPatch: vi.fn().mockResolvedValue("/tmp/test.bin"),
  }),
}));

function resetStore() {
  useShellStore.setState({
    panels: {},
    commandPaletteOpen: false,
    commands: new Map(),
    theme: "dark",
    isPlaying: false,
    tempo: 120,
  });
  resetPanelInit();
}

describe("Shell", () => {
  beforeEach(resetStore);

  it("renders the shell layout", () => {
    render(<Shell />);
    expect(screen.getByTestId("shell")).toBeDefined();
    expect(screen.getByTestId("toolbar")).toBeDefined();
  });

  it("renders with default panels (inspector right, timeline bottom)", () => {
    render(<Shell />);
    // Inspector and timeline should be visible by default
    const panels = useShellStore.getState().panels;
    expect(panels["inspector"]).toBeDefined();
    expect(panels["inspector"]!.visible).toBe(true);
    expect(panels["timeline"]).toBeDefined();
    expect(panels["timeline"]!.visible).toBe(true);
    expect(panels["canvas"]).toBeDefined();
    expect(panels["canvas"]!.visible).toBe(true);
  });

  it("opens command palette with Cmd+K button", () => {
    render(<Shell />);
    expect(useShellStore.getState().commandPaletteOpen).toBe(false);

    const trigger = screen.getByTestId("command-palette-trigger");
    fireEvent.click(trigger);

    expect(useShellStore.getState().commandPaletteOpen).toBe(true);
    expect(screen.getByTestId("command-palette")).toBeDefined();
  });

  it("registers built-in commands", () => {
    render(<Shell />);
    const commands = useShellStore.getState().commands;
    expect(commands.has("transport.toggle")).toBe(true);
    expect(commands.has("node.add")).toBe(true);
    expect(commands.has("palette.toggle")).toBe(true);
    expect(commands.has("theme.toggle")).toBe(true);
    expect(commands.has("file.new")).toBe(true);
    expect(commands.has("file.open")).toBe(true);
    expect(commands.has("file.save")).toBe(true);
  });

  it("toggles theme between dark and light", () => {
    render(<Shell />);
    expect(useShellStore.getState().theme).toBe("dark");

    act(() => {
      useShellStore.getState().toggleTheme();
    });
    expect(useShellStore.getState().theme).toBe("light");
  });

  it("center area shows placeholder when no children", () => {
    render(<Shell />);
    expect(screen.getByTestId("center-area")).toBeDefined();
    expect(screen.getByTestId("center-area").textContent).toContain("Canvas area");
  });

  it("renders children in center area when provided", () => {
    render(
      <Shell>
        <div data-testid="custom-canvas">Custom Canvas</div>
      </Shell>,
    );
    expect(screen.getByTestId("custom-canvas")).toBeDefined();
  });
});
