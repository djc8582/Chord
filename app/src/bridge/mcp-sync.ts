/**
 * MCP Sync — listens for Tauri events from the API server and updates
 * the Yjs document so the canvas reflects externally-created nodes/connections.
 */

import type * as Y from "yjs";
import {
  addNodeWithId,
  removeNode,
  connect,
  disconnect,
  setParameter,
} from "@chord/document-model";
import { useCanvasStore } from "../canvas/store.js";

// Dynamic import so this module can be loaded in non-Tauri environments.
async function listenForEvent<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<T>(event, (e) => handler(e.payload));
  return unlisten;
}

/**
 * Initialize MCP sync listeners. Call once at app startup.
 *
 * @param doc The Yjs document backing the canvas.
 * @param syncCanvas Callback to trigger a canvas re-render after mutations.
 * @returns A cleanup function that removes all listeners.
 */
export async function initMcpSync(
  doc: Y.Doc,
  syncCanvas: () => void,
): Promise<() => void> {
  const cleanups: Array<() => void> = [];

  // mcp:node-added — add a node with the backend's ID
  cleanups.push(
    await listenForEvent<{
      nodeId: string;
      nodeType: string;
      position: { x: number; y: number };
    }>("mcp:node-added", ({ nodeId, nodeType, position }) => {
      addNodeWithId(doc, nodeId, nodeType, position, nodeType);
      // For API-created nodes, the Yjs ID IS the backend numeric ID.
      useCanvasStore.getState().backendIds.set(nodeId, nodeId);
      syncCanvas();
    }),
  );

  // mcp:node-removed — remove a node
  cleanups.push(
    await listenForEvent<{ nodeId: string }>("mcp:node-removed", ({ nodeId }) => {
      removeNode(doc, nodeId);
      syncCanvas();
    }),
  );

  // mcp:connected — create a connection
  cleanups.push(
    await listenForEvent<{
      connectionId: string;
      fromNode: string;
      fromPort: string;
      toNode: string;
      toPort: string;
    }>("mcp:connected", ({ fromNode, fromPort, toNode, toPort }) => {
      connect(
        doc,
        { nodeId: fromNode, port: fromPort },
        { nodeId: toNode, port: toPort },
      );
      syncCanvas();
    }),
  );

  // mcp:disconnected — remove a connection
  cleanups.push(
    await listenForEvent<{ connectionId: string }>(
      "mcp:disconnected",
      ({ connectionId }) => {
        disconnect(doc, connectionId);
        syncCanvas();
      },
    ),
  );

  // mcp:parameter-set — update a parameter value
  cleanups.push(
    await listenForEvent<{
      nodeId: string;
      param: string;
      value: number;
    }>("mcp:parameter-set", ({ nodeId, param, value }) => {
      try {
        setParameter(doc, nodeId, param, value);
        syncCanvas();
      } catch {
        // Node may not exist in Yjs doc yet; ignore.
      }
    }),
  );

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
