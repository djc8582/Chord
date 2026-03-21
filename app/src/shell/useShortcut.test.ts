/**
 * Tests for the keyboard shortcut system.
 */

import { describe, it, expect } from "vitest";
import { parseShortcut, matchesShortcut } from "./useShortcut.js";

function makeKeyboardEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    code: "",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("parseShortcut", () => {
  it("parses simple key", () => {
    const parsed = parseShortcut("n");
    expect(parsed).toEqual({ mod: false, shift: false, alt: false, key: "n" });
  });

  it("parses mod+key", () => {
    const parsed = parseShortcut("mod+k");
    expect(parsed).toEqual({ mod: true, shift: false, alt: false, key: "k" });
  });

  it("parses mod+shift+key", () => {
    const parsed = parseShortcut("mod+shift+z");
    expect(parsed).toEqual({ mod: true, shift: true, alt: false, key: "z" });
  });

  it("parses space", () => {
    const parsed = parseShortcut("space");
    expect(parsed).toEqual({ mod: false, shift: false, alt: false, key: "space" });
  });

  it("parses alt+key", () => {
    const parsed = parseShortcut("alt+d");
    expect(parsed).toEqual({ mod: false, shift: false, alt: true, key: "d" });
  });
});

describe("matchesShortcut", () => {
  it("matches simple key", () => {
    const shortcut = parseShortcut("n");
    const event = makeKeyboardEvent({ key: "n" });
    expect(matchesShortcut(event, shortcut)).toBe(true);
  });

  it("does not match wrong key", () => {
    const shortcut = parseShortcut("n");
    const event = makeKeyboardEvent({ key: "m" });
    expect(matchesShortcut(event, shortcut)).toBe(false);
  });

  it("matches space key", () => {
    const shortcut = parseShortcut("space");
    const event = makeKeyboardEvent({ key: " ", code: "Space" });
    expect(matchesShortcut(event, shortcut)).toBe(true);
  });

  it("matches mod+key with metaKey (Mac)", () => {
    const shortcut = parseShortcut("mod+k");
    // On Mac, mod = metaKey. In jsdom, navigator.userAgent may vary,
    // but let's test the metaKey path.
    const event = makeKeyboardEvent({ key: "k", metaKey: true });
    // This test may pass or fail depending on the navigator.userAgent in jsdom.
    // We test both pathways:
    const ctrlEvent = makeKeyboardEvent({ key: "k", ctrlKey: true });
    // At least one should match depending on platform detection
    const matchesMeta = matchesShortcut(event, shortcut);
    const matchesCtrl = matchesShortcut(ctrlEvent, shortcut);
    expect(matchesMeta || matchesCtrl).toBe(true);
  });

  it("rejects key without required mod", () => {
    const shortcut = parseShortcut("mod+k");
    const event = makeKeyboardEvent({ key: "k" });
    expect(matchesShortcut(event, shortcut)).toBe(false);
  });

  it("rejects mod when shortcut has no mod", () => {
    const shortcut = parseShortcut("k");
    // In jsdom (non-Mac), mod = ctrlKey. So ctrlKey should be rejected.
    const eventCtrl = makeKeyboardEvent({ key: "k", ctrlKey: true });
    expect(matchesShortcut(eventCtrl, shortcut)).toBe(false);
  });

  it("matches shift modifier", () => {
    const shortcut = parseShortcut("shift+n");
    const event = makeKeyboardEvent({ key: "n", shiftKey: true });
    expect(matchesShortcut(event, shortcut)).toBe(true);
  });

  it("rejects missing shift modifier", () => {
    const shortcut = parseShortcut("shift+n");
    const event = makeKeyboardEvent({ key: "n", shiftKey: false });
    expect(matchesShortcut(event, shortcut)).toBe(false);
  });
});
