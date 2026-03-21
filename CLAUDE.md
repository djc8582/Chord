# Chord — Master Build Guide

> **Read this first.** This is the root coordination document for the entire project. Every Claude Code instance working on this codebase should read this file before doing anything.

## What This Is

Chord is a visual audio programming environment — a node graph for building audio systems that exports to every platform (web, desktop, mobile, game engines, DAW plugins). Think Max/MSP + Ableton + n8n + AI, with universal export.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri Desktop App                        │
│  ┌─────────────────────────────────┐ ┌───────────────────┐  │
│  │         React Frontend          │ │   Rust Backend     │  │
│  │  ┌───────┐ ┌────────┐ ┌─────┐  │ │  ┌─────────────┐  │  │
│  │  │Canvas │ │Timeline│ │Piano│  │ │  │ Audio Graph  │  │  │
│  │  │  UI   │ │   UI   │ │Roll │  │ │  │  Compiler   │  │  │
│  │  └───┬───┘ └───┬────┘ └──┬──┘  │ │  └──────┬──────┘  │  │
│  │      │         │         │      │ │         │         │  │
│  │  ┌───┴─────────┴─────────┴───┐  │ │  ┌──────┴──────┐  │  │
│  │  │     Document Model        │◄─┼─┼─►│ DSP Runtime │  │  │
│  │  │     (Yjs CRDT)            │  │ │  │  (real-time) │  │  │
│  │  └───────────────────────────┘  │ │  └──────┬──────┘  │  │
│  └─────────────────────────────────┘ │  ┌──────┴──────┐  │  │
│                                      │  │  Audio I/O   │  │  │
│  Tauri IPC + Shared Memory Bridge    │  │  Plugin Host │  │  │
│                                      │  │  MIDI Engine │  │  │
│                                      │  └─────────────┘  │  │
│                                      └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                                      │
         │              ┌───────────┐           │
         └──────────────│ MCP Server│───────────┘
                        └─────┬─────┘
                              │
                     Claude Code / AI
```

## Monorepo Structure

```
/
├── CLAUDE.md                    ← YOU ARE HERE
├── Cargo.toml                   ← Rust workspace root
├── package.json                 ← Node workspace root
├── crates/                      ← All Rust crates
│   ├── audio-graph/             ← Core graph data structure + compiler
│   ├── dsp-runtime/             ← Real-time audio processing engine
│   ├── audio-io/                ← CPAL-based audio input/output
│   ├── plugin-host/             ← VST3/CLAP/AU hosting
│   ├── node-library/            ← All built-in node implementations
│   ├── midi-engine/             ← MIDI I/O and processing
│   ├── diagnostics/             ← Audio diagnostics & self-monitoring
│   ├── export-engine/           ← Compile patches to all targets
│   ├── mcp-server/              ← MCP server for AI integration
│   ├── scripting-runtime/       ← Expression/code node execution
│   └── testing-framework/       ← Patch testing & assertions
├── app/                         ← Tauri + React frontend
│   ├── src-tauri/               ← Tauri Rust backend (bridges to crates)
│   └── src/                     ← React frontend
│       ├── canvas/              ← Node graph canvas
│       ├── timeline/            ← Timeline/arrangement view
│       ├── piano-roll/          ← MIDI editor
│       ├── inspector/           ← Parameter editor
│       ├── browser/             ← Node/file/community browser
│       ├── mixer/               ← Mixer channel strips
│       ├── visualizer/          ← Visualizer renderers
│       ├── preset-ui/           ← Preset browser & manager
│       ├── audio-editor/        ← Waveform editor
│       ├── notation/            ← Score/notation view
│       ├── live-mode/           ← Performance mode
│       ├── collaboration/       ← Presence, cursors, sync UI
│       └── shell/               ← App layout, panels, routing
├── packages/                    ← Shared TypeScript packages
│   ├── document-model/          ← Yjs CRDT document schema
│   ├── gesture-system/          ← Hand/body/face tracking
│   └── controller-integration/  ← Hardware controller support
├── server/                      ← Cloud backend
│   ├── api/                     ← REST + WebSocket API
│   ├── sync/                    ← Yjs collaboration server
│   ├── cloud-storage/           ← S3, database
│   └── search/                  ← Community search
└── docs/                        ← Generated docs, build plan
```

## Dependency Graph (Build Order)

Modules are grouped into **tiers**. All modules in a tier can be built in parallel. A tier can only start when ALL modules in the previous tier are complete.

### Tier 0 — Foundations (no dependencies, all parallel)
- `crates/audio-graph` — Abstract graph data structure
- `crates/midi-engine` — MIDI I/O and processing
- `packages/document-model` — Yjs CRDT document schema
- `packages/gesture-system` — MediaPipe tracking wrappers

### Tier 1 — Core Engine (depends on Tier 0)
- `crates/dsp-runtime` — depends on `audio-graph`
- `app/src/canvas` — depends on `document-model`
- `app/src/shell` — depends on `document-model`

### Tier 2 — I/O & Nodes (depends on Tier 1)
- `crates/audio-io` — depends on `dsp-runtime`
- `crates/node-library` — depends on `dsp-runtime`, `midi-engine`
- `crates/plugin-host` — depends on `dsp-runtime`
- `crates/scripting-runtime` — depends on `dsp-runtime`
- `crates/diagnostics` — depends on `dsp-runtime`
- `app/src/inspector` — depends on `document-model`, `canvas`
- `app/src/browser` — depends on `document-model`

### Tier 3 — Features (depends on Tier 2)
- `crates/mcp-server` — depends on `audio-graph`, `node-library`, `diagnostics`
- `crates/testing-framework` — depends on `dsp-runtime`, `diagnostics`, `node-library`
- `app/src/timeline` — depends on `document-model`, `canvas`
- `app/src/piano-roll` — depends on `document-model`
- `app/src/mixer` — depends on `document-model`, `inspector`
- `app/src/visualizer` — depends on `dsp-runtime` (via bridge)
- `app/src/preset-ui` — depends on `document-model`, `browser`
- `packages/controller-integration` — depends on `midi-engine`, `document-model`

### Tier 4 — Advanced Features (depends on Tier 3)
- `crates/export-engine` — depends on `audio-graph`, `node-library`, `diagnostics`
- `app/src/audio-editor` — depends on `timeline`, `document-model`
- `app/src/notation` — depends on `piano-roll`, `document-model`
- `app/src/live-mode` — depends on `canvas`, `preset-ui`, `controller-integration`
- `app/src/collaboration` — depends on `document-model`, `canvas`

### Tier 5 — Cloud & Community (depends on Tier 4)
- `server/api` — depends on `document-model` schema
- `server/sync` — depends on `document-model`
- `server/cloud-storage` — independent
- `server/search` — depends on `server/api`

## Interface Contracts

**CRITICAL**: These interfaces are the boundaries between modules. They MUST be defined and frozen before parallel work begins. Every module's CLAUDE.md specifies its public API. If you need to change an interface, STOP and update the contract first.

### Core Interfaces

```rust
// audio-graph → dsp-runtime
// The graph hands compiled execution orders to the runtime
pub trait CompiledGraph {
    fn execution_order(&self) -> &[NodeId];
    fn connections(&self) -> &[Connection];
    fn buffer_requirements(&self) -> BufferLayout;
}

