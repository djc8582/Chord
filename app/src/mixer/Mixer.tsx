/**
 * Mixer Component
 *
 * The top-level mixing console view. Renders a horizontal row of
 * ChannelStrip components for all audio-producing nodes, plus a
 * master strip on the right.
 */

import React, { useEffect, useCallback } from "react";
import { useMixerStore, hasSoloActive } from "./store.js";
import { useCanvasStore } from "../canvas/store.js";
import { ChannelStrip } from "./ChannelStrip.js";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Mixer: React.FC = React.memo(function Mixer() {
  const channels = useMixerStore((s) => s.channels);
  const master = useMixerStore((s) => s.master);
  const syncFromDocument = useMixerStore((s) => s.syncFromDocument);
  const setVolume = useMixerStore((s) => s.setVolume);
  const setPan = useMixerStore((s) => s.setPan);
  const toggleMute = useMixerStore((s) => s.toggleMute);
  const toggleSolo = useMixerStore((s) => s.toggleSolo);
  const setMasterVolume = useMixerStore((s) => s.setMasterVolume);
  const setMasterPan = useMixerStore((s) => s.setMasterPan);
  const toggleMasterMute = useMixerStore((s) => s.toggleMasterMute);

  // Subscribe to canvas store changes (Yjs document changes)
  const ydoc = useCanvasStore((s) => s.ydoc);

  useEffect(() => {
    // Initial sync
    syncFromDocument();

    // Re-sync whenever the canvas nodes change
    // We subscribe to the canvas store to detect document mutations
    const unsubscribe = useCanvasStore.subscribe(() => syncFromDocument());

    return unsubscribe;
  }, [ydoc, syncFromDocument]);

  const anySoloed = hasSoloActive(channels);

  // Master channel handlers
  const handleMasterVolume = useCallback(
    (_nodeId: string, db: number) => setMasterVolume(db),
    [setMasterVolume],
  );
  const handleMasterPan = useCallback(
    (_nodeId: string, pan: number) => setMasterPan(pan),
    [setMasterPan],
  );
  const handleMasterMute = useCallback(
    () => toggleMasterMute(),
    [toggleMasterMute],
  );
  // Master solo is a no-op (master cannot be soloed in standard mixers)
  const handleMasterSolo = useCallback(() => {}, []);

  return (
    <div
      data-testid="mixer"
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        gap: 2,
        padding: 8,
        backgroundColor: "#12121c",
        overflowX: "auto",
        minHeight: 260,
      }}
    >
      {/* Channel strips */}
      {channels.map((ch) => (
        <ChannelStrip
          key={ch.nodeId}
          channel={ch}
          anySoloed={anySoloed}
          onVolumeChange={setVolume}
          onPanChange={setPan}
          onToggleMute={toggleMute}
          onToggleSolo={toggleSolo}
          data-testid={`mixer-channel-${ch.nodeId}`}
        />
      ))}

      {/* Separator */}
      {channels.length > 0 && (
        <div
          data-testid="mixer-separator"
          style={{
            width: 1,
            backgroundColor: "#555",
            margin: "0 4px",
            alignSelf: "stretch",
          }}
        />
      )}

      {/* Master strip */}
      <ChannelStrip
        channel={master}
        anySoloed={false}
        onVolumeChange={handleMasterVolume}
        onPanChange={handleMasterPan}
        onToggleMute={handleMasterMute}
        onToggleSolo={handleMasterSolo}
        data-testid="mixer-master"
      />
    </div>
  );
});
