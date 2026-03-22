/**
 * App — Root application component.
 *
 * Creates the Yjs patch document at startup, initializes the canvas store
 * with the shared document, and wires all feature components into the Shell
 * panel layout.
 */

import { useCallback, useEffect, useRef } from "react";
import { Shell } from "./shell/index.js";
import { Canvas, useCanvasStore, setCanvasBridge } from "./canvas/index.js";
import { Inspector, setInspectorBridge } from "./inspector/index.js";
import { Browser } from "./browser/index.js";
import { Timeline, setTimelineBridge } from "./timeline/index.js";
import { setVisualizerBridge, startVisualizerPolling, stopVisualizerPolling } from "./visualizer/store.js";
import { Visualizer } from "./visualizer/index.js";
import { LiveMode } from "./live-mode/index.js";
import { PianoRoll } from "./piano-roll/index.js";
import { createPatchDocument } from "@chord/document-model";
import { useBridge } from "./bridge/index.js";
import { initMcpSync } from "./bridge/mcp-sync.js";
import { useShellStore } from "./shell/store.js";
import { useCommand } from "./shell/useCommand.js";
import { useShortcut } from "./shell/useShortcut.js";

function App() {
  const initialized = useRef(false);
  const bridge = useBridge();
  const setIsPlaying = useShellStore((s) => s.setIsPlaying);

  // Create the Yjs document once and share it with all stores
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const doc = createPatchDocument();
    useCanvasStore.getState().initDocument(doc);

    // Clear the backend graph so it matches the empty canvas.
    bridge.clearGraph().catch(() => {});

    // DEBUG: Expose bridge and store globally for console testing
    (window as any).__bridge = bridge;
    (window as any).__canvasStore = useCanvasStore;
    console.log("[chord] Debug: window.__bridge and window.__canvasStore available");

    // Give the canvas, inspector, timeline, and visualizer access to the bridge for backend sync
    setCanvasBridge(bridge);
    setInspectorBridge(bridge);
    setTimelineBridge(bridge);
    setVisualizerBridge(bridge);

    // Listen for MCP API server events so externally-created nodes appear on canvas
    let mcpCleanup: (() => void) | undefined;
    initMcpSync(doc, () => useCanvasStore.getState().syncFromDocument()).then(
      (cleanup) => {
        mcpCleanup = cleanup;
        console.log("[chord] MCP sync listeners initialized");
      },
    ).catch((err) => {
      console.error("[chord] MCP sync init failed:", err);
    });

    return () => {
      mcpCleanup?.();
    };
  }, [bridge]);

  // -- Live Mode callbacks --
  const handlePanic = useCallback(() => {
    bridge.stop().catch(console.error);
    setIsPlaying(false);
  }, [bridge, setIsPlaying]);

  const handleBpmChange = useCallback(
    (bpm: number) => {
      bridge.setTempo(bpm).catch(console.error);
    },
    [bridge],
  );

  // -- Visualizer polling: start when playing, stop when stopped --
  const isPlaying = useShellStore((s) => s.isPlaying);
  useEffect(() => {
    if (isPlaying) {
      startVisualizerPolling();
    } else {
      stopVisualizerPolling();
    }
    return () => stopVisualizerPolling();
  }, [isPlaying]);

  // -- Live Mode toggle --
  const [liveModeOpen, setLiveModeOpen] = React.useState(false);
  const toggleLiveMode = useCallback(() => setLiveModeOpen((v) => !v), []);

  useCommand("view.toggleLiveMode", toggleLiveMode, {
    label: "Toggle Live Mode",
    category: "View",
    shortcut: "mod+l",
  });
  useShortcut("mod+l", toggleLiveMode);

  // -- Visualizer panel toggle --
  const toggleVisualizer = useCallback(() => {
    useShellStore.getState().togglePanel("visualizer");
  }, []);
  useCommand("view.toggleVisualizer", toggleVisualizer, {
    label: "Toggle Visualizer",
    category: "View",
  });

  return (
    <Shell
      panelContent={{
        inspector: <Inspector />,
        browser: <Browser />,
        timeline: <Timeline />,
        "piano-roll": <PianoRoll />,
        visualizer: <Visualizer />,
      }}
    >
      <Canvas />
      {liveModeOpen && (
        <LiveMode onPanic={handlePanic} onBpmChange={handleBpmChange} />
      )}
    </Shell>
  );
}

// Need React import for useState
import React from "react";

export default App;
