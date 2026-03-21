/**
 * TimeRuler Component
 *
 * Displays bar numbers or time markers at the top of the timeline.
 * Shows beat grid lines and the current playhead position.
 */

import React, { useMemo } from "react";
import { useTimelineStore, beatToPixel, beatsToBarBeat, beatsToSeconds } from "./store.js";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    position: "relative" as const,
    height: 32,
    backgroundColor: "#0f172a",
    borderBottom: "1px solid #334155",
    overflow: "hidden",
    userSelect: "none" as const,
    cursor: "pointer",
    flexShrink: 0,
  },
  label: {
    position: "absolute" as const,
    top: 2,
    fontSize: 10,
    color: "#94a3b8",
    fontFamily: "monospace",
    pointerEvents: "none" as const,
  },
  majorTick: {
    position: "absolute" as const,
    top: 20,
    width: 1,
    height: 12,
    backgroundColor: "#475569",
  },
  minorTick: {
    position: "absolute" as const,
    top: 24,
    width: 1,
    height: 8,
    backgroundColor: "#334155",
  },
  playhead: {
    position: "absolute" as const,
    top: 0,
    width: 1,
    height: 32,
    backgroundColor: "#f43f5e",
    pointerEvents: "none" as const,
    zIndex: 10,
  },
  loopRegion: {
    position: "absolute" as const,
    top: 0,
    height: 32,
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    borderLeft: "1px solid #3b82f6",
    borderRight: "1px solid #3b82f6",
    pointerEvents: "none" as const,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TimeRulerProps {
  /** Width in pixels of the ruler viewport. */
  width: number;
  /** Optional click handler for setting playhead position. */
  onClickBeat?: (beat: number) => void;
}

export const TimeRuler: React.FC<TimeRulerProps> = ({ width, onClickBeat }) => {
  const zoom = useTimelineStore((s) => s.zoom);
  const scrollBeat = useTimelineStore((s) => s.scrollBeat);
  const playheadBeat = useTimelineStore((s) => s.playheadBeat);
  const timeDisplayMode = useTimelineStore((s) => s.timeDisplayMode);
  const tempo = useTimelineStore((s) => s.tempo);
  const loopRegion = useTimelineStore((s) => s.loopRegion);
  const loopEnabled = useTimelineStore((s) => s.loopEnabled);

  // Calculate which beats are visible
  const ticks = useMemo(() => {
    const startBeat = Math.floor(scrollBeat);
    const endBeat = Math.ceil(scrollBeat + width / zoom);
    const result: Array<{ beat: number; px: number; isMajor: boolean; label: string }> = [];

    // Determine tick spacing based on zoom level
    let tickInterval = 1; // default: every beat
    if (zoom < 8) tickInterval = 8;
    else if (zoom < 16) tickInterval = 4;
    else if (zoom < 40) tickInterval = 1;

    const majorInterval = 4; // every bar (in 4/4)

    for (let beat = startBeat; beat <= endBeat; beat++) {
      if (beat < 0) continue;
      const px = beatToPixel(beat, zoom, scrollBeat);
      if (px < -20 || px > width + 20) continue;

      const isMajor = beat % majorInterval === 0;
      const showTick = isMajor || (beat % tickInterval === 0);

      if (!showTick) continue;

      let label = "";
      if (isMajor) {
        if (timeDisplayMode === "bars") {
          const { bar } = beatsToBarBeat(beat);
          label = `${bar}`;
        } else {
          const secs = beatsToSeconds(beat, tempo);
          label = `${secs.toFixed(1)}s`;
        }
      }

      result.push({ beat, px, isMajor, label });
    }

    return result;
  }, [scrollBeat, width, zoom, timeDisplayMode, tempo]);

  const playheadPx = beatToPixel(playheadBeat, zoom, scrollBeat);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const beat = px / zoom + scrollBeat;
    onClickBeat?.(Math.max(0, beat));
  };

  return (
    <div
      style={{ ...styles.container, width }}
      onClick={handleClick}
      data-testid="time-ruler"
    >
      {ticks.map((tick) => (
        <React.Fragment key={tick.beat}>
          {tick.label && (
            <span style={{ ...styles.label, left: tick.px + 3 }}>{tick.label}</span>
          )}
          <div
            style={{
              ...(tick.isMajor ? styles.majorTick : styles.minorTick),
              left: tick.px,
            }}
          />
        </React.Fragment>
      ))}

      {/* Loop region indicator */}
      {loopEnabled && loopRegion && (
        <div
          style={{
            ...styles.loopRegion,
            left: beatToPixel(loopRegion.startBeat, zoom, scrollBeat),
            width: (loopRegion.endBeat - loopRegion.startBeat) * zoom,
          }}
          data-testid="loop-region"
        />
      )}

      {/* Playhead */}
      {playheadPx >= 0 && playheadPx <= width && (
        <div style={{ ...styles.playhead, left: playheadPx }} data-testid="playhead-ruler" />
      )}
    </div>
  );
};
