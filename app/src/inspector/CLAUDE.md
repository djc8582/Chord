# inspector

> **Tier 2** — Depends on `document-model`, `canvas`.

## What This Is

Parameter editor panel. Shows all parameters of the selected node(s) with appropriate widgets (knobs, sliders, dropdowns). Preset browser integration.

## Key Features
- Auto-generates parameter UI from node descriptor
- Knob, slider, toggle, dropdown, text field widgets
- Value display with units
- Right-click for automation, modulation, MIDI learn
- Multi-node editing (shared parameters)
- Preset browser (select, save, browse)
- Node documentation display

## Dependencies
- `document-model` (Tier 0) — parameter data
- `canvas` (Tier 1) — selection state

## Definition of Done
- [ ] Selecting a node shows its parameters
- [ ] Parameter changes update Yjs document (and engine via bridge)
- [ ] Knob/slider widgets are smooth and responsive
- [ ] Multi-node selection shows shared parameters
- [ ] Preset save/load works for a single node
