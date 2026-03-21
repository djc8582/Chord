/**
 * Tests for the theme system.
 */

import { describe, it, expect } from "vitest";
import { getTheme, darkTheme, lightTheme } from "./themes.js";

describe("themes", () => {
  it("darkTheme has mode dark", () => {
    expect(darkTheme.mode).toBe("dark");
  });

  it("lightTheme has mode light", () => {
    expect(lightTheme.mode).toBe("light");
  });

  it("dark theme has correct bg color", () => {
    expect(darkTheme.colors.bg).toBe("#0f172a");
  });

  it("getTheme returns correct theme for mode", () => {
    expect(getTheme("dark")).toBe(darkTheme);
    expect(getTheme("light")).toBe(lightTheme);
  });

  it("themes have all required color properties", () => {
    const requiredKeys = [
      "bg",
      "bgPanel",
      "bgSurface",
      "border",
      "text",
      "textMuted",
      "accent",
      "accentHover",
      "danger",
    ] as const;

    for (const key of requiredKeys) {
      expect(typeof darkTheme.colors[key]).toBe("string");
      expect(typeof lightTheme.colors[key]).toBe("string");
      expect(darkTheme.colors[key].length).toBeGreaterThan(0);
      expect(lightTheme.colors[key].length).toBeGreaterThan(0);
    }
  });

  it("dark and light themes have different bg colors", () => {
    expect(darkTheme.colors.bg).not.toBe(lightTheme.colors.bg);
  });
});
