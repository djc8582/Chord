/**
 * Chord Document Model — Type definitions
 *
 * These types represent the plain-data shapes stored inside the Yjs CRDT
 * document. Every frontend module imports from here.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** A two-dimensional position on the canvas. */
export interface Vec2 {
  x: number;
  y: number;
}

/** A reference to a specific port on a specific node. */
export interface PortRef {
  nodeId: string;
  port: string;
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

/** The data stored for a single node inside the patch. */
export interface NodeData {
  id: string;
  type: string;
  position: Vec2;
  parameters: Record<string, number>;
  name: string;
  color?: string;
  collapsed?: boolean;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/** A single audio/signal connection between two ports. */
export interface ConnectionData {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/** Placeholder for timeline data — forward-compatible with future schema. */
export interface TimelineData {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Metadata & Settings
// ---------------------------------------------------------------------------

/** Scalar values that may appear in the metadata or settings maps. */
export type MetadataField = string | number | boolean | null;
export type SettingValue = string | number | boolean | null;

// ---------------------------------------------------------------------------
// Serialised patch (JSON)
// ---------------------------------------------------------------------------

/** The shape produced by `serializePatch` and consumed by `deserializePatch`. */
export interface SerializedPatch {
  nodes: Record<string, NodeData>;
  connections: ConnectionData[];
  timeline: Record<string, TimelineData>;
  metadata: Record<string, MetadataField>;
  settings: Record<string, SettingValue>;
}
