/**
 * Command Palette (Cmd+K / Ctrl+K)
 *
 * Searchable list of all registered commands. Filters in real-time,
 * navigable with keyboard (Up/Down/Enter/Escape).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShellStore } from "./store.js";
import { getTheme } from "./themes.js";
import type { Command } from "./types.js";

/**
 * Simple fuzzy-ish filter: checks if all query characters appear in order
 * in the target string (case-insensitive).
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query) return commands;
  const q = query.toLowerCase();
  return commands.filter((cmd) => {
    const label = cmd.label.toLowerCase();
    let qi = 0;
    for (let li = 0; li < label.length && qi < q.length; li++) {
      if (label[li] === q[qi]) qi++;
    }
    return qi === q.length;
  });
}

export function CommandPalette() {
  const open = useShellStore((s) => s.commandPaletteOpen);
  const close = useShellStore((s) => s.closeCommandPalette);
  const commandsMap = useShellStore((s) => s.commands);
  const themeMode = useShellStore((s) => s.theme);
  const theme = getTheme(themeMode);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allCommands = useMemo(() => Array.from(commandsMap.values()), [commandsMap]);
  const filtered = useMemo(() => filterCommands(allCommands, query), [allCommands, query]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus the input on next tick (after render)
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Clamp selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const executeSelected = useCallback(() => {
    const cmd = filtered[selectedIndex];
    if (cmd) {
      close();
      // Execute after closing so the palette doesn't flash
      requestAnimationFrame(() => cmd.execute());
    }
  }, [filtered, selectedIndex, close]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          executeSelected();
          break;
        case "Escape":
          e.preventDefault();
          close();
          break;
      }
    },
    [filtered.length, executeSelected, close],
  );

  if (!open) return null;

  return (
    <div
      data-testid="command-palette-overlay"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 120,
        zIndex: 9999,
      }}
    >
      <div
        data-testid="command-palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          width: 520,
          maxHeight: 400,
          background: theme.colors.bgPanel,
          border: "3px solid #000",
          borderRadius: 0,
          overflow: "hidden",
          boxShadow: "4px 4px 0px #000",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search input */}
        <input
          ref={inputRef}
          data-testid="command-palette-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command..."
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "transparent",
            border: "none",
            borderBottom: "3px solid #000",
            color: theme.colors.text,
            fontSize: 14,
            fontWeight: 700,
            fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
            outline: "none",
          }}
        />

        {/* Results list */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 && (
            <div
              style={{
                padding: "16px",
                textAlign: "center",
                color: theme.colors.textMuted,
                fontSize: 13,
              }}
            >
              No matching commands
            </div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              data-testid={`command-item-${cmd.id}`}
              onClick={() => {
                close();
                requestAnimationFrame(() => cmd.execute());
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 16px",
                cursor: "pointer",
                background: i === selectedIndex ? theme.colors.bgSurface : "transparent",
                color: i === selectedIndex ? "#00ff41" : theme.colors.text,
                fontSize: 13,
                fontWeight: 700,
                borderLeft: i === selectedIndex ? "3px solid #00ff41" : "3px solid transparent",
              }}
            >
              <span>
                {cmd.category && (
                  <span style={{ color: theme.colors.textMuted, marginRight: 8 }}>
                    {cmd.category} &rsaquo;
                  </span>
                )}
                {cmd.label}
              </span>
              {cmd.shortcut && (
                <span
                  style={{
                    fontSize: 11,
                    color: theme.colors.textMuted,
                    background: theme.colors.bgSurface,
                    padding: "2px 6px",
                    borderRadius: 0,
                    border: "2px solid #000",
                    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
                    fontWeight: 700,
                  }}
                >
                  {cmd.shortcut}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
