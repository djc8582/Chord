/**
 * @chord/document-model
 *
 * The Yjs CRDT document schema for Chord patches. This is the SINGLE SOURCE
 * OF TRUTH for patch structure. Every frontend module and the collaboration
 * server import from here.
 *
 * @example
 * ```ts
 * import {
 *   createPatchDocument,
 *   addNode,
 *   connect,
 *   serializePatch,
 * } from "@chord/document-model";
 * ```
 */

// Re-export all plain types
export type {
  Vec2,
  PortRef,
  NodeData,
  ConnectionData,
  TimelineData,
  MetadataField,
  SettingValue,
  SerializedPatch,
} from "./types.js";

// Re-export the PatchDocument accessor type
export type { PatchDocument } from "./schema.js";

// Re-export schema helpers and constants
export {
  // Map key constants
  NODES_KEY,
  CONNECTIONS_KEY,
  TIMELINE_KEY,
  METADATA_KEY,
  SETTINGS_KEY,
  // Document lifecycle
  createPatchDocument,
  getPatchDocument,
  generateId,
  // Mutation helpers
  addNode,
  removeNode,
  connect,
  disconnect,
  setParameter,
  setNodePosition,
  // Serialization
  serializePatch,
  deserializePatch,
  // UndoManager
  createUndoManager,
  // Binary encoding / sync
  encodeDocumentState,
  applyDocumentUpdate,
  syncDocuments,
} from "./schema.js";
