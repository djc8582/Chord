/**
 * Default panel configurations and registration helper.
 */

import type { PanelConfig } from "./types.js";
import { useShellStore } from "./store.js";

/**
 * Register a panel in the shell store (imperative, for use outside components).
 */
export function registerPanel(config: PanelConfig): void {
  useShellStore.getState().registerPanel(config);
}

/**
 * Default panel configurations matching the Chord layout spec:
 *   - Canvas in center
 *   - Inspector on the right
 *   - Browser on the left
 *   - Timeline on the bottom
 */
export const defaultPanels: PanelConfig[] = [
  {
    id: "browser",
    title: "Browser",
    position: "left",
    defaultSize: 220,
    minSize: 150,
    defaultVisible: false,
    icon: "folder",
  },
  {
    id: "canvas",
    title: "Canvas",
    position: "center",
    defaultSize: 0, // center fills remaining space
    minSize: 200,
    defaultVisible: true,
    icon: "grid",
  },
  {
    id: "inspector",
    title: "Inspector",
    position: "right",
    defaultSize: 280,
    minSize: 180,
    defaultVisible: true,
    icon: "sliders",
  },
  {
    id: "timeline",
    title: "Timeline",
    position: "bottom",
    defaultSize: 200,
    minSize: 100,
    defaultVisible: true,
    icon: "clock",
  },
];

/**
 * Register all default panels. Called once at app startup.
 */
export function registerDefaultPanels(): void {
  for (const config of defaultPanels) {
    registerPanel(config);
  }
}
