/**
 * Collaboration Store Tests
 *
 * Tests covering:
 * - Add / remove / update remote users
 * - Presence tracking: active/inactive based on lastSeen
 * - User color assignment (unique colors per user)
 * - Sync status transitions
 * - Pending changes counter
 * - getActiveUsers filters correctly
 * - Empty state (no remote users)
 * - Local user cursor updates
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useCollaborationStore,
  USER_COLORS,
  ACTIVE_THRESHOLD_MS,
} from "./store";
import { SyncStatus } from "./types";
import type { User } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(id: string, name?: string): User {
  return {
    id,
    name: name ?? `User ${id}`,
    color: USER_COLORS[0],
  };
}

// Reset the store before every test
beforeEach(() => {
  useCollaborationStore.setState({
    localUser: null,
    remoteUsers: new Map(),
    syncStatus: SyncStatus.Disconnected,
    pendingChanges: 0,
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("empty state", () => {
  it("starts with no local user", () => {
    expect(useCollaborationStore.getState().localUser).toBeNull();
  });

  it("starts with empty remote users map", () => {
    expect(useCollaborationStore.getState().remoteUsers.size).toBe(0);
  });

  it("starts disconnected", () => {
    expect(useCollaborationStore.getState().syncStatus).toBe(SyncStatus.Disconnected);
  });

  it("starts with zero pending changes", () => {
    expect(useCollaborationStore.getState().pendingChanges).toBe(0);
  });

  it("getActiveUsers returns empty array when no remote users", () => {
    expect(useCollaborationStore.getState().getActiveUsers()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Local user
// ---------------------------------------------------------------------------

describe("setLocalUser", () => {
  it("sets the local user", () => {
    const user = makeUser("local-1", "Alice");
    useCollaborationStore.getState().setLocalUser(user);

    expect(useCollaborationStore.getState().localUser).toEqual(user);
  });

  it("replaces the local user on subsequent calls", () => {
    useCollaborationStore.getState().setLocalUser(makeUser("u1", "Alice"));
    useCollaborationStore.getState().setLocalUser(makeUser("u2", "Bob"));

    expect(useCollaborationStore.getState().localUser?.name).toBe("Bob");
  });
});

// ---------------------------------------------------------------------------
// Add / remove remote users
// ---------------------------------------------------------------------------

describe("addRemoteUser / removeUser", () => {
  it("adds a remote user to the map", () => {
    const user = makeUser("r1", "Bob");
    useCollaborationStore.getState().addRemoteUser(user);

    const entry = useCollaborationStore.getState().remoteUsers.get("r1");
    expect(entry).toBeDefined();
    expect(entry!.user.name).toBe("Bob");
    expect(entry!.presence.userId).toBe("r1");
    expect(entry!.presence.isActive).toBe(true);
  });

  it("removes a remote user", () => {
    useCollaborationStore.getState().addRemoteUser(makeUser("r1"));
    expect(useCollaborationStore.getState().remoteUsers.size).toBe(1);

    useCollaborationStore.getState().removeUser("r1");
    expect(useCollaborationStore.getState().remoteUsers.size).toBe(0);
  });

  it("removing a non-existent user is a no-op", () => {
    useCollaborationStore.getState().removeUser("nonexistent");
    expect(useCollaborationStore.getState().remoteUsers.size).toBe(0);
  });

  it("can add multiple remote users", () => {
    useCollaborationStore.getState().addRemoteUser(makeUser("r1"));
    useCollaborationStore.getState().addRemoteUser(makeUser("r2"));
    useCollaborationStore.getState().addRemoteUser(makeUser("r3"));

    expect(useCollaborationStore.getState().remoteUsers.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Update presence
// ---------------------------------------------------------------------------

describe("updatePresence", () => {
  it("updates cursor position for a remote user", () => {
    useCollaborationStore.getState().addRemoteUser(makeUser("r1"));
    useCollaborationStore.getState().updatePresence("r1", {
      cursor: { x: 100, y: 200, viewportId: "main" },
    });

    const entry = useCollaborationStore.getState().remoteUsers.get("r1");
    expect(entry!.presence.cursor).toEqual({ x: 100, y: 200, viewportId: "main" });
  });

  it("updates selection for a remote user", () => {
    useCollaborationStore.getState().addRemoteUser(makeUser("r1"));
    useCollaborationStore.getState().updatePresence("r1", {
      selection: ["node-1", "node-2"],
    });

    const entry = useCollaborationStore.getState().remoteUsers.get("r1");
    expect(entry!.presence.selection).toEqual(["node-1", "node-2"]);
  });

  it("updates lastSeen timestamp", () => {
    useCollaborationStore.getState().addRemoteUser(makeUser("r1"));
    const ts = 1700000000000;
    useCollaborationStore.getState().updatePresence("r1", {
      lastSeen: ts,
    });

    const entry = useCollaborationStore.getState().remoteUsers.get("r1");
    expect(entry!.presence.lastSeen).toBe(ts);
  });

  it("preserves existing presence fields when partially updating", () => {
    useCollaborationStore.getState().addRemoteUser(makeUser("r1"));
    useCollaborationStore.getState().updatePresence("r1", {
      cursor: { x: 10, y: 20, viewportId: "main" },
    });
    useCollaborationStore.getState().updatePresence("r1", {
      selection: ["node-a"],
    });

    const entry = useCollaborationStore.getState().remoteUsers.get("r1");
    expect(entry!.presence.cursor).toEqual({ x: 10, y: 20, viewportId: "main" });
    expect(entry!.presence.selection).toEqual(["node-a"]);
  });

  it("does nothing for unknown user id", () => {
    useCollaborationStore.getState().updatePresence("nonexistent", {
      cursor: { x: 0, y: 0, viewportId: "main" },
    });
    expect(useCollaborationStore.getState().remoteUsers.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Presence tracking — active / inactive
// ---------------------------------------------------------------------------

describe("presence tracking: active / inactive", () => {
  it("newly added user is active", () => {
    useCollaborationStore.getState().addRemoteUser(makeUser("r1"));
    const now = Date.now();
    expect(useCollaborationStore.getState().isUserActive("r1", now)).toBe(true);
  });

  it("user becomes inactive after ACTIVE_THRESHOLD_MS", () => {
    useCollaborationStore.getState().addRemoteUser(makeUser("r1"));
    const staleTime = Date.now() + ACTIVE_THRESHOLD_MS + 1;
    expect(useCollaborationStore.getState().isUserActive("r1", staleTime)).toBe(false);
  });

  it("user marked as inactive is reported inactive even if lastSeen is recent", () => {
    useCollaborationStore.getState().addRemoteUser(makeUser("r1"));
    useCollaborationStore.getState().updatePresence("r1", {
      isActive: false,
      lastSeen: Date.now(),
    });
    expect(useCollaborationStore.getState().isUserActive("r1")).toBe(false);
  });

  it("isUserActive returns false for unknown user", () => {
    expect(useCollaborationStore.getState().isUserActive("ghost")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getActiveUsers
// ---------------------------------------------------------------------------

describe("getActiveUsers", () => {
  it("returns only active users", () => {
    const now = Date.now();
    useCollaborationStore.getState().addRemoteUser(makeUser("r1", "Alice"));
    useCollaborationStore.getState().addRemoteUser(makeUser("r2", "Bob"));

    // Make r2 stale
    useCollaborationStore.getState().updatePresence("r2", {
      lastSeen: now - ACTIVE_THRESHOLD_MS - 1,
    });

    const active = useCollaborationStore.getState().getActiveUsers(now);
    expect(active).toHaveLength(1);
    expect(active[0].user.name).toBe("Alice");
  });

  it("returns empty when all users are inactive", () => {
    const now = Date.now();
    useCollaborationStore.getState().addRemoteUser(makeUser("r1"));
    useCollaborationStore.getState().updatePresence("r1", {
      isActive: false,
    });

    expect(useCollaborationStore.getState().getActiveUsers(now)).toHaveLength(0);
  });

  it("returns all users when all are active", () => {
    const now = Date.now();
    useCollaborationStore.getState().addRemoteUser(makeUser("r1"));
    useCollaborationStore.getState().addRemoteUser(makeUser("r2"));
    useCollaborationStore.getState().addRemoteUser(makeUser("r3"));

    expect(useCollaborationStore.getState().getActiveUsers(now)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// User color assignment
// ---------------------------------------------------------------------------

describe("getUserColor", () => {
  it("returns a color from the USER_COLORS palette", () => {
    useCollaborationStore.getState().addRemoteUser(makeUser("r1"));
    const color = useCollaborationStore.getState().getUserColor("r1");
    expect(USER_COLORS).toContain(color);
  });

  it("returns a deterministic color for the same user id", () => {
    const color1 = useCollaborationStore.getState().getUserColor("user-abc");
    const color2 = useCollaborationStore.getState().getUserColor("user-abc");
    expect(color1).toBe(color2);
  });

  it("assigns different colors to different user ids (in most cases)", () => {
    const colors = new Set<string>();
    // Use enough varied ids to get at least 2 distinct colors
    for (let i = 0; i < 20; i++) {
      colors.add(useCollaborationStore.getState().getUserColor(`user-${i}`));
    }
    expect(colors.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Sync status transitions
// ---------------------------------------------------------------------------

describe("setSyncStatus", () => {
  it("transitions from disconnected to connecting", () => {
    useCollaborationStore.getState().setSyncStatus(SyncStatus.Connecting);
    expect(useCollaborationStore.getState().syncStatus).toBe(SyncStatus.Connecting);
  });

  it("transitions from connecting to connected", () => {
    useCollaborationStore.getState().setSyncStatus(SyncStatus.Connecting);
    useCollaborationStore.getState().setSyncStatus(SyncStatus.Connected);
    expect(useCollaborationStore.getState().syncStatus).toBe(SyncStatus.Connected);
  });

  it("transitions to syncing", () => {
    useCollaborationStore.getState().setSyncStatus(SyncStatus.Syncing);
    expect(useCollaborationStore.getState().syncStatus).toBe(SyncStatus.Syncing);
  });

  it("transitions to error", () => {
    useCollaborationStore.getState().setSyncStatus(SyncStatus.Error);
    expect(useCollaborationStore.getState().syncStatus).toBe(SyncStatus.Error);
  });

  it("transitions back to disconnected", () => {
    useCollaborationStore.getState().setSyncStatus(SyncStatus.Connected);
    useCollaborationStore.getState().setSyncStatus(SyncStatus.Disconnected);
    expect(useCollaborationStore.getState().syncStatus).toBe(SyncStatus.Disconnected);
  });
});

// ---------------------------------------------------------------------------
// Pending changes counter
// ---------------------------------------------------------------------------

describe("setPendingChanges", () => {
  it("sets the pending changes count", () => {
    useCollaborationStore.getState().setPendingChanges(5);
    expect(useCollaborationStore.getState().pendingChanges).toBe(5);
  });

  it("resets to zero", () => {
    useCollaborationStore.getState().setPendingChanges(10);
    useCollaborationStore.getState().setPendingChanges(0);
    expect(useCollaborationStore.getState().pendingChanges).toBe(0);
  });

  it("handles large counts", () => {
    useCollaborationStore.getState().setPendingChanges(99999);
    expect(useCollaborationStore.getState().pendingChanges).toBe(99999);
  });
});

// ---------------------------------------------------------------------------
// Local user cursor updates (via updatePresence pattern)
// ---------------------------------------------------------------------------

describe("local user cursor updates", () => {
  it("can track cursor position for a remote user (simulating local user on a peer)", () => {
    const user = makeUser("r1", "Alice");
    useCollaborationStore.getState().addRemoteUser(user);
    useCollaborationStore.getState().updatePresence("r1", {
      cursor: { x: 300, y: 450, viewportId: "main" },
    });

    const entry = useCollaborationStore.getState().remoteUsers.get("r1");
    expect(entry!.presence.cursor).toEqual({ x: 300, y: 450, viewportId: "main" });
  });

  it("cursor updates refresh lastSeen by default", () => {
    const user = makeUser("r1");
    useCollaborationStore.getState().addRemoteUser(user);

    const before = Date.now();
    useCollaborationStore.getState().updatePresence("r1", {
      cursor: { x: 0, y: 0, viewportId: "main" },
    });
    const after = Date.now();

    const entry = useCollaborationStore.getState().remoteUsers.get("r1");
    expect(entry!.presence.lastSeen).toBeGreaterThanOrEqual(before);
    expect(entry!.presence.lastSeen).toBeLessThanOrEqual(after);
  });
});
