/**
 * Tests for the command palette filtering logic.
 */

import { describe, it, expect } from "vitest";
import { filterCommands } from "./CommandPalette.js";
import type { Command } from "./types.js";

const commands: Command[] = [
  { id: "transport.play", label: "Play", category: "Transport", execute: () => {} },
  { id: "transport.stop", label: "Stop", category: "Transport", execute: () => {} },
  { id: "file.save", label: "Save Patch", category: "File", execute: () => {} },
  { id: "file.open", label: "Open Patch", category: "File", execute: () => {} },
  { id: "node.add", label: "Add Node", category: "Edit", execute: () => {} },
  { id: "theme.toggle", label: "Toggle Theme", category: "View", execute: () => {} },
];

describe("filterCommands", () => {
  it("returns all commands when query is empty", () => {
    expect(filterCommands(commands, "")).toHaveLength(commands.length);
  });

  it("filters by exact substring", () => {
    const result = filterCommands(commands, "play");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("transport.play");
  });

  it("filters case-insensitively", () => {
    const result = filterCommands(commands, "PLAY");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("transport.play");
  });

  it("performs fuzzy matching (characters in order)", () => {
    // "sv" matches "Save Patch" (s...a...v...e → s, v appear in order in "save")
    const result = filterCommands(commands, "sv");
    expect(result.some((c) => c.id === "file.save")).toBe(true);
  });

  it("returns empty array when nothing matches", () => {
    const result = filterCommands(commands, "zzzzz");
    expect(result).toHaveLength(0);
  });

  it("matches partial beginning", () => {
    const result = filterCommands(commands, "tog");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("theme.toggle");
  });

  it("returns multiple matches for broad queries", () => {
    // "p" matches Play, Stop, Save Patch, Open Patch (all contain 'p')
    const result = filterCommands(commands, "p");
    expect(result.length).toBeGreaterThan(1);
  });
});
