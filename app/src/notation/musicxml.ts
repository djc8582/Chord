/**
 * Notation Module — MusicXML Export
 *
 * Generates valid MusicXML from piano roll notes. The output conforms to
 * MusicXML 4.0 partwise format.
 */

import type { Note } from "../piano-roll/types";
import type { MusicXMLExportOptions } from "./types";
import { beatsToMeasures, midiPitchToMusicXML, durationToNoteType } from "./music-theory";
import type { NoteType } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Map note types to MusicXML duration divisions. */
export const NOTE_TYPE_TO_DIVISIONS: Record<NoteType, number> = {
  whole: 16,
  half: 8,
  quarter: 4,
  eighth: 2,
  "16th": 1,
  "32nd": 0.5,
};

/** MusicXML note type names. */
const NOTE_TYPE_TO_XML: Record<NoteType, string> = {
  whole: "whole",
  half: "half",
  quarter: "quarter",
  eighth: "eighth",
  "16th": "16th",
  "32nd": "32nd",
};

// ---------------------------------------------------------------------------
// XML Helpers
// ---------------------------------------------------------------------------

/** Escape special XML characters. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Create an XML element with text content. */
function xmlElement(tag: string, content: string, indent: string = ""): string {
  return `${indent}<${tag}>${escapeXml(content)}</${tag}>`;
}

/** Create an empty XML element. */
function xmlEmpty(tag: string, indent: string = ""): string {
  return `${indent}<${tag}/>`;
}

// ---------------------------------------------------------------------------
// MusicXML Export
// ---------------------------------------------------------------------------

/**
 * Export notes to a MusicXML string.
 *
 * @param notes - Array of Note objects from the piano roll
 * @param options - Export options (title, composer, clef, key/time signatures)
 * @returns Valid MusicXML string
 */
