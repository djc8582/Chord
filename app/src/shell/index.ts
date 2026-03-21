/**
 * @chord/app — Shell module
 *
 * The app shell: panel layout, command palette, keyboard shortcuts,
 * theme system, and global UI state.
 */

// Main component
export { Shell } from "./Shell.js";

// Hooks
export { useBridge } from "../bridge/index.js";
export { useCommand } from "./useCommand.js";
export { useShortcut } from "./useShortcut.js";

// Panel registration
export { registerPanel, defaultPanels, registerDefaultPanels } from "./panels.js";

// Store (for advanced usage / testing)
export { useShellStore } from "./store.js";

// Themes
export { getTheme, darkTheme, lightTheme } from "./themes.js";

// Types
export type {
  PanelId,
  PanelPosition,
  PanelConfig,
  PanelState,
  Command,
  ThemeMode,
  ThemeColors,
  Theme,
  ShellState,
} from "./types.js";
