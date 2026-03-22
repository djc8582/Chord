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
    backgroundColor: "#fffef0",
    color: "#000",
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    overflow: "hidden",
    position: "relative" as const,
  },
  toolbar: {
    display: "flex",
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 8,
    padding: "4px 8px",
    backgroundColor: "#ffffff",
    borderBottom: "3px solid #000",
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
    border: "3px solid #000",
    borderRadius: 8,
    background: "#ffffff",
    color: "#000",
    cursor: "pointer",
    fontSize: 12,
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    fontWeight: 700,
  },
  transportButtonActive: {
    backgroundColor: "#c8ff00",
    color: "#000",
    borderColor: "#000",
  },
  tempoInput: {
    width: 52,
    height: 22,
    border: "3px solid #000",
    borderRadius: 8,
    background: "#fffef0",
    color: "#000",
    textAlign: "center" as const,
    fontSize: 11,
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    fontWeight: 700,
  },
  tempoLabel: {
    fontSize: 10,
    color: "#333",
    fontWeight: 700,
  },
  divider: {
    width: 3,
    height: 20,
    backgroundColor: "#000",
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
    border: "3px solid #000",
    borderRadius: 8,
    background: "#ffffff",
    color: "#000",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
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
    border: "3px solid #000",
    borderRadius: 8,
    background: "#ffffff",
    color: "#000",
    cursor: "pointer",
    fontSize: 10,
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
  },
  snapButtonActive: {
    backgroundColor: "#c8ff00",
    color: "#000",
    borderColor: "#000",
  },
  loopButton: {
    padding: "2px 8px",
    height: 22,
    border: "3px solid #000",
    borderRadius: 8,
    background: "#ffffff",
    color: "#000",
    cursor: "pointer",
    fontSize: 10,
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
  },
  loopButtonActive: {
    backgroundColor: "#7c3aed",
    color: "#fff",
    borderColor: "#000",
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
    backgroundColor: "#ffffff",
    borderBottom: "3px solid #000",
    borderRight: "3px solid #000",
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
    width: 2,
    height: "100%",
    backgroundColor: "#7c3aed",
    pointerEvents: "none" as const,
    zIndex: 20,
  },
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 120,
    color: "#666",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
  },
  addLaneButton: {
    padding: "4px 12px",
    border: "3px dashed #000",
    borderRadius: 8,
    background: "#ffffff",
    color: "#000",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    margin: 8,
  },
  positionDisplay: {
    fontSize: 11,
    color: "#000",
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    fontWeight: 700,
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
                  ? { borderColor: "#000", background: "#c8ff00", color: "#000" }
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
