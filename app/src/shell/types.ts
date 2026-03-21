/**
 * Shell module types — panel layout, commands, shortcuts, themes.
 */

// ---------------------------------------------------------------------------
// Panel System
// ---------------------------------------------------------------------------

/** Unique identifier for a panel slot. */
export type PanelId =
  | "canvas"
  | "inspector"
  | "browser"
  | "timeline"
  | "mixer"
  | "piano-roll"
  | "visualizer"
  | "preset-ui"
  | "audio-editor"
  | "notation"
  | string; // extensible

/** Where a panel can be docked. */
export type PanelPosition = "center" | "left" | "right" | "bottom" | "top";

/** Configuration for a registered panel. */
export interface PanelConfig {
  id: PanelId;
  title: string;
  position: PanelPosition;
  /** Initial size in pixels (width for left/right, height for top/bottom). */
  defaultSize: number;
  /** Minimum size in pixels. */
  minSize: number;
  /** Whether the panel is visible by default. */
  defaultVisible: boolean;
  /** Icon identifier (for tab bar). */
  icon?: string;
}

/** Runtime state of a single panel. */
export interface PanelState {
  id: PanelId;
  visible: boolean;
  size: number;
  collapsed: boolean;
}

// ---------------------------------------------------------------------------
// Command System
// ---------------------------------------------------------------------------

/** A command that can be triggered from the palette or keyboard shortcut. */
export interface Command {
  id: string;
  label: string;
  /** Category for grouping in the palette (e.g., "Transport", "Edit"). */
  category?: string;
  /** Default keyboard shortcut (e.g., "mod+k", "space"). */
  shortcut?: string;
  /** Handler function. */
  execute: () => void;
}

// ---------------------------------------------------------------------------
// Theme System
// ---------------------------------------------------------------------------

export type ThemeMode = "dark" | "light";

export interface ThemeColors {
  bg: string;
  bgPanel: string;
  bgSurface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  danger: string;
}

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
}

// ---------------------------------------------------------------------------
// Shell Store
// ---------------------------------------------------------------------------

/** The full shell UI state managed by Zustand. */
export interface ShellState {
  // Panels
  panels: Record<PanelId, PanelState>;
  registerPanel: (config: PanelConfig) => void;
  togglePanel: (id: PanelId) => void;
  setPanelSize: (id: PanelId, size: number) => void;
  collapsePanel: (id: PanelId) => void;
  expandPanel: (id: PanelId) => void;

  // Command palette
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;

  // Commands
  commands: Map<string, Command>;
  registerCommand: (cmd: Command) => void;
  unregisterCommand: (id: string) => void;
  executeCommand: (id: string) => void;

  // Theme
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;

  // Transport state (mirror of backend state for UI)
  isPlaying: boolean;
  tempo: number;
  setIsPlaying: (playing: boolean) => void;
  setTempo: (bpm: number) => void;
}
