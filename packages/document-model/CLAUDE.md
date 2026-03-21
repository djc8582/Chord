# document-model

> **Tier 0** — No dependencies. Can be built immediately.

## What This Is

The Yjs CRDT document schema. This defines the structure of a Chord patch as a Yjs document. Every frontend module and the collaboration server import from here. This is the SINGLE SOURCE OF TRUTH for patch structure.

## Schema

```typescript
// The root Yjs document
export interface PatchDocument {
  nodes: Y.Map<NodeData>;          // NodeId → NodeData
  connections: Y.Array<ConnectionData>;
  timeline: Y.Map<TimelineData>;
  metadata: Y.Map<MetadataField>;
  settings: Y.Map<SettingValue>;
}

export interface NodeData {
  id: string;
  type: string;
  position: { x: number; y: number };
  parameters: Record<string, number>;
  name: string;
  color?: string;
  collapsed?: boolean;
}

export interface ConnectionData {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

// Helper functions
export function createPatchDocument(): Y.Doc;
export function addNode(doc: Y.Doc, type: string, position: Vec2): string;
export function removeNode(doc: Y.Doc, nodeId: string): void;
export function connect(doc: Y.Doc, from: PortRef, to: PortRef): string;
export function setParameter(doc: Y.Doc, nodeId: string, param: string, value: number): void;
export function serializePatch(doc: Y.Doc): string; // JSON
export function deserializePatch(json: string): Y.Doc;
```

## Key Rules
- **ALL** frontend modules import types from this package. Never define node/connection types inline.
- **ALL** mutations go through the helper functions. Never mutate Yjs maps directly from UI code.
- The schema must be forward-compatible. New fields are always optional.

## Dependencies
- `yjs`, `y-protocols`

## Definition of Done
- [ ] Schema types defined and exported
- [ ] createPatchDocument returns a valid empty document
- [ ] addNode / removeNode / connect / setParameter work correctly
- [ ] Serialize → deserialize roundtrip preserves all data
- [ ] Two Yjs documents sync changes correctly (basic CRDT test)
- [ ] UndoManager tracks changes per-user
