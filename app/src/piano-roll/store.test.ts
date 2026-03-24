/**
 * Piano Roll Store Tests
 *
 * Tests covering:
 * - Note CRUD (add, select, move, resize, delete)
 * - Quantize snaps notes to grid
 * - Velocity editing
 * - Selection (single, multi, rubber-band)
 * - Zoom/scroll state management
 * - Piano keyboard note names map correctly (MIDI 60 = C4, etc.)
 * - Tool switching (select/draw/erase)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { usePianoRollStore, resetNoteIdCounter } from "./store";
import {
  midiPitchToName,
  isBlackKey,
  velocityToColor,
  snapValueToBeats,
  snapToGrid,
  snapToGridFloor,
} from "./types";
import type { Note } from "./types";

// Reset store and ID counter before each test
beforeEach(() => {
  resetNoteIdCounter();
  usePianoRollStore.getState().clear();
  // Reset to defaults
  usePianoRollStore.setState({
    zoomX: 80,
    zoomY: 14,
    scrollX: 0,
    scrollY: 84,
    snapEnabled: true,
    snapValue: "1/4",
    velocityEditMode: false,
    tool: "select",
  });
});

// ===========================================================================
// Note CRUD
// ===========================================================================

describe("Note CRUD", () => {
  it("addNote creates a note and returns an id", () => {
    const store = usePianoRollStore.getState();
    const id = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });

    expect(id).toBeTruthy();
    const state = usePianoRollStore.getState();
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0].id).toBe(id);
    expect(state.notes[0].pitch).toBe(60);
    expect(state.notes[0].start).toBe(0);
    expect(state.notes[0].duration).toBe(1);
    expect(state.notes[0].velocity).toBe(100);
  });

  it("addNote supports optional channel", () => {
    const store = usePianoRollStore.getState();
    const id = store.addNote({
      pitch: 64,
      start: 2,
      duration: 0.5,
      velocity: 80,
      channel: 5,
    });

    const note = usePianoRollStore.getState().notes.find((n) => n.id === id);
    expect(note?.channel).toBe(5);
  });

  it("addNote creates multiple notes with unique ids", () => {
    const store = usePianoRollStore.getState();
    const id1 = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    const id2 = store.addNote({ pitch: 64, start: 1, duration: 1, velocity: 90 });
    const id3 = store.addNote({ pitch: 67, start: 2, duration: 1, velocity: 80 });

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(usePianoRollStore.getState().notes).toHaveLength(3);
  });

  it("removeNote deletes a specific note", () => {
    const store = usePianoRollStore.getState();
    const id1 = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    const id2 = store.addNote({ pitch: 64, start: 1, duration: 1, velocity: 90 });

    usePianoRollStore.getState().removeNote(id1);

    const state = usePianoRollStore.getState();
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0].id).toBe(id2);
  });

  it("removeNote also removes the note from selection", () => {
    const store = usePianoRollStore.getState();
    const id = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    usePianoRollStore.getState().selectNote(id);
    expect(usePianoRollStore.getState().selectedNoteIds.has(id)).toBe(true);

    usePianoRollStore.getState().removeNote(id);
    expect(usePianoRollStore.getState().selectedNoteIds.has(id)).toBe(false);
  });

  it("removeSelectedNotes deletes all selected notes", () => {
    const store = usePianoRollStore.getState();
    const id1 = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    const id2 = store.addNote({ pitch: 64, start: 1, duration: 1, velocity: 90 });
    const id3 = store.addNote({ pitch: 67, start: 2, duration: 1, velocity: 80 });

    usePianoRollStore.getState().selectNote(id1);
    usePianoRollStore.getState().selectNote(id2, true);
    usePianoRollStore.getState().removeSelectedNotes();

    const state = usePianoRollStore.getState();
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0].id).toBe(id3);
    expect(state.selectedNoteIds.size).toBe(0);
  });

  it("updateNote modifies note fields", () => {
    const store = usePianoRollStore.getState();
    const id = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });

    usePianoRollStore.getState().updateNote(id, { pitch: 72, velocity: 50 });

    const note = usePianoRollStore.getState().notes.find((n) => n.id === id);
    expect(note?.pitch).toBe(72);
    expect(note?.velocity).toBe(50);
    expect(note?.start).toBe(0); // unchanged
    expect(note?.duration).toBe(1); // unchanged
  });

  it("moveNote changes pitch and start with snapping", () => {
    const store = usePianoRollStore.getState();
    const id = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });

    usePianoRollStore.getState().moveNote(id, 5, 2);

    const note = usePianoRollStore.getState().notes.find((n) => n.id === id);
    expect(note?.pitch).toBe(65);
    expect(note?.start).toBe(2);
  });

  it("moveNote clamps pitch to 0-127", () => {
    const store = usePianoRollStore.getState();
    const id1 = store.addNote({ pitch: 125, start: 0, duration: 1, velocity: 100 });
    const id2 = store.addNote({ pitch: 2, start: 1, duration: 1, velocity: 100 });

    usePianoRollStore.getState().moveNote(id1, 10, 0);
    usePianoRollStore.getState().moveNote(id2, -10, 0);

    const note1 = usePianoRollStore.getState().notes.find((n) => n.id === id1);
    const note2 = usePianoRollStore.getState().notes.find((n) => n.id === id2);
    expect(note1?.pitch).toBe(127);
    expect(note2?.pitch).toBe(0);
  });

  it("moveNote clamps start to >= 0", () => {
    const store = usePianoRollStore.getState();
    const id = store.addNote({ pitch: 60, start: 1, duration: 1, velocity: 100 });

    usePianoRollStore.getState().moveNote(id, 0, -5);

    const note = usePianoRollStore.getState().notes.find((n) => n.id === id);
    expect(note?.start).toBeGreaterThanOrEqual(0);
  });

  it("resizeNote changes duration with minimum enforcement", () => {
    const store = usePianoRollStore.getState();
    const id = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });

    usePianoRollStore.getState().resizeNote(id, 2);
    expect(usePianoRollStore.getState().notes[0].duration).toBe(2);

    // Very small duration should clamp to minimum (snap grid)
    usePianoRollStore.getState().resizeNote(id, 0.001);
    const note = usePianoRollStore.getState().notes.find((n) => n.id === id);
    expect(note!.duration).toBeGreaterThan(0);
  });

  it("setNotes replaces all notes", () => {
    const notes: Note[] = [
      { id: "a", pitch: 60, start: 0, duration: 1, velocity: 100 },
      { id: "b", pitch: 64, start: 1, duration: 0.5, velocity: 80 },
    ];
    usePianoRollStore.getState().setNotes(notes);

    const state = usePianoRollStore.getState();
    expect(state.notes).toHaveLength(2);
    expect(state.notes[0].id).toBe("a");
    expect(state.notes[1].id).toBe("b");
  });

  it("clear removes all notes and selection", () => {
    const store = usePianoRollStore.getState();
    store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    store.addNote({ pitch: 64, start: 1, duration: 1, velocity: 90 });
    usePianoRollStore.getState().selectAll();
    usePianoRollStore.getState().clear();

    const state = usePianoRollStore.getState();
    expect(state.notes).toHaveLength(0);
    expect(state.selectedNoteIds.size).toBe(0);
  });
});

// ===========================================================================
// Selection (single, multi, rubber-band)
// ===========================================================================

describe("Selection", () => {
  it("selectNote selects a single note (clears previous)", () => {
    const store = usePianoRollStore.getState();
    const id1 = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    const id2 = store.addNote({ pitch: 64, start: 1, duration: 1, velocity: 90 });

    usePianoRollStore.getState().selectNote(id1);
    expect(usePianoRollStore.getState().selectedNoteIds.has(id1)).toBe(true);
    expect(usePianoRollStore.getState().selectedNoteIds.size).toBe(1);

    // Selecting another clears the first
    usePianoRollStore.getState().selectNote(id2);
    expect(usePianoRollStore.getState().selectedNoteIds.has(id1)).toBe(false);
    expect(usePianoRollStore.getState().selectedNoteIds.has(id2)).toBe(true);
    expect(usePianoRollStore.getState().selectedNoteIds.size).toBe(1);
  });

  it("selectNote with addToSelection=true adds to current selection", () => {
    const store = usePianoRollStore.getState();
    const id1 = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    const id2 = store.addNote({ pitch: 64, start: 1, duration: 1, velocity: 90 });

    usePianoRollStore.getState().selectNote(id1);
    usePianoRollStore.getState().selectNote(id2, true);

    const selected = usePianoRollStore.getState().selectedNoteIds;
    expect(selected.has(id1)).toBe(true);
    expect(selected.has(id2)).toBe(true);
    expect(selected.size).toBe(2);
  });

  it("deselectNote removes a note from selection", () => {
    const store = usePianoRollStore.getState();
    const id1 = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    const id2 = store.addNote({ pitch: 64, start: 1, duration: 1, velocity: 90 });

    usePianoRollStore.getState().selectNote(id1);
    usePianoRollStore.getState().selectNote(id2, true);
    usePianoRollStore.getState().deselectNote(id1);

    const selected = usePianoRollStore.getState().selectedNoteIds;
    expect(selected.has(id1)).toBe(false);
    expect(selected.has(id2)).toBe(true);
  });

  it("toggleNoteSelection toggles a note in/out of selection", () => {
    const store = usePianoRollStore.getState();
    const id = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });

    usePianoRollStore.getState().toggleNoteSelection(id);
    expect(usePianoRollStore.getState().selectedNoteIds.has(id)).toBe(true);

    usePianoRollStore.getState().toggleNoteSelection(id);
    expect(usePianoRollStore.getState().selectedNoteIds.has(id)).toBe(false);
  });

  it("selectAll selects every note", () => {
    const store = usePianoRollStore.getState();
    store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    store.addNote({ pitch: 64, start: 1, duration: 1, velocity: 90 });
    store.addNote({ pitch: 67, start: 2, duration: 1, velocity: 80 });

    usePianoRollStore.getState().selectAll();

    expect(usePianoRollStore.getState().selectedNoteIds.size).toBe(3);
  });

  it("clearSelection deselects everything", () => {
    const store = usePianoRollStore.getState();
    store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    store.addNote({ pitch: 64, start: 1, duration: 1, velocity: 90 });

    usePianoRollStore.getState().selectAll();
    usePianoRollStore.getState().clearSelection();

    expect(usePianoRollStore.getState().selectedNoteIds.size).toBe(0);
  });

  it("selectNotesInRect selects notes whose range overlaps the rectangle", () => {
    const store = usePianoRollStore.getState();
    // Note at pitch 60, beats 0-1
    const id1 = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    // Note at pitch 64, beats 2-3
    const id2 = store.addNote({ pitch: 64, start: 2, duration: 1, velocity: 90 });
    // Note at pitch 48, beats 0-1
    const id3 = store.addNote({ pitch: 48, start: 0, duration: 1, velocity: 80 });

    // Select rectangle covering pitches 58-66, beats 0-1.5
    usePianoRollStore.getState().selectNotesInRect({
      startBeat: 0,
      endBeat: 1.5,
      startPitch: 58,
      endPitch: 66,
    });

    const selected = usePianoRollStore.getState().selectedNoteIds;
    expect(selected.has(id1)).toBe(true);  // overlaps
    expect(selected.has(id2)).toBe(false); // outside beat range
    expect(selected.has(id3)).toBe(false); // outside pitch range
  });

  it("selectNotesInRect handles reversed coordinates (drag from bottom-right to top-left)", () => {
    const store = usePianoRollStore.getState();
    const id1 = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });

    // Rectangle with start > end (reversed drag)
    usePianoRollStore.getState().selectNotesInRect({
      startBeat: 2,
      endBeat: -1,
      startPitch: 65,
      endPitch: 55,
    });

    expect(usePianoRollStore.getState().selectedNoteIds.has(id1)).toBe(true);
  });

  it("moveSelectedNotes moves all selected notes", () => {
    const store = usePianoRollStore.getState();
    const id1 = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    const id2 = store.addNote({ pitch: 64, start: 1, duration: 1, velocity: 90 });
    const id3 = store.addNote({ pitch: 67, start: 2, duration: 1, velocity: 80 });

    usePianoRollStore.getState().selectNote(id1);
    usePianoRollStore.getState().selectNote(id2, true);

    usePianoRollStore.getState().moveSelectedNotes(2, 4);

    const notes = usePianoRollStore.getState().notes;
    const n1 = notes.find((n) => n.id === id1)!;
    const n2 = notes.find((n) => n.id === id2)!;
    const n3 = notes.find((n) => n.id === id3)!;

    expect(n1.pitch).toBe(62);
    expect(n1.start).toBe(4);
    expect(n2.pitch).toBe(66);
    expect(n2.start).toBe(5);
    // Unselected note should not move
    expect(n3.pitch).toBe(67);
    expect(n3.start).toBe(2);
  });

  it("resizeSelectedNotes adjusts duration of selected notes", () => {
    const store = usePianoRollStore.getState();
    const id1 = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    const id2 = store.addNote({ pitch: 64, start: 1, duration: 2, velocity: 90 });

    usePianoRollStore.getState().selectNote(id1);
    usePianoRollStore.getState().selectNote(id2, true);

    usePianoRollStore.getState().resizeSelectedNotes(1);

    const notes = usePianoRollStore.getState().notes;
    expect(notes.find((n) => n.id === id1)?.duration).toBe(2);
    expect(notes.find((n) => n.id === id2)?.duration).toBe(3);
  });
});

// ===========================================================================
// Quantize
// ===========================================================================

describe("Quantize", () => {
  it("quantizeSelectedNotes snaps selected notes to grid", () => {
    const store = usePianoRollStore.getState();
    // Note slightly off-grid
    const id1 = store.addNote({ pitch: 60, start: 0.3, duration: 0.8, velocity: 100 });
    const id2 = store.addNote({ pitch: 64, start: 1.7, duration: 1.3, velocity: 90 });

    usePianoRollStore.getState().selectAll();
    usePianoRollStore.getState().quantizeSelectedNotes();

    const notes = usePianoRollStore.getState().notes;
    // With 1/4 snap, grid = 1 beat
    expect(notes.find((n) => n.id === id1)?.start).toBe(0); // 0.3 rounds to 0
    expect(notes.find((n) => n.id === id1)?.duration).toBe(1); // 0.8 rounds to 1
    expect(notes.find((n) => n.id === id2)?.start).toBe(2); // 1.7 rounds to 2
    expect(notes.find((n) => n.id === id2)?.duration).toBe(1); // 1.3 rounds to 1
  });

  it("quantizeAllNotes snaps every note regardless of selection", () => {
    const store = usePianoRollStore.getState();
    store.addNote({ pitch: 60, start: 0.6, duration: 0.9, velocity: 100 });
    store.addNote({ pitch: 64, start: 2.4, duration: 0.4, velocity: 90 });

    // Do NOT select anything
    usePianoRollStore.getState().quantizeAllNotes();

    const notes = usePianoRollStore.getState().notes;
    expect(notes[0].start).toBe(1);   // 0.6 rounds to 1
    expect(notes[0].duration).toBe(1); // 0.9 rounds to 1
    expect(notes[1].start).toBe(2);   // 2.4 rounds to 2
    // 0.4 rounds to 0, but minimum duration is snap grid (1), so it should be 1
    expect(notes[1].duration).toBe(1);
  });

  it("quantize with 1/8 snap uses 0.5 beat grid", () => {
    usePianoRollStore.setState({ snapValue: "1/8" });

    const store = usePianoRollStore.getState();
    store.addNote({ pitch: 60, start: 0.3, duration: 0.6, velocity: 100 });

    usePianoRollStore.getState().selectAll();
    usePianoRollStore.getState().quantizeSelectedNotes();

    const note = usePianoRollStore.getState().notes[0];
    expect(note.start).toBe(0.5); // 0.3 rounds to 0.5 with 0.5 grid
    expect(note.duration).toBe(0.5); // 0.6 rounds to 0.5
  });

  it("quantize with 1/16 snap uses 0.25 beat grid", () => {
    usePianoRollStore.setState({ snapValue: "1/16" });

    const store = usePianoRollStore.getState();
    store.addNote({ pitch: 60, start: 0.13, duration: 0.37, velocity: 100 });

    usePianoRollStore.getState().selectAll();
    usePianoRollStore.getState().quantizeSelectedNotes();

    const note = usePianoRollStore.getState().notes[0];
    expect(note.start).toBeCloseTo(0.25, 5);
    expect(note.duration).toBeCloseTo(0.25, 5);
  });

  it("quantize only affects selected notes, not unselected", () => {
    const store = usePianoRollStore.getState();
    const id1 = store.addNote({ pitch: 60, start: 0.3, duration: 0.8, velocity: 100 });
    const id2 = store.addNote({ pitch: 64, start: 1.7, duration: 1.3, velocity: 90 });

    usePianoRollStore.getState().selectNote(id1);
    usePianoRollStore.getState().quantizeSelectedNotes();

    const notes = usePianoRollStore.getState().notes;
    expect(notes.find((n) => n.id === id1)?.start).toBe(0);
    // id2 should be unchanged since it was not selected
    expect(notes.find((n) => n.id === id2)?.start).toBe(1.7);
  });
});

// ===========================================================================
// Velocity editing
// ===========================================================================

describe("Velocity editing", () => {
  it("setNoteVelocity updates a single note's velocity", () => {
    const store = usePianoRollStore.getState();
    const id = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });

    usePianoRollStore.getState().setNoteVelocity(id, 42);

    const note = usePianoRollStore.getState().notes.find((n) => n.id === id);
    expect(note?.velocity).toBe(42);
  });

  it("setNoteVelocity clamps to 0-127", () => {
    const store = usePianoRollStore.getState();
    const id = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });

    usePianoRollStore.getState().setNoteVelocity(id, -10);
    expect(usePianoRollStore.getState().notes[0].velocity).toBe(0);

    usePianoRollStore.getState().setNoteVelocity(id, 200);
    expect(usePianoRollStore.getState().notes[0].velocity).toBe(127);
  });

  it("setNoteVelocity rounds to integer", () => {
    const store = usePianoRollStore.getState();
    const id = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });

    usePianoRollStore.getState().setNoteVelocity(id, 63.7);
    expect(usePianoRollStore.getState().notes[0].velocity).toBe(64);
  });

  it("setSelectedNotesVelocity updates velocity for all selected notes", () => {
    const store = usePianoRollStore.getState();
    const id1 = store.addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    const id2 = store.addNote({ pitch: 64, start: 1, duration: 1, velocity: 90 });
    const id3 = store.addNote({ pitch: 67, start: 2, duration: 1, velocity: 80 });

    usePianoRollStore.getState().selectNote(id1);
    usePianoRollStore.getState().selectNote(id2, true);
    usePianoRollStore.getState().setSelectedNotesVelocity(50);

    const notes = usePianoRollStore.getState().notes;
    expect(notes.find((n) => n.id === id1)?.velocity).toBe(50);
    expect(notes.find((n) => n.id === id2)?.velocity).toBe(50);
    expect(notes.find((n) => n.id === id3)?.velocity).toBe(80); // unselected
  });

  it("velocityEditMode can be toggled", () => {
    expect(usePianoRollStore.getState().velocityEditMode).toBe(false);

    usePianoRollStore.getState().setVelocityEditMode(true);
    expect(usePianoRollStore.getState().velocityEditMode).toBe(true);

    usePianoRollStore.getState().setVelocityEditMode(false);
    expect(usePianoRollStore.getState().velocityEditMode).toBe(false);
  });
});

// ===========================================================================
// Zoom / Scroll state
// ===========================================================================

describe("Zoom / Scroll", () => {
  it("setZoomX updates horizontal zoom", () => {
    usePianoRollStore.getState().setZoomX(120);
    expect(usePianoRollStore.getState().zoomX).toBe(120);
  });

  it("setZoomX clamps to min/max", () => {
    usePianoRollStore.getState().setZoomX(1);
    expect(usePianoRollStore.getState().zoomX).toBe(10);

    usePianoRollStore.getState().setZoomX(9999);
    expect(usePianoRollStore.getState().zoomX).toBe(500);
  });

  it("setZoomY updates vertical zoom", () => {
    usePianoRollStore.getState().setZoomY(20);
    expect(usePianoRollStore.getState().zoomY).toBe(20);
  });

  it("setZoomY clamps to min/max", () => {
    usePianoRollStore.getState().setZoomY(1);
    expect(usePianoRollStore.getState().zoomY).toBe(4);

    usePianoRollStore.getState().setZoomY(100);
    expect(usePianoRollStore.getState().zoomY).toBe(40);
  });

  it("setScrollX updates horizontal scroll", () => {
    usePianoRollStore.getState().setScrollX(16);
    expect(usePianoRollStore.getState().scrollX).toBe(16);
  });

  it("setScrollX clamps to >= 0", () => {
    usePianoRollStore.getState().setScrollX(-5);
    expect(usePianoRollStore.getState().scrollX).toBe(0);
  });

  it("setScrollY updates vertical scroll", () => {
    usePianoRollStore.getState().setScrollY(60);
    expect(usePianoRollStore.getState().scrollY).toBe(60);
  });

  it("setScrollY clamps to 0-127", () => {
    usePianoRollStore.getState().setScrollY(-5);
    expect(usePianoRollStore.getState().scrollY).toBe(0);

    usePianoRollStore.getState().setScrollY(200);
    expect(usePianoRollStore.getState().scrollY).toBe(127);
  });
});

// ===========================================================================
// Snap settings
// ===========================================================================

describe("Snap settings", () => {
  it("setSnapEnabled toggles snap", () => {
    usePianoRollStore.getState().setSnapEnabled(false);
    expect(usePianoRollStore.getState().snapEnabled).toBe(false);

    usePianoRollStore.getState().setSnapEnabled(true);
    expect(usePianoRollStore.getState().snapEnabled).toBe(true);
  });

  it("setSnapValue changes the snap grid", () => {
    usePianoRollStore.getState().setSnapValue("1/16");
    expect(usePianoRollStore.getState().snapValue).toBe("1/16");

    usePianoRollStore.getState().setSnapValue("1/8T");
    expect(usePianoRollStore.getState().snapValue).toBe("1/8T");
  });

  it("moveNote without snap does not quantize", () => {
    usePianoRollStore.setState({ snapEnabled: false });

    const store = usePianoRollStore.getState();
    const id = store.addNote({ pitch: 60, start: 0.33, duration: 1, velocity: 100 });

    usePianoRollStore.getState().moveNote(id, 0, 0.17);

    const note = usePianoRollStore.getState().notes.find((n) => n.id === id);
    expect(note?.start).toBeCloseTo(0.5, 5);
  });
});

// ===========================================================================
// Piano keyboard note names
// ===========================================================================

describe("Piano keyboard note names (midiPitchToName)", () => {
  it("MIDI 60 = C4 (middle C)", () => {
    expect(midiPitchToName(60)).toBe("C4");
  });

  it("MIDI 69 = A4 (concert A)", () => {
    expect(midiPitchToName(69)).toBe("A4");
  });

  it("MIDI 0 = C-1", () => {
    expect(midiPitchToName(0)).toBe("C-1");
  });

  it("MIDI 127 = G9", () => {
    expect(midiPitchToName(127)).toBe("G9");
  });

  it("MIDI 48 = C3", () => {
    expect(midiPitchToName(48)).toBe("C3");
  });

  it("MIDI 72 = C5", () => {
    expect(midiPitchToName(72)).toBe("C5");
  });

  it("MIDI 61 = C#4", () => {
    expect(midiPitchToName(61)).toBe("C#4");
  });

  it("MIDI 63 = D#4", () => {
    expect(midiPitchToName(63)).toBe("D#4");
  });

  it("MIDI 12 = C0", () => {
    expect(midiPitchToName(12)).toBe("C0");
  });

  it("MIDI 21 = A0 (lowest piano key)", () => {
    expect(midiPitchToName(21)).toBe("A0");
  });
});

// ===========================================================================
// isBlackKey
// ===========================================================================

describe("isBlackKey", () => {
  it("C is a white key", () => {
    expect(isBlackKey(60)).toBe(false); // C4
  });

  it("C# is a black key", () => {
    expect(isBlackKey(61)).toBe(true); // C#4
  });

  it("D is a white key", () => {
    expect(isBlackKey(62)).toBe(false);
  });

  it("D# is a black key", () => {
    expect(isBlackKey(63)).toBe(true);
  });

  it("E is a white key", () => {
    expect(isBlackKey(64)).toBe(false);
  });

  it("F is a white key", () => {
    expect(isBlackKey(65)).toBe(false);
  });

  it("F# is a black key", () => {
    expect(isBlackKey(66)).toBe(true);
  });

  it("G is a white key", () => {
    expect(isBlackKey(67)).toBe(false);
  });

  it("G# is a black key", () => {
    expect(isBlackKey(68)).toBe(true);
  });

  it("A is a white key", () => {
    expect(isBlackKey(69)).toBe(false);
  });

  it("A# is a black key", () => {
    expect(isBlackKey(70)).toBe(true);
  });

  it("B is a white key", () => {
    expect(isBlackKey(71)).toBe(false);
  });
});

// ===========================================================================
// Tool switching
// ===========================================================================

describe("Tool switching", () => {
  it("default tool is select", () => {
    expect(usePianoRollStore.getState().tool).toBe("select");
  });

  it("setTool switches to draw", () => {
    usePianoRollStore.getState().setTool("draw");
    expect(usePianoRollStore.getState().tool).toBe("draw");
  });

  it("setTool switches to erase", () => {
    usePianoRollStore.getState().setTool("erase");
    expect(usePianoRollStore.getState().tool).toBe("erase");
  });

  it("setTool switches back to select", () => {
    usePianoRollStore.getState().setTool("draw");
    usePianoRollStore.getState().setTool("select");
    expect(usePianoRollStore.getState().tool).toBe("select");
  });
});

// ===========================================================================
// snapValueToBeats / snapToGrid / snapToGridFloor
// ===========================================================================

describe("snapValueToBeats", () => {
  it("1/1 = 4 beats", () => {
    expect(snapValueToBeats("1/1")).toBe(4);
  });

  it("1/2 = 2 beats", () => {
    expect(snapValueToBeats("1/2")).toBe(2);
  });

  it("1/4 = 1 beat", () => {
    expect(snapValueToBeats("1/4")).toBe(1);
  });

  it("1/8 = 0.5 beats", () => {
    expect(snapValueToBeats("1/8")).toBe(0.5);
  });

  it("1/16 = 0.25 beats", () => {
    expect(snapValueToBeats("1/16")).toBe(0.25);
  });

  it("1/32 = 0.125 beats", () => {
    expect(snapValueToBeats("1/32")).toBe(0.125);
  });

  it("1/4T = 4/3 beats", () => {
    expect(snapValueToBeats("1/4T")).toBeCloseTo(4 / 3, 10);
  });

  it("1/8T = 2/3 beats", () => {
    expect(snapValueToBeats("1/8T")).toBeCloseTo(2 / 3, 10);
  });

  it("1/16T = 1/3 beats", () => {
    expect(snapValueToBeats("1/16T")).toBeCloseTo(1 / 3, 10);
  });

  it("1/32T = 1/6 beats", () => {
    expect(snapValueToBeats("1/32T")).toBeCloseTo(1 / 6, 10);
  });
});

describe("snapToGrid", () => {
  it("snaps 0.3 to 0 with 1/4 grid", () => {
    expect(snapToGrid(0.3, "1/4")).toBe(0);
  });

  it("snaps 0.6 to 1 with 1/4 grid", () => {
    expect(snapToGrid(0.6, "1/4")).toBe(1);
  });

  it("snaps 0.3 to 0.5 with 1/8 grid", () => {
    expect(snapToGrid(0.3, "1/8")).toBe(0.5);
  });

  it("snaps 0.1 to 0 with 1/8 grid", () => {
    expect(snapToGrid(0.1, "1/8")).toBe(0);
  });

  it("snaps 2.6 to 2.5 with 1/8 grid", () => {
    expect(snapToGrid(2.6, "1/8")).toBe(2.5);
  });

  it("exact grid values remain unchanged", () => {
    expect(snapToGrid(2, "1/4")).toBe(2);
    expect(snapToGrid(1.5, "1/8")).toBe(1.5);
    expect(snapToGrid(0.75, "1/16")).toBe(0.75);
  });
});

describe("snapToGridFloor", () => {
  it("floors 0.9 to 0 with 1/4 grid", () => {
    expect(snapToGridFloor(0.9, "1/4")).toBe(0);
  });

  it("floors 1.1 to 1 with 1/4 grid", () => {
    expect(snapToGridFloor(1.1, "1/4")).toBe(1);
  });

  it("floors 0.4 to 0 with 1/8 grid", () => {
    expect(snapToGridFloor(0.4, "1/8")).toBe(0);
  });

  it("floors 0.6 to 0.5 with 1/8 grid", () => {
    expect(snapToGridFloor(0.6, "1/8")).toBe(0.5);
  });
});

// ===========================================================================
// velocityToColor
// ===========================================================================

describe("velocityToColor", () => {
  it("returns a valid HSL string for velocity 0", () => {
    const color = velocityToColor(0);
    expect(color).toMatch(/^hsl\(\d+,\s*\d+%,\s*\d+%\)$/);
  });

  it("returns a valid HSL string for velocity 127", () => {
    const color = velocityToColor(127);
    expect(color).toMatch(/^hsl\(\d+,\s*\d+%,\s*\d+%\)$/);
  });

  it("low velocity is blueish (hue near 240)", () => {
    const color = velocityToColor(0);
    // Parse the hue
    const hue = parseInt(color.match(/hsl\((\d+)/)?.[1] ?? "0");
    expect(hue).toBe(240);
  });

  it("high velocity is reddish (hue near 0)", () => {
    const color = velocityToColor(127);
    const hue = parseInt(color.match(/hsl\((\d+)/)?.[1] ?? "999");
    expect(hue).toBe(0);
  });

  it("mid velocity is greenish", () => {
    const color = velocityToColor(64);
    const hue = parseInt(color.match(/hsl\((\d+)/)?.[1] ?? "0");
    // ~120 should be green territory
    expect(hue).toBeGreaterThan(90);
    expect(hue).toBeLessThan(150);
  });

  it("clamps below 0", () => {
    const color = velocityToColor(-10);
    const hue = parseInt(color.match(/hsl\((\d+)/)?.[1] ?? "0");
    expect(hue).toBe(240);
  });

  it("clamps above 127", () => {
    const color = velocityToColor(200);
    const hue = parseInt(color.match(/hsl\((\d+)/)?.[1] ?? "999");
    expect(hue).toBe(0);
  });
});
