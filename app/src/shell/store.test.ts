/**
 * Tests for the shell Zustand store — panel management, commands, theme.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useShellStore } from "./store.js";

/**
 * Reset the store between tests to avoid cross-test contamination.
 */
function resetStore() {
  useShellStore.setState({
    panels: {},
    commandPaletteOpen: false,
    commands: new Map(),
    theme: "dark",
    isPlaying: false,
    tempo: 120,
  });
}

describe("ShellStore", () => {
  beforeEach(resetStore);

  // -----------------------------------------------------------------------
  // Panels
  // -----------------------------------------------------------------------

  describe("panels", () => {
    it("registerPanel adds a panel to state", () => {
      useShellStore.getState().registerPanel({
        id: "test",
        title: "Test Panel",
        position: "right",
        defaultSize: 300,
        minSize: 100,
        defaultVisible: true,
      });

      const panel = useShellStore.getState().panels["test"];
      expect(panel).toBeDefined();
      expect(panel!.visible).toBe(true);
      expect(panel!.size).toBe(300);
      expect(panel!.collapsed).toBe(false);
    });

    it("togglePanel flips visibility", () => {
      const state = useShellStore.getState();
      state.registerPanel({
        id: "tp",
        title: "Toggle",
        position: "left",
        defaultSize: 200,
        minSize: 100,
        defaultVisible: true,
      });

      state.togglePanel("tp");
      expect(useShellStore.getState().panels["tp"]!.visible).toBe(false);

      useShellStore.getState().togglePanel("tp");
      expect(useShellStore.getState().panels["tp"]!.visible).toBe(true);
    });

    it("setPanelSize updates the size", () => {
      const state = useShellStore.getState();
      state.registerPanel({
        id: "sp",
        title: "Size",
        position: "bottom",
        defaultSize: 200,
        minSize: 50,
        defaultVisible: true,
      });

      state.setPanelSize("sp", 350);
      expect(useShellStore.getState().panels["sp"]!.size).toBe(350);
    });

    it("collapsePanel / expandPanel update collapsed flag", () => {
      const state = useShellStore.getState();
      state.registerPanel({
        id: "cp",
        title: "Collapse",
        position: "right",
        defaultSize: 250,
        minSize: 100,
        defaultVisible: true,
      });

      state.collapsePanel("cp");
      expect(useShellStore.getState().panels["cp"]!.collapsed).toBe(true);

      useShellStore.getState().expandPanel("cp");
      expect(useShellStore.getState().panels["cp"]!.collapsed).toBe(false);
    });

    it("operations on non-existent panels are no-ops", () => {
      const before = useShellStore.getState().panels;
      useShellStore.getState().togglePanel("nope");
      useShellStore.getState().setPanelSize("nope", 999);
      useShellStore.getState().collapsePanel("nope");
      useShellStore.getState().expandPanel("nope");
      expect(useShellStore.getState().panels).toEqual(before);
    });
  });

  // -----------------------------------------------------------------------
  // Command Palette
  // -----------------------------------------------------------------------

  describe("command palette", () => {
    it("starts closed", () => {
      expect(useShellStore.getState().commandPaletteOpen).toBe(false);
    });

    it("open / close / toggle work", () => {
      useShellStore.getState().openCommandPalette();
      expect(useShellStore.getState().commandPaletteOpen).toBe(true);

      useShellStore.getState().closeCommandPalette();
      expect(useShellStore.getState().commandPaletteOpen).toBe(false);

      useShellStore.getState().toggleCommandPalette();
      expect(useShellStore.getState().commandPaletteOpen).toBe(true);

      useShellStore.getState().toggleCommandPalette();
      expect(useShellStore.getState().commandPaletteOpen).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Commands
  // -----------------------------------------------------------------------

  describe("commands", () => {
    it("registerCommand adds to the map", () => {
      let called = false;
      useShellStore.getState().registerCommand({
        id: "test.cmd",
        label: "Test Command",
        execute: () => {
          called = true;
        },
      });

      expect(useShellStore.getState().commands.get("test.cmd")).toBeDefined();
      expect(useShellStore.getState().commands.get("test.cmd")!.label).toBe("Test Command");
    });

    it("executeCommand calls the handler", () => {
      let called = false;
      useShellStore.getState().registerCommand({
        id: "exec.test",
        label: "Execute Me",
        execute: () => {
          called = true;
        },
      });

      useShellStore.getState().executeCommand("exec.test");
      expect(called).toBe(true);
    });

    it("executeCommand on unknown ID is a no-op", () => {
      // Should not throw
      useShellStore.getState().executeCommand("nonexistent");
    });

    it("unregisterCommand removes the command", () => {
      useShellStore.getState().registerCommand({
        id: "remove.me",
        label: "Remove",
        execute: () => {},
      });
      expect(useShellStore.getState().commands.has("remove.me")).toBe(true);

      useShellStore.getState().unregisterCommand("remove.me");
      expect(useShellStore.getState().commands.has("remove.me")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Theme
  // -----------------------------------------------------------------------

  describe("theme", () => {
    it("defaults to dark", () => {
      expect(useShellStore.getState().theme).toBe("dark");
    });

    it("setTheme changes the theme", () => {
      useShellStore.getState().setTheme("light");
      expect(useShellStore.getState().theme).toBe("light");
    });

    it("toggleTheme switches between dark and light", () => {
      useShellStore.getState().toggleTheme();
      expect(useShellStore.getState().theme).toBe("light");

      useShellStore.getState().toggleTheme();
      expect(useShellStore.getState().theme).toBe("dark");
    });
  });

  // -----------------------------------------------------------------------
  // Transport
  // -----------------------------------------------------------------------

  describe("transport", () => {
    it("isPlaying defaults to false", () => {
      expect(useShellStore.getState().isPlaying).toBe(false);
    });

    it("setIsPlaying updates state", () => {
      useShellStore.getState().setIsPlaying(true);
      expect(useShellStore.getState().isPlaying).toBe(true);
    });

    it("tempo defaults to 120", () => {
      expect(useShellStore.getState().tempo).toBe(120);
    });

    it("setTempo updates tempo", () => {
      useShellStore.getState().setTempo(140);
      expect(useShellStore.getState().tempo).toBe(140);
    });
  });
});
