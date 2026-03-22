/**
 * App — Root application component.
 *
 * Creates the Yjs patch document at startup, initializes the canvas store
 * with the shared document, and wires all feature components into the Shell
 * panel layout.
 */

import { useEffect, useRef } from "react";
import { Shell } from "./shell/index.js";
import { Canvas, useCanvasStore, setCanvasBridge } from "./canvas/index.js";
import { Inspector, setInspectorBridge } from "./inspector/index.js";
import { Browser } from "./browser/index.js";
import { Timeline, setTimelineBridge } from "./timeline/index.js";
import { setVisualizerBridge } from "./visualizer/index.js";
import { createPatchDocument } from "@chord/document-model";
import { useBridge } from "./bridge/index.js";
import { initMcpSync } from "./bridge/mcp-sync.js";

function App() {
  const initialized = useRef(false);
  const bridge = useBridge();

  // Create the Yjs document once and share it with all stores
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const doc = createPatchDocument();
    useCanvasStore.getState().initDocument(doc);

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

  return (
    <Shell
      panelContent={{
        inspector: <Inspector />,
        browser: <Browser />,
        timeline: <Timeline />,
      }}
    >
      <Canvas />
    </Shell>
  );
}

export default App;
