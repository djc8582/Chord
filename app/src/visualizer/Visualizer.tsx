/**
 * Visualizer Component
 *
 * Wraps Waveform and/or Spectrum components with a mode toggle and
 * target node selector. Reads state from the visualizer Zustand store.
 */

import React from "react";
import { Waveform } from "./Waveform.js";
import { Spectrum } from "./Spectrum.js";
import { useVisualizerStore } from "./store.js";
import type { VisualizerMode } from "./store.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VisualizerProps {
  /** Available node IDs to select from. */
  nodeIds?: Array<{ id: string; label: string }>;

  /** Canvas width for each sub-visualizer. */
  width?: number;

  /** Canvas height for each sub-visualizer. */
  height?: number;

  /** Sample rate in Hz (for spectrum frequency axis). */
  sampleRate?: number;
}

// ---------------------------------------------------------------------------
// Mode button labels
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<VisualizerMode, string> = {
  waveform: "Waveform",
  spectrum: "Spectrum",
  both: "Both",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Visualizer: React.FC<VisualizerProps> = ({
  nodeIds = [],
  width = 512,
  height = 200,
  sampleRate = 44100,
}) => {
  const mode = useVisualizerStore((s) => s.mode);
  const targetNodeId = useVisualizerStore((s) => s.targetNodeId);
  const waveformData = useVisualizerStore((s) => s.waveformData);
  const spectrumData = useVisualizerStore((s) => s.spectrumData);
  const peakData = useVisualizerStore((s) => s.peakData);
  const frozen = useVisualizerStore((s) => s.frozen);
  const settings = useVisualizerStore((s) => s.settings);

  const setMode = useVisualizerStore((s) => s.setMode);
  const setTargetNode = useVisualizerStore((s) => s.setTargetNode);
  const toggleFrozen = useVisualizerStore((s) => s.toggleFrozen);

  const showWaveform = mode === "waveform" || mode === "both";
  const showSpectrum = mode === "spectrum" || mode === "both";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
          backgroundColor: settings.colorScheme.backgroundColor,
          borderRadius: 4,
          fontSize: 12,
          fontFamily: "monospace",
          color: "#d1d5db",
        }}
      >
        {/* Mode toggle buttons */}
        {(["waveform", "spectrum", "both"] as VisualizerMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: "2px 8px",
              borderRadius: 3,
              border: "1px solid #4b5563",
              backgroundColor: mode === m ? "#374151" : "transparent",
              color: mode === m ? "#f9fafb" : "#9ca3af",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "monospace",
            }}
          >
            {MODE_LABELS[m]}
          </button>
        ))}

        {/* Separator */}
        <span style={{ borderLeft: "1px solid #4b5563", height: 16 }} />

        {/* Node selector */}
        <select
          value={targetNodeId ?? ""}
          onChange={(e) => setTargetNode(e.target.value || null)}
          style={{
            backgroundColor: "#1f2937",
            color: "#d1d5db",
            border: "1px solid #4b5563",
            borderRadius: 3,
            padding: "2px 4px",
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          <option value="">No node</option>
          {nodeIds.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>

        {/* Freeze toggle */}
        <button
          onClick={toggleFrozen}
          style={{
            padding: "2px 8px",
            borderRadius: 3,
            border: "1px solid #4b5563",
            backgroundColor: frozen ? "#991b1b" : "transparent",
            color: frozen ? "#fca5a5" : "#9ca3af",
            cursor: "pointer",
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          {frozen ? "Frozen" : "Live"}
        </button>
      </div>

      {/* Visualizers */}
      {showWaveform && (
        <Waveform
          data={waveformData}
          width={width}
          height={mode === "both" ? Math.floor(height / 2) : height}
          style={settings.waveformStyle}
          colorScheme={settings.colorScheme}
          autoScale={settings.autoScale}
          frozen={frozen}
        />
      )}

      {showSpectrum && (
        <Spectrum
          data={spectrumData}
          peakData={settings.peakHold ? peakData : undefined}
          width={width}
          height={mode === "both" ? Math.floor(height / 2) : height}
          style={settings.spectrumStyle}
          colorScheme={settings.colorScheme}
          logScale={settings.logFrequencyScale}
          dbScale={settings.dbScale}
          fftSize={settings.fftSize}
          sampleRate={sampleRate}
        />
      )}
    </div>
  );
};
