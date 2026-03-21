import { describe, it, expect, beforeEach } from "vitest";
import { autoMap, autoMapMultiple } from "../auto-mapping.js";
import { resetMappingIdCounter } from "../controller-mapping.js";
import type { NodeData } from "@chord/document-model";

beforeEach(() => {
  resetMappingIdCounter();
});

function makeNode(id: string, params: Record<string, number>): NodeData {
  return {
    id,
    type: "test-node",
    position: { x: 0, y: 0 },
    parameters: params,
    name: `Node ${id}`,
  };
}

describe("autoMap", () => {
  it("maps CCs 1-N to node parameters", () => {
    const node = makeNode("n1", {
      frequency: 440,
      gain: 0.5,
      pan: 0,
    });

    const mappings = autoMap(node);

    expect(mappings).toHaveLength(3);
    expect(mappings[0].midiCC).toBe(1);
    expect(mappings[0].targetParam).toBe("frequency");
    expect(mappings[0].targetNodeId).toBe("n1");
    expect(mappings[1].midiCC).toBe(2);
    expect(mappings[1].targetParam).toBe("gain");
    expect(mappings[2].midiCC).toBe(3);
    expect(mappings[2].targetParam).toBe("pan");
  });

  it("uses default channel 0", () => {
    const node = makeNode("n1", { freq: 440 });
    const mappings = autoMap(node);
    expect(mappings[0].midiChannel).toBe(0);
  });

  it("respects midiChannel option", () => {
    const node = makeNode("n1", { freq: 440 });
    const mappings = autoMap(node, { midiChannel: 5 });
    expect(mappings[0].midiChannel).toBe(5);
  });

  it("respects startCC option", () => {
    const node = makeNode("n1", { freq: 440, gain: 0.5 });
    const mappings = autoMap(node, { startCC: 20 });
    expect(mappings[0].midiCC).toBe(20);
    expect(mappings[1].midiCC).toBe(21);
  });

  it("respects maxMappings option", () => {
    const params: Record<string, number> = {};
    for (let i = 0; i < 20; i++) params[`p${i}`] = 0;
    const node = makeNode("n1", params);

    const mappings = autoMap(node, { maxMappings: 4 });
    expect(mappings).toHaveLength(4);
  });

  it("limits to 8 by default", () => {
    const params: Record<string, number> = {};
    for (let i = 0; i < 20; i++) params[`p${i}`] = 0;
    const node = makeNode("n1", params);

    const mappings = autoMap(node);
    expect(mappings).toHaveLength(8);
  });

  it("respects curve, min, max options", () => {
    const node = makeNode("n1", { freq: 440 });
    const mappings = autoMap(node, {
      curve: "logarithmic",
      min: 20,
      max: 20000,
    });
    expect(mappings[0].curve).toBe("logarithmic");
    expect(mappings[0].min).toBe(20);
    expect(mappings[0].max).toBe(20000);
  });

  it("excludes specified parameters", () => {
    const node = makeNode("n1", {
      frequency: 440,
      gain: 0.5,
      bypass: 0,
      pan: 0,
    });

    const mappings = autoMap(node, { excludeParams: ["bypass"] });
    expect(mappings).toHaveLength(3);
    expect(mappings.every((m) => m.targetParam !== "bypass")).toBe(true);
  });

  it("handles node with no parameters", () => {
    const node = makeNode("n1", {});
    const mappings = autoMap(node);
    expect(mappings).toHaveLength(0);
  });

  it("stops before exceeding CC 127", () => {
    const params: Record<string, number> = {};
    for (let i = 0; i < 10; i++) params[`p${i}`] = 0;
    const node = makeNode("n1", params);

    const mappings = autoMap(node, { startCC: 122, maxMappings: 10 });
    // CCs 122..127 = 6 mappings, stops at 127
    expect(mappings).toHaveLength(6);
    expect(mappings[mappings.length - 1].midiCC).toBe(127);
  });
});

describe("autoMapMultiple", () => {
  it("assigns blocks of CCs to each node", () => {
    const n1 = makeNode("n1", { freq: 440, gain: 0.5 });
    const n2 = makeNode("n2", { cutoff: 1000, resonance: 0.7 });

    const mappings = autoMapMultiple([n1, n2]);

    // n1 gets CCs 1-2, n2 gets CCs 9-10 (blocks of 8)
    const n1Mappings = mappings.filter((m) => m.targetNodeId === "n1");
    const n2Mappings = mappings.filter((m) => m.targetNodeId === "n2");

    expect(n1Mappings).toHaveLength(2);
    expect(n1Mappings[0].midiCC).toBe(1);
    expect(n1Mappings[1].midiCC).toBe(2);

    expect(n2Mappings).toHaveLength(2);
    expect(n2Mappings[0].midiCC).toBe(9);
    expect(n2Mappings[1].midiCC).toBe(10);
  });

  it("stops mapping nodes when CCs would exceed 127", () => {
    const nodes: NodeData[] = [];
    for (let i = 0; i < 20; i++) {
      nodes.push(makeNode(`n${i}`, { p: 0 }));
    }

    const mappings = autoMapMultiple(nodes, { startCC: 1, maxMappings: 8 });
    // 127 / 8 = ~15.8, so 16 nodes max (CCs 1, 9, 17, ..., 121)
    // Node 16 would start at CC 129 which is >127
    expect(mappings.length).toBeLessThanOrEqual(16);
    expect(mappings.every((m) => m.midiCC <= 127)).toBe(true);
  });

  it("handles empty nodes array", () => {
    expect(autoMapMultiple([])).toHaveLength(0);
  });
});
