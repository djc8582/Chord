/**
 * Collaboration Store
 *
 * Zustand store tracking local user, remote users and their presence,
 * sync status, and pending changes. Provides helpers for querying
 * active users and assigning unique colors.
 */

import { create } from "zustand";
import type { User, UserPresence } from "./types.js";
import { SyncStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Color palette — visually distinct colors assigned round-robin
// ---------------------------------------------------------------------------

export const USER_COLORS: string[] = [
  "#f43f5e", // rose
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#14b8a6", // teal
  "#ef4444", // red
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#f97316", // orange
];

/** Threshold (ms) — users who haven't been seen within this window are inactive. */
export const ACTIVE_THRESHOLD_MS = 30_000;

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface CollaborationStore {
  // State
  localUser: User | null;
  remoteUsers: Map<string, { user: User; presence: UserPresence }>;
  syncStatus: SyncStatus;
  pendingChanges: number;

  // Mutations
  setLocalUser: (user: User) => void;
  updatePresence: (userId: string, presence: Partial<UserPresence>) => void;
  addRemoteUser: (user: User) => void;
  removeUser: (userId: string) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setPendingChanges: (count: number) => void;

  // Queries (computed helpers)
  getActiveUsers: (now?: number) => Array<{ user: User; presence: UserPresence }>;
  getUserColor: (userId: string) => string;
  isUserActive: (userId: string, now?: number) => boolean;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useCollaborationStore = create<CollaborationStore>((set, get) => ({
  localUser: null,
  remoteUsers: new Map(),
  syncStatus: SyncStatus.Disconnected,
  pendingChanges: 0,

  setLocalUser: (user) => set({ localUser: user }),

  addRemoteUser: (user) => {
    set((state) => {
      const next = new Map(state.remoteUsers);
      next.set(user.id, {
        user,
        presence: {
          userId: user.id,
          isActive: true,
          lastSeen: Date.now(),
        },
      });
      return { remoteUsers: next };
    });
  },

  updatePresence: (userId, partial) => {
    set((state) => {
      const existing = state.remoteUsers.get(userId);
      if (!existing) return state;

      const next = new Map(state.remoteUsers);
      next.set(userId, {
        user: existing.user,
        presence: {
          ...existing.presence,
          ...partial,
          lastSeen: partial.lastSeen ?? Date.now(),
        },
      });
      return { remoteUsers: next };
    });
  },

  removeUser: (userId) => {
    set((state) => {
      const next = new Map(state.remoteUsers);
      next.delete(userId);
      return { remoteUsers: next };
    });
  },

  setSyncStatus: (status) => set({ syncStatus: status }),

  setPendingChanges: (count) => set({ pendingChanges: count }),

  getActiveUsers: (now) => {
    const ts = now ?? Date.now();
    const result: Array<{ user: User; presence: UserPresence }> = [];
    for (const entry of get().remoteUsers.values()) {
      if (entry.presence.isActive && ts - entry.presence.lastSeen < ACTIVE_THRESHOLD_MS) {
        result.push(entry);
      }
    }
    return result;
  },

  getUserColor: (userId) => {
    // Deterministic color from user id — hash the id to an index
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
    }
    const index = Math.abs(hash) % USER_COLORS.length;
    return USER_COLORS[index];
  },

  isUserActive: (userId, now) => {
    const ts = now ?? Date.now();
    const entry = get().remoteUsers.get(userId);
    if (!entry) return false;
    return entry.presence.isActive && ts - entry.presence.lastSeen < ACTIVE_THRESHOLD_MS;
  },
}));
