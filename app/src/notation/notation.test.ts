/**
 * Notation Module Tests
 *
 * Tests covering:
 * - midiToNoteName maps correctly (60=C4, 69=A4, 61=C#4)
 * - durationToNoteType (1 beat = quarter, 2 = half, 4 = whole, 0.5 = eighth, etc.)
 * - pitchToStaffPosition correct for treble and bass clef
 * - beatsToMeasures groups correctly in 4/4 and 3/4 time
 * - MusicXML export produces valid XML structure
 * - MusicXML includes correct pitch, duration, key/time signatures
 * - Key signature accidental detection
 * - Notation store state management
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  midiToNoteName,
  durationToNoteType,
  pitchToStaffPosition,
  needsAccidental,
  beatsToMeasures,
  midiPitchToMusicXML,
} from "./music-theory";
import { exportToMusicXML } from "./musicxml";
import { useNotationStore } from "./store";
import type { Note } from "../piano-roll/types";
import type { KeySignature, TimeSignature } from "./types";

// ---------------------------------------------------------------------------
// midiToNoteName
// ---------------------------------------------------------------------------

describe("midiToNoteName", () => {
  it("maps MIDI 60 to C4", () => {
    expect(midiToNoteName(60)).toBe("C4");
  });

  it("maps MIDI 69 to A4", () => {
    expect(midiToNoteName(69)).toBe("A4");
  });

  it("maps MIDI 61 to C#4", () => {
    expect(midiToNoteName(61)).toBe("C#4");
  });

  it("maps MIDI 0 to C-1", () => {
    expect(midiToNoteName(0)).toBe("C-1");
  });

  it("maps MIDI 127 to G9", () => {
    expect(midiToNoteName(127)).toBe("G9");
  });

  it("maps MIDI 48 to C3", () => {
    expect(midiToNoteName(48)).toBe("C3");
  });

  it("maps MIDI 72 to C5", () => {
    expect(midiToNoteName(72)).toBe("C5");
  });

  it("uses flat names when useFlats is true", () => {
    expect(midiToNoteName(61, true)).toBe("Db4");
    expect(midiToNoteName(63, true)).toBe("Eb4");
    expect(midiToNoteName(66, true)).toBe("Gb4");
    expect(midiToNoteName(68, true)).toBe("Ab4");
    expect(midiToNoteName(70, true)).toBe("Bb4");
  });

  it("handles all chromatic notes in octave 4", () => {
    const expected = [
      "C4", "C#4", "D4", "D#4", "E4", "F4",
      "F#4", "G4", "G#4", "A4", "A#4", "B4",
    ];
    for (let i = 0; i < 12; i++) {
      expect(midiToNoteName(60 + i)).toBe(expected[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// durationToNoteType
// ---------------------------------------------------------------------------

describe("durationToNoteType", () => {
  it("1 beat = quarter note", () => {
    const result = durationToNoteType(1);
    expect(result.type).toBe("quarter");
    expect(result.dots).toBe(0);
  });

  it("2 beats = half note", () => {
    const result = durationToNoteType(2);
    expect(result.type).toBe("half");
    expect(result.dots).toBe(0);
  });

  it("4 beats = whole note", () => {
    const result = durationToNoteType(4);
    expect(result.type).toBe("whole");
    expect(result.dots).toBe(0);
  });

  it("0.5 beats = eighth note", () => {
    const result = durationToNoteType(0.5);
    expect(result.type).toBe("eighth");
    expect(result.dots).toBe(0);
  });

  it("0.25 beats = sixteenth note", () => {
    const result = durationToNoteType(0.25);
    expect(result.type).toBe("16th");
    expect(result.dots).toBe(0);
  });

  it("0.125 beats = thirty-second note", () => {
    const result = durationToNoteType(0.125);
    expect(result.type).toBe("32nd");
    expect(result.dots).toBe(0);
  });

  it("1.5 beats = dotted quarter note", () => {
    const result = durationToNoteType(1.5);
    expect(result.type).toBe("quarter");
    expect(result.dots).toBe(1);
  });

  it("3 beats = dotted half note", () => {
    const result = durationToNoteType(3);
    expect(result.type).toBe("half");
    expect(result.dots).toBe(1);
  });

  it("0.75 beats = dotted eighth note", () => {
    const result = durationToNoteType(0.75);
    expect(result.type).toBe("eighth");
    expect(result.dots).toBe(1);
  });

  it("6 beats = dotted whole note", () => {
    const result = durationToNoteType(6);
    expect(result.type).toBe("whole");
    expect(result.dots).toBe(1);
  });

  it("7 beats = double-dotted whole note", () => {
    const result = durationToNoteType(7);
    expect(result.type).toBe("whole");
    expect(result.dots).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// pitchToStaffPosition
// ---------------------------------------------------------------------------

describe("pitchToStaffPosition", () => {
  describe("treble clef", () => {
    it("E4 (MIDI 64) is on bottom line (position 0)", () => {
      const pos = pitchToStaffPosition(64, "treble");
      expect(pos.line).toBe(0);
      expect(pos.ledgerLines).toBe(0);
      expect(pos.ledgerDirection).toBe("none");
    });

    it("F4 (MIDI 65) is in first space (position 1)", () => {
      const pos = pitchToStaffPosition(65, "treble");
      expect(pos.line).toBe(1);
    });

    it("G4 (MIDI 67) is on second line (position 2)", () => {
      const pos = pitchToStaffPosition(67, "treble");
      expect(pos.line).toBe(2);
    });

    it("B4 (MIDI 71) is on third line (position 4)", () => {
      const pos = pitchToStaffPosition(71, "treble");
      expect(pos.line).toBe(4);
    });

    it("D5 (MIDI 74) is on fourth line (position 6)", () => {
      const pos = pitchToStaffPosition(74, "treble");
      expect(pos.line).toBe(6);
    });

    it("F5 (MIDI 77) is on top line (position 8)", () => {
      const pos = pitchToStaffPosition(77, "treble");
      expect(pos.line).toBe(8);
    });

    it("C4 (MIDI 60) needs ledger line below", () => {
      const pos = pitchToStaffPosition(60, "treble");
      expect(pos.line).toBe(-2);
      expect(pos.ledgerLines).toBe(1);
      expect(pos.ledgerDirection).toBe("below");
    });

    it("A5 (MIDI 81) needs ledger line above", () => {
      const pos = pitchToStaffPosition(81, "treble");
      expect(pos.line).toBe(10);
      expect(pos.ledgerLines).toBe(1);
      expect(pos.ledgerDirection).toBe("above");
    });

    it("C#4 (MIDI 61) is at same position as C4 (accidental on C)", () => {
      const pos = pitchToStaffPosition(61, "treble");
      // C# uses C's diatonic position
      expect(pos.line).toBe(-2);
    });
  });

  describe("bass clef", () => {
    it("G2 (MIDI 43) is on bottom line (position 0)", () => {
      const pos = pitchToStaffPosition(43, "bass");
      expect(pos.line).toBe(0);
      expect(pos.ledgerLines).toBe(0);
      expect(pos.ledgerDirection).toBe("none");
    });

    it("B2 (MIDI 47) is on second line (position 2)", () => {
      const pos = pitchToStaffPosition(47, "bass");
      expect(pos.line).toBe(2);
    });

    it("D3 (MIDI 50) is on third line (position 4)", () => {
      const pos = pitchToStaffPosition(50, "bass");
      expect(pos.line).toBe(4);
    });

    it("F3 (MIDI 53) is on fourth line (position 6)", () => {
      const pos = pitchToStaffPosition(53, "bass");
      expect(pos.line).toBe(6);
    });

    it("A3 (MIDI 57) is on top line (position 8)", () => {
      const pos = pitchToStaffPosition(57, "bass");
      expect(pos.line).toBe(8);
    });

    it("E2 (MIDI 40) needs ledger line below", () => {
      const pos = pitchToStaffPosition(40, "bass");
      expect(pos.line).toBe(-2);
      expect(pos.ledgerLines).toBe(1);
      expect(pos.ledgerDirection).toBe("below");
    });

    it("C4 (MIDI 60) needs ledger lines above", () => {
      // G2(0) A2(1) B2(2) C3(3) D3(4) E3(5) F3(6) G3(7) A3(8) B3(9) C4(10)
      const pos = pitchToStaffPosition(60, "bass");
      expect(pos.line).toBe(10);
      expect(pos.ledgerLines).toBe(1);
      expect(pos.ledgerDirection).toBe("above");
    });
  });
});

// ---------------------------------------------------------------------------
// needsAccidental
// ---------------------------------------------------------------------------

describe("needsAccidental", () => {
  describe("C major (no accidentals)", () => {
    const keySig: KeySignature = { fifths: 0 };

    it("C4 needs no accidental", () => {
      expect(needsAccidental(60, keySig)).toBe("none");
    });

    it("E4 needs no accidental", () => {
      expect(needsAccidental(64, keySig)).toBe("none");
    });

    it("C#4 needs a sharp", () => {
      expect(needsAccidental(61, keySig)).toBe("sharp");
    });

    it("F#4 needs a sharp", () => {
      expect(needsAccidental(66, keySig)).toBe("sharp");
    });

    it("Bb4 needs a sharp (displayed as A# in sharp context)", () => {
      expect(needsAccidental(70, keySig)).toBe("sharp");
    });
  });

  describe("G major (1 sharp: F#)", () => {
    const keySig: KeySignature = { fifths: 1 };

    it("F#4 (MIDI 66) needs no accidental (in key)", () => {
      expect(needsAccidental(66, keySig)).toBe("none");
    });

    it("F4 (MIDI 65) needs a natural (normally sharped)", () => {
      expect(needsAccidental(65, keySig)).toBe("natural");
    });

    it("C4 (MIDI 60) needs no accidental", () => {
      expect(needsAccidental(60, keySig)).toBe("none");
    });

    it("C#4 (MIDI 61) needs a sharp (not in key)", () => {
      expect(needsAccidental(61, keySig)).toBe("sharp");
    });
  });

  describe("D major (2 sharps: F#, C#)", () => {
    const keySig: KeySignature = { fifths: 2 };

    it("F#4 needs no accidental", () => {
      expect(needsAccidental(66, keySig)).toBe("none");
    });

    it("C#4 needs no accidental", () => {
      expect(needsAccidental(61, keySig)).toBe("none");
    });

    it("F4 needs a natural", () => {
      expect(needsAccidental(65, keySig)).toBe("natural");
    });

    it("C4 needs a natural", () => {
      expect(needsAccidental(60, keySig)).toBe("natural");
    });

    it("G#4 needs a sharp", () => {
      expect(needsAccidental(68, keySig)).toBe("sharp");
    });
  });

  describe("F major (1 flat: Bb)", () => {
    const keySig: KeySignature = { fifths: -1 };

    it("Bb4 (MIDI 70) needs no accidental (in key)", () => {
      expect(needsAccidental(70, keySig)).toBe("none");
    });

    it("B4 (MIDI 71) needs a natural (normally flatted)", () => {
      expect(needsAccidental(71, keySig)).toBe("natural");
    });

    it("C4 (MIDI 60) needs no accidental", () => {
      expect(needsAccidental(60, keySig)).toBe("none");
    });

    it("F#4 (MIDI 66) needs a flat (not in key)", () => {
      // F# is chromatic, and in a flat key it's not one of the key flats
      expect(needsAccidental(66, keySig)).toBe("flat");
    });
  });

  describe("Bb major (2 flats: Bb, Eb)", () => {
    const keySig: KeySignature = { fifths: -2 };

    it("Bb4 needs no accidental", () => {
      expect(needsAccidental(70, keySig)).toBe("none");
    });

    it("Eb4 needs no accidental", () => {
      expect(needsAccidental(63, keySig)).toBe("none");
    });

    it("B4 needs a natural", () => {
      expect(needsAccidental(71, keySig)).toBe("natural");
    });

    it("E4 needs a natural", () => {
      expect(needsAccidental(64, keySig)).toBe("natural");
    });

    it("F#4 needs a flat (not in key)", () => {
      expect(needsAccidental(66, keySig)).toBe("flat");
    });
  });
});

// ---------------------------------------------------------------------------
// beatsToMeasures
// ---------------------------------------------------------------------------

describe("beatsToMeasures", () => {
  const makeNote = (
    id: string,
    pitch: number,
    start: number,
    duration: number,
  ): Note => ({
    id,
    pitch,
    start,
    duration,
    velocity: 80,
  });

  describe("4/4 time", () => {
    const timeSig: TimeSignature = { beats: 4, beatType: 4 };

    it("returns empty array for no notes", () => {
      const result = beatsToMeasures([], timeSig);
      expect(result).toEqual([]);
    });

    it("places a single note in one measure", () => {
      const notes = [makeNote("n1", 60, 0, 1)];
      const result = beatsToMeasures(notes, timeSig);
      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(1);
      expect(result[0].notes).toHaveLength(1);
      expect(result[0].notes[0].beatInMeasure).toBe(0);
    });

    it("groups notes into correct measures", () => {
      const notes = [
        makeNote("n1", 60, 0, 1),   // measure 1
        makeNote("n2", 64, 2, 1),   // measure 1
        makeNote("n3", 67, 4, 1),   // measure 2
        makeNote("n4", 72, 8, 1),   // measure 3
      ];
      const result = beatsToMeasures(notes, timeSig);
      expect(result).toHaveLength(3);

      // Measure 1: notes at beats 0 and 2
      expect(result[0].notes).toHaveLength(2);
      expect(result[0].notes[0].id).toBe("n1");
      expect(result[0].notes[1].id).toBe("n2");

      // Measure 2: note at beat 4 -> beatInMeasure = 0
      expect(result[1].notes).toHaveLength(1);
      expect(result[1].notes[0].id).toBe("n3");
      expect(result[1].notes[0].beatInMeasure).toBe(0);

      // Measure 3: note at beat 8 -> beatInMeasure = 0
      expect(result[2].notes).toHaveLength(1);
      expect(result[2].notes[0].id).toBe("n4");
      expect(result[2].notes[0].beatInMeasure).toBe(0);
    });

    it("splits a note that spans a barline", () => {
      // Note starts at beat 3, duration 2 = ends at beat 5
      // Should be split: measure 1 (beat 3, dur 1) and measure 2 (beat 0, dur 1)
      const notes = [makeNote("n1", 60, 3, 2)];
      const result = beatsToMeasures(notes, timeSig);
      expect(result).toHaveLength(2);

      // First part: in measure 1, beat 3, duration 1
      expect(result[0].notes).toHaveLength(1);
      expect(result[0].notes[0].beatInMeasure).toBe(3);
      expect(result[0].notes[0].duration).toBe(1);

      // Second part: in measure 2, beat 0, duration 1
      expect(result[1].notes).toHaveLength(1);
      expect(result[1].notes[0].beatInMeasure).toBe(0);
      expect(result[1].notes[0].duration).toBe(1);
    });
  });

  describe("3/4 time", () => {
    const timeSig: TimeSignature = { beats: 3, beatType: 4 };

    it("creates measures of 3 beats", () => {
      const notes = [
        makeNote("n1", 60, 0, 1),  // measure 1
        makeNote("n2", 64, 3, 1),  // measure 2
        makeNote("n3", 67, 6, 1),  // measure 3
      ];
      const result = beatsToMeasures(notes, timeSig);
      expect(result).toHaveLength(3);

      expect(result[0].notes[0].beatInMeasure).toBe(0);
      expect(result[1].notes[0].beatInMeasure).toBe(0);
      expect(result[2].notes[0].beatInMeasure).toBe(0);
    });

    it("splits note across 3/4 barline correctly", () => {
      // Note at beat 2, duration 2 -> crosses barline at beat 3
      const notes = [makeNote("n1", 60, 2, 2)];
      const result = beatsToMeasures(notes, timeSig);
      expect(result).toHaveLength(2);

      expect(result[0].notes[0].beatInMeasure).toBe(2);
      expect(result[0].notes[0].duration).toBe(1);

      expect(result[1].notes[0].beatInMeasure).toBe(0);
      expect(result[1].notes[0].duration).toBe(1);
    });
  });

  describe("6/8 time", () => {
    const timeSig: TimeSignature = { beats: 6, beatType: 8 };

    it("creates measures of 3 beats (6 eighth notes = 3 quarter-note beats)", () => {
      const notes = [
        makeNote("n1", 60, 0, 0.5),  // measure 1
        makeNote("n2", 64, 3, 0.5),  // measure 2
      ];
      const result = beatsToMeasures(notes, timeSig);
      expect(result).toHaveLength(2);
      expect(result[0].notes).toHaveLength(1);
      expect(result[1].notes).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// midiPitchToMusicXML
// ---------------------------------------------------------------------------

describe("midiPitchToMusicXML", () => {
  it("MIDI 60 = C4", () => {
    const { step, octave, alter } = midiPitchToMusicXML(60);
    expect(step).toBe("C");
    expect(octave).toBe(4);
    expect(alter).toBe(0);
  });

  it("MIDI 61 = C#4", () => {
    const { step, octave, alter } = midiPitchToMusicXML(61);
    expect(step).toBe("C");
    expect(octave).toBe(4);
    expect(alter).toBe(1);
  });

  it("MIDI 69 = A4", () => {
    const { step, octave, alter } = midiPitchToMusicXML(69);
    expect(step).toBe("A");
    expect(octave).toBe(4);
    expect(alter).toBe(0);
  });

  it("MIDI 66 = F#4", () => {
    const { step, octave, alter } = midiPitchToMusicXML(66);
    expect(step).toBe("F");
    expect(octave).toBe(4);
    expect(alter).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// MusicXML export
// ---------------------------------------------------------------------------

describe("exportToMusicXML", () => {
  const makeNote = (
    id: string,
    pitch: number,
    start: number,
    duration: number,
    velocity: number = 80,
  ): Note => ({
    id,
    pitch,
    start,
    duration,
    velocity,
  });

  it("produces valid XML with correct declaration", () => {
    const xml = exportToMusicXML([]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<score-partwise");
    expect(xml).toContain("</score-partwise>");
  });

  it("includes part-list and part", () => {
    const xml = exportToMusicXML([]);
    expect(xml).toContain("<part-list>");
    expect(xml).toContain('<score-part id="P1">');
    expect(xml).toContain('<part id="P1">');
  });

  it("includes key signature", () => {
    const xml = exportToMusicXML([], {
      keySignature: { fifths: 2 },
    });
    expect(xml).toContain("<key>");
    expect(xml).toContain("<fifths>2</fifths>");
    expect(xml).toContain("</key>");
  });

  it("includes time signature", () => {
    const xml = exportToMusicXML([], {
      timeSignature: { beats: 3, beatType: 4 },
    });
    expect(xml).toContain("<time>");
    expect(xml).toContain("<beats>3</beats>");
    expect(xml).toContain("<beat-type>4</beat-type>");
    expect(xml).toContain("</time>");
  });

  it("includes treble clef", () => {
    const xml = exportToMusicXML([], { clef: "treble" });
    expect(xml).toContain("<clef>");
    expect(xml).toContain("<sign>G</sign>");
    expect(xml).toContain("<line>2</line>");
  });

  it("includes bass clef", () => {
    const xml = exportToMusicXML([], { clef: "bass" });
    expect(xml).toContain("<sign>F</sign>");
    expect(xml).toContain("<line>4</line>");
  });

  it("includes correct pitch information for a note", () => {
    const notes = [makeNote("n1", 60, 0, 1)]; // C4
    const xml = exportToMusicXML(notes);
    expect(xml).toContain("<pitch>");
    expect(xml).toContain("<step>C</step>");
    expect(xml).toContain("<octave>4</octave>");
    expect(xml).not.toContain("<alter>"); // C has no alter
    expect(xml).toContain("</pitch>");
  });

  it("includes alter for sharped notes", () => {
    const notes = [makeNote("n1", 61, 0, 1)]; // C#4
    const xml = exportToMusicXML(notes);
    expect(xml).toContain("<step>C</step>");
    expect(xml).toContain("<alter>1</alter>");
    expect(xml).toContain("<octave>4</octave>");
  });

  it("includes correct duration", () => {
    const notes = [makeNote("n1", 60, 0, 1)]; // quarter note, divisions=4
    const xml = exportToMusicXML(notes, { divisions: 4 });
    expect(xml).toContain("<duration>4</duration>");
    expect(xml).toContain("<type>quarter</type>");
  });

  it("generates a rest for an empty measure", () => {
    const xml = exportToMusicXML([]);
    expect(xml).toContain("<rest/>");
  });

  it("includes barline at end", () => {
    const xml = exportToMusicXML([]);
    expect(xml).toContain("<barline>");
    expect(xml).toContain("<bar-style>light-heavy</bar-style>");
  });

  it("generates multiple measures for notes spread across time", () => {
    const notes = [
      makeNote("n1", 60, 0, 1),
      makeNote("n2", 64, 4, 1),
    ];
    const xml = exportToMusicXML(notes, {
      timeSignature: { beats: 4, beatType: 4 },
    });
    expect(xml).toContain('<measure number="1">');
    expect(xml).toContain('<measure number="2">');
  });

  it("includes title and composer", () => {
    const xml = exportToMusicXML([], {
      title: "My Song",
      composer: "John Doe",
    });
    expect(xml).toContain("<work-title>My Song</work-title>");
    expect(xml).toContain('<creator type="composer">John Doe</creator>');
  });

  it("escapes XML special characters in title", () => {
    const xml = exportToMusicXML([], { title: "Rock & Roll <3>" });
    expect(xml).toContain("Rock &amp; Roll &lt;3&gt;");
  });

  it("marks chord notes correctly", () => {
    // Two notes at the same beat position
    const notes = [
      makeNote("n1", 60, 0, 1),
      makeNote("n2", 64, 0, 1),
    ];
    const xml = exportToMusicXML(notes);
    expect(xml).toContain("<chord/>");
  });

  it("includes divisions in attributes", () => {
    const xml = exportToMusicXML([], { divisions: 8 });
    expect(xml).toContain("<divisions>8</divisions>");
  });
});

// ---------------------------------------------------------------------------
// Notation store
// ---------------------------------------------------------------------------

describe("useNotationStore", () => {
  beforeEach(() => {
    useNotationStore.getState().reset();
  });

  it("has correct default state", () => {
    const state = useNotationStore.getState();
    expect(state.clef).toBe("treble");
    expect(state.keySignature).toEqual({ fifths: 0 });
    expect(state.timeSignature).toEqual({ beats: 4, beatType: 4 });
    expect(state.zoom).toBe(1.0);
    expect(state.scrollX).toBe(0);
    expect(state.scrollY).toBe(0);
    expect(state.selectedNoteIds.size).toBe(0);
  });

  it("sets clef", () => {
    useNotationStore.getState().setClef("bass");
    expect(useNotationStore.getState().clef).toBe("bass");
  });

  it("sets clef to grand", () => {
    useNotationStore.getState().setClef("grand");
    expect(useNotationStore.getState().clef).toBe("grand");
  });

  it("sets key signature", () => {
    useNotationStore.getState().setKeySignature({ fifths: 3 });
    expect(useNotationStore.getState().keySignature).toEqual({ fifths: 3 });
  });

  it("sets time signature", () => {
    useNotationStore.getState().setTimeSignature({ beats: 3, beatType: 4 });
    expect(useNotationStore.getState().timeSignature).toEqual({
      beats: 3,
      beatType: 4,
    });
  });

  it("sets zoom with clamping", () => {
    useNotationStore.getState().setZoom(2.0);
    expect(useNotationStore.getState().zoom).toBe(2.0);

    useNotationStore.getState().setZoom(0.1);
    expect(useNotationStore.getState().zoom).toBe(0.25);

    useNotationStore.getState().setZoom(10.0);
    expect(useNotationStore.getState().zoom).toBe(4.0);
  });

  it("zooms in and out", () => {
    useNotationStore.getState().setZoom(1.0);

    useNotationStore.getState().zoomIn();
    expect(useNotationStore.getState().zoom).toBe(1.25);

    useNotationStore.getState().zoomOut();
    expect(useNotationStore.getState().zoom).toBe(1.0);
  });

  it("sets scroll positions", () => {
    useNotationStore.getState().setScrollX(100);
    expect(useNotationStore.getState().scrollX).toBe(100);

    useNotationStore.getState().setScrollY(50);
    expect(useNotationStore.getState().scrollY).toBe(50);
  });

  it("clamps scrollX to non-negative", () => {
    useNotationStore.getState().setScrollX(-10);
    expect(useNotationStore.getState().scrollX).toBe(0);
  });

  it("manages selected note IDs", () => {
    useNotationStore.getState().setSelectedNoteIds(new Set(["a", "b"]));
    expect(useNotationStore.getState().selectedNoteIds.size).toBe(2);
    expect(useNotationStore.getState().selectedNoteIds.has("a")).toBe(true);
    expect(useNotationStore.getState().selectedNoteIds.has("b")).toBe(true);
  });

  it("clears selection", () => {
    useNotationStore
      .getState()
      .setSelectedNoteIds(new Set(["a", "b"]));
    useNotationStore.getState().clearSelection();
    expect(useNotationStore.getState().selectedNoteIds.size).toBe(0);
  });

  it("resets to default state", () => {
    useNotationStore.getState().setClef("bass");
    useNotationStore.getState().setZoom(2.5);
    useNotationStore.getState().setKeySignature({ fifths: -3 });

    useNotationStore.getState().reset();

    const state = useNotationStore.getState();
    expect(state.clef).toBe("treble");
    expect(state.zoom).toBe(1.0);
    expect(state.keySignature).toEqual({ fifths: 0 });
  });
});
