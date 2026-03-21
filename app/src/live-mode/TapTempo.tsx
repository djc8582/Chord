/**
 * TapTempo
 *
 * Tap a button to set BPM from tap interval. Shows current BPM prominently.
 * Designed for stage use: large, readable, dark background.
 */

import React, { useCallback } from "react";
import { useLiveModeStore } from "./store.js";

export interface TapTempoProps {
  /** Optional callback when BPM changes (e.g. to call bridge.setTempo). */
  onBpmChange?: (bpm: number) => void;
  /** Optional CSS class name. */
  className?: string;
}

export const TapTempo: React.FC<TapTempoProps> = ({ onBpmChange, className }) => {
  const bpm = useLiveModeStore((s) => s.bpm);
  const tap = useLiveModeStore((s) => s.tap);
  const resetTaps = useLiveModeStore((s) => s.resetTaps);

  const handleTap = useCallback(() => {
    tap();
    // Read updated BPM after tap
    const updatedBpm = useLiveModeStore.getState().bpm;
    onBpmChange?.(updatedBpm);
  }, [tap, onBpmChange]);

  const handleReset = useCallback(() => {
    resetTaps();
  }, [resetTaps]);

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "#e2e8f0",
          minWidth: 80,
          textAlign: "right",
        }}
      >
        {bpm}
      </div>
      <div style={{ fontSize: 14, color: "#94a3b8", marginRight: 8 }}>BPM</div>
      <button
        onClick={handleTap}
        aria-label="Tap Tempo"
        style={{
          minWidth: 64,
          minHeight: 48,
          padding: "10px 20px",
          fontSize: 16,
          fontWeight: 600,
          color: "#e2e8f0",
          backgroundColor: "#334155",
          border: "2px solid #475569",
          borderRadius: 8,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        Tap
      </button>
      <button
        onClick={handleReset}
        aria-label="Reset Tap Tempo"
        style={{
          padding: "10px 12px",
          fontSize: 12,
          color: "#94a3b8",
          backgroundColor: "transparent",
          border: "1px solid #475569",
          borderRadius: 6,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        Reset
      </button>
    </div>
  );
};
