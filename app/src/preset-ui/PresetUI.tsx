/**
 * PresetUI Component
 *
 * Top-level component that combines the preset browser, manager, and
 * snapshot panel into a single cohesive preset management interface.
 */

import React from "react";
import * as Y from "yjs";
import { PresetBrowser } from "./PresetBrowser.js";
import { PresetManager } from "./PresetManager.js";
import { SnapshotPanel } from "./SnapshotPanel.js";

// ---------------------------------------------------------------------------
// PresetUI
// ---------------------------------------------------------------------------

export interface PresetUIProps {
  /** The Y.Doc that presets operate on. */
  doc: Y.Doc;
}

export const PresetUI: React.FC<PresetUIProps> = ({ doc }) => {
  return (
    <div className="preset-ui" data-testid="preset-ui">
      {/* Manager: current preset name, save/rename/delete */}
      <PresetManager doc={doc} />

      {/* Browser: searchable categorized list */}
      <PresetBrowser doc={doc} />

      {/* Snapshots: quick A/B comparison */}
      <SnapshotPanel doc={doc} />
    </div>
  );
};
