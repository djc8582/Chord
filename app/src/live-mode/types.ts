/**
 * Live Mode — Type definitions
 *
 * Types for setlist entries and live performance state.
 */

// ---------------------------------------------------------------------------
// Setlist
// ---------------------------------------------------------------------------

/** A single entry in a performance setlist. */
export interface SetlistEntry {
  /** Unique identifier for this entry. */
  id: string;
  /** Reference to the preset this entry loads. */
  presetId: string;
  /** Display name shown on stage (may differ from preset name). */
  name: string;
  /** Color for visual identification under stage lighting. */
  color: string;
  /** Free-form notes for the performer (e.g. "start soft, build at chorus"). */
  notes: string;
}

// ---------------------------------------------------------------------------
// Default colors for setlist entries
// ---------------------------------------------------------------------------

export const SETLIST_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
] as const;
