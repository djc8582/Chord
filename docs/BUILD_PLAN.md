# Chord Build Plan — Parallel Execution Guide

## How to Read This

This document tells you exactly which Claude Code instances to spin up at each phase, what each one builds, and what "done" means before advancing. Every module has a `CLAUDE.md` in its directory — point Claude Code there first.

---

## Phase 1: Foundations (Week 1–2)

**Spin up 4 parallel Claude Code instances.**

| Instance | Module | What It Builds | Done When |
|----------|--------|---------------|-----------|
| CC-1 | `crates/audio-graph` | Graph data structure, compiler, topological sort, type system | All tests pass, 1000-node graph compiles in <10ms |
| CC-2 | `crates/midi-engine` | MIDI types, device I/O, message parsing | MIDI devices listed, messages sent/received |
| CC-3 | `packages/document-model` | Yjs schema, patch document, helper functions | Serialize→deserialize roundtrip works, CRDT sync works |
| CC-4 | `packages/gesture-system` | MediaPipe wrappers for hand/body/face | Hand landmarks from webcam at 30fps |

**No dependencies between these.** All four can run simultaneously without coordination.

**End of Phase 1 gate:** All four modules pass their Definition of Done. Interface types are exported and importable.

---

## Phase 2: Core Engine + Basic UI (Week 3–5)

**Spin up 3 parallel instances.**

| Instance | Module | Depends On | Done When |
|----------|--------|-----------|-----------|
| CC-5 | `crates/dsp-runtime` | audio-graph | Simple chain produces audio, hot-swap is glitch-free, 500 nodes in <5ms |
| CC-6 | `app/src/canvas` | document-model | Nodes render, drag/connect/delete works, 100 nodes at 60fps |
| CC-7 | `app/src/shell` | document-model | App launches with panels, Cmd+K palette works, Tauri bridge sends commands |

**CC-6 and CC-7 can start immediately** (they only need document-model from Phase 1).
**CC-5 must wait** for audio-graph from Phase 1.

---

## Phase 3: I/O, Nodes, and UI Panels (Week 5–8)

**Spin up 6–7 parallel instances.** This is the widest parallel phase.

| Instance | Module | Depends On | Done When |
|----------|--------|-----------|-----------|
| CC-8 | `crates/audio-io` | dsp-runtime | Audio plays through speakers |
| CC-9 | `crates/node-library` (Wave 1) | dsp-runtime, midi-engine | Osc, Filter, Gain, Env, LFO, Mixer, Output, MIDI nodes work |
| CC-10 | `crates/plugin-host` | dsp-runtime | Loads a VST3 plugin, processes audio, shows GUI |
| CC-11 | `crates/scripting-runtime` | dsp-runtime | Expression node produces 440Hz sine |
| CC-12 | `crates/diagnostics` | dsp-runtime | Detects clipping, clicks, NaN with <0.1% overhead |
| CC-13 | `app/src/inspector` | document-model, canvas | Selecting node shows parameters, editing updates engine |
| CC-14 | `app/src/browser` | document-model | Node library with search, click to add |

**At the end of this phase**, the app should be a working (minimal) audio environment: you can add nodes from the browser, connect them on the canvas, edit parameters in the inspector, and hear audio through speakers.

---

## Phase 4: Production Features (Week 8–12)

**Spin up 7–8 parallel instances.**

| Instance | Module | Depends On | Done When |
|----------|--------|-----------|-----------|
| CC-15 | `crates/node-library` (Wave 2+3) | node-library Wave 1 | Delay, Reverb, Comp, EQ, Euclidean, Gravity, Markov all work |
| CC-16 | `crates/mcp-server` | audio-graph, node-library, diagnostics | Claude Code can build a synth patch via MCP |
| CC-17 | `crates/testing-framework` | dsp-runtime, diagnostics | Audio assertions pass/fail correctly, CLI runner works |
| CC-18 | `app/src/timeline` | document-model, canvas | Lanes, clips, transport, basic recording |
| CC-19 | `app/src/piano-roll` | document-model | Note editing, velocity, quantize |
| CC-20 | `app/src/mixer` | document-model, inspector | Channel strips, faders, meters |
| CC-21 | `app/src/visualizer` | dsp-runtime (bridge) | Waveform and spectrum renderers working |
| CC-22 | `app/src/preset-ui` | document-model, browser | Preset save/load/browse, snapshots |
| CC-23 | `packages/controller-integration` | midi-engine, document-model | MIDI learn, auto-mapping |

