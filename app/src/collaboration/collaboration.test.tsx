/**
 * Collaboration Component Tests
 *
 * Tests covering:
 * - CursorOverlay renders remote cursors
 * - PresenceBar shows online users
 * - SyncStatusIndicator shows correct status
 * - CollaborationProvider manages context
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useCollaborationStore, USER_COLORS } from "./store";
import { SyncStatus } from "./types";
import type { User } from "./types";
import { CursorOverlay } from "./CursorOverlay";
import { PresenceBar } from "./PresenceBar";
import { SyncStatusIndicator } from "./SyncStatusIndicator";
import { CollaborationProvider, useCollaboration } from "./CollaborationProvider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(id: string, name?: string, color?: string): User {
  return {
    id,
    name: name ?? `User ${id}`,
    color: color ?? USER_COLORS[0],
  };
}

function resetStore() {
  useCollaborationStore.setState({
    localUser: null,
    remoteUsers: new Map(),
    syncStatus: SyncStatus.Disconnected,
    pendingChanges: 0,
  });
}

beforeEach(resetStore);

// ---------------------------------------------------------------------------
// CursorOverlay
// ---------------------------------------------------------------------------

describe("CursorOverlay", () => {
  it("renders the SVG overlay container", () => {
    render(<CursorOverlay />);
    expect(screen.getByTestId("cursor-overlay")).toBeDefined();
  });

  it("renders nothing when no remote users have cursors", () => {
    render(<CursorOverlay />);
    const svg = screen.getByTestId("cursor-overlay");
    expect(svg.childNodes.length).toBe(0);
  });

  it("renders a cursor for each remote user with a cursor position", () => {
    const now = Date.now();
    const users = new Map();
    users.set("r1", {
      user: makeUser("r1", "Alice", "#f43f5e"),
      presence: {
        userId: "r1",
        cursor: { x: 100, y: 200, viewportId: "main" },
        isActive: true,
        lastSeen: now,
      },
    });
    users.set("r2", {
      user: makeUser("r2", "Bob", "#3b82f6"),
      presence: {
        userId: "r2",
        cursor: { x: 300, y: 400, viewportId: "main" },
        isActive: true,
        lastSeen: now,
      },
    });
    useCollaborationStore.setState({ remoteUsers: users });

    render(<CursorOverlay />);
    expect(screen.getByTestId("remote-cursor-Alice")).toBeDefined();
    expect(screen.getByTestId("remote-cursor-Bob")).toBeDefined();
  });

  it("does not render cursors for users without cursor position", () => {
    const now = Date.now();
    const users = new Map();
    users.set("r1", {
      user: makeUser("r1", "Alice"),
      presence: {
        userId: "r1",
        isActive: true,
        lastSeen: now,
        // No cursor
      },
    });
    useCollaborationStore.setState({ remoteUsers: users });

    render(<CursorOverlay />);
    expect(screen.queryByTestId("remote-cursor-Alice")).toBeNull();
  });

  it("filters cursors by viewportId", () => {
    const now = Date.now();
    const users = new Map();
    users.set("r1", {
      user: makeUser("r1", "Alice"),
      presence: {
        userId: "r1",
        cursor: { x: 100, y: 200, viewportId: "other-viewport" },
        isActive: true,
        lastSeen: now,
      },
    });
    useCollaborationStore.setState({ remoteUsers: users });

    render(<CursorOverlay viewportId="main" />);
    expect(screen.queryByTestId("remote-cursor-Alice")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PresenceBar
// ---------------------------------------------------------------------------

describe("PresenceBar", () => {
  it("renders the presence bar container", () => {
    render(<PresenceBar />);
    expect(screen.getByTestId("presence-bar")).toBeDefined();
  });

  it("renders local user when set", () => {
    useCollaborationStore.setState({ localUser: makeUser("local", "Me") });
    render(<PresenceBar />);
    expect(screen.getByTestId("presence-local-user")).toBeDefined();
  });

  it("renders remote users", () => {
    const users = new Map();
    users.set("r1", {
      user: makeUser("r1", "Alice"),
      presence: { userId: "r1", isActive: true, lastSeen: Date.now() },
    });
    users.set("r2", {
      user: makeUser("r2", "Bob"),
      presence: { userId: "r2", isActive: true, lastSeen: Date.now() },
    });
    useCollaborationStore.setState({ remoteUsers: users });

    render(<PresenceBar />);
    expect(screen.getByTestId("presence-user-r1")).toBeDefined();
    expect(screen.getByTestId("presence-user-r2")).toBeDefined();
  });

  it("shows overflow badge when more than MAX_VISIBLE users", () => {
    const users = new Map();
    for (let i = 0; i < 7; i++) {
      users.set(`r${i}`, {
        user: makeUser(`r${i}`, `User ${i}`),
        presence: { userId: `r${i}`, isActive: true, lastSeen: Date.now() },
      });
    }
    useCollaborationStore.setState({ remoteUsers: users });

    render(<PresenceBar />);
    expect(screen.getByTestId("presence-overflow")).toBeDefined();
    expect(screen.getByTestId("presence-overflow").textContent).toBe("+2");
  });

  it("marks inactive users with data-active=false", () => {
    const users = new Map();
    users.set("r1", {
      user: makeUser("r1", "Alice"),
      presence: {
        userId: "r1",
        isActive: false,
        lastSeen: Date.now() - 60_000,
      },
    });
    useCollaborationStore.setState({ remoteUsers: users });

    render(<PresenceBar />);
    expect(screen.getByTestId("presence-user-r1").getAttribute("data-active")).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// SyncStatusIndicator
// ---------------------------------------------------------------------------

describe("SyncStatusIndicator", () => {
  it("renders status indicator", () => {
    render(<SyncStatusIndicator />);
    expect(screen.getByTestId("sync-status")).toBeDefined();
  });

  it("shows Connected label when connected", () => {
    useCollaborationStore.setState({ syncStatus: SyncStatus.Connected });
    render(<SyncStatusIndicator />);
    expect(screen.getByTestId("sync-status-label").textContent).toBe("Connected");
    expect(screen.getByTestId("sync-status").getAttribute("data-status")).toBe("connected");
  });

  it("shows Syncing label when syncing", () => {
    useCollaborationStore.setState({ syncStatus: SyncStatus.Syncing });
    render(<SyncStatusIndicator />);
    expect(screen.getByTestId("sync-status-label").textContent).toBe("Syncing");
  });

  it("shows Disconnected label when disconnected", () => {
    useCollaborationStore.setState({ syncStatus: SyncStatus.Disconnected });
    render(<SyncStatusIndicator />);
    expect(screen.getByTestId("sync-status-label").textContent).toBe("Disconnected");
  });

  it("shows Error label on error", () => {
    useCollaborationStore.setState({ syncStatus: SyncStatus.Error });
    render(<SyncStatusIndicator />);
    expect(screen.getByTestId("sync-status-label").textContent).toBe("Error");
  });

  it("shows pending changes count", () => {
    useCollaborationStore.setState({
      syncStatus: SyncStatus.Syncing,
      pendingChanges: 3,
    });
    render(<SyncStatusIndicator />);
    expect(screen.getByTestId("sync-status-pending").textContent).toBe("3");
  });

  it("hides pending badge when count is zero", () => {
    useCollaborationStore.setState({
      syncStatus: SyncStatus.Connected,
      pendingChanges: 0,
    });
    render(<SyncStatusIndicator />);
    expect(screen.queryByTestId("sync-status-pending")).toBeNull();
  });

  it("calls onReconnect when clicked while disconnected", () => {
    useCollaborationStore.setState({ syncStatus: SyncStatus.Disconnected });
    const onReconnect = vi.fn();
    render(<SyncStatusIndicator onReconnect={onReconnect} />);

    fireEvent.click(screen.getByTestId("sync-status"));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("calls onReconnect when clicked while in error state", () => {
    useCollaborationStore.setState({ syncStatus: SyncStatus.Error });
    const onReconnect = vi.fn();
    render(<SyncStatusIndicator onReconnect={onReconnect} />);

    fireEvent.click(screen.getByTestId("sync-status"));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("does not call onReconnect when connected", () => {
    useCollaborationStore.setState({ syncStatus: SyncStatus.Connected });
    const onReconnect = vi.fn();
    render(<SyncStatusIndicator onReconnect={onReconnect} />);

    fireEvent.click(screen.getByTestId("sync-status"));
    expect(onReconnect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CollaborationProvider
// ---------------------------------------------------------------------------

describe("CollaborationProvider", () => {
  it("renders children", () => {
    render(
      <CollaborationProvider>
        <div data-testid="child">Hello</div>
      </CollaborationProvider>,
    );
    expect(screen.getByTestId("child")).toBeDefined();
  });

  it("sets local user and connected status on mount when user prop provided", () => {
    const user = makeUser("local-1", "Alice");
    render(
      <CollaborationProvider user={user}>
        <div />
      </CollaborationProvider>,
    );

    expect(useCollaborationStore.getState().localUser).toEqual(user);
    expect(useCollaborationStore.getState().syncStatus).toBe(SyncStatus.Connected);
  });

  it("provides useCollaboration hook to children", () => {
    let ctx: ReturnType<typeof useCollaboration> | null = null;

    function Child() {
      ctx = useCollaboration();
      return <div data-testid="hooked" />;
    }

    render(
      <CollaborationProvider user={makeUser("u1")}>
        <Child />
      </CollaborationProvider>,
    );

    expect(ctx).not.toBeNull();
    expect(typeof ctx!.broadcastCursor).toBe("function");
    expect(typeof ctx!.broadcastSelection).toBe("function");
    expect(typeof ctx!.reconnect).toBe("function");
    expect(typeof ctx!.handleMessage).toBe("function");
  });

  it("handleMessage processes user_joined", () => {
    let ctx: ReturnType<typeof useCollaboration> | null = null;

    function Child() {
      ctx = useCollaboration();
      return null;
    }

    render(
      <CollaborationProvider user={makeUser("u1")}>
        <Child />
      </CollaborationProvider>,
    );

    act(() => {
      ctx!.handleMessage({
        type: "user_joined",
        user: makeUser("r1", "Remote Alice"),
        timestamp: Date.now(),
      });
    });

    expect(useCollaborationStore.getState().remoteUsers.has("r1")).toBe(true);
  });

  it("handleMessage processes user_left", () => {
    let ctx: ReturnType<typeof useCollaboration> | null = null;

    function Child() {
      ctx = useCollaboration();
      return null;
    }

    render(
      <CollaborationProvider user={makeUser("u1")}>
        <Child />
      </CollaborationProvider>,
    );

    act(() => {
      ctx!.handleMessage({
        type: "user_joined",
        user: makeUser("r1", "Remote"),
        timestamp: Date.now(),
      });
    });
    expect(useCollaborationStore.getState().remoteUsers.size).toBe(1);

    act(() => {
      ctx!.handleMessage({
        type: "user_left",
        userId: "r1",
        timestamp: Date.now(),
      });
    });
    expect(useCollaborationStore.getState().remoteUsers.size).toBe(0);
  });

  it("handleMessage processes cursor_move", () => {
    let ctx: ReturnType<typeof useCollaboration> | null = null;

    function Child() {
      ctx = useCollaboration();
      return null;
    }

    render(
      <CollaborationProvider user={makeUser("u1")}>
        <Child />
      </CollaborationProvider>,
    );

    // First add the user
    act(() => {
      ctx!.handleMessage({
        type: "user_joined",
        user: makeUser("r1"),
        timestamp: Date.now(),
      });
    });

    // Then move cursor
    act(() => {
      ctx!.handleMessage({
        type: "cursor_move",
        userId: "r1",
        cursor: { x: 500, y: 600, viewportId: "main" },
        timestamp: Date.now(),
      });
    });

    const entry = useCollaborationStore.getState().remoteUsers.get("r1");
    expect(entry!.presence.cursor).toEqual({ x: 500, y: 600, viewportId: "main" });
  });

  it("handleMessage processes selection_change", () => {
    let ctx: ReturnType<typeof useCollaboration> | null = null;

    function Child() {
      ctx = useCollaboration();
      return null;
    }

    render(
      <CollaborationProvider user={makeUser("u1")}>
        <Child />
      </CollaborationProvider>,
    );

    act(() => {
      ctx!.handleMessage({
        type: "user_joined",
        user: makeUser("r1"),
        timestamp: Date.now(),
      });
      ctx!.handleMessage({
        type: "selection_change",
        userId: "r1",
        selection: ["node-x", "node-y"],
        timestamp: Date.now(),
      });
    });

    const entry = useCollaborationStore.getState().remoteUsers.get("r1");
    expect(entry!.presence.selection).toEqual(["node-x", "node-y"]);
  });

  it("handleMessage processes presence_update", () => {
    let ctx: ReturnType<typeof useCollaboration> | null = null;

    function Child() {
      ctx = useCollaboration();
      return null;
    }

    render(
      <CollaborationProvider user={makeUser("u1")}>
        <Child />
      </CollaborationProvider>,
    );

    act(() => {
      ctx!.handleMessage({
        type: "user_joined",
        user: makeUser("r1"),
        timestamp: Date.now(),
      });
      ctx!.handleMessage({
        type: "presence_update",
        userId: "r1",
        isActive: false,
        timestamp: Date.now(),
      });
    });

    const entry = useCollaborationStore.getState().remoteUsers.get("r1");
    expect(entry!.presence.isActive).toBe(false);
  });

  it("useCollaboration throws when used outside provider", () => {
    function Bad() {
      useCollaboration();
      return null;
    }

    expect(() => render(<Bad />)).toThrow(
      "useCollaboration must be used inside <CollaborationProvider>",
    );
  });
});
