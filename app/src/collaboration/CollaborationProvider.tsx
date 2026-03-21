/**
 * CollaborationProvider
 *
 * Context wrapper that manages the collaboration lifecycle. For now it
 * manages local state and simulates presence updates. When the server/sync
 * module is ready this component becomes the integration point for
 * WebSocket / Yjs awareness connections.
 */

import React, { createContext, useContext, useCallback, useEffect, useRef } from "react";
import { useCollaborationStore } from "./store.js";
import { SyncStatus } from "./types.js";
import type { User, CursorPosition, CollaborationMessage } from "./types.js";

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

export interface CollaborationContextValue {
  /** Update the local user's cursor position (broadcasts to peers). */
  broadcastCursor: (cursor: CursorPosition) => void;
  /** Update the local user's selection (broadcasts to peers). */
  broadcastSelection: (selection: string[]) => void;
  /** Attempt to reconnect when disconnected. */
  reconnect: () => void;
  /** Process an incoming collaboration message (for testing / future server integration). */
  handleMessage: (message: CollaborationMessage) => void;
}

const CollaborationContext = createContext<CollaborationContextValue | null>(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCollaboration(): CollaborationContextValue {
  const ctx = useContext(CollaborationContext);
  if (!ctx) {
    throw new Error("useCollaboration must be used inside <CollaborationProvider>");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface CollaborationProviderProps {
  /** The local user. If omitted the provider will not set a localUser automatically. */
  user?: User;
  children: React.ReactNode;
  "data-testid"?: string;
}

export function CollaborationProvider({ user, children, ...rest }: CollaborationProviderProps) {
  const store = useCollaborationStore;
  const initialised = useRef(false);

  // Set up local user and mark as connected on mount
  useEffect(() => {
    if (user && !initialised.current) {
      store.getState().setLocalUser(user);
      store.getState().setSyncStatus(SyncStatus.Connected);
      initialised.current = true;
    }
  }, [user, store]);

  // ---------------------------------------------------------------------------
  // Message handler — processes inbound collaboration messages
  // ---------------------------------------------------------------------------

  const handleMessage = useCallback(
    (msg: CollaborationMessage) => {
      const state = store.getState();
      switch (msg.type) {
        case "user_joined":
          state.addRemoteUser(msg.user);
          break;
        case "user_left":
          state.removeUser(msg.userId);
          break;
        case "cursor_move":
          state.updatePresence(msg.userId, {
            cursor: msg.cursor,
            lastSeen: msg.timestamp,
          });
          break;
        case "selection_change":
          state.updatePresence(msg.userId, {
            selection: msg.selection,
            lastSeen: msg.timestamp,
          });
          break;
        case "presence_update":
          state.updatePresence(msg.userId, {
            isActive: msg.isActive,
            lastSeen: msg.timestamp,
          });
          break;
      }
    },
    [store],
  );

  // ---------------------------------------------------------------------------
  // Outbound broadcasts (stubs for future WebSocket integration)
  // ---------------------------------------------------------------------------

  const broadcastCursor = useCallback(
    (_cursor: CursorPosition) => {
      // In a real implementation this would send a cursor_move message
      // over the WebSocket / Yjs awareness channel.
      // For now it is a no-op — the cursor is local only.
    },
    [],
  );

  const broadcastSelection = useCallback(
    (_selection: string[]) => {
      // Stub — will broadcast via WebSocket when server/sync is available.
    },
    [],
  );

  const reconnect = useCallback(() => {
    const current = store.getState().syncStatus;
    if (current === SyncStatus.Disconnected || current === SyncStatus.Error) {
      store.getState().setSyncStatus(SyncStatus.Connecting);
      // Simulate reconnect succeeding after a short delay
      setTimeout(() => {
        store.getState().setSyncStatus(SyncStatus.Connected);
      }, 500);
    }
  }, [store]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const value: CollaborationContextValue = {
    broadcastCursor,
    broadcastSelection,
    reconnect,
    handleMessage,
  };

  return (
    <CollaborationContext.Provider value={value}>
      <div data-testid={rest["data-testid"] ?? "collaboration-provider"}>{children}</div>
    </CollaborationContext.Provider>
  );
}
