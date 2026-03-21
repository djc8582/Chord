/**
 * MappingStore — manages a collection of controller-to-parameter mappings.
 *
 * Provides CRUD operations plus lookups by node and by MIDI CC.
 */

import type { ControllerMapping } from "./controller-mapping.js";
import { validateMapping } from "./controller-mapping.js";

export class MappingStore {
  private _mappings: Map<string, ControllerMapping> = new Map();

  /** Returns all mappings as an array. */
  getAll(): ControllerMapping[] {
    return Array.from(this._mappings.values());
  }

  /** Returns the number of mappings. */
  get size(): number {
    return this._mappings.size;
  }

  /**
   * Add a new mapping. Throws if the mapping is invalid or if a mapping
   * with the same ID already exists.
   */
  addMapping(mapping: ControllerMapping): void {
    const error = validateMapping(mapping);
    if (error) {
      throw new Error(`Invalid mapping: ${error}`);
    }
    if (this._mappings.has(mapping.id)) {
      throw new Error(`Mapping with id '${mapping.id}' already exists`);
    }
    this._mappings.set(mapping.id, { ...mapping });
  }

  /**
   * Remove a mapping by ID. Returns true if removed, false if not found.
   */
  removeMapping(id: string): boolean {
    return this._mappings.delete(id);
  }

  /**
   * Update an existing mapping. The `updates` partial is merged into the
   * existing mapping. Throws if the mapping doesn't exist or if the result
   * is invalid.
   */
  updateMapping(id: string, updates: Partial<Omit<ControllerMapping, "id">>): void {
    const existing = this._mappings.get(id);
    if (!existing) {
      throw new Error(`Mapping '${id}' not found`);
    }
    const updated: ControllerMapping = { ...existing, ...updates, id };
    const error = validateMapping(updated);
    if (error) {
      throw new Error(`Invalid mapping after update: ${error}`);
    }
    this._mappings.set(id, updated);
  }

  /**
   * Get a mapping by its ID, or undefined if not found.
   */
  getMapping(id: string): ControllerMapping | undefined {
    const m = this._mappings.get(id);
    return m ? { ...m } : undefined;
  }

  /**
   * Get all mappings that target a specific node.
   */
  getMappingsForNode(nodeId: string): ControllerMapping[] {
    return this.getAll().filter((m) => m.targetNodeId === nodeId);
  }

  /**
   * Get the mapping for a specific MIDI channel + CC number, or undefined.
   * If multiple mappings share the same channel+CC, the first one is returned.
   */
  getMappingForCC(channel: number, cc: number): ControllerMapping | undefined {
    for (const m of this._mappings.values()) {
      if (m.midiChannel === channel && m.midiCC === cc) {
        return { ...m };
      }
    }
    return undefined;
  }

  /**
   * Get all mappings for a specific MIDI channel + CC number.
   */
  getAllMappingsForCC(channel: number, cc: number): ControllerMapping[] {
    return this.getAll().filter(
      (m) => m.midiChannel === channel && m.midiCC === cc,
    );
  }

  /** Remove all mappings. */
  clear(): void {
    this._mappings.clear();
  }

  /** Serialize all mappings to a plain array (for persistence). */
  serialize(): ControllerMapping[] {
    return this.getAll();
  }

  /** Load mappings from a serialized array, replacing all current mappings. */
  deserialize(mappings: ControllerMapping[]): void {
    this._mappings.clear();
    for (const m of mappings) {
      this.addMapping(m);
    }
  }
}
