/**
 * NotationView Component
 *
 * Main notation view wrapper. Includes toolbar (clef, key/time signature,
 * zoom controls, export button) and a scrollable staff area.
 */

import React, { useCallback, useMemo } from "react";
import type { Note } from "../piano-roll/types";
import { useNotationStore } from "./store";
import { Staff } from "./Staff";
import { exportToMusicXML, downloadMusicXML } from "./musicxml";
import { KEY_SIGNATURES } from "./types";
import type { Clef, KeySignature, TimeSignature } from "./types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NotationViewProps {
  /** Notes to display. */
  notes: Note[];
  /** Selected note IDs (optional, links to piano-roll selection). */
  selectedNoteIds?: Set<string>;
  /** Callback when a note is clicked. */
  onNoteClick?: (noteId: string) => void;
}

// ---------------------------------------------------------------------------
// Toolbar sub-component
// ---------------------------------------------------------------------------

function Toolbar({
  clef,
  keySignature,
  timeSignature,
  zoom,
  onClefChange,
  onKeySignatureChange,
  onTimeSignatureChange,
  onZoomIn,
  onZoomOut,
  onExport,
}: {
  clef: Clef;
  keySignature: KeySignature;
  timeSignature: TimeSignature;
  zoom: number;
  onClefChange: (clef: Clef) => void;
  onKeySignatureChange: (ks: KeySignature) => void;
  onTimeSignatureChange: (ts: TimeSignature) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onExport: () => void;
}) {
  // Find the current key name
  const currentKeyName = useMemo(() => {
    for (const [name, ks] of Object.entries(KEY_SIGNATURES)) {
      if (ks.fifths === keySignature.fifths) return name;
    }
    return "C major";
  }, [keySignature.fifths]);

  return (
    <div
      data-testid="notation-toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        borderBottom: "1px solid #ddd",
        backgroundColor: "#f8f8f8",
        flexWrap: "wrap",
      }}
    >
      {/* Clef selector */}
      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Clef:</span>
        <select
          data-testid="clef-selector"
          value={clef}
          onChange={(e) => onClefChange(e.target.value as Clef)}
          style={{ fontSize: 12, padding: "2px 4px" }}
        >
          <option value="treble">Treble</option>
          <option value="bass">Bass</option>
          <option value="grand">Grand</option>
        </select>
      </label>

      {/* Key signature selector */}
      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Key:</span>
        <select
          data-testid="key-signature-selector"
          value={currentKeyName}
          onChange={(e) => {
            const ks = KEY_SIGNATURES[e.target.value];
            if (ks) onKeySignatureChange(ks);
          }}
          style={{ fontSize: 12, padding: "2px 4px" }}
        >
          {Object.keys(KEY_SIGNATURES).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      {/* Time signature */}
      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Time:</span>
        <input
          data-testid="time-beats-input"
          type="number"
          min={1}
          max={16}
          value={timeSignature.beats}
          onChange={(e) =>
            onTimeSignatureChange({
              ...timeSignature,
              beats: Math.max(1, parseInt(e.target.value) || 4),
            })
          }
          style={{ width: 36, fontSize: 12, padding: "2px 4px" }}
        />
        <span>/</span>
        <select
          data-testid="time-beat-type-select"
          value={timeSignature.beatType}
          onChange={(e) =>
            onTimeSignatureChange({
              ...timeSignature,
              beatType: parseInt(e.target.value),
            })
          }
          style={{ fontSize: 12, padding: "2px 4px" }}
        >
          <option value={2}>2</option>
          <option value={4}>4</option>
          <option value={8}>8</option>
          <option value={16}>16</option>
        </select>
      </label>

      {/* Zoom controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          data-testid="zoom-out-button"
          onClick={onZoomOut}
          style={{ fontSize: 12, padding: "2px 8px" }}
          title="Zoom out"
        >
          -
        </button>
        <span style={{ fontSize: 12, minWidth: 40, textAlign: "center" }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          data-testid="zoom-in-button"
          onClick={onZoomIn}
          style={{ fontSize: 12, padding: "2px 8px" }}
          title="Zoom in"
        >
          +
        </button>
      </div>

      {/* Export button */}
      <button
        data-testid="export-musicxml-button"
        onClick={onExport}
        style={{
          fontSize: 12,
          padding: "4px 12px",
          marginLeft: "auto",
          backgroundColor: "#2196F3",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        Export MusicXML
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main NotationView component
// ---------------------------------------------------------------------------

export const NotationView: React.FC<NotationViewProps> = React.memo(
  function NotationView({ notes, selectedNoteIds, onNoteClick }) {
    const {
      clef,
      setClef,
      keySignature,
      setKeySignature,
      timeSignature,
      setTimeSignature,
      zoom,
      zoomIn,
      zoomOut,
    } = useNotationStore();

    const handleExport = useCallback(() => {
      const xml = exportToMusicXML(notes, {
        clef,
        keySignature,
        timeSignature,
      });
      downloadMusicXML(xml);
    }, [notes, clef, keySignature, timeSignature]);

    // For grand staff, render two staves
    const renderStaves = useMemo(() => {
      if (clef === "grand") {
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Staff
              notes={notes}
              clef="treble"
              keySignature={keySignature}
              timeSignature={timeSignature}
              zoom={zoom}
              selectedNoteIds={selectedNoteIds}
              onNoteClick={onNoteClick}
            />
            <Staff
              notes={notes}
              clef="bass"
              keySignature={keySignature}
              timeSignature={timeSignature}
              zoom={zoom}
              selectedNoteIds={selectedNoteIds}
              onNoteClick={onNoteClick}
            />
          </div>
        );
      }

      return (
        <Staff
          notes={notes}
          clef={clef}
          keySignature={keySignature}
          timeSignature={timeSignature}
          zoom={zoom}
          selectedNoteIds={selectedNoteIds}
          onNoteClick={onNoteClick}
        />
      );
    }, [notes, clef, keySignature, timeSignature, zoom, selectedNoteIds, onNoteClick]);

    return (
      <div
        data-testid="notation-view"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}
      >
        <Toolbar
          clef={clef}
          keySignature={keySignature}
          timeSignature={timeSignature}
          zoom={zoom}
          onClefChange={setClef}
          onKeySignatureChange={setKeySignature}
          onTimeSignatureChange={setTimeSignature}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onExport={handleExport}
        />
        <div
          data-testid="notation-score-area"
          style={{
            flex: 1,
            overflow: "auto",
            padding: 16,
            backgroundColor: "white",
          }}
        >
          {renderStaves}
        </div>
      </div>
    );
  },
);
