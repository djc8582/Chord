/**
 * AudioEditor Component
 *
 * Top-level audio editor that combines the WaveformEditor and SpectralView.
 * Opens when double-clicking an audio clip in the timeline.
 */

import React, { useState } from "react";
import { WaveformEditor } from "./WaveformEditor.js";
import { SpectralView } from "./SpectralView.js";
import { useAudioEditorStore } from "./store.js";
import { bufferLength } from "./operations.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AudioEditorProps {
  /** Width of the editor in CSS pixels. */
  width?: number;
  /** Height of the waveform area. */
  waveformHeight?: number;
  /** Height of the spectral view area. */
  spectralHeight?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ViewTab = "waveform" | "spectral" | "both";

export const AudioEditor: React.FC<AudioEditorProps> = ({
  width = 800,
  waveformHeight = 300,
  spectralHeight = 200,
}) => {
  const [viewTab, setViewTab] = useState<ViewTab>("waveform");
  const { buffer, clipId } = useAudioEditorStore();

  const len = buffer ? bufferLength(buffer) : 0;
  const sr = buffer?.sampleRate ?? 44100;
  const channels = buffer?.channels.length ?? 0;

  const tabStyle = (tab: ViewTab): React.CSSProperties => ({
    padding: "6px 12px",
    fontSize: 12,
    fontFamily: "monospace",
    background: viewTab === tab ? "#3b82f6" : "#1e293b",
    color: "#e2e8f0",
    border: "1px solid #334155",
    borderRadius: "4px 4px 0 0",
    cursor: "pointer",
    borderBottom: viewTab === tab ? "1px solid #3b82f6" : "1px solid #334155",
  });

  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #1e293b",
        borderRadius: 8,
        padding: 8,
        fontFamily: "monospace",
        color: "#e2e8f0",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: "bold", fontSize: 14 }}>Audio Editor</span>
        {clipId && <span style={{ fontSize: 11, color: "#94a3b8" }}>Clip: {clipId}</span>}
        {buffer && (
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {channels === 1 ? "Mono" : "Stereo"} | {sr} Hz | {(len / sr).toFixed(3)}s
          </span>
        )}
      </div>

      {/* View tabs */}
      <div style={{ display: "flex", gap: 2 }}>
        <button style={tabStyle("waveform")} onClick={() => setViewTab("waveform")}>Waveform</button>
        <button style={tabStyle("spectral")} onClick={() => setViewTab("spectral")}>Spectral</button>
        <button style={tabStyle("both")} onClick={() => setViewTab("both")}>Both</button>
      </div>

      {/* Content */}
      {!buffer ? (
        <div
          style={{
            width,
            height: waveformHeight,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#1a1a2e",
            borderRadius: "0 4px 4px 4px",
            color: "#94a3b8",
            fontSize: 13,
          }}
        >
          No audio loaded. Double-click an audio clip in the timeline to open it.
        </div>
      ) : (
        <div>
          {(viewTab === "waveform" || viewTab === "both") && (
            <WaveformEditor width={width} height={waveformHeight} />
          )}
          {(viewTab === "spectral" || viewTab === "both") && (
            <SpectralView width={width} height={spectralHeight} />
          )}
        </div>
      )}
    </div>
  );
};
