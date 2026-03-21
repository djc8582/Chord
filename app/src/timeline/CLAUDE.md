# timeline

> **Tier 3** — Depends on `document-model`, `canvas`.

## What This Is

Timeline/arrangement view. Lanes with clips (audio, MIDI, automation, trigger), tempo track, markers, recording.

## Key Features
- Horizontal scrolling timeline with beat grid
- Lanes associated with nodes from the canvas
- Audio clips (waveform display)
- MIDI clips (miniature piano roll)
- Automation lanes (drawable curves)
- Tempo track with ramps
- Transport controls (play, stop, record, loop)
- Clip operations: move, resize, split, duplicate, crossfade
- Recording: arm lanes, punch in/out, loop recording

## Dependencies
- `document-model` (Tier 0) — timeline data structure
- `canvas` (Tier 1) — shared node references

## Definition of Done
- [ ] Timeline renders lanes and beat grid
- [ ] Clips can be created, moved, resized
- [ ] Audio clips show waveform
- [ ] MIDI clips show note preview
- [ ] Automation lanes are drawable
- [ ] Transport controls work (play/stop sync with Rust engine)
- [ ] Tempo changes reflected in grid
