/**
 * Chord Document Model — Yjs CRDT schema
 *
 * Defines the shape of a PatchDocument backed by a Yjs Doc and provides all
 * the helper functions that frontend (and server) modules use to read and
 * mutate patch state.
 *
 * IMPORTANT: All mutations go through the helpers exported here.
 * Never mutate Yjs maps/arrays directly from UI code.
 */

import * as Y from "yjs";
import type {
  NodeData,
  ConnectionData,
  TimelineData,
  MetadataField,
  SettingValue,
  Vec2,
  PortRef,
  SerializedPatch,
} from "./types.js";

// ---------------------------------------------------------------------------
// Map key constants (single source of truth)
// ---------------------------------------------------------------------------

export const NODES_KEY = "nodes";
export const CONNECTIONS_KEY = "connections";
export const TIMELINE_KEY = "timeline";
export const METADATA_KEY = "metadata";
export const SETTINGS_KEY = "settings";

// ---------------------------------------------------------------------------
// PatchDocument — typed accessors over the raw Y.Doc
// ---------------------------------------------------------------------------

/**
 * Typed accessor object that wraps a Y.Doc and provides strongly-typed
 * references to each top-level shared type.
 */
export interface PatchDocument {
  doc: Y.Doc;
  nodes: Y.Map<NodeData>;
  connections: Y.Array<ConnectionData>;
  timeline: Y.Map<TimelineData>;
  metadata: Y.Map<MetadataField>;
  settings: Y.Map<SettingValue>;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let idCounter = 0;

/** Generates a short unique id. Suitable for local-first usage. */
export function generateId(): string {
  return `${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Document creation
// ---------------------------------------------------------------------------

/**
 * Create a new Yjs document pre-initialised with the Chord patch schema.
 *
 * The returned `Y.Doc` contains the following shared types:
 * - `nodes`       — `Y.Map<NodeData>`
 * - `connections`  — `Y.Array<ConnectionData>`
 * - `timeline`    — `Y.Map<TimelineData>`
 * - `metadata`    — `Y.Map<MetadataField>`
 * - `settings`    — `Y.Map<SettingValue>`
 */
export function createPatchDocument(): Y.Doc {
  const doc = new Y.Doc();
  // Accessing a shared type for the first time creates it inside the doc.
  // We just touch them here so they are guaranteed to exist.
  doc.getMap(NODES_KEY);
  doc.getArray(CONNECTIONS_KEY);
  doc.getMap(TIMELINE_KEY);
  doc.getMap(METADATA_KEY);
  doc.getMap(SETTINGS_KEY);
  return doc;
}

/**
 * Convenience: wrap a Y.Doc into the strongly-typed PatchDocument accessor.
 */
export function getPatchDocument(doc: Y.Doc): PatchDocument {
  return {
    doc,
    nodes: doc.getMap<NodeData>(NODES_KEY),
    connections: doc.getArray<ConnectionData>(CONNECTIONS_KEY),
    timeline: doc.getMap<TimelineData>(TIMELINE_KEY),
    metadata: doc.getMap<MetadataField>(METADATA_KEY),
    settings: doc.getMap<SettingValue>(SETTINGS_KEY),
  };
}

// ---------------------------------------------------------------------------
// Mutation helpers
// ---------------------------------------------------------------------------

/**
 * Add a node to the patch.
 *
 * @returns The id of the newly created node.
 */
export function addNode(
  doc: Y.Doc,
  type: string,
  position: Vec2,
  name?: string,
): string {
  const id = generateId();
  const nodes = doc.getMap<NodeData>(NODES_KEY);

  const nodeData: NodeData = {
    id,
    type,
    position: { x: position.x, y: position.y },
    parameters: {},
    name: name ?? type,
  };

  doc.transact(() => {
    nodes.set(id, nodeData);
  });

  return id;
}

/**
 * Remove a node and all connections that reference it.
 */
export function removeNode(doc: Y.Doc, nodeId: string): void {
  const nodes = doc.getMap<NodeData>(NODES_KEY);
  const connections = doc.getArray<ConnectionData>(CONNECTIONS_KEY);

  doc.transact(() => {
    nodes.delete(nodeId);

    // Walk the connections array backward so that splice indices stay valid.
    for (let i = connections.length - 1; i >= 0; i--) {
      const conn = connections.get(i);
      if (conn.fromNode === nodeId || conn.toNode === nodeId) {
        connections.delete(i, 1);
      }
    }
  });
}

/**
 * Connect two ports.
 *
 * @returns The id of the newly created connection.
 */
export function connect(doc: Y.Doc, from: PortRef, to: PortRef): string {
  const id = generateId();
  const connections = doc.getArray<ConnectionData>(CONNECTIONS_KEY);

  const connectionData: ConnectionData = {
    id,
    fromNode: from.nodeId,
    fromPort: from.port,
    toNode: to.nodeId,
    toPort: to.port,
  };

  doc.transact(() => {
    connections.push([connectionData]);
  });

  return id;
}

/**
 * Disconnect (remove) a connection by its id.
 */
export function disconnect(doc: Y.Doc, connectionId: string): void {
  const connections = doc.getArray<ConnectionData>(CONNECTIONS_KEY);

  doc.transact(() => {
    for (let i = connections.length - 1; i >= 0; i--) {
      if (connections.get(i).id === connectionId) {
        connections.delete(i, 1);
        return;
      }
    }
  });
}

/**
 * Set (or update) a single parameter on a node.
 *
 * Because Yjs tracks changes at the map-entry level, we replace the entire
 * NodeData value so that the change propagates correctly to remote peers.
 */
export function setParameter(
  doc: Y.Doc,
  nodeId: string,
  param: string,
  value: number,
): void {
  const nodes = doc.getMap<NodeData>(NODES_KEY);

  doc.transact(() => {
    const existing = nodes.get(nodeId);
    if (!existing) {
      throw new Error(`setParameter: node "${nodeId}" not found`);
    }

    const updated: NodeData = {
      ...existing,
      parameters: {
        ...existing.parameters,
        [param]: value,
      },
    };

    nodes.set(nodeId, updated);
  });
}

/**
 * Update the position of a node.
 */
export function setNodePosition(
  doc: Y.Doc,
  nodeId: string,
  position: Vec2,
): void {
  const nodes = doc.getMap<NodeData>(NODES_KEY);

  doc.transact(() => {
    const existing = nodes.get(nodeId);
    if (!existing) {
      throw new Error(`setNodePosition: node "${nodeId}" not found`);
    }

    nodes.set(nodeId, {
      ...existing,
      position: { x: position.x, y: position.y },
    });
  });
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serialize a Yjs patch document to a JSON string.
 *
 * The output is a self-contained snapshot that can be stored on disk,
 * sent over the network, or fed back into `deserializePatch`.
 */
export function serializePatch(doc: Y.Doc): string {
  const patch = getPatchDocument(doc);

  const nodes: Record<string, NodeData> = {};
  patch.nodes.forEach((value, key) => {
    nodes[key] = value;
  });

  const connections: ConnectionData[] = patch.connections.toArray();

  const timeline: Record<string, TimelineData> = {};
  patch.timeline.forEach((value, key) => {
    timeline[key] = value;
  });

  const metadata: Record<string, MetadataField> = {};
  patch.metadata.forEach((value, key) => {
    metadata[key] = value;
  });

  const settings: Record<string, SettingValue> = {};
  patch.settings.forEach((value, key) => {
    settings[key] = value;
  });

  const serialized: SerializedPatch = {
    nodes,
    connections,
    timeline,
    metadata,
    settings,
  };

  return JSON.stringify(serialized);
}

/**
 * Deserialize a JSON string (produced by `serializePatch`) into a fresh
 * Yjs document.
 */
export function deserializePatch(json: string): Y.Doc {
  const data: SerializedPatch = JSON.parse(json);
  const doc = createPatchDocument();

  doc.transact(() => {
    const nodes = doc.getMap<NodeData>(NODES_KEY);
    for (const [key, value] of Object.entries(data.nodes)) {
      nodes.set(key, value);
    }

    const connections = doc.getArray<ConnectionData>(CONNECTIONS_KEY);
    for (const conn of data.connections) {
      connections.push([conn]);
    }

    const timeline = doc.getMap<TimelineData>(TIMELINE_KEY);
    for (const [key, value] of Object.entries(data.timeline)) {
      timeline.set(key, value);
    }

    const metadata = doc.getMap<MetadataField>(METADATA_KEY);
    for (const [key, value] of Object.entries(data.metadata)) {
      metadata.set(key, value);
    }

    const settings = doc.getMap<SettingValue>(SETTINGS_KEY);
    for (const [key, value] of Object.entries(data.settings)) {
      settings.set(key, value);
    }
  });

  return doc;
}

// ---------------------------------------------------------------------------
// UndoManager integration
// ---------------------------------------------------------------------------

/**
 * Create a Yjs UndoManager scoped to the `nodes` and `connections` shared
 * types. Each user should have their own UndoManager instance so that
 * undo/redo only affects their own changes.
 *
 * @param doc        The Yjs document.
 * @param captureTimeout  Milliseconds within which consecutive changes are
 *                        merged into a single undo step. Defaults to 500.
 */
export function createUndoManager(
  doc: Y.Doc,
  captureTimeout = 500,
): Y.UndoManager {
  const nodes = doc.getMap<NodeData>(NODES_KEY);
  const connections = doc.getArray<ConnectionData>(CONNECTIONS_KEY);

  return new Y.UndoManager([nodes, connections], {
    captureTimeout,
    // Track the origin so that only the local user's changes are captured.
    trackedOrigins: new Set([null]),
  });
}

// ---------------------------------------------------------------------------
// Binary encoding helpers (Yjs state vectors)
// ---------------------------------------------------------------------------

/**
 * Encode the full document state as a Uint8Array (Yjs binary encoding).
 * Useful for network sync and persistence.
 */
export function encodeDocumentState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Apply a Yjs state update (Uint8Array) to a document.
 */
export function applyDocumentUpdate(doc: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(doc, update);
}

/**
 * Synchronise two documents by exchanging state updates.
 * After this call both documents contain the merged state.
 */
export function syncDocuments(docA: Y.Doc, docB: Y.Doc): void {
  const updateA = Y.encodeStateAsUpdate(docA);
  const updateB = Y.encodeStateAsUpdate(docB);
  Y.applyUpdate(docA, updateB);
  Y.applyUpdate(docB, updateA);
}
