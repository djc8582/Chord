/**
 * LiveMode
 *
 * Fullscreen performance view. Minimal, distraction-free dark UI optimized
 * for stage visibility. Shows current patch name, prev/next navigation,
 * setlist sidebar, panic button, BPM display, and tap tempo.
 *
 * Keyboard shortcuts:
 *   Left/Right arrows — prev/next patch
 *   Escape — exit live mode
 *   Space — play/stop transport
 *   P — panic (all notes off)
 */

import React, { useCallback, useEffect } from "react";
import { useLiveModeStore } from "./store.js";
import { PanicButton } from "./PanicButton.js";
import { TapTempo } from "./TapTempo.js";

export interface LiveModeProps {
  /** Callback to exit live mode. */
  onExit?: () => void;
  /** Callback for play/stop toggle. */
  onPlayStop?: () => void;
  /** Callback when panic is triggered (e.g. bridge.stop + all-notes-off). */
  onPanic?: () => void;
  /** Callback when BPM changes via tap tempo. */
  onBpmChange?: (bpm: number) => void;
  /** Callback when the active setlist entry changes. */
  onEntryChange?: (entry: { id: string; presetId: string } | null) => void;
}

export const LiveMode: React.FC<LiveModeProps> = ({
  onExit,
  onPlayStop,
  onPanic,
  onBpmChange,
  onEntryChange,
}) => {
  const isActive = useLiveModeStore((s) => s.isActive);
  const setlist = useLiveModeStore((s) => s.setlist);
  const currentIndex = useLiveModeStore((s) => s.currentIndex);
  const sidebarOpen = useLiveModeStore((s) => s.sidebarOpen);
  const next = useLiveModeStore((s) => s.next);
  const prev = useLiveModeStore((s) => s.prev);
  const goTo = useLiveModeStore((s) => s.goTo);
  const deactivate = useLiveModeStore((s) => s.deactivate);
  const toggleSidebar = useLiveModeStore((s) => s.toggleSidebar);
  const panic = useLiveModeStore((s) => s.panic);
  const clearPanic = useLiveModeStore((s) => s.clearPanic);

  const currentEntry = currentIndex >= 0 && currentIndex < setlist.length
    ? setlist[currentIndex]
    : null;

  // -- Notify parent on entry change ----------------------------------------

  useEffect(() => {
    if (currentEntry) {
      onEntryChange?.({ id: currentEntry.id, presetId: currentEntry.presetId });
    } else {
      onEntryChange?.(null);
    }
  }, [currentEntry, onEntryChange]);

  // -- Keyboard shortcuts ---------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isActive) return;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
          e.preventDefault();
          prev();
          break;
        case "Escape":
          e.preventDefault();
          deactivate();
          onExit?.();
          break;
        case " ":
          e.preventDefault();
          onPlayStop?.();
          break;
        case "p":
        case "P":
          e.preventDefault();
          panic();
          onPanic?.();
          setTimeout(() => clearPanic(), 1000);
          break;
        default:
          break;
      }
    },
    [isActive, next, prev, deactivate, onExit, onPlayStop, panic, clearPanic, onPanic],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // -- Don't render if not active -------------------------------------------

  if (!isActive) return null;

  // -- Render ---------------------------------------------------------------

  return (
    <div
      data-testid="live-mode"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        backgroundColor: "#020617",
        color: "#e2e8f0",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Sidebar */}
      {sidebarOpen && (
        <aside
          data-testid="live-mode-sidebar"
          style={{
            width: 280,
            backgroundColor: "#0f172a",
            borderRight: "1px solid #1e293b",
            overflowY: "auto",
            padding: "16px 0",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "0 16px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Setlist
          </div>
          {setlist.map((entry, index) => (
            <button
              key={entry.id}
              onClick={() => goTo(index)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "12px 16px",
                textAlign: "left",
                background:
                  index === currentIndex ? "#1e3a5f" : "transparent",
                border: "none",
                borderLeft: `3px solid ${entry.color}`,
                color: index === currentIndex ? "#fff" : "#94a3b8",
                fontSize: 15,
                fontWeight: index === currentIndex ? 700 : 400,
                cursor: "pointer",
              }}
            >
              <span style={{ color: "#475569", minWidth: 20 }}>
                {index + 1}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.name}
              </span>
            </button>
          ))}
          {setlist.length === 0 && (
            <div
              style={{
                padding: "24px 16px",
                color: "#475569",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              Empty setlist
            </div>
          )}
        </aside>
      )}

      {/* Main performance area */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: 32,
        }}
      >
        {/* Top bar */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            right: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={toggleSidebar}
              aria-label="Toggle setlist sidebar"
              style={{
                padding: "8px 12px",
                fontSize: 14,
                color: "#94a3b8",
                background: "transparent",
                border: "1px solid #334155",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {sidebarOpen ? "Hide" : "Show"} Setlist
            </button>
            <button
              onClick={() => {
                deactivate();
                onExit?.();
              }}
              aria-label="Exit live mode"
              style={{
                padding: "8px 12px",
                fontSize: 14,
                color: "#94a3b8",
                background: "transparent",
                border: "1px solid #334155",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Exit
            </button>
          </div>
          <TapTempo onBpmChange={onBpmChange} />
        </div>

        {/* Current patch display */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 48,
          }}
        >
          {currentEntry ? (
            <>
              <div
                style={{
                  fontSize: 14,
                  color: "#64748b",
                  marginBottom: 8,
                }}
              >
                {currentIndex + 1} / {setlist.length}
              </div>
              <div
                style={{
                  fontSize: 72,
                  fontWeight: 800,
                  lineHeight: 1.1,
                  color: currentEntry.color,
                  maxWidth: 800,
                  wordBreak: "break-word",
                }}
              >
                {currentEntry.name}
              </div>
              {currentEntry.notes && (
                <div
                  style={{
                    fontSize: 18,
                    color: "#94a3b8",
                    marginTop: 16,
                    maxWidth: 600,
                  }}
                >
                  {currentEntry.notes}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 24, color: "#475569" }}>
              {setlist.length === 0 ? "No setlist loaded" : "Select an entry"}
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <button
            onClick={prev}
            disabled={setlist.length === 0}
            aria-label="Previous patch"
            style={{
              minWidth: 120,
              minHeight: 72,
              padding: "16px 32px",
              fontSize: 24,
              fontWeight: 700,
              color: "#e2e8f0",
              backgroundColor: "#1e293b",
              border: "2px solid #334155",
              borderRadius: 12,
              cursor: setlist.length > 0 ? "pointer" : "not-allowed",
              opacity: setlist.length > 0 ? 1 : 0.4,
              userSelect: "none",
            }}
          >
            Prev
          </button>

          <PanicButton onPanic={onPanic} />

          <button
            onClick={next}
            disabled={setlist.length === 0}
            aria-label="Next patch"
            style={{
              minWidth: 120,
              minHeight: 72,
              padding: "16px 32px",
              fontSize: 24,
              fontWeight: 700,
              color: "#e2e8f0",
              backgroundColor: "#1e293b",
              border: "2px solid #334155",
              borderRadius: 12,
              cursor: setlist.length > 0 ? "pointer" : "not-allowed",
              opacity: setlist.length > 0 ? 1 : 0.4,
              userSelect: "none",
            }}
          >
            Next
          </button>
        </div>

        {/* Bottom: prev/next entry names */}
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: 32,
            right: 32,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            color: "#475569",
          }}
        >
          <span>
            {currentIndex > 0 && setlist[currentIndex - 1]
              ? `< ${setlist[currentIndex - 1].name}`
              : ""}
          </span>
          <span>
            {currentIndex >= 0 && currentIndex < setlist.length - 1
              ? `${setlist[currentIndex + 1].name} >`
              : ""}
          </span>
        </div>
      </main>
    </div>
  );
};
