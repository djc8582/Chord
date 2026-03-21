/**
 * @chord/collaboration
 *
 * Real-time collaboration UI module. Provides presence indicators,
 * cursor overlays, sync status, and the provider that integrates
 * with the server/sync layer.
 */

// Types
export type {
  User,
  UserPresence,
  CursorPosition,
  CollaborationMessage,
  PresenceUpdateMessage,
  CursorMoveMessage,
  SelectionChangeMessage,
  UserJoinedMessage,
  UserLeftMessage,
} from "./types.js";
export { SyncStatus } from "./types.js";

// Store
export {
  useCollaborationStore,
  USER_COLORS,
  ACTIVE_THRESHOLD_MS,
} from "./store.js";
export type { CollaborationStore } from "./store.js";

// Components
export { CursorOverlay, RemoteCursor } from "./CursorOverlay.js";
export { PresenceBar, UserDot } from "./PresenceBar.js";
export { SyncStatusIndicator } from "./SyncStatusIndicator.js";
export { CollaborationProvider, useCollaboration } from "./CollaborationProvider.js";
