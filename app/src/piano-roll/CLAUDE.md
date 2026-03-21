# piano-roll

> **Tier 3** — Depends on `document-model`.

## What This Is

Full MIDI editor. Note editing, velocity, CC lanes, MPE, microtuning, chord detection, scale overlay, notation view.

## Key Features
- Grid with note rectangles (click to add, drag to move/resize)
- Velocity bars below grid
- CC lanes (drawable curves)
- Scale overlay (highlight valid notes)
- Ghost notes from other tracks
- Quantize, humanize, strum
- Step input via MIDI keyboard
- Chord detection display
- Notation/score view tab (MusicXML export)

## Dependencies
- `document-model` (Tier 0) — MIDI clip data

## Definition of Done
- [ ] Notes can be added, selected, moved, resized, deleted
- [ ] Velocity editing works
- [ ] At least one CC lane is drawable
- [ ] Quantize snaps notes to grid
- [ ] Scale overlay highlights correct notes
- [ ] Playback highlights current position
