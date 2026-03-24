/**
 * Staff Component
 *
 * Renders a 5-line musical staff with clef, key signature, time signature,
 * notes positioned by pitch/time, barlines, stems, and ledger lines.
 * Rendered as SVG for crisp display at any zoom level.
 */

import React, { useMemo } from "react";
import type { Note } from "../piano-roll/types";
import type {
  KeySignature,
  TimeSignature,
} from "./types";
import {
  beatsToMeasures,
  pitchToStaffPosition,
  needsAccidental,
  durationToNoteType,
} from "./music-theory";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Vertical spacing between staff lines in SVG units. */
const LINE_SPACING = 10;
/** Horizontal pixels per beat at zoom=1. */
const PIXELS_PER_BEAT = 40;
/** Left margin for clef, key sig, time sig. */
const LEFT_MARGIN = 80;
/** Top margin. */
const TOP_MARGIN = 60;
/** Note head width. */
const NOTE_HEAD_RX = 5;
const NOTE_HEAD_RY = 3.5;
/** Stem length in staff spaces. */
const STEM_LENGTH = 3.5 * LINE_SPACING;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StaffProps {
  /** Notes to render. */
  notes: Note[];
  /** Clef type. */
  clef: "treble" | "bass";
  /** Key signature. */
  keySignature: KeySignature;
  /** Time signature. */
  timeSignature: TimeSignature;
  /** Zoom factor. */
  zoom?: number;
  /** IDs of selected notes (highlighted). */
  selectedNoteIds?: Set<string>;
  /** Callback when a note is clicked. */
  onNoteClick?: (noteId: string) => void;
}

// ---------------------------------------------------------------------------
// Helper sub-components
// ---------------------------------------------------------------------------

/** Render the 5 staff lines. */
function StaffLines({ width }: { width: number }) {
  const lines = [];
  for (let i = 0; i < 5; i++) {
    const y = TOP_MARGIN + i * LINE_SPACING;
    lines.push(
      <line
        key={`staff-line-${i}`}
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke="#333"
        strokeWidth={1}
      />,
    );
  }
  return <>{lines}</>;
}

/** Render a clef symbol (text representation). */
function ClefSymbol({ clef }: { clef: "treble" | "bass" }) {
  // Position the clef symbol
  const y = clef === "treble"
    ? TOP_MARGIN + 3 * LINE_SPACING  // Treble clef centered around 3rd line
    : TOP_MARGIN + 1 * LINE_SPACING; // Bass clef centered around 2nd line from top

  const symbol = clef === "treble" ? "\uD834\uDD1E" : "\uD834\uDD22";

  return (
    <text
      x={10}
      y={y}
      fontSize={clef === "treble" ? 40 : 30}
      fontFamily="serif"
      fill="#333"
      dominantBaseline="central"
    >
      {symbol}
    </text>
  );
}

/** Render key signature accidentals. */
function KeySignatureDisplay({
  keySignature,
  clef,
}: {
  keySignature: KeySignature;
  clef: "treble" | "bass";
}) {
  const { fifths } = keySignature;
  if (fifths === 0) return null;

  const isSharp = fifths > 0;
  const count = Math.abs(fifths);
  const symbol = isSharp ? "\u266F" : "\u266D";

  // Sharp positions on treble clef (staff line indices from top, 0-based)
  const sharpPositionsTreble = [0, 3, -0.5, 2.5, 5.5, 2, 5];
  const sharpPositionsBass = [2, 5, 1.5, 4.5, 7.5, 4, 7];
  const flatPositionsTreble = [6, 3, 6.5, 3.5, 7, 4, 7.5];
  const flatPositionsBass = [8, 5, 8.5, 5.5, 9, 6, 9.5];

  let positions: number[];
  if (isSharp) {
    positions = clef === "treble" ? sharpPositionsTreble : sharpPositionsBass;
  } else {
    positions = clef === "treble" ? flatPositionsTreble : flatPositionsBass;
  }

  const elements = [];
  for (let i = 0; i < count; i++) {
    const x = 38 + i * 10;
    // Convert position: 0 = top line, each unit = half a line spacing
    const y = TOP_MARGIN + positions[i] * (LINE_SPACING / 2);

    elements.push(
      <text
        key={`ks-${i}`}
        x={x}
        y={y}
        fontSize={14}
        fontFamily="serif"
        fill="#333"
        dominantBaseline="central"
        textAnchor="middle"
      >
        {symbol}
      </text>,
    );
  }

  return <>{elements}</>;
}

