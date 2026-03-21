/**
 * LevelMeter Component
 *
 * An animated vertical bar showing signal level with peak + RMS display.
 * Uses green/yellow/red color zones based on dB level.
 */

import React from "react";
import { levelToMeterHeight, meterColor } from "./store.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LevelMeterProps {
  /** Peak level in dB. */
  peakDb: number;
  /** RMS level in dB. */
  rmsDb: number;
  /** Whether the signal is clipping. */
  clipping?: boolean;
  /** Height of the meter in pixels. */
  height?: number;
  /** Test ID prefix for testing. */
  "data-testid"?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const LevelMeter: React.FC<LevelMeterProps> = React.memo(
  function LevelMeter({
    peakDb,
    rmsDb,
    clipping = false,
    height = 120,
    "data-testid": testId = "level-meter",
  }) {
    const peakHeight = levelToMeterHeight(peakDb);
    const rmsHeight = levelToMeterHeight(rmsDb);

    const peakZone = meterColor(peakDb);
    const rmsZone = meterColor(rmsDb);

    const zoneColors = {
      green: "#22c55e",
      yellow: "#eab308",
      red: "#ef4444",
    };

    return (
      <div
        data-testid={testId}
        data-peak-db={isFinite(peakDb) ? peakDb.toFixed(1) : "-inf"}
        data-rms-db={isFinite(rmsDb) ? rmsDb.toFixed(1) : "-inf"}
        data-clipping={clipping}
        style={{
          position: "relative",
          width: 12,
          height,
          backgroundColor: "#1a1a2e",
          borderRadius: 2,
          overflow: "hidden",
          border: clipping ? "1px solid #ef4444" : "1px solid #333",
        }}
      >
        {/* RMS bar (wider, background) */}
        <div
          data-testid={`${testId}-rms`}
          data-zone={rmsZone}
          style={{
            position: "absolute",
            bottom: 0,
            left: 1,
            right: 1,
            height: `${rmsHeight * 100}%`,
            backgroundColor: zoneColors[rmsZone],
            opacity: 0.7,
            transition: "height 50ms ease-out",
          }}
        />

        {/* Peak indicator (thin line) */}
        <div
          data-testid={`${testId}-peak`}
          data-zone={peakZone}
          style={{
            position: "absolute",
            bottom: `${peakHeight * 100}%`,
            left: 0,
            right: 0,
            height: 2,
            backgroundColor: zoneColors[peakZone],
            transition: "bottom 50ms ease-out",
          }}
        />

        {/* Clip indicator */}
        {clipping && (
          <div
            data-testid={`${testId}-clip`}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              backgroundColor: "#ef4444",
            }}
          />
        )}
      </div>
    );
  },
);
