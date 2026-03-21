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
import { Timeline } from "./timeline/index.js";
import { createPatchDocument } from "@chord/document-model";
import { useBridge } from "./bridge/index.js";

function App() {
  const initialized = useRef(false);
  const bridge = useBridge();

  // Create the Yjs document once and share it with all stores
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const doc = createPatchDocument();
    useCanvasStore.getState().initDocument(doc);

    // Give the canvas and inspector access to the bridge for backend sync
    setCanvasBridge(bridge);
    setInspectorBridge(bridge);
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
