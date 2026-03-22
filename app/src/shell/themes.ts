/**
 * Theme definitions for Chord — Neobrutalist style.
 *
 * Inspired by playful, colorful neobrutalism: bright backgrounds,
 * white/cream cards, thick black borders, bold rounded corners.
 */

import type { Theme, ThemeMode } from "./types.js";

export const darkTheme: Theme = {
  mode: "dark",
  colors: {
    bg: "#7c3aed",           // Vibrant purple background
    bgPanel: "#fffef0",      // Cream/off-white panels
    bgSurface: "#ffffff",    // Pure white surfaces
    border: "#000000",       // Thick black borders
    text: "#000000",         // Black text on light panels
    textMuted: "#555555",    // Dark gray muted text
    accent: "#c8ff00",       // Lime green accent
    accentHover: "#a8e000",  // Darker lime hover
    danger: "#ff4757",       // Coral red
  },
};

export const lightTheme: Theme = {
  mode: "light",
  colors: {
    bg: "#c8ff00",           // Lime green background
    bgPanel: "#ffffff",      // White panels
    bgSurface: "#fffef0",    // Cream surfaces
    border: "#000000",       // Thick black borders
    text: "#000000",         // Black text
    textMuted: "#555555",    // Dark gray
    accent: "#7c3aed",       // Purple accent
    accentHover: "#6d28d9",  // Darker purple
    danger: "#ff4757",       // Coral red
  },
};

export function getTheme(mode: ThemeMode): Theme {
  return mode === "dark" ? darkTheme : lightTheme;
}
