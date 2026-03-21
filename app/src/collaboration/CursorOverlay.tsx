/**
 * CursorOverlay
 *
 * Renders remote users' cursors on the canvas as an SVG overlay.
 * Each cursor is a colored arrow with the user's name label.
 * Cursors interpolate smoothly between positions and fade out
 * when the user goes inactive.
 */

import React, { useEffect, useRef } from "react";
import { useCollaborationStore, ACTIVE_THRESHOLD_MS } from "./store.js";
import type { CursorPosition } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURSOR_SIZE = 20;
const LABEL_OFFSET_X = 14;
const LABEL_OFFSET_Y = 18;
const FADE_DURATION_MS = 3_000;

// ---------------------------------------------------------------------------
// Single remote cursor
// ---------------------------------------------------------------------------

interface RemoteCursorProps {
  name: string;
  color: string;
  cursor: CursorPosition;
  lastSeen: number;
  isActive: boolean;
  now: number;
}

export function RemoteCursor({ name, color, cursor, lastSeen, isActive, now }: RemoteCursorProps) {
  const inactiveElapsed = now - lastSeen;
  const fadingOut = !isActive || inactiveElapsed >= ACTIVE_THRESHOLD_MS;
  const opacity = fadingOut
    ? Math.max(0, 1 - (inactiveElapsed - ACTIVE_THRESHOLD_MS) / FADE_DURATION_MS)
    : 1;

  if (opacity <= 0) return null;

  return (
    <g
      data-testid={`remote-cursor-${name}`}
      style={{
        transform: `translate(${cursor.x}px, ${cursor.y}px)`,
        opacity,
        transition: "transform 0.1s ease-out, opacity 0.3s ease-out",
      }}
    >
      {/* Cursor arrow */}
      <polygon
        points={`0,0 0,${CURSOR_SIZE} ${CURSOR_SIZE * 0.4},${CURSOR_SIZE * 0.7}`}
        fill={color}
        stroke="#fff"
        strokeWidth={1}
      />
      {/* Name label */}
      <rect
        x={LABEL_OFFSET_X}
        y={LABEL_OFFSET_Y - 12}
        width={name.length * 7 + 8}
        height={16}
        rx={3}
        fill={color}
      />
      <text
        x={LABEL_OFFSET_X + 4}
        y={LABEL_OFFSET_Y}
        fontSize={11}
        fontFamily="system-ui, sans-serif"
        fill="#fff"
      >
        {name}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Overlay container
// ---------------------------------------------------------------------------

export interface CursorOverlayProps {
  viewportId?: string;
  "data-testid"?: string;
}

export function CursorOverlay({ viewportId = "main", ...rest }: CursorOverlayProps) {
  const remoteUsers = useCollaborationStore((s) => s.remoteUsers);
  const nowRef = useRef(Date.now());

  // Tick the clock so fade-out animations progress
  useEffect(() => {
    let raf: number;
    function tick() {
      nowRef.current = Date.now();
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cursors: React.ReactElement[] = [];
  for (const [, entry] of remoteUsers) {
    const { user, presence } = entry;
    if (!presence.cursor) continue;
    if (presence.cursor.viewportId !== viewportId) continue;

    cursors.push(
      <RemoteCursor
        key={user.id}
        name={user.name}
        color={user.color}
        cursor={presence.cursor}
        lastSeen={presence.lastSeen}
        isActive={presence.isActive}
        now={nowRef.current}
      />,
    );
  }

  return (
    <svg
      data-testid={rest["data-testid"] ?? "cursor-overlay"}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 1000,
      }}
    >
      {cursors}
    </svg>
  );
}
