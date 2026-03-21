/**
 * Shell — the top-level app layout component.
 *
 * Composes the toolbar, panel layout, command palette, and wires up
 * default keyboard shortcuts and commands.
 */

import React, { useCallback, useEffect } from "react";
import { useShellStore } from "./store.js";
import { getTheme } from "./themes.js";
import { registerDefaultPanels, defaultPanels } from "./panels.js";
import { useShortcut } from "./useShortcut.js";
import { useCommand } from "./useCommand.js";
import { Toolbar } from "./Toolbar.js";
import { Panel } from "./Panel.js";
import { CommandPalette } from "./CommandPalette.js";
import { useBridge } from "../bridge/index.js";

export interface ShellProps {
  children?: React.ReactNode;
  /** Map panel IDs to React elements rendered inside each Panel. */
  panelContent?: Record<string, React.ReactNode>;
}

/**
 * Initialize default panels once, outside of the render cycle.
 */
let panelsInitialized = false;
function ensurePanelsInitialized() {
  if (!panelsInitialized) {
    registerDefaultPanels();
    panelsInitialized = true;
  }
}

// Allow re-initialization in tests
export function resetPanelInit() {
  panelsInitialized = false;
}

export function Shell({ children, panelContent }: ShellProps) {
  const themeMode = useShellStore((s) => s.theme);
  const theme = getTheme(themeMode);
  const panels = useShellStore((s) => s.panels);
  const isPlaying = useShellStore((s) => s.isPlaying);
  const setIsPlaying = useShellStore((s) => s.setIsPlaying);
  const toggleCommandPalette = useShellStore((s) => s.toggleCommandPalette);
  const _bridge = useBridge();

  useEffect(() => {
    ensurePanelsInitialized();
  }, []);

  // ---------------------------------------------------------------------------
  // Register built-in commands
  // ---------------------------------------------------------------------------

  const handleTogglePlay = useCallback(() => {
    const next = !isPlaying;
    setIsPlaying(next);
    if (next) {
      _bridge.play().catch(console.error);
    } else {
      _bridge.stop().catch(console.error);
    }
  }, [isPlaying, setIsPlaying, _bridge]);

  const handleAddNode = useCallback(() => {
    _bridge.addNode("oscillator", { x: 400, y: 300 }).catch(console.error);
  }, [_bridge]);

  useCommand("transport.toggle", handleTogglePlay, {
    label: "Play / Stop",
    category: "Transport",
    shortcut: "space",
  });

  useCommand("node.add", handleAddNode, {
    label: "Add Node",
    category: "Edit",
    shortcut: "n",
  });

  useCommand("palette.toggle", toggleCommandPalette, {
    label: "Command Palette",
    category: "View",
    shortcut: "mod+k",
  });

  useCommand("theme.toggle", useShellStore.getState().toggleTheme, {
    label: "Toggle Theme",
    category: "View",
    shortcut: "mod+shift+t",
  });

  useCommand("file.new", () => {
    /* stub */
  }, { label: "New Patch", category: "File", shortcut: "mod+n" });

  useCommand("file.open", () => {
    _bridge.loadPatch("").catch(console.error);
  }, { label: "Open Patch", category: "File", shortcut: "mod+o" });

  useCommand("file.save", () => {
    _bridge.savePatch("").catch(console.error);
  }, { label: "Save Patch", category: "File", shortcut: "mod+s" });

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  useShortcut("mod+k", toggleCommandPalette);
  useShortcut("space", handleTogglePlay);
  useShortcut("n", handleAddNode);

  // ---------------------------------------------------------------------------
  // Derive visible panels by position
  // ---------------------------------------------------------------------------

  const leftPanels = Object.values(panels).filter(
    (p) => p.visible && findPanelConfig(p.id)?.position === "left",
  );
  const rightPanels = Object.values(panels).filter(
    (p) => p.visible && findPanelConfig(p.id)?.position === "right",
  );
  const bottomPanels = Object.values(panels).filter(
    (p) => p.visible && findPanelConfig(p.id)?.position === "bottom",
  );

  return (
    <div
      data-testid="shell"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: theme.colors.bg,
        color: theme.colors.text,
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 13,
      }}
    >
      <Toolbar />

      {/* Main area: left panels | center | right panels */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left panels */}
        {leftPanels.map((p) => {
          const config = findPanelConfig(p.id);
          return config ? (
            <Panel
              key={p.id}
              id={p.id}
              title={config.title}
              position="left"
              minSize={config.minSize}
            >
              {panelContent?.[p.id]}
            </Panel>
          ) : null;
        })}

        {/* Center column: canvas + bottom panels */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          {/* Center canvas area */}
          <div
            data-testid="center-area"
            style={{
              flex: 1,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {children ?? (
              <div style={{ color: theme.colors.textMuted, fontSize: 14 }}>
                Canvas area — drag nodes here
              </div>
            )}
          </div>

          {/* Bottom panels */}
          {bottomPanels.map((p) => {
            const config = findPanelConfig(p.id);
            return config ? (
              <Panel
                key={p.id}
                id={p.id}
                title={config.title}
                position="bottom"
                minSize={config.minSize}
              >
                {panelContent?.[p.id]}
              </Panel>
            ) : null;
          })}
        </div>

        {/* Right panels */}
        {rightPanels.map((p) => {
          const config = findPanelConfig(p.id);
          return config ? (
            <Panel
              key={p.id}
              id={p.id}
              title={config.title}
              position="right"
              minSize={config.minSize}
            >
              {panelContent?.[p.id]}
            </Panel>
          ) : null;
        })}
      </div>

      <CommandPalette />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findPanelConfig(id: string) {
  return defaultPanels.find((p) => p.id === id) ?? null;
}
