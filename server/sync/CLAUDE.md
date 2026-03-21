# server/sync

> **Tier 5** — Depends on `document-model`.

## What This Is

Yjs collaboration server. Relays CRDT updates between peers. Persists document snapshots.

## Tech Stack
- WebSocket server (Rust or Node.js)
- y-websocket protocol
- PostgreSQL for document snapshots
- S3 for incremental updates

## Definition of Done
- [ ] Two clients sync a Yjs document in real-time via server
- [ ] Document persists across server restarts
- [ ] Handles 10+ concurrent editors without issues
