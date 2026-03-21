# notation

> **Tier 4** — Depends on `piano-roll`, `document-model`.

## What This Is

Score/notation view. Renders MIDI data as standard music notation. Exports MusicXML and PDF.

## Dependencies
- `piano-roll` (Tier 3) — shares MIDI data access
- Consider: `vexflow` or `opensheetmusicdisplay` for rendering

## Definition of Done
- [ ] Renders MIDI clip as notation (treble/bass clef)
- [ ] Key and time signatures displayed
- [ ] Export to MusicXML
- [ ] Basic note entry via clicking on staff
