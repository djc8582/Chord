/**
 * PresetBrowser Component
 *
 * A searchable, categorized list of presets. Users can click to load a
 * preset, star to favorite, and filter by category or search query.
 */

import React, { useCallback, useMemo } from "react";
import * as Y from "yjs";
import { usePresetStore, filterPresets, filterPresetsByCategory, groupPresetsByCategory } from "./store.js";
import type { Preset, PresetCategory } from "./types.js";
import { PRESET_CATEGORIES } from "./types.js";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PresetItemProps {
  preset: Preset;
  isActive: boolean;
  onLoad: (presetId: string) => void;
  onToggleFavorite: (presetId: string) => void;
}

export const PresetItem: React.FC<PresetItemProps> = ({
  preset,
  isActive,
  onLoad,
  onToggleFavorite,
}) => {
  return (
    <div
      className={`preset-item ${isActive ? "preset-item--active" : ""}`}
      data-testid={`preset-item-${preset.id}`}
    >
      <button
        className="preset-item__name"
        onClick={() => onLoad(preset.id)}
        title={preset.description || preset.name}
      >
        {preset.name}
      </button>
      <button
        className="preset-item__favorite"
        onClick={() => onToggleFavorite(preset.id)}
        aria-label={preset.favorite ? "Unfavorite" : "Favorite"}
      >
        {preset.favorite ? "[*]" : "[ ]"}
      </button>
    </div>
  );
};

interface CategoryGroupProps {
  category: PresetCategory;
  presets: Preset[];
  currentPresetId: string | null;
  onLoad: (presetId: string) => void;
  onToggleFavorite: (presetId: string) => void;
}

export const CategoryGroup: React.FC<CategoryGroupProps> = ({
  category,
  presets,
  currentPresetId,
  onLoad,
  onToggleFavorite,
}) => {
  return (
    <div className="preset-category-group" data-testid={`category-${category.id}`}>
      <div className="preset-category-group__header">
        <span className="preset-category-group__icon">{category.icon}</span>
        <span className="preset-category-group__label">{category.label}</span>
        <span className="preset-category-group__count">({presets.length})</span>
      </div>
      <div className="preset-category-group__list">
        {presets.map((preset) => (
          <PresetItem
            key={preset.id}
            preset={preset}
            isActive={preset.id === currentPresetId}
            onLoad={onLoad}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PresetBrowser
// ---------------------------------------------------------------------------

export interface PresetBrowserProps {
  /** The Y.Doc to load presets into. */
  doc: Y.Doc;
}

export const PresetBrowser: React.FC<PresetBrowserProps> = ({ doc }) => {
  const {
    presets,
    currentPreset,
    searchQuery,
    selectedCategory,
    setSearchQuery,
    setSelectedCategory,
    clearSearch,
    loadPreset,
    toggleFavorite,
  } = usePresetStore();

  const handleLoad = useCallback(
    (presetId: string) => {
      loadPreset(presetId, doc);
    },
    [doc, loadPreset],
  );

  const handleToggleFavorite = useCallback(
    (presetId: string) => {
      toggleFavorite(presetId);
    },
    [toggleFavorite],
  );

  // Filtered + grouped presets
  const displayedGroups = useMemo(() => {
    let filtered = filterPresets(presets, searchQuery);
    filtered = filterPresetsByCategory(filtered, selectedCategory);
    return groupPresetsByCategory(filtered);
  }, [presets, searchQuery, selectedCategory]);

  const totalFiltered = useMemo(
    () => displayedGroups.reduce((sum, g) => sum + g.presets.length, 0),
    [displayedGroups],
  );

  return (
    <div className="preset-browser" data-testid="preset-browser">
      {/* Search bar */}
      <div className="preset-browser__search">
        <input
          type="text"
          placeholder="Search presets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="preset-browser__search-input"
          data-testid="preset-search-input"
        />
        {searchQuery && (
          <button
            className="preset-browser__search-clear"
            onClick={() => clearSearch()}
            aria-label="Clear search"
          >
            x
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div className="preset-browser__categories">
        <button
          className={`preset-browser__category-tab ${selectedCategory === null ? "preset-browser__category-tab--active" : ""}`}
          onClick={() => setSelectedCategory(null)}
        >
          All
        </button>
        {PRESET_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`preset-browser__category-tab ${selectedCategory === cat.id ? "preset-browser__category-tab--active" : ""}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Preset list */}
      <div className="preset-browser__list">
        {displayedGroups.length === 0 ? (
          <div className="preset-browser__empty" data-testid="preset-browser-empty">
            {presets.length === 0
              ? "No presets saved yet."
              : "No presets match your search."}
          </div>
        ) : (
          displayedGroups.map((group) => (
            <CategoryGroup
              key={group.category.id}
              category={group.category}
              presets={group.presets}
              currentPresetId={currentPreset?.id ?? null}
              onLoad={handleLoad}
              onToggleFavorite={handleToggleFavorite}
            />
          ))
        )}
      </div>

      {/* Status bar */}
      <div className="preset-browser__status">
        {totalFiltered} preset{totalFiltered !== 1 ? "s" : ""}
      </div>
    </div>
  );
};
