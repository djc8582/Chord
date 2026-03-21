import { describe, it, expect, beforeEach } from "vitest";
import { MappingStore } from "../mapping-store.js";
import { createMapping, resetMappingIdCounter } from "../controller-mapping.js";
import type { ControllerMapping } from "../controller-mapping.js";

let store: MappingStore;

beforeEach(() => {
  resetMappingIdCounter();
  store = new MappingStore();
});

function makeMapping(overrides?: Partial<ControllerMapping>): ControllerMapping {
  return createMapping({
    midiChannel: 0,
    midiCC: 1,
    targetNodeId: "node-1",
    targetParam: "frequency",
    ...overrides,
  });
}

describe("MappingStore", () => {
  describe("addMapping", () => {
    it("adds a valid mapping", () => {
      const m = makeMapping();
      store.addMapping(m);
      expect(store.size).toBe(1);
    });

    it("throws for invalid mapping", () => {
      const m = makeMapping();
      m.midiChannel = 99; // invalid
      expect(() => store.addMapping(m)).toThrow("Invalid mapping");
    });

    it("throws for duplicate ID", () => {
      const m = makeMapping({ id: "dup" } as Partial<ControllerMapping>);
      store.addMapping(m);
      const m2 = makeMapping({ id: "dup" } as Partial<ControllerMapping>);
      m2.midiCC = 2; // different CC but same ID
      expect(() => store.addMapping(m2)).toThrow("already exists");
    });
  });

  describe("removeMapping", () => {
    it("removes an existing mapping", () => {
      const m = makeMapping();
      store.addMapping(m);
      expect(store.removeMapping(m.id)).toBe(true);
      expect(store.size).toBe(0);
    });

    it("returns false for non-existent mapping", () => {
      expect(store.removeMapping("nonexistent")).toBe(false);
    });
  });

  describe("updateMapping", () => {
    it("updates fields on an existing mapping", () => {
      const m = makeMapping();
      store.addMapping(m);
      store.updateMapping(m.id, { min: 10, max: 100 });
      const updated = store.getMapping(m.id);
      expect(updated?.min).toBe(10);
      expect(updated?.max).toBe(100);
      // Other fields unchanged
      expect(updated?.midiCC).toBe(1);
    });

    it("throws for non-existent mapping", () => {
      expect(() => store.updateMapping("nonexistent", { min: 0 })).toThrow("not found");
    });

    it("throws if update results in invalid mapping", () => {
      const m = makeMapping();
      store.addMapping(m);
      expect(() => store.updateMapping(m.id, { min: 100, max: 0 })).toThrow("Invalid mapping");
    });
  });

  describe("getMappingsForNode", () => {
    it("returns all mappings for a specific node", () => {
      store.addMapping(makeMapping({ targetNodeId: "node-1", midiCC: 1 } as Partial<ControllerMapping>));
      store.addMapping(makeMapping({ targetNodeId: "node-1", midiCC: 2, targetParam: "gain" } as Partial<ControllerMapping>));
      store.addMapping(makeMapping({ targetNodeId: "node-2", midiCC: 3 } as Partial<ControllerMapping>));

      const forNode1 = store.getMappingsForNode("node-1");
      expect(forNode1).toHaveLength(2);
      expect(forNode1.every((m) => m.targetNodeId === "node-1")).toBe(true);
    });

    it("returns empty array if no mappings for node", () => {
      store.addMapping(makeMapping());
      expect(store.getMappingsForNode("other-node")).toHaveLength(0);
    });
  });

  describe("getMappingForCC", () => {
    it("finds a mapping by channel + CC", () => {
      const m = makeMapping({ midiChannel: 3, midiCC: 74 } as Partial<ControllerMapping>);
      store.addMapping(m);

      const found = store.getMappingForCC(3, 74);
      expect(found).toBeDefined();
      expect(found?.midiChannel).toBe(3);
      expect(found?.midiCC).toBe(74);
    });

    it("returns undefined if not found", () => {
      store.addMapping(makeMapping({ midiChannel: 0, midiCC: 1 } as Partial<ControllerMapping>));
      expect(store.getMappingForCC(0, 99)).toBeUndefined();
      expect(store.getMappingForCC(1, 1)).toBeUndefined();
    });
  });

  describe("getAllMappingsForCC", () => {
    it("returns all mappings for a channel + CC", () => {
      store.addMapping(makeMapping({ midiChannel: 0, midiCC: 1, targetNodeId: "n1", targetParam: "p1" } as Partial<ControllerMapping>));
      store.addMapping(makeMapping({ midiChannel: 0, midiCC: 1, targetNodeId: "n2", targetParam: "p2" } as Partial<ControllerMapping>));
      store.addMapping(makeMapping({ midiChannel: 0, midiCC: 2, targetNodeId: "n3", targetParam: "p3" } as Partial<ControllerMapping>));

      const found = store.getAllMappingsForCC(0, 1);
      expect(found).toHaveLength(2);
    });
  });

  describe("getAll / clear", () => {
    it("returns all mappings", () => {
      store.addMapping(makeMapping({ midiCC: 1 } as Partial<ControllerMapping>));
      store.addMapping(makeMapping({ midiCC: 2, targetParam: "gain" } as Partial<ControllerMapping>));
      expect(store.getAll()).toHaveLength(2);
    });

    it("clear removes all mappings", () => {
      store.addMapping(makeMapping());
      store.clear();
      expect(store.size).toBe(0);
      expect(store.getAll()).toHaveLength(0);
    });
  });

  describe("serialize / deserialize", () => {
    it("roundtrips correctly", () => {
      const m1 = makeMapping({ midiCC: 1 } as Partial<ControllerMapping>);
      const m2 = makeMapping({ midiCC: 2, targetParam: "gain" } as Partial<ControllerMapping>);
      store.addMapping(m1);
      store.addMapping(m2);

      const serialized = store.serialize();
      expect(serialized).toHaveLength(2);

      const store2 = new MappingStore();
      store2.deserialize(serialized);
      expect(store2.size).toBe(2);
      expect(store2.getMapping(m1.id)?.midiCC).toBe(1);
      expect(store2.getMapping(m2.id)?.midiCC).toBe(2);
    });

    it("deserialize replaces existing mappings", () => {
      store.addMapping(makeMapping({ midiCC: 99 } as Partial<ControllerMapping>));
      expect(store.size).toBe(1);

      const m = makeMapping({ midiCC: 50, targetParam: "x" } as Partial<ControllerMapping>);
      store.deserialize([m]);
      expect(store.size).toBe(1);
      expect(store.getAll()[0].midiCC).toBe(50);
    });
  });

  describe("immutability", () => {
    it("getMapping returns a copy, not the internal reference", () => {
      const m = makeMapping();
      store.addMapping(m);
      const retrieved = store.getMapping(m.id);
      retrieved!.min = 999;
      const again = store.getMapping(m.id);
      expect(again?.min).toBe(0); // unchanged
    });
  });
});
