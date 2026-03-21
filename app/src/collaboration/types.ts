/**
 * Collaboration Module — Type definitions
 *
 * Types for real-time collaboration: user presence, cursor positions,
 * sync status, and collaboration protocol messages.
 */

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

/** A collaborating user. */
export interface User {
  id: string;
  name: string;
  color: string;
  avatar?: string;
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

/** Cursor position on the canvas, scoped to a viewport. */
export interface CursorPosition {
  x: number;
  y: number;
  viewportId: string;
}

/** Presence state for a single remote user. */
export interface UserPresence {
  userId: string;
  cursor?: CursorPosition;
  selection?: string[];
  isActive: boolean;
  lastSeen: number;
}

// ---------------------------------------------------------------------------
// Sync status
// ---------------------------------------------------------------------------

/** Connection / synchronization status. */
export enum SyncStatus {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
  Syncing = "syncing",
  Error = "error",
}

// ---------------------------------------------------------------------------
// Collaboration messages
// ---------------------------------------------------------------------------

/** Discriminated union of collaboration protocol messages. */
export type CollaborationMessage =
  | PresenceUpdateMessage
  | CursorMoveMessage
  | SelectionChangeMessage
  | UserJoinedMessage
  | UserLeftMessage;

export interface PresenceUpdateMessage {
  type: "presence_update";
  userId: string;
  isActive: boolean;
  timestamp: number;
}

export interface CursorMoveMessage {
  type: "cursor_move";
  userId: string;
  cursor: CursorPosition;
  timestamp: number;
}

export interface SelectionChangeMessage {
  type: "selection_change";
  userId: string;
  selection: string[];
  timestamp: number;
}

export interface UserJoinedMessage {
  type: "user_joined";
  user: User;
  timestamp: number;
}

export interface UserLeftMessage {
  type: "user_left";
  userId: string;
  timestamp: number;
}
