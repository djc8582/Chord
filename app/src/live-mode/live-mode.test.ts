/**
 * Live Mode Module Tests
 *
 * Tests covering:
 * - Store activation/deactivation
 * - Setlist CRUD (add, remove, reorder, update)
 * - Navigation (next, prev, goTo) with wraparound
 * - Navigation at boundaries (first/last entry)
 * - Empty setlist handling
 * - Panic sets isPanicking and clears
 * - Tap tempo calculates BPM from intervals
 * - Sidebar toggle
 * - calculateBpmFromTaps utility
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useLiveModeStore, calculateBpmFromTaps } from "./store.js";
import type { SetlistEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useLiveModeStore.setState({
    isActive: false,
    setlist: [],
    currentIndex: -1,
    isPanicking: false,
    bpm: 120,
    sidebarOpen: true,
    tapTimestamps: [],
  });
}

function makeEntry(id: string, name?: string): SetlistEntry {
  return {
    id,
    presetId: `preset-${id}`,
    name: name ?? `Entry ${id}`,
    color: "#3b82f6",
    notes: "",
  };
}

function setupSetlist(count: number): SetlistEntry[] {
  const entries = Array.from({ length: count }, (_, i) =>
    makeEntry(`e${i + 1}`, `Patch ${i + 1}`),
  );
  for (const entry of entries) {
    useLiveModeStore.getState().addEntry(entry);
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Activation / Deactivation
// ---------------------------------------------------------------------------

describe("activation", () => {
  beforeEach(resetStore);

  it("starts inactive by default", () => {
    const state = useLiveModeStore.getState();
    expect(state.isActive).toBe(false);
    expect(state.currentIndex).toBe(-1);
  });

  it("activates and sets currentIndex to 0 when setlist is non-empty", () => {
    setupSetlist(3);
    useLiveModeStore.getState().activate();

    const state = useLiveModeStore.getState();
    expect(state.isActive).toBe(true);
    expect(state.currentIndex).toBe(0);
  });

  it("activates with currentIndex -1 when setlist is empty", () => {
    useLiveModeStore.getState().activate();

    const state = useLiveModeStore.getState();
    expect(state.isActive).toBe(true);
    expect(state.currentIndex).toBe(-1);
  });

  it("deactivates live mode", () => {
    setupSetlist(2);
    useLiveModeStore.getState().activate();
    useLiveModeStore.getState().deactivate();

    expect(useLiveModeStore.getState().isActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Setlist CRUD
// ---------------------------------------------------------------------------

describe("setlist CRUD", () => {
  beforeEach(resetStore);

  it("adds entries to the setlist", () => {
    const e1 = makeEntry("a", "Ambient");
    const e2 = makeEntry("b", "Bass");
    useLiveModeStore.getState().addEntry(e1);
    useLiveModeStore.getState().addEntry(e2);

    const { setlist } = useLiveModeStore.getState();
    expect(setlist).toHaveLength(2);
    expect(setlist[0].name).toBe("Ambient");
    expect(setlist[1].name).toBe("Bass");
  });

  it("removes an entry by id", () => {
    setupSetlist(3);
    useLiveModeStore.getState().removeEntry("e2");

    const { setlist } = useLiveModeStore.getState();
    expect(setlist).toHaveLength(2);
    expect(setlist.map((e) => e.id)).toEqual(["e1", "e3"]);
  });

  it("removing a non-existent entry is a no-op", () => {
    setupSetlist(2);
    useLiveModeStore.getState().removeEntry("nonexistent");
    expect(useLiveModeStore.getState().setlist).toHaveLength(2);
  });

  it("reorders an entry from one index to another", () => {
    setupSetlist(4);
    // Move index 0 to index 2
    useLiveModeStore.getState().reorderEntry(0, 2);

    const names = useLiveModeStore.getState().setlist.map((e) => e.name);
    expect(names).toEqual(["Patch 2", "Patch 3", "Patch 1", "Patch 4"]);
  });

  it("reorderEntry with invalid indices is a no-op", () => {
    setupSetlist(3);
    const before = useLiveModeStore.getState().setlist.map((e) => e.id);
    useLiveModeStore.getState().reorderEntry(-1, 2);
    const after = useLiveModeStore.getState().setlist.map((e) => e.id);
    expect(after).toEqual(before);
  });

  it("updates an entry", () => {
    setupSetlist(2);
    useLiveModeStore.getState().updateEntry("e1", {
      name: "Updated Name",
      notes: "Play softly",
      color: "#ef4444",
    });

    const entry = useLiveModeStore.getState().setlist[0];
    expect(entry.name).toBe("Updated Name");
    expect(entry.notes).toBe("Play softly");
    expect(entry.color).toBe("#ef4444");
    // presetId should not change
    expect(entry.presetId).toBe("preset-e1");
  });

  it("updateEntry on non-existent id is a safe no-op", () => {
    setupSetlist(1);
    useLiveModeStore.getState().updateEntry("nonexistent", { name: "X" });
    expect(useLiveModeStore.getState().setlist[0].name).toBe("Patch 1");
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe("navigation", () => {
  beforeEach(resetStore);

  it("next() advances to next entry", () => {
    setupSetlist(3);
    useLiveModeStore.getState().activate();
    expect(useLiveModeStore.getState().currentIndex).toBe(0);

    useLiveModeStore.getState().next();
    expect(useLiveModeStore.getState().currentIndex).toBe(1);

    useLiveModeStore.getState().next();
    expect(useLiveModeStore.getState().currentIndex).toBe(2);
  });

  it("next() wraps from last to first", () => {
    setupSetlist(3);
    useLiveModeStore.getState().activate();
    useLiveModeStore.getState().goTo(2); // last entry

    useLiveModeStore.getState().next();
    expect(useLiveModeStore.getState().currentIndex).toBe(0);
  });

  it("prev() goes to previous entry", () => {
    setupSetlist(3);
    useLiveModeStore.getState().activate();
    useLiveModeStore.getState().goTo(2);

    useLiveModeStore.getState().prev();
    expect(useLiveModeStore.getState().currentIndex).toBe(1);

    useLiveModeStore.getState().prev();
    expect(useLiveModeStore.getState().currentIndex).toBe(0);
  });

  it("prev() wraps from first to last", () => {
    setupSetlist(3);
    useLiveModeStore.getState().activate();
    expect(useLiveModeStore.getState().currentIndex).toBe(0);

    useLiveModeStore.getState().prev();
    expect(useLiveModeStore.getState().currentIndex).toBe(2);
  });

  it("goTo() jumps to a specific index", () => {
    setupSetlist(5);
    useLiveModeStore.getState().activate();

    useLiveModeStore.getState().goTo(3);
    expect(useLiveModeStore.getState().currentIndex).toBe(3);
  });

  it("goTo() clamps to valid range", () => {
    setupSetlist(3);
    useLiveModeStore.getState().activate();

    useLiveModeStore.getState().goTo(100);
    expect(useLiveModeStore.getState().currentIndex).toBe(2);

    useLiveModeStore.getState().goTo(-5);
    expect(useLiveModeStore.getState().currentIndex).toBe(0);
  });

  it("navigation is no-op on empty setlist", () => {
    useLiveModeStore.getState().activate();

    useLiveModeStore.getState().next();
    expect(useLiveModeStore.getState().currentIndex).toBe(-1);

    useLiveModeStore.getState().prev();
    expect(useLiveModeStore.getState().currentIndex).toBe(-1);

    useLiveModeStore.getState().goTo(0);
    expect(useLiveModeStore.getState().currentIndex).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Navigation at boundaries
// ---------------------------------------------------------------------------

describe("navigation at boundaries", () => {
  beforeEach(resetStore);

  it("single-entry setlist: next stays on same entry (wraps to 0)", () => {
    setupSetlist(1);
    useLiveModeStore.getState().activate();
    expect(useLiveModeStore.getState().currentIndex).toBe(0);

    useLiveModeStore.getState().next();
    expect(useLiveModeStore.getState().currentIndex).toBe(0);
  });

  it("single-entry setlist: prev stays on same entry (wraps to 0)", () => {
    setupSetlist(1);
    useLiveModeStore.getState().activate();

    useLiveModeStore.getState().prev();
    expect(useLiveModeStore.getState().currentIndex).toBe(0);
  });

  it("two-entry setlist: next/prev toggle between entries", () => {
    setupSetlist(2);
    useLiveModeStore.getState().activate();

    useLiveModeStore.getState().next();
    expect(useLiveModeStore.getState().currentIndex).toBe(1);

    useLiveModeStore.getState().next();
    expect(useLiveModeStore.getState().currentIndex).toBe(0);

    useLiveModeStore.getState().prev();
    expect(useLiveModeStore.getState().currentIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Remove entry and currentIndex adjustment
// ---------------------------------------------------------------------------

describe("remove entry adjusts currentIndex", () => {
  beforeEach(resetStore);

  it("removing entry before current shifts index down", () => {
    setupSetlist(4);
    useLiveModeStore.getState().activate();
    useLiveModeStore.getState().goTo(2); // current = index 2

    useLiveModeStore.getState().removeEntry("e1"); // remove index 0

    expect(useLiveModeStore.getState().currentIndex).toBe(1);
    expect(useLiveModeStore.getState().setlist).toHaveLength(3);
  });

  it("removing the current entry clamps to valid index", () => {
    setupSetlist(3);
    useLiveModeStore.getState().activate();
    useLiveModeStore.getState().goTo(2); // last entry

    useLiveModeStore.getState().removeEntry("e3"); // remove current (last)

    const state = useLiveModeStore.getState();
    expect(state.setlist).toHaveLength(2);
    expect(state.currentIndex).toBe(1); // clamped to new last
  });

  it("removing last remaining entry sets index to -1", () => {
    setupSetlist(1);
    useLiveModeStore.getState().activate();

    useLiveModeStore.getState().removeEntry("e1");

    expect(useLiveModeStore.getState().setlist).toHaveLength(0);
    expect(useLiveModeStore.getState().currentIndex).toBe(-1);
  });

  it("removing entry after current does not change index", () => {
    setupSetlist(3);
    useLiveModeStore.getState().activate();
    useLiveModeStore.getState().goTo(0);

    useLiveModeStore.getState().removeEntry("e3"); // remove index 2

    expect(useLiveModeStore.getState().currentIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reorder entry and currentIndex tracking
// ---------------------------------------------------------------------------

describe("reorder entry tracks currentIndex", () => {
  beforeEach(resetStore);

  it("moving the current entry updates currentIndex", () => {
    setupSetlist(4);
    useLiveModeStore.getState().activate();
    // current is at 0
    useLiveModeStore.getState().reorderEntry(0, 3);
    expect(useLiveModeStore.getState().currentIndex).toBe(3);
  });

  it("moving an entry from before current to after shifts index down", () => {
    setupSetlist(4);
    useLiveModeStore.getState().activate();
    useLiveModeStore.getState().goTo(2); // current = 2

    useLiveModeStore.getState().reorderEntry(0, 3); // move 0 to 3
    expect(useLiveModeStore.getState().currentIndex).toBe(1);
  });

  it("moving an entry from after current to before shifts index up", () => {
    setupSetlist(4);
    useLiveModeStore.getState().activate();
    useLiveModeStore.getState().goTo(1); // current = 1

    useLiveModeStore.getState().reorderEntry(3, 0); // move 3 to 0
    expect(useLiveModeStore.getState().currentIndex).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Panic
// ---------------------------------------------------------------------------

describe("panic", () => {
  beforeEach(resetStore);

  it("panic sets isPanicking to true", () => {
    expect(useLiveModeStore.getState().isPanicking).toBe(false);

    useLiveModeStore.getState().panic();
    expect(useLiveModeStore.getState().isPanicking).toBe(true);
  });

  it("clearPanic resets isPanicking to false", () => {
    useLiveModeStore.getState().panic();
    expect(useLiveModeStore.getState().isPanicking).toBe(true);

    useLiveModeStore.getState().clearPanic();
    expect(useLiveModeStore.getState().isPanicking).toBe(false);
  });

  it("multiple panics in a row work correctly", () => {
    useLiveModeStore.getState().panic();
    useLiveModeStore.getState().clearPanic();
    useLiveModeStore.getState().panic();

    expect(useLiveModeStore.getState().isPanicking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tap Tempo
// ---------------------------------------------------------------------------

describe("tap tempo", () => {
  beforeEach(resetStore);

  it("single tap does not change BPM (need >= 2)", () => {
    useLiveModeStore.getState().tap(1000);
    // BPM stays at default 120
    expect(useLiveModeStore.getState().bpm).toBe(120);
  });

  it("two taps 500ms apart = 120 BPM", () => {
    useLiveModeStore.getState().tap(1000);
    useLiveModeStore.getState().tap(1500);

    expect(useLiveModeStore.getState().bpm).toBe(120);
  });

  it("three taps 400ms apart = 150 BPM", () => {
    useLiveModeStore.getState().tap(1000);
    useLiveModeStore.getState().tap(1400);
    useLiveModeStore.getState().tap(1800);

    expect(useLiveModeStore.getState().bpm).toBe(150);
  });

  it("taps 1000ms apart = 60 BPM", () => {
    useLiveModeStore.getState().tap(1000);
    useLiveModeStore.getState().tap(2000);
    useLiveModeStore.getState().tap(3000);

    expect(useLiveModeStore.getState().bpm).toBe(60);
  });

  it("resetTaps clears timestamps", () => {
    useLiveModeStore.getState().tap(1000);
    useLiveModeStore.getState().tap(1500);
    useLiveModeStore.getState().resetTaps();

    expect(useLiveModeStore.getState().tapTimestamps).toEqual([]);
  });

  it("old taps (> 3s from latest) are discarded", () => {
    useLiveModeStore.getState().tap(1000);
    useLiveModeStore.getState().tap(1500);
    // Wait more than 3 seconds
    useLiveModeStore.getState().tap(5000);

    // Only the last two taps should matter: 1500 is > 3s before 5000 so discarded
    // Actually 5000 - 1500 = 3500 > 3000, so only the 5000 tap remains
    // With one tap, no BPM change from this last set
    const { tapTimestamps } = useLiveModeStore.getState();
    expect(tapTimestamps).toHaveLength(1); // only the 5000 tap remains
  });
});

// ---------------------------------------------------------------------------
// calculateBpmFromTaps utility
// ---------------------------------------------------------------------------

describe("calculateBpmFromTaps", () => {
  it("returns null for empty array", () => {
    expect(calculateBpmFromTaps([])).toBeNull();
  });

  it("returns null for single tap", () => {
    expect(calculateBpmFromTaps([1000])).toBeNull();
  });

  it("calculates 120 BPM for 500ms intervals", () => {
    expect(calculateBpmFromTaps([1000, 1500, 2000])).toBe(120);
  });

  it("calculates 60 BPM for 1000ms intervals", () => {
    expect(calculateBpmFromTaps([1000, 2000, 3000])).toBe(60);
  });

  it("calculates 150 BPM for 400ms intervals", () => {
    expect(calculateBpmFromTaps([0, 400, 800])).toBe(150);
  });

  it("clamps to minimum 20 BPM", () => {
    // 10000ms interval = 6 BPM, should clamp to 20
    expect(calculateBpmFromTaps([0, 10000])).toBe(20);
  });

  it("clamps to maximum 300 BPM", () => {
    // 100ms interval = 600 BPM, should clamp to 300
    expect(calculateBpmFromTaps([0, 100])).toBe(300);
  });

  it("uses last 8 taps only", () => {
    // 10 taps at 500ms intervals
    const taps = Array.from({ length: 10 }, (_, i) => i * 500);
    const result = calculateBpmFromTaps(taps);
    // Last 8 taps: 1000..4500, all 500ms apart = 120 BPM
    expect(result).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

describe("sidebar", () => {
  beforeEach(resetStore);

  it("starts open by default", () => {
    expect(useLiveModeStore.getState().sidebarOpen).toBe(true);
  });

  it("toggleSidebar flips the state", () => {
    useLiveModeStore.getState().toggleSidebar();
    expect(useLiveModeStore.getState().sidebarOpen).toBe(false);

    useLiveModeStore.getState().toggleSidebar();
    expect(useLiveModeStore.getState().sidebarOpen).toBe(true);
  });

  it("setSidebarOpen sets explicitly", () => {
    useLiveModeStore.getState().setSidebarOpen(false);
    expect(useLiveModeStore.getState().sidebarOpen).toBe(false);

    useLiveModeStore.getState().setSidebarOpen(true);
    expect(useLiveModeStore.getState().sidebarOpen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty setlist edge cases
// ---------------------------------------------------------------------------

describe("empty setlist handling", () => {
  beforeEach(resetStore);

  it("currentIndex is -1 with no entries", () => {
    expect(useLiveModeStore.getState().currentIndex).toBe(-1);
  });

  it("activating with empty setlist keeps index at -1", () => {
    useLiveModeStore.getState().activate();
    expect(useLiveModeStore.getState().currentIndex).toBe(-1);
  });

  it("adding first entry during active mode selects it", () => {
    useLiveModeStore.getState().activate();
    expect(useLiveModeStore.getState().currentIndex).toBe(-1);

    useLiveModeStore.getState().addEntry(makeEntry("first", "First"));
    expect(useLiveModeStore.getState().currentIndex).toBe(0);
  });

  it("adding entry when not active does not auto-select", () => {
    useLiveModeStore.getState().addEntry(makeEntry("first", "First"));
    expect(useLiveModeStore.getState().currentIndex).toBe(-1);
  });

  it("removing all entries returns index to -1", () => {
    setupSetlist(2);
    useLiveModeStore.getState().activate();

    useLiveModeStore.getState().removeEntry("e1");
    useLiveModeStore.getState().removeEntry("e2");

    expect(useLiveModeStore.getState().setlist).toHaveLength(0);
    expect(useLiveModeStore.getState().currentIndex).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Default BPM
// ---------------------------------------------------------------------------

describe("default state", () => {
  beforeEach(resetStore);

  it("default BPM is 120", () => {
    expect(useLiveModeStore.getState().bpm).toBe(120);
  });

  it("default isPanicking is false", () => {
    expect(useLiveModeStore.getState().isPanicking).toBe(false);
  });
});
