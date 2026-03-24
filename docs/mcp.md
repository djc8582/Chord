# Chord MCP Integration

Chord exposes an MCP (Model Context Protocol) server that makes the entire audio engine programmable by AI coding assistants. Every feature — patch creation, modification, diagnostics, export — is available as an MCP tool.

## Setup

### From the Chord Desktop App

If the Chord desktop app is running, the MCP server is already active. Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "chord": {
      "command": "/path/to/chord-mcp-server",
      "args": []
    }
  }
}
```

### Standalone

```bash
cargo run -p chord-mcp-server
```

The server communicates over stdio using JSON-RPC per the MCP specification.

---

## Available Tools

### Patch Management

#### create_patch

Create a complete patch from natural language description.

```json
{
  "description": "warm ambient pad with slow evolving filter and euclidean percussion",
  "options": {
    "tempo": 85,
    "key": "C#",
    "scale": "phrygian",
    "intensity": 0.3
  }
}
```

**Returns:** `{ patch_id, layers, parameters, node_count, connection_count }`

The vibe translator parses the description for mood, genre, texture, elements, tempo, and key, then builds a multi-layer patch with appropriate effects.

#### get_patch

Get the full patch as JSON.

```json
{ "patch_id": "optional — omit for current patch" }
```

**Returns:** Complete patch JSON with nodes, connections, parameters, metadata.

#### compile_patch

Compile a DSL patch definition into the engine format.

#### export_patch

Export a patch to a target format.

```json
{
  "patch_id": "...",
  "target": "web",
  "options": {}
}
```

**Targets:** `web`, `react`, `standalone`, `vst3`, `clap`

---

### Node Graph Manipulation

#### add_node

Add a node to the graph.

```json
{
  "type": "oscillator",
  "position": { "x": 100, "y": 200 },
  "params": { "frequency": 261.63, "waveform": 1 }
}
```

**Returns:** `{ node_id }`

#### remove_node

```json
{ "node_id": "node-3" }
```

#### connect

Connect two nodes.

```json
{
  "from_node": "node-1",
  "from_port": "out",
  "to_node": "node-2",
  "to_port": "in"
}
```

#### disconnect

Remove a connection.

```json
{
  "from_node": "node-1",
  "from_port": "out",
  "to_node": "node-2",
  "to_port": "in"
}
```

#### set_parameter

Set a parameter on a node.

```json
{
  "node_id": "node-1",
  "param": "frequency",
  "value": 440.0
}
```

#### list_node_types

List all available node types with documentation. Returns the full registry of 47 node types with parameter definitions.

---

### Diagnostics & Analysis

#### run_diagnostics

Full diagnostic check of the current patch.

**Returns:**
```json
{
  "overall_health": "good",
  "signal_stats": { ... },
  "detected_problems": [],
  "suggestions": [],
  "cpu_usage": 0.12
}
```

#### find_problems

List detected audio problems with severity and auto-fix suggestions.

**Returns:**
```json
{
  "problems": [
    {
      "id": "prob-1",
      "severity": "warning",
      "type": "dc_offset",
      "node_id": "node-3",
      "description": "DC offset detected on output (+0.15)",
      "auto_fix_available": true,
      "suggested_fix": "Add DC blocker after node-3"
    }
  ]
}
```

**Problem types:** `clipping`, `dc_offset`, `silence`, `nan_detected`, `click_detected`, `phase_cancellation`, `frequency_masking`, `excessive_resonance`

#### auto_fix

Apply an auto-fix for a detected problem.

```json
{ "problem_id": "prob-1" }
```

**Returns:** `{ fixed: true, description: "Added DC blocker after node-3" }`

#### get_signal_stats

Get signal statistics for any point in the audio graph.

```json
{
  "node_id": "node-3",
  "port": "out"
}
```

**Returns:**
```json
{
  "rms": -18.2,
  "peak": -6.1,
  "crest_factor": 12.1,
  "dc_offset": 0.001,
  "has_signal": true,
  "has_nan": false,
  "has_inf": false,
  "spectral_centroid": 1240.5,
  "zero_crossing_rate": 0.23
}
```

#### get_cpu_profile

Get CPU usage information for the audio processing pipeline.

---

## Best Practices for AI Assistants

### Workflow

1. **Create** a patch with `create_patch` using a rich description
2. **Verify** quality with `run_diagnostics` and `find_problems`
3. **Fix** any issues with `auto_fix` before manual tweaking
4. **Modify** by adding/removing nodes or adjusting parameters
5. **Re-check** with `run_diagnostics` after modifications
6. **Export** when the user needs it in their project

### Description Quality

GOOD: `"warm evolving ambient — 4 detuned saw voices through breathing lowpass filter, sub-bass drone, sparse crystalline bell pings, filtered noise bed, wide stereo reverb, each layer modulated independently at different rates"`

BAD: `"ambient music"` — too vague, produces generic output

### Parameter Ranges

- Intensity: always 0-1
- Frequencies: Hz (20-20000)
- Time: seconds
- Mix: 0-1 (keep reverb/delay mix under 0.4 for most uses)
- dB values: negative numbers (e.g., threshold: -12)

### Common Patterns

**Build a synth patch from scratch:**
```
1. add_node("oscillator") → set frequency, waveform
2. add_node("filter") → set cutoff, resonance
3. add_node("reverb") → set decay, mix
4. connect osc → filter → reverb → output
5. add_node("lfo") → connect to filter cutoff for movement
6. run_diagnostics to verify
```

**Add warmth to a thin patch:**
```
1. find_problems → likely "spectral_thinness"
2. Add a second oscillator detuned ±7 cents
3. Add subtle saturation (waveshaper, drive=0.15)
4. Add a noise layer at -24dB for breath
5. Verify with get_signal_stats
```

**Fix clipping:**
```
1. find_problems → shows clipping
2. auto_fix → adds limiter and adjusts gain staging
3. run_diagnostics → verify fixed
```

## Example Session

```
Human: "Make me some lo-fi study beats"

AI workflow:
1. create_patch("lo-fi study beats — dusty drum machine with vinyl crackle,
   mellow electric piano with bitcrushed warmth and lots of reverb,
   simple walking bass line, 80 BPM, heavy swing, C minor pentatonic")

2. run_diagnostics()
   → quality_score: 0.85, no problems

3. set_parameter(drums, "swing", 0.6)
   → more laid-back feel

4. export_patch(patch_id, "react")
   → generates React component code

5. Returns code to the user:
   import { LofiStudyBeats } from './chord-exports/lofi-study-beats';
   <LofiStudyBeats intensity={focusLevel} />
```
