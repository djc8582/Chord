# canvas

> **Tier 1** — Depends on `document-model`.

## What This Is

The node graph canvas. The primary interaction surface. Users add nodes, connect ports, drag, zoom, select, group, and encapsulate here.

## Implementation
- **Phase 1:** React Flow for rapid development
- **Phase 2:** Custom WebGL canvas for 2000+ nodes at 60fps

## Key Features
- Nodes render from document-model NodeData
- Connections render from document-model ConnectionData
- All mutations go through document-model helpers (never local state)
- Port type coloring (orange=audio, blue=control, etc.)
- Connection drawing with type-aware highlighting
- Rubber band selection, multi-select, Cmd+click
- Copy/paste/duplicate nodes
- Node search (N key or Cmd+K with "add" prefix)
- Zoom/pan with minimap
- Subpatch enter/exit (double-click or Tab)
- Signal flow animation on connections (optional)

## Dependencies
- `document-model` (Tier 0) — all data
- `@xyflow/react` (Phase 1) or custom WebGL (Phase 2)

## Definition of Done
- [ ] Nodes render from Yjs document
- [ ] Drag nodes to move (position updates in Yjs)
- [ ] Draw connections between compatible ports
- [ ] Delete nodes and connections
- [ ] Node search palette spawns nodes
- [ ] Pan/zoom smooth at 60fps with 100 nodes
- [ ] Rubber band selection works
- [ ] Copy/paste works