export function exportToMusicXML(
  notes: Note[],
  options: MusicXMLExportOptions = {},
): string {
  const {
    title = "Untitled",
    composer = "",
    clef = "treble",
    keySignature = { fifths: 0 },
    timeSignature = { beats: 4, beatType: 4 },
    divisions = 4,
  } = options;

  const measures = beatsToMeasures(notes, timeSignature);

  // If no notes, create one empty measure
  if (measures.length === 0) {
    measures.push({
      number: 1,
      notes: [],
      timeSignature,
    });
  }

  const lines: string[] = [];

  // XML declaration
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
  );
  lines.push('<score-partwise version="4.0">');

  // Work / identification
  if (title) {
    lines.push("  <work>");
    lines.push(`    ${xmlElement("work-title", title)}`);
    lines.push("  </work>");
  }

  if (composer) {
    lines.push("  <identification>");
    lines.push(`    <creator type="composer">${escapeXml(composer)}</creator>`);
    lines.push("  </identification>");
  }

  // Part list
  lines.push("  <part-list>");
  lines.push('    <score-part id="P1">');
  lines.push(`      ${xmlElement("part-name", "Piano")}`);
  lines.push("    </score-part>");
  lines.push("  </part-list>");

  // Part
  lines.push('  <part id="P1">');

  for (const measure of measures) {
    lines.push(`    <measure number="${measure.number}">`);

    // Attributes in first measure
    if (measure.number === 1) {
      lines.push("      <attributes>");
      lines.push(`        ${xmlElement("divisions", String(divisions))}`);
      lines.push("        <key>");
      lines.push(
        `          ${xmlElement("fifths", String(keySignature.fifths))}`,
      );
      lines.push("        </key>");
      lines.push("        <time>");
      lines.push(
        `          ${xmlElement("beats", String(timeSignature.beats))}`,
      );
      lines.push(
        `          ${xmlElement("beat-type", String(timeSignature.beatType))}`,
      );
      lines.push("        </time>");

      // Clef
      const actualClef = clef === "grand" ? "treble" : clef;
      lines.push("        <clef>");
      lines.push(
        `          ${xmlElement("sign", actualClef === "treble" ? "G" : "F")}`,
      );
      lines.push(
        `          ${xmlElement("line", actualClef === "treble" ? "2" : "4")}`,
      );
      lines.push("        </clef>");

      lines.push("      </attributes>");
    }

    // Sort notes by beat position
    const sortedNotes = [...measure.notes].sort(
      (a, b) => a.beatInMeasure - b.beatInMeasure,
    );

    if (sortedNotes.length === 0) {
      // Empty measure — write a whole-measure rest
      const beatsPerMeasure =
        timeSignature.beats * (4 / timeSignature.beatType);
      const restDuration = Math.round(beatsPerMeasure * divisions);
      lines.push("      <note>");
      lines.push(`        ${xmlEmpty("rest")}`);
      lines.push(
        `        ${xmlElement("duration", String(restDuration))}`,
      );
      lines.push(`        ${xmlElement("type", "whole")}`);
      lines.push("      </note>");
    } else {
      // Track current beat position to insert rests for gaps
      let currentBeat = 0;

      for (let i = 0; i < sortedNotes.length; i++) {
        const note = sortedNotes[i];

        // Insert rest if there is a gap
        if (note.beatInMeasure > currentBeat + 0.001) {
          const gapDuration = note.beatInMeasure - currentBeat;
          const gapDivisions = Math.round(gapDuration * divisions);
          if (gapDivisions > 0) {
            const restType = durationToNoteType(gapDuration);
            lines.push("      <note>");
            lines.push(`        ${xmlEmpty("rest")}`);
            lines.push(
              `        ${xmlElement("duration", String(gapDivisions))}`,
            );
            lines.push(
              `        ${xmlElement("type", NOTE_TYPE_TO_XML[restType.type])}`,
            );
            for (let d = 0; d < restType.dots; d++) {
              lines.push(`        ${xmlEmpty("dot")}`);
            }
            lines.push("      </note>");
          }
        }

        // Check if this note is a chord with the previous note (same beat position)
        const isChord =
          i > 0 &&
          Math.abs(sortedNotes[i - 1].beatInMeasure - note.beatInMeasure) <
            0.001;

        // Write the note
        const pitchInfo = midiPitchToMusicXML(note.pitch);
        const durationDivisions = Math.round(note.duration * divisions);
        const noteType = durationToNoteType(note.duration);

        lines.push("      <note>");

        if (isChord) {
          lines.push(`        ${xmlEmpty("chord")}`);
        }

        lines.push("        <pitch>");
        lines.push(`          ${xmlElement("step", pitchInfo.step)}`);
        if (pitchInfo.alter !== 0) {
          lines.push(
            `          ${xmlElement("alter", String(pitchInfo.alter))}`,
          );
        }
        lines.push(
          `          ${xmlElement("octave", String(pitchInfo.octave))}`,
        );
        lines.push("        </pitch>");

        lines.push(
          `        ${xmlElement("duration", String(durationDivisions))}`,
        );
        lines.push(
          `        ${xmlElement("type", NOTE_TYPE_TO_XML[noteType.type])}`,
        );

        for (let d = 0; d < noteType.dots; d++) {
          lines.push(`        ${xmlEmpty("dot")}`);
        }

        // Dynamics (velocity mapped to MusicXML dynamics 1-127)
        if (note.velocity > 0) {
          lines.push(`        ${xmlElement("dynamics", String(note.velocity))}`);
        }

        lines.push("      </note>");

        // Advance current beat (only for non-chord notes)
        if (!isChord) {
          currentBeat = note.beatInMeasure + note.duration;
        }
      }
    }

    // Barline at end of last measure
    if (measure.number === measures.length) {
      lines.push("      <barline>");
      lines.push(
        `        ${xmlElement("bar-style", "light-heavy")}`,
      );
      lines.push("      </barline>");
    }

    lines.push("    </measure>");
  }

  lines.push("  </part>");
  lines.push("</score-partwise>");

  return lines.join("\n");
}

/**
 * Trigger a browser download of a MusicXML file.
 *
 * @param xml - MusicXML string content
 * @param filename - Filename for the download (default: "score.musicxml")
 */
export function downloadMusicXML(
  xml: string,
  filename: string = "score.musicxml",
): void {
  const blob = new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