/** Render time signature numbers. */
function TimeSignatureDisplay({
  timeSignature,
}: {
  timeSignature: TimeSignature;
}) {
  const x = LEFT_MARGIN - 15;

  return (
    <>
      <text
        x={x}
        y={TOP_MARGIN + 1 * LINE_SPACING}
        fontSize={16}
        fontFamily="serif"
        fontWeight="bold"
        fill="#333"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {timeSignature.beats}
      </text>
      <text
        x={x}
        y={TOP_MARGIN + 3 * LINE_SPACING}
        fontSize={16}
        fontFamily="serif"
        fontWeight="bold"
        fill="#333"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {timeSignature.beatType}
      </text>
    </>
  );
}

/** Render a single note on the staff. */
function NoteElement({
  pitch,
  x,
  clef,
  keySignature,
  duration,
  isSelected,
  noteId,
  onNoteClick,
}: {
  pitch: number;
  x: number;
  clef: "treble" | "bass";
  keySignature: KeySignature;
  duration: number;
  isSelected: boolean;
  noteId: string;
  onNoteClick?: (id: string) => void;
}) {
  const position = pitchToStaffPosition(pitch, clef);
  const accidental = needsAccidental(pitch, keySignature);
  const noteType = durationToNoteType(duration);

  // Y position: bottom line (position 0) = TOP_MARGIN + 4*LINE_SPACING
  // Each staff position = half a LINE_SPACING up
  const y = TOP_MARGIN + 4 * LINE_SPACING - position.line * (LINE_SPACING / 2);

  // Determine if note head is filled (quarter and shorter = filled)
  const isFilled = noteType.type !== "whole" && noteType.type !== "half";

  // Stem direction: notes above middle line go down, below go up
  const stemUp = position.line < 4;
  const stemX = stemUp ? x + NOTE_HEAD_RX : x - NOTE_HEAD_RX;
  const stemY1 = y;
  const stemY2 = stemUp ? y - STEM_LENGTH : y + STEM_LENGTH;
  const showStem = noteType.type !== "whole";

  const color = isSelected ? "#2196F3" : "#333";

  // Ledger lines
  const ledgerElements: React.ReactElement[] = [];
  if (position.ledgerDirection === "below") {
    // Draw ledger lines below the staff
    for (let i = 1; i <= position.ledgerLines; i++) {
      const ly = TOP_MARGIN + 4 * LINE_SPACING + i * LINE_SPACING;
      ledgerElements.push(
        <line
          key={`ledger-below-${i}`}
          x1={x - 8}
          y1={ly}
          x2={x + 8}
          y2={ly}
          stroke="#333"
          strokeWidth={1}
        />,
      );
    }
  } else if (position.ledgerDirection === "above") {
    for (let i = 1; i <= position.ledgerLines; i++) {
      const ly = TOP_MARGIN - i * LINE_SPACING;
      ledgerElements.push(
        <line
          key={`ledger-above-${i}`}
          x1={x - 8}
          y1={ly}
          x2={x + 8}
          y2={ly}
          stroke="#333"
          strokeWidth={1}
        />,
      );
    }
  }

  // Middle C ledger line
  if (
    (clef === "treble" && position.line === -2) ||
    (clef === "bass" && position.line === 12)
  ) {
    ledgerElements.push(
      <line
        key="ledger-middle-c"
        x1={x - 8}
        y1={y}
        x2={x + 8}
        y2={y}
        stroke="#333"
        strokeWidth={1}
      />,
    );
  }

  // Accidental symbol
  let accidentalElement: React.ReactElement | null = null;
  if (accidental !== "none") {
    const accSymbol =
      accidental === "sharp"
        ? "\u266F"
        : accidental === "flat"
          ? "\u266D"
          : "\u266E";
    accidentalElement = (
      <text
        x={x - 12}
        y={y}
        fontSize={12}
        fontFamily="serif"
        fill={color}
        dominantBaseline="central"
        textAnchor="middle"
      >
        {accSymbol}
      </text>
    );
  }

  // Dot for dotted notes
  const dots: React.ReactElement[] = [];
  for (let d = 0; d < noteType.dots; d++) {
    dots.push(
      <circle
        key={`dot-${d}`}
        cx={x + NOTE_HEAD_RX + 5 + d * 5}
        cy={y}
        r={1.5}
        fill={color}
      />,
    );
  }

  // Flag for eighth/sixteenth (if not beamed)
  let flagElement: React.ReactElement | null = null;
  if (noteType.type === "eighth" || noteType.type === "16th" || noteType.type === "32nd") {
    const flagCount =
      noteType.type === "eighth" ? 1 : noteType.type === "16th" ? 2 : 3;
    const flagElements: React.ReactElement[] = [];
    for (let f = 0; f < flagCount; f++) {
      const fy = stemUp ? stemY2 + f * 6 : stemY2 - f * 6;
      const dir = stemUp ? 1 : -1;
      flagElements.push(
        <path
          key={`flag-${f}`}
          d={`M ${stemX} ${fy} q 6 ${dir * 8} 0 ${dir * 14}`}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />,
      );
    }
    flagElement = <>{flagElements}</>;
  }

  return (
    <g
      data-testid={`note-${noteId}`}
      style={{ cursor: "pointer" }}
      onClick={() => onNoteClick?.(noteId)}
    >
      {ledgerElements}
      {accidentalElement}
      <ellipse
        cx={x}
        cy={y}
        rx={NOTE_HEAD_RX}
        ry={NOTE_HEAD_RY}
        fill={isFilled ? color : "white"}
        stroke={color}
        strokeWidth={1.5}
        transform={`rotate(-15, ${x}, ${y})`}
      />
      {showStem && (
        <line
          x1={stemX}
          y1={stemY1}
          x2={stemX}
          y2={stemY2}
          stroke={color}
          strokeWidth={1.2}
        />
      )}
      {flagElement}
      {dots}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main Staff component
// ---------------------------------------------------------------------------

export const Staff: React.FC<StaffProps> = React.memo(function Staff({
  notes,
  clef,
  keySignature,
  timeSignature,
  zoom = 1,
  selectedNoteIds,
  onNoteClick,
}) {
  const measures = useMemo(
    () => beatsToMeasures(notes, timeSignature),
    [notes, timeSignature],
  );

  // Calculate total width
  const beatsPerMeasure = timeSignature.beats * (4 / timeSignature.beatType);
  const totalMeasures = Math.max(measures.length, 1);
  const totalWidth =
    LEFT_MARGIN + totalMeasures * beatsPerMeasure * PIXELS_PER_BEAT * zoom + 40;
  const height = TOP_MARGIN * 2 + 4 * LINE_SPACING;

  // Render barlines
  const barlines: React.ReactElement[] = [];
  for (let m = 0; m <= totalMeasures; m++) {
    const x = LEFT_MARGIN + m * beatsPerMeasure * PIXELS_PER_BEAT * zoom;
    barlines.push(
      <line
        key={`barline-${m}`}
        x1={x}
        y1={TOP_MARGIN}
        x2={x}
        y2={TOP_MARGIN + 4 * LINE_SPACING}
        stroke="#333"
        strokeWidth={m === totalMeasures ? 2 : 1}
      />,
    );
  }

  // Render notes
  const noteElements: React.ReactElement[] = [];
  for (const measure of measures) {
    const measureStartX =
      LEFT_MARGIN +
      (measure.number - 1) * beatsPerMeasure * PIXELS_PER_BEAT * zoom;

    for (const note of measure.notes) {
      const x = measureStartX + note.beatInMeasure * PIXELS_PER_BEAT * zoom;
      const isSelected = selectedNoteIds?.has(note.id) ?? false;

      noteElements.push(
        <NoteElement
          key={`${note.id}-m${measure.number}`}
          pitch={note.pitch}
          x={x}
          clef={clef}
          keySignature={keySignature}
          duration={note.duration}
          isSelected={isSelected}
          noteId={note.id}
          onNoteClick={onNoteClick}
        />,
      );
    }
  }

  return (
    <svg
      data-testid="notation-staff"
      width={totalWidth}
      height={height}
      viewBox={`0 0 ${totalWidth} ${height}`}
      style={{ overflow: "visible" }}
    >
      <StaffLines width={totalWidth} />
      <ClefSymbol clef={clef} />
      <KeySignatureDisplay keySignature={keySignature} clef={clef} />
      <TimeSignatureDisplay timeSignature={timeSignature} />
      {barlines}
      {noteElements}
    </svg>
  );
});
