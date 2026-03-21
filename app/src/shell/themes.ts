/**
 * Theme definitions for Chord.
 */

import type { Theme, ThemeMode } from "./types.js";

export const darkTheme: Theme = {
  mode: "dark",
  colors: {
    bg: "#0f172a",
    bgPanel: "#1e293b",
    bgSurface: "#334155",
    border: "#475569",
    text: "#e2e8f0",
    textMuted: "#94a3b8",
    accent: "#3b82f6",
    accentHover: "#2563eb",
    danger: "#ef4444",
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
