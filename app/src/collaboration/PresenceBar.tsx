/**
 * PresenceBar
 *
 * Displays a horizontal bar showing who is currently online.
 * Each user gets a colored dot (or avatar) with a tooltip name.
 * When there are many users a count badge collapses the overflow.
 */

import { useState } from "react";
import { useCollaborationStore, ACTIVE_THRESHOLD_MS } from "./store.js";
import type { User, UserPresence } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VISIBLE_AVATARS = 5;

// ---------------------------------------------------------------------------
// Single user avatar dot
// ---------------------------------------------------------------------------

interface UserDotProps {
  user: User;
  presence: UserPresence;
  now: number;
  "data-testid"?: string;
}

export function UserDot({ user, presence, now, ...rest }: UserDotProps) {
  const [hovered, setHovered] = useState(false);
  const isActive = presence.isActive && now - presence.lastSeen < ACTIVE_THRESHOLD_MS;

  return (
    <div
      data-testid={rest["data-testid"] ?? `presence-user-${user.id}`}
      data-active={isActive}
      style={{
        position: "relative",
        width: 28,
        height: 28,
        borderRadius: "50%",
        backgroundColor: user.color,
        opacity: isActive ? 1 : 0.4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        fontSize: 12,
        color: "#fff",
        fontWeight: 600,
        fontFamily: "system-ui, sans-serif",
        border: isActive ? "2px solid #fff" : "2px solid transparent",
        transition: "opacity 0.3s, border-color 0.3s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={user.name}
          style={{ width: "100%", height: "100%", borderRadius: "50%" }}
        />
      ) : (
        user.name.charAt(0).toUpperCase()
      )}

      {/* Activity indicator */}
      {presence.selection && presence.selection.length > 0 && isActive && (
        <span
          data-testid={`presence-user-${user.id}-typing`}
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "#22c55e",
            border: "1px solid #fff",
          }}
        />
      )}

      {/* Tooltip */}
      {hovered && (
        <div
          data-testid={`presence-user-${user.id}-tooltip`}
          style={{
            position: "absolute",
            top: -28,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "2px 8px",
            borderRadius: 4,
            backgroundColor: "#1e293b",
            color: "#f1f5f9",
            fontSize: 11,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {user.name}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PresenceBar
// ---------------------------------------------------------------------------

export interface PresenceBarProps {
  "data-testid"?: string;
}

export function PresenceBar(props: PresenceBarProps) {
  const localUser = useCollaborationStore((s) => s.localUser);
  const remoteUsers = useCollaborationStore((s) => s.remoteUsers);
  const now = Date.now();

  const entries = Array.from(remoteUsers.values());
  const visible = entries.slice(0, MAX_VISIBLE_AVATARS);
  const overflowCount = Math.max(0, entries.length - MAX_VISIBLE_AVATARS);

  return (
    <div
      data-testid={props["data-testid"] ?? "presence-bar"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
      }}
    >
      {/* Local user (always first) */}
      {localUser && (
        <UserDot
          user={localUser}
          presence={{
            userId: localUser.id,
            isActive: true,
            lastSeen: now,
          }}
          now={now}
          data-testid="presence-local-user"
        />
      )}

      {/* Remote users */}
      {visible.map(({ user, presence }) => (
        <UserDot key={user.id} user={user} presence={presence} now={now} />
      ))}

      {/* Overflow badge */}
      {overflowCount > 0 && (
        <div
          data-testid="presence-overflow"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: "#475569",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#f1f5f9",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          +{overflowCount}
        </div>
      )}
    </div>
  );
}
