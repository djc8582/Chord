/**
 * SyncStatusIndicator
 *
 * Displays the current connection / sync status as a colored dot with
 * a label. Shows pending changes count when syncing. Offers a
 * reconnect action when disconnected or errored.
 */

import { useCollaborationStore } from "./store.js";
import { SyncStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Status → visual mapping
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  SyncStatus,
  { color: string; label: string; clickable: boolean }
> = {
  [SyncStatus.Connected]: { color: "#22c55e", label: "Connected", clickable: false },
  [SyncStatus.Syncing]: { color: "#eab308", label: "Syncing", clickable: false },
  [SyncStatus.Connecting]: { color: "#eab308", label: "Connecting", clickable: false },
  [SyncStatus.Disconnected]: { color: "#ef4444", label: "Disconnected", clickable: true },
  [SyncStatus.Error]: { color: "#ef4444", label: "Error", clickable: true },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SyncStatusIndicatorProps {
  onReconnect?: () => void;
  "data-testid"?: string;
}

export function SyncStatusIndicator({ onReconnect, ...rest }: SyncStatusIndicatorProps) {
  const syncStatus = useCollaborationStore((s) => s.syncStatus);
  const pendingChanges = useCollaborationStore((s) => s.pendingChanges);

  const config = STATUS_CONFIG[syncStatus];
  const isClickable = config.clickable && onReconnect != null;

  return (
    <button
      data-testid={rest["data-testid"] ?? "sync-status"}
      data-status={syncStatus}
      onClick={isClickable ? onReconnect : undefined}
      disabled={!isClickable}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        border: "none",
        borderRadius: 6,
        backgroundColor: "transparent",
        cursor: isClickable ? "pointer" : "default",
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        color: "#cbd5e1",
      }}
    >
      {/* Status dot */}
      <span
        data-testid="sync-status-dot"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: config.color,
          flexShrink: 0,
        }}
      />

      {/* Label */}
      <span data-testid="sync-status-label">{config.label}</span>

      {/* Pending changes badge */}
      {pendingChanges > 0 && (
        <span
          data-testid="sync-status-pending"
          style={{
            marginLeft: 2,
            padding: "1px 5px",
            borderRadius: 8,
            backgroundColor: "#334155",
            color: "#e2e8f0",
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          {pendingChanges}
        </span>
      )}
    </button>
  );
}
