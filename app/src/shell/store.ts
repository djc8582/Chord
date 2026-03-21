/**
 * Shell Zustand store — global UI state.
 */

import { create } from "zustand";
import type { ShellState, PanelConfig, PanelState, Command } from "./types.js";

export const useShellStore = create<ShellState>((set, get) => ({
  // ---------------------------------------------------------------------------
  // Panels
  // ---------------------------------------------------------------------------
  panels: {},

  registerPanel(config: PanelConfig) {
    set((state) => ({
      panels: {
        ...state.panels,
        [config.id]: {
          id: config.id,
          visible: config.defaultVisible,
          size: config.defaultSize,
          collapsed: false,
        } satisfies PanelState,
      },
    }));
  },

  togglePanel(id) {
    set((state) => {
      const panel = state.panels[id];
      if (!panel) return state;
      return {
        panels: {
          ...state.panels,
          [id]: { ...panel, visible: !panel.visible },
        },
      };
    });
  },

  setPanelSize(id, size) {
    set((state) => {
      const panel = state.panels[id];
      if (!panel) return state;
      return {
        panels: {
          ...state.panels,
          [id]: { ...panel, size },
        },
      };
    });
  },

  collapsePanel(id) {
    set((state) => {
      const panel = state.panels[id];
      if (!panel) return state;
      return {
        panels: {
          ...state.panels,
          [id]: { ...panel, collapsed: true },
        },
      };
    });
  },

  expandPanel(id) {
    set((state) => {
      const panel = state.panels[id];
      if (!panel) return state;
      return {
        panels: {
          ...state.panels,
          [id]: { ...panel, collapsed: false },
        },
      };
    });
  },

  // ---------------------------------------------------------------------------
  // Command Palette
  // ---------------------------------------------------------------------------
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------
  commands: new Map<string, Command>(),

  registerCommand(cmd: Command) {
    set((state) => {
      const next = new Map(state.commands);
      next.set(cmd.id, cmd);
      return { commands: next };
    });
  },

  unregisterCommand(id: string) {
    set((state) => {
      const next = new Map(state.commands);
      next.delete(id);
      return { commands: next };
    });
  },

  executeCommand(id: string) {
    const cmd = get().commands.get(id);
    if (cmd) {
      cmd.execute();
    }
  },

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------
  theme: "dark",
  setTheme: (mode) => set({ theme: mode }),
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),

  // ---------------------------------------------------------------------------
  // Transport (UI mirror)
  // ---------------------------------------------------------------------------
  isPlaying: false,
  tempo: 120,
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setTempo: (bpm) => set({ tempo: bpm }),
}));
