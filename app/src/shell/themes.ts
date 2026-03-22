/**
 * Theme definitions for Chord.
 */

import type { Theme, ThemeMode } from "./types.js";

export const darkTheme: Theme = {
  mode: "dark",
  colors: {
    bg: "#0a0a0a",
    bgPanel: "#1a1a2e",
    bgSurface: "#16213e",
    border: "#000000",
    text: "#ffffff",
    textMuted: "#94a3b8",
    accent: "#00ff41",
    accentHover: "#00cc33",
    danger: "#ff1493",
  },
};

export const lightTheme: Theme = {
  mode: "light",
  colors: {
    bg: "#f8fafc",
    bgPanel: "#ffffff",
    bgSurface: "#f1f5f9",
    border: "#cbd5e1",
    text: "#1e293b",
    textMuted: "#64748b",
    accent: "#3b82f6",
    accentHover: "#2563eb",
    danger: "#ef4444",
  },
};

export function getTheme(mode: ThemeMode): Theme {
  return mode === "dark" ? darkTheme : lightTheme;
}
