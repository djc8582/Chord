# mcp-server

> **Tier 3** — Depends on `audio-graph`, `node-library`, `diagnostics`.

## What This Is

MCP (Model Context Protocol) server that exposes the entire environment to Claude Code and other AI tools. This is the "IDE for sound" core — every feature is programmable.

## MCP Tools Exposed

```
get_patch()                         → Full patch as JSON
set_patch(json)                     → Replace entire patch
add_node(type, position)            → Add node, returns NodeId
remove_node(id)                     → Remove node
connect(from, to)                   → Create connection
disconnect(id)                      → Remove connection
set_parameter(node, param, value)   → Set parameter
get_parameter(node, param)          → Get parameter value
get_node_library()                  → All available node types + docs
play() / stop()                     → Transport control
render(duration, format)            → Offline render to file
export(target, options)             → Export to any target
run_diagnostics()                   → Full health check
get_signal_stats(node, port)        → Real-time signal stats
find_problems()                     → List detected issues + fixes
auto_fix(problem_id)                → Apply a suggested fix
create_test(assertion)              → Define a test assertion
run_tests()                         → Run all tests
search_community(query)             → Search community patches
freeze_node(id)                     → Freeze/bake a node
```

## Implementation Details
- Runs as a local TCP server (stdio or SSE transport for MCP)
- JSON-RPC protocol per MCP spec
- Thread-safe access to engine state via message passing
- Tool results include rich context (signal stats, spectrograms, etc.)

## Dependencies
- `audio-graph` (Tier 0) — graph manipulation
- `node-library` (Tier 2) — node type registry
- `diagnostics` (Tier 2) — health checks
- `export-engine` (Tier 4, optional) — export tool

## Definition of Done
- [ ] MCP server starts and responds to tool discovery
- [ ] add_node / connect / set_parameter work from Claude Code
- [ ] get_patch returns valid JSON representation of graph
- [ ] run_diagnostics returns structured health report
- [ ] render produces an audio file
- [ ] Claude Code can build a simple synth patch end-to-end via MCP
