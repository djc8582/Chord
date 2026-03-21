/**
 * PresetManager Component
 *
 * Provides save/save-as/rename/delete controls for the currently loaded
 * preset. Shows the current preset name and a dirty indicator when the
 * document has unsaved changes.
 */

import React, { useCallback, useState } from "react";
import * as Y from "yjs";
import { usePresetStore } from "./store.js";

// ---------------------------------------------------------------------------
// PresetManager
// ---------------------------------------------------------------------------

export interface PresetManagerProps {
  /** The Y.Doc whose state will be saved. */
  doc: Y.Doc;
}

export const PresetManager: React.FC<PresetManagerProps> = ({ doc }) => {
  const {
    currentPreset,
    dirty,
    savePreset,
    saveCurrentPreset,
    savePresetAs,
    renamePreset,
    deletePreset,
  } = usePresetStore();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isSaveAs, setIsSaveAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");

  // Save: if a preset is loaded, overwrite it. Otherwise, prompt for name.
  const handleSave = useCallback(() => {
    if (currentPreset) {
      saveCurrentPreset(doc);
    } else {
      setIsSaveAs(true);
      setSaveAsName("New Preset");
    }
  }, [currentPreset, doc, saveCurrentPreset]);

  // Save-As: create a new preset
  const handleSaveAs = useCallback(() => {
    setIsSaveAs(true);
    setSaveAsName(currentPreset ? `${currentPreset.name} (copy)` : "New Preset");
  }, [currentPreset]);

  const handleSaveAsConfirm = useCallback(() => {
    if (saveAsName.trim()) {
      savePresetAs(doc, saveAsName.trim());
    }
    setIsSaveAs(false);
    setSaveAsName("");
  }, [doc, saveAsName, savePresetAs]);

  const handleSaveAsCancel = useCallback(() => {
    setIsSaveAs(false);
    setSaveAsName("");
  }, []);

  // Rename
  const handleStartRename = useCallback(() => {
    if (!currentPreset) return;
    setIsRenaming(true);
    setRenameValue(currentPreset.name);
  }, [currentPreset]);

  const handleRenameConfirm = useCallback(() => {
    if (currentPreset && renameValue.trim()) {
      renamePreset(currentPreset.id, renameValue.trim());
    }
    setIsRenaming(false);
    setRenameValue("");
  }, [currentPreset, renameValue, renamePreset]);

  const handleRenameCancel = useCallback(() => {
    setIsRenaming(false);
    setRenameValue("");
  }, []);

  // Delete
  const handleDelete = useCallback(() => {
    if (!currentPreset) return;
    deletePreset(currentPreset.id);
  }, [currentPreset, deletePreset]);

  return (
    <div className="preset-manager" data-testid="preset-manager">
      {/* Current preset name + dirty indicator */}
      <div className="preset-manager__header">
        <span className="preset-manager__name" data-testid="preset-manager-name">
          {currentPreset ? currentPreset.name : "(no preset)"}
        </span>
        {dirty && (
          <span
            className="preset-manager__dirty"
            data-testid="preset-manager-dirty"
            title="Unsaved changes"
          >
            *
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="preset-manager__actions">
        <button
          className="preset-manager__btn"
          onClick={handleSave}
          data-testid="preset-save-btn"
        >
          Save
        </button>
        <button
          className="preset-manager__btn"
          onClick={handleSaveAs}
          data-testid="preset-save-as-btn"
        >
          Save As
        </button>
        <button
          className="preset-manager__btn"
          onClick={handleStartRename}
          disabled={!currentPreset}
          data-testid="preset-rename-btn"
        >
          Rename
        </button>
        <button
          className="preset-manager__btn preset-manager__btn--danger"
          onClick={handleDelete}
          disabled={!currentPreset}
          data-testid="preset-delete-btn"
        >
          Delete
        </button>
      </div>

      {/* Rename dialog */}
      {isRenaming && (
        <div className="preset-manager__dialog" data-testid="preset-rename-dialog">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="preset-manager__dialog-input"
            autoFocus
          />
          <button onClick={handleRenameConfirm}>OK</button>
          <button onClick={handleRenameCancel}>Cancel</button>
        </div>
      )}

      {/* Save-As dialog */}
      {isSaveAs && (
        <div className="preset-manager__dialog" data-testid="preset-save-as-dialog">
          <input
            type="text"
            value={saveAsName}
            onChange={(e) => setSaveAsName(e.target.value)}
            className="preset-manager__dialog-input"
            autoFocus
          />
          <button onClick={handleSaveAsConfirm}>OK</button>
          <button onClick={handleSaveAsCancel}>Cancel</button>
        </div>
      )}
    </div>
  );
};
