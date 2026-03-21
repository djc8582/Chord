/**
 * Timeline Component
 *
 * The main horizontal arrangement view. Combines the time ruler, lanes,
 * transport controls, and playhead into a unified timeline panel.
 */

import React, { useCallback, useRef, useMemo } from "react";
import { useTimelineStore, beatToPixel } from "./store.js";
import { TimeRuler } from "./TimeRuler.js";
import { LaneComponent } from "./Lane.js";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
    fontFamily: "system-ui, sans-serif",
    overflow: "hidden",
    position: "relative" as const,
  },
  toolbar: {
    display: "flex",
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 8,
    padding: "4px 8px",
    backgroundColor: "#1e293b",
    borderBottom: "1px solid #334155",
    flexShrink: 0,
    height: 36,
  },
  transportGroup: {
    display: "flex",
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 4,
  },
  transportButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 24,
    border: "1px solid #475569",
    borderRadius: 4,
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "system-ui, sans-serif",
    fontWeight: 700,
  },
  transportButtonActive: {
    backgroundColor: "#22c55e",
    color: "#fff",
    borderColor: "#22c55e",
  },
  tempoInput: {
    width: 52,
    height: 22,
    border: "1px solid #475569",
    borderRadius: 3,
    background: "#0f172a",
    color: "#e2e8f0",
    textAlign: "center" as const,
    fontSize: 11,
    fontFamily: "monospace",
  },
  tempoLabel: {
    fontSize: 10,
    color: "#64748b",
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: "#334155",
    margin: "0 4px",
  },
  zoomGroup: {
    display: "flex",
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 4,
  },
  zoomButton: {
    width: 24,
    height: 22,
    border: "1px solid #475569",
    borderRadius: 3,
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
  snapGroup: {
    display: "flex",
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
  },
  snapButton: {
    padding: "2px 8px",
    height: 22,
    border: "1px solid #475569",
    borderRadius: 3,
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 10,
    fontFamily: "system-ui, sans-serif",
  },
  snapButtonActive: {
    backgroundColor: "#3b82f6",
    color: "#fff",
    borderColor: "#3b82f6",
  },
  loopButton: {
    padding: "2px 8px",
    height: 22,
    border: "1px solid #475569",
    borderRadius: 3,
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 10,
    fontFamily: "system-ui, sans-serif",
  },
  loopButtonActive: {
    backgroundColor: "#a855f7",
    color: "#fff",
    borderColor: "#a855f7",
  },
  rulerRow: {
    display: "flex",
    flexDirection: "row" as const,
    flexShrink: 0,
  },
  laneHeaderSpacer: {
    width: 160,
    minWidth: 160,
    height: 32,
    backgroundColor: "#1e293b",
    borderBottom: "1px solid #334155",
    borderRight: "1px solid #334155",
    flexShrink: 0,
  },
  lanesContainer: {
    flex: 1,
    overflow: "auto",
    position: "relative" as const,
  },
  playheadLine: {
    position: "absolute" as const,
    top: 0,
    width: 1,
    height: "100%",
    backgroundColor: "#f43f5e",
    pointerEvents: "none" as const,
    zIndex: 20,
  },
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 120,
    color: "#475569",
    fontSize: 13,
    fontFamily: "system-ui, sans-serif",
  },
  addLaneButton: {
    padding: "4px 12px",
    border: "1px dashed #475569",
    borderRadius: 4,
    background: "transparent",
    color: "#64748b",
    cursor: "pointer",
    fontSize: 11,
    fontFamily: "system-ui, sans-serif",
    margin: 8,
  },
  positionDisplay: {
    fontSize: 11,
    color: "#94a3b8",
    fontFamily: "monospace",
    minWidth: 60,
    textAlign: "center" as const,
  },
};

// ---------------------------------------------------------------------------
// Snap resolution options
// ---------------------------------------------------------------------------