**Milestone:** At the end of Phase 4, the app is a viable tool. Someone could use it to make music. MCP server means Claude Code can build patches.

---

## Phase 5: Advanced Features (Week 12–16)

**Spin up 5–6 parallel instances.**

| Instance | Module | Depends On | Done When |
|----------|--------|-----------|-----------|
| CC-24 | `crates/export-engine` | audio-graph, node-library, diagnostics | Simple patch exports to web (WASM+React) and VST3 |
| CC-25 | `crates/node-library` (Wave 4+5) | node-library Wave 2+3 | All remaining nodes (AI, spectral, sound design, etc.) |
| CC-26 | `app/src/audio-editor` | timeline | Waveform editing (cut, normalize, reverse) |
| CC-27 | `app/src/notation` | piano-roll | Score view renders, MusicXML export |
| CC-28 | `app/src/live-mode` | canvas, preset-ui, controller-integration | Performance mode fullscreen, setlist, panic button |
| CC-29 | `app/src/collaboration` | document-model, canvas | Presence indicators, cursor sharing |

---

## Phase 6: Cloud & Community (Week 16–20)

**Spin up 4 parallel instances.** These are mostly independent.

| Instance | Module | Depends On | Done When |
|----------|--------|-----------|-----------|
| CC-30 | `server/api` | document-model schema | User auth, patch CRUD, OAuth |
| CC-31 | `server/sync` | document-model | Two clients sync in real-time |
| CC-32 | `server/cloud-storage` | — | Upload/download, signed URLs |
| CC-33 | `server/search` | server/api | Community search returns results |

---

## Total Claude Code Instances Over Time

```
Week  1-2:  ████ (4 instances)
Week  3-5:  ███ (3 instances)
Week  5-8:  ███████ (7 instances)  ← widest parallel
Week  8-12: █████████ (9 instances) ← peak parallelism
Week 12-16: ██████ (6 instances)
Week 16-20: ████ (4 instances)
```

Peak: ~9 simultaneous Claude Code instances during Phase 4.

---

## Critical Path

The longest dependency chain determines the minimum calendar time:

```
audio-graph → dsp-runtime → audio-io → [AUDIO WORKS]
                          → node-library Wave 1 → MCP server → [AI WORKS]
                          → node-library Wave 2+3 → export-engine → [EXPORT WORKS]
                          → diagnostics → testing-framework → [TESTING WORKS]

document-model → canvas → timeline → audio-editor
              → shell → [APP LAUNCHES]
              → piano-roll → notation
```

**The critical path is:** audio-graph → dsp-runtime → node-library → export-engine

Everything else has slack and can absorb delays.

---

## Integration Checkpoints

After each phase, run these integration checks before proceeding:

### After Phase 2
- [ ] Rust engine compiles and starts
- [ ] React app renders in Tauri window
- [ ] Tauri bridge sends a command from React to Rust and gets a response

### After Phase 3
- [ ] Add an Oscillator node via browser, connect to Output, hear sound
- [ ] Change frequency parameter in inspector, hear pitch change
- [ ] Diagnostics reports signal stats for the oscillator

### After Phase 4
- [ ] Build a 3-node synth (Osc → Filter → Output) with automation on filter cutoff
- [ ] Claude Code builds the same synth via MCP
- [ ] Record MIDI into piano roll, play back
- [ ] Preset save/load roundtrip preserves all parameters
- [ ] Visualizer shows waveform of output

### After Phase 5
- [ ] Export the synth as a React component, load in a test web app, hear audio
- [ ] Export as VST3, load in a DAW (Ableton/Logic), hear audio
- [ ] Live mode: fullscreen, setlist with 3 patches, next/prev works
- [ ] Two users collaborate on same patch in real-time

### After Phase 6
- [ ] Create account, upload patch, search for it, download it
- [ ] Fork a community patch, modify, re-publish
- [ ] Cloud compilation produces a working iOS framework

---

## Rules for All Instances

1. **Read CLAUDE.md before writing code.** Root CLAUDE.md first, then module CLAUDE.md.
2. **Never modify another module's public API** without updating the interface contract.
3. **Mock missing dependencies.** Don't wait — create a mock that matches the interface.
4. **Write tests alongside code.** Definition of Done includes tests.
5. **Types are law.** Import from the canonical source. Never duplicate type definitions.
6. **Commits should be atomic.** One logical change per commit. Makes parallel merging easier.
7. **If stuck on an interface question, create an issue** rather than making assumptions.
