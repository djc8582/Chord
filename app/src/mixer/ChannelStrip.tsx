/**
 * ChannelStrip Component
 *
 * A vertical mixer channel strip containing:
 * - Channel name/label at top
 * - Level meter (peak + RMS)
 * - Volume fader (vertical slider, -inf to +12dB)
 * - Pan knob (L-R)
 * - Mute button (M)
 * - Solo button (S)
 * - Color indicator
 */

import React, { useCallback } from "react";
import type { MixerChannel } from "./store.js";
import { isChannelAudible } from "./store.js";
import { Fader } from "./Fader.js";
import { LevelMeter } from "./LevelMeter.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChannelStripProps {
  channel: MixerChannel;
  /** Whether any channel in the mixer is soloed (affects mute display). */
  anySoloed: boolean;
  onVolumeChange: (nodeId: string, db: number) => void;
  onPanChange: (nodeId: string, pan: number) => void;
  onToggleMute: (nodeId: string) => void;
  onToggleSolo: (nodeId: string) => void;
  /** Test ID prefix for testing. */
  "data-testid"?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChannelStrip: React.FC<ChannelStripProps> = React.memo(
  function ChannelStrip({
    channel,
    anySoloed,
    onVolumeChange,
    onPanChange,
    onToggleMute,
    onToggleSolo,
    "data-testid": testId = "channel-strip",
  }) {
    const audible = isChannelAudible(channel, anySoloed);

    const handleVolumeChange = useCallback(
      (db: number) => onVolumeChange(channel.nodeId, db),
      [channel.nodeId, onVolumeChange],
    );

    const handlePanChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onPanChange(channel.nodeId, parseFloat(e.target.value));
      },
      [channel.nodeId, onPanChange],
    );

    const handleMute = useCallback(
      () => onToggleMute(channel.nodeId),
      [channel.nodeId, onToggleMute],
    );

    const handleSolo = useCallback(
      () => onToggleSolo(channel.nodeId),
      [channel.nodeId, onToggleSolo],
    );

    // Format pan display
    const panDisplay =
      channel.pan === 0
        ? "C"
        : channel.pan < 0
          ? `L${Math.round(Math.abs(channel.pan) * 100)}`
          : `R${Math.round(channel.pan * 100)}`;

    return (
      <div
        data-testid={testId}
        data-channel-id={channel.nodeId}
        data-audible={audible}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          padding: "8px 6px",
          minWidth: 64,
          backgroundColor: audible ? "#1e1e2e" : "#15151f",
          borderRadius: 4,
          border: "1px solid #333",
          opacity: audible ? 1 : 0.5,
        }}
      >
        {/* Color indicator */}
        <div
          data-testid={`${testId}-color`}
          style={{
            width: "100%",
            height: 3,
            backgroundColor: channel.color ?? "#666",
            borderRadius: 1,
          }}
        />

        {/* Channel name */}
        <div
          data-testid={`${testId}-name`}
          title={channel.name}
          style={{
            fontSize: 10,
            fontWeight: 600,
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 56,
            color: "#ccc",
            userSelect: "none",
          }}
        >
          {channel.name}
        </div>

        {/* Level meter + Fader side by side */}
        <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
          <LevelMeter
            peakDb={channel.peakDb}
            rmsDb={channel.rmsDb}
            clipping={channel.clipping}
            data-testid={`${testId}-meter`}
          />
          <Fader
            valueDb={channel.volumeDb}
            onChange={handleVolumeChange}
            data-testid={`${testId}-fader`}
          />
        </div>

        {/* Pan knob */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
          }}
        >
          <input
            data-testid={`${testId}-pan`}
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={channel.pan}
            onChange={handlePanChange}
            aria-label="Pan"
            style={{ width: 48, height: 14 }}
          />
          <span
            data-testid={`${testId}-pan-display`}
            style={{
              fontSize: 9,
              fontFamily: "monospace",
              color: "#999",
              userSelect: "none",
            }}
          >
            {panDisplay}
          </span>
        </div>

        {/* Mute / Solo buttons */}
        <div style={{ display: "flex", gap: 4 }}>
          <button
            data-testid={`${testId}-mute`}
            onClick={handleMute}
            aria-label={channel.muted ? "Unmute" : "Mute"}
            aria-pressed={channel.muted}
            style={{
              width: 24,
              height: 20,
              fontSize: 10,
              fontWeight: 700,
              border: "none",
              borderRadius: 2,
              cursor: "pointer",
              backgroundColor: channel.muted ? "#ef4444" : "#444",
              color: channel.muted ? "#fff" : "#999",
            }}
          >
            M
          </button>
          <button
            data-testid={`${testId}-solo`}
            onClick={handleSolo}
            aria-label={channel.soloed ? "Unsolo" : "Solo"}
            aria-pressed={channel.soloed}
            style={{
              width: 24,
              height: 20,
              fontSize: 10,
              fontWeight: 700,
              border: "none",
              borderRadius: 2,
              cursor: "pointer",
              backgroundColor: channel.soloed ? "#eab308" : "#444",
              color: channel.soloed ? "#000" : "#999",
            }}
          >
            S
          </button>
        </div>
      </div>
    );
  },
);
