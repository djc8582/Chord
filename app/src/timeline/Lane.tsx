/**
 * Lane Component
 *
 * A single horizontal track row in the timeline. Displays a lane header
 * (name, mute/solo/arm buttons) and the clip area.
 */

import React, { useCallback, useMemo } from "react";
import { useTimelineStore, beatToPixel } from "./store.js";
import { ClipComponent } from "./Clip.js";
import type { Lane as LaneData } from "./types.js";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    display: "flex",
    flexDirection: "row" as const,
    borderBottom: "1px solid #1e293b",
    backgroundColor: "#0f172a",
  },
  header: {
    width: 160,
    minWidth: 160,
    display: "flex",
    flexDirection: "column" as const,
    padding: "4px 8px",
    backgroundColor: "#1e293b",
    borderRight: "1px solid #334155",
    gap: 4,
    userSelect: "none" as const,
    flexShrink: 0,
  },
  headerName: {
    fontSize: 12,
    fontWeight: 600,
    color: "#e2e8f0",
    fontFamily: "system-ui, sans-serif",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  headerControls: {
    display: "flex",
    flexDirection: "row" as const,
    gap: 4,
  },
  controlButton: {
    fontSize: 9,
    fontWeight: 700,
    padding: "1px 4px",
    borderRadius: 2,
    border: "1px solid #475569",
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
    lineHeight: 1.4,
  },
  controlButtonActive: {
    color: "#fff",
  },
  clipArea: {
    position: "relative" as const,
    flex: 1,
    overflow: "hidden",
  },
  gridLine: {
    position: "absolute" as const,
    top: 0,
    width: 1,
    height: "100%",
    backgroundColor: "#1e293b",
    pointerEvents: "none" as const,
  },
  gridLineMajor: {
    backgroundColor: "#334155",
  },
  colorStripe: {
    position: "absolute" as const,
    left: 0,
    top: 0,
    width: 3,
    height: "100%",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface LaneProps {
  lane: LaneData;
  /** Width of the clip area in pixels. */
  clipAreaWidth: number;
}

export const LaneComponent: React.FC<LaneProps> = ({ lane, clipAreaWidth }) => {
  const zoom = useTimelineStore((s) => s.zoom);
  const scrollBeat = useTimelineStore((s) => s.scrollBeat);
  const clips = useTimelineStore((s) => s.clips);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const setLaneMuted = useTimelineStore((s) => s.setLaneMuted);
  const setLaneSolo = useTimelineStore((s) => s.setLaneSolo);
  const setLaneArmed = useTimelineStore((s) => s.setLaneArmed);
  const addClip = useTimelineStore((s) => s.addClip);
  const clearClipSelection = useTimelineStore((s) => s.clearClipSelection);
  const setPlayheadBeat = useTimelineStore((s) => s.setPlayheadBeat);
  const snap = useTimelineStore((s) => s.snap);

  // Filter clips for this lane
  const laneClips = useMemo(
    () => clips.filter((c) => c.laneId === lane.id),
    [clips, lane.id],
  );

  // Generate grid lines
  const gridLines = useMemo(() => {
    const lines: Array<{ beat: number; px: number; isMajor: boolean }> = [];
    const startBeat = Math.floor(scrollBeat);
    const endBeat = Math.ceil(scrollBeat + clipAreaWidth / zoom);

    for (let beat = startBeat; beat <= endBeat; beat++) {
      if (beat < 0) continue;
      const px = beatToPixel(beat, zoom, scrollBeat);
      if (px < 0 || px > clipAreaWidth) continue;
      lines.push({ beat, px, isMajor: beat % 4 === 0 });
    }
    return lines;
  }, [scrollBeat, clipAreaWidth, zoom]);

  const handleMuteClick = useCallback(() => {
    setLaneMuted(lane.id, !lane.muted);
  }, [lane.id, lane.muted, setLaneMuted]);

  const handleSoloClick = useCallback(() => {
    setLaneSolo(lane.id, !lane.solo);
  }, [lane.id, lane.solo, setLaneSolo]);

  const handleArmClick = useCallback(() => {
    setLaneArmed(lane.id, !lane.armed);
  }, [lane.id, lane.armed, setLaneArmed]);

  const handleClipAreaDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Double-click on empty space creates a new clip
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const beat = px / zoom + scrollBeat;
      const snappedBeat = snap.enabled
        ? Math.round(beat / snap.resolution) * snap.resolution
        : beat;
      addClip(lane.id, Math.max(0, snappedBeat), 4, "midi");
    },
    [lane.id, zoom, scrollBeat, snap, addClip],
  );

  const handleClipAreaClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Click on empty space clears selection and moves playhead
      if ((e.target as HTMLElement).dataset.clipId) return;
      clearClipSelection();
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const beat = px / zoom + scrollBeat;
      setPlayheadBeat(Math.max(0, beat));
    },
    [zoom, scrollBeat, clearClipSelection, setPlayheadBeat],
  );

  return (
    <div
      style={{ ...styles.container, height: lane.height }}
      data-testid={`lane-${lane.id}`}
      data-lane-id={lane.id}
    >
      {/* Lane header */}
      <div style={styles.header}>
        <div style={{ position: "relative" as const }}>
          <div style={{ ...styles.colorStripe, backgroundColor: lane.color }} />
          <span style={{ ...styles.headerName, paddingLeft: 8 }}>{lane.name}</span>
        </div>
        <div style={styles.headerControls}>
          <button
            style={{
              ...styles.controlButton,
              ...(lane.muted ? { ...styles.controlButtonActive, backgroundColor: "#ef4444" } : {}),
            }}
            onClick={handleMuteClick}
            data-testid={`lane-mute-${lane.id}`}
          >
            M
          </button>
          <button
            style={{
              ...styles.controlButton,
              ...(lane.solo ? { ...styles.controlButtonActive, backgroundColor: "#eab308" } : {}),
            }}
            onClick={handleSoloClick}
            data-testid={`lane-solo-${lane.id}`}
          >
            S
          </button>
          <button
            style={{
              ...styles.controlButton,
              ...(lane.armed ? { ...styles.controlButtonActive, backgroundColor: "#ef4444" } : {}),
            }}
            onClick={handleArmClick}
            data-testid={`lane-arm-${lane.id}`}
          >
            R
          </button>
        </div>
      </div>

      {/* Clip area */}
      <div
        style={{ ...styles.clipArea, opacity: lane.muted ? 0.5 : 1 }}
        onClick={handleClipAreaClick}
        onDoubleClick={handleClipAreaDoubleClick}
        data-testid={`lane-clips-${lane.id}`}
      >
        {/* Grid lines */}
        {gridLines.map((line) => (
          <div
            key={line.beat}
            style={{
              ...styles.gridLine,
              ...(line.isMajor ? styles.gridLineMajor : {}),
              left: line.px,
            }}
          />
        ))}

        {/* Clips */}
        {laneClips.map((clip) => {
          const x = beatToPixel(clip.startBeat, zoom, scrollBeat);
          const widthPx = clip.durationBeats * zoom;
          return (
            <ClipComponent
              key={clip.id}
              clip={clip}
              x={x}
              widthPx={widthPx}
              heightPx={lane.height}
              selected={selectedClipIds.includes(clip.id)}
            />
          );
        })}
      </div>
    </div>
  );
};