// dsp-runtime → node-library
// Every node implements this trait
pub trait AudioNode: Send + 'static {
    fn process(&mut self, ctx: &ProcessContext) -> ProcessResult;
    fn reset(&mut self);
    fn latency(&self) -> u32;
    fn tail_length(&self) -> u32;
}

// document-model → all frontend modules
// The Yjs document schema that everything reads/writes
// Defined in packages/document-model/src/schema.ts
// ALL frontend modules import from here. NEVER define patch
// structure inline.

// dsp-runtime → diagnostics
// Diagnostics hooks into the processing pipeline
pub trait DiagnosticProbe {
    fn on_buffer_processed(&mut self, node_id: NodeId, port: PortId, buffer: &AudioBuffer);
    fn on_error(&mut self, node_id: NodeId, error: AudioError);
}

// mcp-server → everything
// MCP exposes the full system. It imports from audio-graph,
// node-library, diagnostics, and export-engine.
```

### Frontend ↔ Backend Bridge

```typescript
// All communication between React and Rust goes through typed commands.
// Defined in app/src-tauri/src/commands.rs and app/src/bridge/types.ts
// NEVER call invoke() with raw strings. Always use typed wrappers.

interface BridgeCommands {
  // Graph manipulation
  addNode(type: string, position: Vec2): Promise<NodeId>;
  removeNode(id: NodeId): Promise<void>;
  connect(from: PortRef, to: PortRef): Promise<ConnectionId>;
  disconnect(id: ConnectionId): Promise<void>;
  setParameter(nodeId: NodeId, param: string, value: number): Promise<void>;

  // Transport
  play(): Promise<void>;
  stop(): Promise<void>;
  setTempo(bpm: number): Promise<void>;

  // Audio engine
  getSignalStats(nodeId: NodeId, port: PortId): Promise<SignalStats>;
  runDiagnostics(): Promise<DiagnosticReport>;

  // State
  loadPatch(path: string): Promise<void>;
  savePatch(path: string): Promise<void>;
  exportPatch(target: ExportTarget, options: ExportOptions): Promise<string>;
}
```

## Parallel Work Rules

1. **Read the module's CLAUDE.md before writing any code.**
2. **Never modify another module's public API.** If you need a change, update the interface contract document and flag it.
3. **Use the mock/stub pattern.** If your module depends on something not yet built, import the interface and create a mock. The mock will be replaced when the dependency is ready.
4. **Tests are mandatory.** Every module has a "Definition of Done" in its CLAUDE.md that includes test criteria. A module is not done until tests pass.
5. **Types are the source of truth.** Interface types are defined in exactly one place. Import, never duplicate.

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Desktop framework | Tauri 2.x | Lightweight, Rust backend, web frontend |
| Frontend | React 18 + TypeScript | Ecosystem, performance, developer familiarity |
| State (collaborative) | Yjs | Best CRDT library, battle-tested |
| State (UI) | Zustand | Minimal, performant, TypeScript-first |
| Canvas | React Flow → Custom WebGL | React Flow for MVP, migrate later |
| Audio engine | Custom Rust | No ceiling, real-time safe, SIMD |
| Audio I/O | CPAL | Cross-platform, Rust-native |
| Plugin hosting | vst3-sys, clack-host | Rust bindings for VST3 and CLAP |
| MIDI | midir | Cross-platform MIDI I/O in Rust |
| Serialization | serde + JSON | Universal, debuggable |
| Build | Cargo workspaces + pnpm | Monorepo management |
| Testing | cargo test + vitest | Rust + TypeScript test runners |

## Getting Started (for any Claude Code instance)

1. Read this file
2. Identify which module you're working on
3. Read that module's `CLAUDE.md`
4. Check the dependency graph — are your dependencies built?
5. If not, use mocks/stubs for missing dependencies
6. Build, test, verify against the Definition of Done
7. Do NOT touch files outside your module unless updating a shared interface
