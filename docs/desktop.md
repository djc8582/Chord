# Chord Desktop App

The full Chord visual programming environment — a Tauri 2 app with React frontend and Rust audio backend.

## Architecture

The desktop app combines:
- **React frontend** — visual node graph (React Flow), timeline, piano roll, mixer, browser, inspector
- **Rust backend** — audio-graph compiler, DSP runtime, audio I/O (CPAL), plugin hosting (VST3/CLAP), MIDI (midir)
- **Tauri IPC** — typed commands bridging frontend ↔ backend
- **Yjs CRDT** — collaborative document model for real-time multi-user editing

## Development

```bash
cd app
pnpm install
pnpm tauri dev
```

This launches the Tauri dev server with hot reload for the React frontend and automatic Rust recompilation.

## Build

```bash
cd app
pnpm tauri build
```

Produces platform-native installers:
- **macOS:** `.dmg` and `.app`
- **Windows:** `.msi` and `.exe`
- **Linux:** `.deb`, `.AppImage`

## Frontend Modules

| Module | Path | Description |
|--------|------|-------------|
| Shell | `app/src/shell/` | App layout, panels, routing, keyboard shortcuts |
| Canvas | `app/src/canvas/` | Node graph editor (React Flow) |
| Timeline | `app/src/timeline/` | Arrangement/timeline view |
| Piano Roll | `app/src/piano-roll/` | MIDI note editor |
| Inspector | `app/src/inspector/` | Parameter editor panel |
| Browser | `app/src/browser/` | Node type / file / community browser |
| Mixer | `app/src/mixer/` | Channel strip mixer |
| Visualizer | `app/src/visualizer/` | Real-time audio visualization |
| Preset UI | `app/src/preset-ui/` | Preset browser & management |
| Audio Editor | `app/src/audio-editor/` | Waveform editor |
| Notation | `app/src/notation/` | Score/notation view |
| Live Mode | `app/src/live-mode/` | Performance mode |
| Collaboration | `app/src/collaboration/` | Multi-user cursors, presence, sync |
| Bridge | `app/src/bridge/` | Typed Tauri IPC wrappers |

## Backend Crates

All Rust crates are in `/crates/`. The Tauri backend (`app/src-tauri/`) bridges them to the frontend via typed IPC commands defined in `commands.rs`.

## MCP Integration

The desktop app runs the MCP server, allowing AI assistants to control the full audio engine. When the app is running, connect Claude Code to `localhost:19475`.

## Collaboration

Real-time collaboration is powered by Yjs:
- Document state is a Yjs CRDT — operations merge deterministically
- Sync server in `server/sync/` handles WebSocket connections
- Frontend shows remote cursors, selections, and edits in real-time
- Works offline — changes sync when reconnected

## Plugin Hosting

The desktop app can host:
- **VST3** plugins (via vst3-sys)
- **CLAP** plugins (via clack-host)
- **Audio Units** on macOS

Plugins appear as node types in the browser and can be added to the graph like any built-in node.

## MIDI

Full MIDI support via midir:
- MIDI input from hardware controllers
- MIDI output to external synths
- MIDI learn for parameter mapping
- Auto-mapping for popular controllers (via `@chord/controller-integration`)

## Gesture Control

The `@chord/gesture-system` package provides MediaPipe-based tracking:
- Hand tracking — control parameters with hand gestures
- Body tracking — full-body control
- Face tracking — facial expression control
Available as an experimental feature in the desktop app.
