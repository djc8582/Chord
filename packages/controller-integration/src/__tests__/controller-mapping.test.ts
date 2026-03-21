import { describe, it, expect, beforeEach } from "vitest";
import {
  scaleValue,
  applyMapping,
  validateMapping,
  createMapping,
  resetMappingIdCounter,
} from "../controller-mapping.js";
import type { ControllerMapping } from "../controller-mapping.js";

beforeEach(() => {
  resetMappingIdCounter();
});

describe("createMapping", () => {
  it("creates a mapping with defaults", () => {
    const m = createMapping({
      midiChannel: 0,
      midiCC: 1,
      targetNodeId: "node-1",
      targetParam: "frequency",
    });
    expect(m.id).toBe("mapping-1");
    expect(m.midiChannel).toBe(0);
    expect(m.midiCC).toBe(1);
    expect(m.targetNodeId).toBe("node-1");
    expect(m.targetParam).toBe("frequency");
    expect(m.min).toBe(0);
    expect(m.max).toBe(1);
    expect(m.curve).toBe("linear");
  });

  it("creates a mapping with custom values", () => {
    const m = createMapping({
      id: "custom-id",
      midiChannel: 5,
      midiCC: 74,
      targetNodeId: "node-2",
      targetParam: "cutoff",
      min: 20,
      max: 20000,
      curve: "logarithmic",
    });
    expect(m.id).toBe("custom-id");
    expect(m.min).toBe(20);
    expect(m.max).toBe(20000);
    expect(m.curve).toBe("logarithmic");
  });

  it("generates sequential IDs", () => {
    const m1 = createMapping({ midiChannel: 0, midiCC: 1, targetNodeId: "n", targetParam: "p" });
    const m2 = createMapping({ midiChannel: 0, midiCC: 2, targetNodeId: "n", targetParam: "q" });
    expect(m1.id).toBe("mapping-1");
    expect(m2.id).toBe("mapping-2");
  });
});

describe("validateMapping", () => {
  const valid: ControllerMapping = {
    id: "m1",
    midiChannel: 0,
    midiCC: 1,
    targetNodeId: "node-1",
    targetParam: "frequency",
    min: 0,
    max: 1,
    curve: "linear",
  };

  it("returns null for valid mapping", () => {
    expect(validateMapping(valid)).toBeNull();
  });

  it("rejects empty id", () => {
    expect(validateMapping({ ...valid, id: "" })).toContain("id");
  });

  it("rejects invalid midiChannel", () => {
    expect(validateMapping({ ...valid, midiChannel: -1 })).toContain("midiChannel");
    expect(validateMapping({ ...valid, midiChannel: 16 })).toContain("midiChannel");
    expect(validateMapping({ ...valid, midiChannel: 1.5 })).toContain("midiChannel");
  });

  it("rejects invalid midiCC", () => {
    expect(validateMapping({ ...valid, midiCC: -1 })).toContain("midiCC");
    expect(validateMapping({ ...valid, midiCC: 128 })).toContain("midiCC");
  });

  it("rejects empty targetNodeId", () => {
    expect(validateMapping({ ...valid, targetNodeId: "" })).toContain("targetNodeId");
  });

  it("rejects empty targetParam", () => {
    expect(validateMapping({ ...valid, targetParam: "" })).toContain("targetParam");
  });

  it("rejects min >= max", () => {
    expect(validateMapping({ ...valid, min: 1, max: 1 })).toContain("min");
    expect(validateMapping({ ...valid, min: 2, max: 1 })).toContain("min");
  });

  it("rejects non-finite min or max", () => {
    expect(validateMapping({ ...valid, min: Infinity })).toContain("min");
    expect(validateMapping({ ...valid, max: NaN })).toContain("max");
  });

  it("rejects invalid curve", () => {
    expect(validateMapping({ ...valid, curve: "quadratic" as never })).toContain("curve");
  });
});

describe("scaleValue", () => {
  describe("linear", () => {
    it("maps 0 to min", () => {
      expect(scaleValue(0, 0, 1, "linear")).toBeCloseTo(0, 5);
    });

    it("maps 127 to max", () => {
      expect(scaleValue(127, 0, 1, "linear")).toBeCloseTo(1, 5);
    });

    it("maps 63.5 (midpoint) to ~0.5", () => {
      // 63/127 = ~0.496, 64/127 = ~0.504
      expect(scaleValue(64, 0, 1, "linear")).toBeCloseTo(64 / 127, 3);
    });

    it("maps to a custom range", () => {
      expect(scaleValue(0, 20, 20000, "linear")).toBeCloseTo(20, 5);
      expect(scaleValue(127, 20, 20000, "linear")).toBeCloseTo(20000, 5);
    });

    it("handles negative range", () => {
      expect(scaleValue(0, -1, 1, "linear")).toBeCloseTo(-1, 5);
      expect(scaleValue(127, -1, 1, "linear")).toBeCloseTo(1, 5);
    });
  });

  describe("logarithmic", () => {
    it("maps 0 to min", () => {
      expect(scaleValue(0, 0, 1, "logarithmic")).toBeCloseTo(0, 5);
    });

    it("maps 127 to max", () => {
      expect(scaleValue(127, 0, 1, "logarithmic")).toBeCloseTo(1, 5);
    });

    it("has a value above linear midpoint (slow start, fast end)", () => {
      const logMid = scaleValue(64, 0, 1, "logarithmic");
      const linMid = scaleValue(64, 0, 1, "linear");
      // Log curve should be above the linear curve at the midpoint
      expect(logMid).toBeGreaterThan(linMid);
    });

    it("maps to a custom range", () => {
      expect(scaleValue(0, 20, 20000, "logarithmic")).toBeCloseTo(20, 5);
      expect(scaleValue(127, 20, 20000, "logarithmic")).toBeCloseTo(20000, 5);
    });
  });

  describe("exponential", () => {
    it("maps 0 to min", () => {
      expect(scaleValue(0, 0, 1, "exponential")).toBeCloseTo(0, 5);
    });

    it("maps 127 to max", () => {
      expect(scaleValue(127, 0, 1, "exponential")).toBeCloseTo(1, 5);
    });

    it("has a value below linear midpoint (fast start, slow end)", () => {
      const expMid = scaleValue(64, 0, 1, "exponential");
      const linMid = scaleValue(64, 0, 1, "linear");
      // Exponential curve should be below the linear curve at the midpoint
      expect(expMid).toBeLessThan(linMid);
    });

    it("maps to a custom range", () => {
      expect(scaleValue(0, 20, 20000, "exponential")).toBeCloseTo(20, 5);
      expect(scaleValue(127, 20, 20000, "exponential")).toBeCloseTo(20000, 5);
    });
  });

  it("clamps out-of-range CC values", () => {
    expect(scaleValue(-10, 0, 1, "linear")).toBeCloseTo(0, 5);
    expect(scaleValue(200, 0, 1, "linear")).toBeCloseTo(1, 5);
  });
});

describe("applyMapping", () => {
  it("applies a linear mapping", () => {
    const m = createMapping({
      midiChannel: 0,
      midiCC: 1,
      targetNodeId: "node-1",
      targetParam: "gain",
      min: 0,
      max: 1,
      curve: "linear",
    });
    expect(applyMapping(m, 0)).toBeCloseTo(0, 5);
    expect(applyMapping(m, 127)).toBeCloseTo(1, 5);
    expect(applyMapping(m, 64)).toBeCloseTo(64 / 127, 3);
  });
});
