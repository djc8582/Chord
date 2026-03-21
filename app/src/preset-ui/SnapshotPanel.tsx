/**
 * SnapshotPanel Component
 *
 * Quick-save snapshots for A/B comparison. Shows a list of snapshots,
 * click to restore, with capture and delete controls.
 */

import React, { useCallback } from "react";
import * as Y from "yjs";
import { usePresetStore } from "./store.js";
import type { Snapshot } from "./types.js";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SnapshotItemProps {
  snapshot: Snapshot;
  isActive: boolean;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export const SnapshotItem: React.FC<SnapshotItemProps> = ({
  snapshot,
  isActive,
  onRestore,
  onDelete,
}) => {
  const timeStr = new Date(snapshot.timestamp).toLocaleTimeString();

  return (
    <div
      className={`snapshot-item ${isActive ? "snapshot-item--active" : ""}`}
      data-testid={`snapshot-item-${snapshot.id}`}
    >
      <button
        className="snapshot-item__name"
        onClick={() => onRestore(snapshot.id)}
        title={`Captured at ${timeStr}`}
      >
        {snapshot.name}
      </button>
      <span className="snapshot-item__time">{timeStr}</span>
      <button
        className="snapshot-item__delete"
        onClick={() => onDelete(snapshot.id)}
        aria-label={`Delete snapshot ${snapshot.name}`}
      >
        x
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SnapshotPanel
// ---------------------------------------------------------------------------

export interface SnapshotPanelProps {
  /** The Y.Doc to snapshot/restore. */
  doc: Y.Doc;
}

export const SnapshotPanel: React.FC<SnapshotPanelProps> = ({ doc }) => {
  const {
    snapshots,
    activeSnapshotId,
    captureSnapshot,
    restoreSnapshot,
    deleteSnapshot,
    renameSnapshot,
    clearSnapshots,
  } = usePresetStore();

  const handleCapture = useCallback(() => {
    captureSnapshot(doc);
  }, [doc, captureSnapshot]);

  const handleCaptureA = useCallback(() => {
    captureSnapshot(doc, "A");
  }, [doc, captureSnapshot]);

  const handleCaptureB = useCallback(() => {
    captureSnapshot(doc, "B");
  }, [doc, captureSnapshot]);

  const handleRestore = useCallback(
    (snapshotId: string) => {
      restoreSnapshot(snapshotId, doc);
    },
    [doc, restoreSnapshot],
  );

  const handleDelete = useCallback(
    (snapshotId: string) => {
      deleteSnapshot(snapshotId);
    },
    [deleteSnapshot],
  );

  const handleRename = useCallback(
    (snapshotId: string, name: string) => {
      renameSnapshot(snapshotId, name);
    },
    [renameSnapshot],
  );

  return (
    <div className="snapshot-panel" data-testid="snapshot-panel">
      <div className="snapshot-panel__header">
        <span className="snapshot-panel__title">Snapshots</span>
        <span className="snapshot-panel__count">({snapshots.length})</span>
      </div>

      {/* Quick A/B buttons */}
      <div className="snapshot-panel__quick-actions">
        <button
          className="snapshot-panel__btn"
          onClick={handleCaptureA}
          data-testid="snapshot-capture-a"
        >
          Capture A
        </button>
        <button
          className="snapshot-panel__btn"
          onClick={handleCaptureB}
          data-testid="snapshot-capture-b"
        >
          Capture B
        </button>
        <button
          className="snapshot-panel__btn"
          onClick={handleCapture}
          data-testid="snapshot-capture"
        >
          Capture
        </button>
      </div>

      {/* Snapshot list */}
      <div className="snapshot-panel__list">
        {snapshots.length === 0 ? (
          <div className="snapshot-panel__empty" data-testid="snapshot-panel-empty">
            No snapshots captured.
          </div>
        ) : (
          snapshots.map((snapshot) => (
            <SnapshotItem
              key={snapshot.id}
              snapshot={snapshot}
              isActive={snapshot.id === activeSnapshotId}
              onRestore={handleRestore}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))
        )}
      </div>

      {/* Clear all */}
      {snapshots.length > 0 && (
        <div className="snapshot-panel__footer">
          <button
            className="snapshot-panel__btn snapshot-panel__btn--danger"
            onClick={clearSnapshots}
            data-testid="snapshot-clear-all"
          >
            Clear All
          </button>
        </div>
      )}
    </div>
  );
};
