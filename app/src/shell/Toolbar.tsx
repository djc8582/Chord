/**
 * Top toolbar / menu bar.
 *
 * Contains transport controls, file operations, and quick actions.
 */

import React from "react";
import { useShellStore } from "./store.js";
import { getTheme } from "./themes.js";

export function Toolbar() {
  const themeMode = useShellStore((s) => s.theme);
  const theme = getTheme(themeMode);
  const isPlaying = useShellStore((s) => s.isPlaying);
  const tempo = useShellStore((s) => s.tempo);
  const executeCommand = useShellStore((s) => s.executeCommand);
  const toggleCommandPalette = useShellStore((s) => s.toggleCommandPalette);
  const toggleTheme = useShellStore((s) => s.toggleTheme);

  const buttonStyle: React.CSSProperties = {
    background: "none",
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.text,
    padding: "4px 10px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  return (
    <div
      data-testid="toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        height: 40,
        minHeight: 40,
        padding: "0 12px",
        gap: 8,
        background: theme.colors.bgPanel,
        borderBottom: `1px solid ${theme.colors.border}`,
        userSelect: "none",
      }}
    >
      {/* Logo / Brand */}
      <span
        style={{
          fontWeight: 700,
          fontSize: 14,
          color: theme.colors.accent,
          marginRight: 12,
        }}
      >
        Chord
      </span>

      {/* File operations */}
      <button
        style={buttonStyle}
        onClick={() => executeCommand("file.new")}
        title="New Patch"
      >
        New
      </button>
      <button
        style={buttonStyle}
        onClick={() => executeCommand("file.open")}
        title="Open Patch"
      >
        Open
      </button>
      <button
        style={buttonStyle}
        onClick={() => executeCommand("file.save")}
        title="Save Patch"
      >
        Save
      </button>

      {/* Separator */}
      <div
        style={{
          width: 1,
          height: 20,
          background: theme.colors.border,
          margin: "0 4px",
        }}
      />

      {/* Transport */}
      <button
        data-testid="transport-toggle"
        style={{
          ...buttonStyle,
          background: isPlaying ? theme.colors.accent : "transparent",
          color: isPlaying ? "#fff" : theme.colors.text,
          minWidth: 60,
          justifyContent: "center",
        }}
        onClick={() => executeCommand("transport.toggle")}
        title={isPlaying ? "Stop (Space)" : "Play (Space)"}
      >
        {isPlaying ? "Stop" : "Play"}
      </button>

      <span
        style={{
          fontSize: 12,
          color: theme.colors.textMuted,
          fontFamily: "monospace",
          minWidth: 60,
          textAlign: "center",
        }}
      >
        {tempo} BPM
      </span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Quick actions */}
      <button
        style={buttonStyle}
        onClick={toggleTheme}
        title="Toggle Theme"
      >
        {themeMode === "dark" ? "Light" : "Dark"}
      </button>

      <button
        data-testid="command-palette-trigger"
        style={buttonStyle}
        onClick={toggleCommandPalette}
        title="Command Palette (Cmd+K)"
      >
        Cmd+K
      </button>
    </div>
  );
}