const SNAP_OPTIONS = [
  { label: "1/4", value: 1 as const },
  { label: "1/8", value: 0.5 as const },
  { label: "1/16", value: 0.25 as const },
  { label: "Bar", value: 4 as const },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Timeline: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Store selectors
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const tempo = useTimelineStore((s) => s.tempo);
  const playheadBeat = useTimelineStore((s) => s.playheadBeat);
  const zoom = useTimelineStore((s) => s.zoom);
  const scrollBeat = useTimelineStore((s) => s.scrollBeat);
  const lanes = useTimelineStore((s) => s.lanes);
  const laneOrder = useTimelineStore((s) => s.laneOrder);
  const snap = useTimelineStore((s) => s.snap);
  const loopEnabled = useTimelineStore((s) => s.loopEnabled);

  // Store actions
  const togglePlayback = useTimelineStore((s) => s.togglePlayback);
  const setPlayheadBeat = useTimelineStore((s) => s.setPlayheadBeat);
  const setTempo = useTimelineStore((s) => s.setTempo);
  const zoomIn = useTimelineStore((s) => s.zoomIn);
  const zoomOut = useTimelineStore((s) => s.zoomOut);
  const setScrollBeat = useTimelineStore((s) => s.setScrollBeat);
  const setSnapEnabled = useTimelineStore((s) => s.setSnapEnabled);
  const setSnapResolution = useTimelineStore((s) => s.setSnapResolution);
  const setLoopEnabled = useTimelineStore((s) => s.setLoopEnabled);
  const addLane = useTimelineStore((s) => s.addLane);
  const setIsPlaying = useTimelineStore((s) => s.setIsPlaying);

  // Ordered lanes
  const orderedLanes = useMemo(() => {
    const laneMap = new Map(lanes.map((l) => [l.id, l]));
    return laneOrder
      .map((id) => laneMap.get(id))
      .filter((l): l is NonNullable<typeof l> => l != null);
  }, [lanes, laneOrder]);

  // Approximate clip area width (will be measured at runtime for precision)
  const clipAreaWidth = 1200;

  // Format playhead position for display
  const playheadBar = Math.floor(playheadBeat / 4) + 1;
  const playheadBeatInBar = Math.floor(playheadBeat % 4) + 1;
  const positionDisplay = `${playheadBar}.${playheadBeatInBar}`;

  // --- Event handlers ---

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setPlayheadBeat(0);
  }, [setIsPlaying, setPlayheadBeat]);

  const handleTempoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        setTempo(val);
      }
    },
    [setTempo],
  );

  const handleRulerClick = useCallback(
    (beat: number) => {
      setPlayheadBeat(beat);
    },
    [setPlayheadBeat],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom with Ctrl/Cmd + scroll
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      } else {
        // Horizontal scroll
        const beatsDelta = e.deltaX / zoom;
        setScrollBeat(scrollBeat + beatsDelta);
      }
    },
    [zoom, scrollBeat, zoomIn, zoomOut, setScrollBeat],
  );

  const handleAddLane = useCallback(() => {
    const laneNum = lanes.length + 1;
    addLane(`Track ${laneNum}`);
  }, [lanes.length, addLane]);

  const playheadPx = beatToPixel(playheadBeat, zoom, scrollBeat) + 160; // offset for header

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onWheel={handleWheel}
      data-testid="timeline"
    >
      {/* Toolbar */}
      <div style={styles.toolbar} data-testid="timeline-toolbar">
        {/* Transport controls */}
        <div style={styles.transportGroup}>
          <button
            style={{
              ...styles.transportButton,
              ...(isPlaying ? styles.transportButtonActive : {}),
            }}
            onClick={togglePlayback}
            data-testid="transport-play"
            title="Play/Pause"
          >
            {isPlaying ? "||" : "\u25B6"}
          </button>
          <button
            style={styles.transportButton}
            onClick={handleStop}
            data-testid="transport-stop"
            title="Stop"
          >
            {"\u25A0"}
          </button>
        </div>

        {/* Position display */}
        <span style={styles.positionDisplay} data-testid="position-display">
          {positionDisplay}
        </span>

        <div style={styles.divider} />

        {/* Tempo */}
        <span style={styles.tempoLabel}>BPM</span>
        <input
          style={styles.tempoInput}
          type="number"
          value={tempo}
          onChange={handleTempoChange}
          min={1}
          max={999}
          data-testid="tempo-input"
        />

        <div style={styles.divider} />

        {/* Zoom */}
        <div style={styles.zoomGroup}>
          <button
            style={styles.zoomButton}
            onClick={zoomOut}
            data-testid="zoom-out"
            title="Zoom Out"
          >
            -
          </button>
          <button
            style={styles.zoomButton}
            onClick={zoomIn}
            data-testid="zoom-in"
            title="Zoom In"
          >
            +
          </button>
        </div>

        <div style={styles.divider} />

        {/* Snap */}
        <div style={styles.snapGroup}>
          <button
            style={{
              ...styles.snapButton,
              ...(snap.enabled ? styles.snapButtonActive : {}),
            }}
            onClick={() => setSnapEnabled(!snap.enabled)}
            data-testid="snap-toggle"
            title="Toggle Snap to Grid"
          >
            SNAP
          </button>
          {SNAP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              style={{
                ...styles.snapButton,
                ...(snap.resolution === opt.value && snap.enabled
                  ? { borderColor: "#3b82f6", color: "#3b82f6" }
                  : {}),
              }}
              onClick={() => setSnapResolution(opt.value)}
              data-testid={`snap-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}

          <div style={styles.divider} />

          {/* Loop */}
          <button
            style={{
              ...styles.loopButton,
              ...(loopEnabled ? styles.loopButtonActive : {}),
            }}
            onClick={() => setLoopEnabled(!loopEnabled)}
            data-testid="loop-toggle"
            title="Toggle Loop"
          >
            LOOP
          </button>
        </div>
      </div>

      {/* Time ruler row */}
      <div style={styles.rulerRow}>
        <div style={styles.laneHeaderSpacer} />
        <TimeRuler width={clipAreaWidth} onClickBeat={handleRulerClick} />
      </div>

      {/* Lanes area */}
      <div style={styles.lanesContainer} data-testid="lanes-container">
        {orderedLanes.length === 0 ? (
          <div style={styles.emptyState}>
            No tracks. Click the button below to add one.
          </div>
        ) : (
          orderedLanes.map((lane) => (
            <LaneComponent
              key={lane.id}
              lane={lane}
              clipAreaWidth={clipAreaWidth}
            />
          ))
        )}

        {/* Add lane button */}
        <button
          style={styles.addLaneButton}
          onClick={handleAddLane}
          data-testid="add-lane"
        >
          + Add Track
        </button>

        {/* Playhead line overlay */}
        {playheadPx >= 160 && (
          <div
            style={{
              ...styles.playheadLine,
              left: playheadPx,
            }}
            data-testid="playhead-line"
          />
        )}
      </div>
    </div>
  );
};
