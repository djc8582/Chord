/**
 * Auto-mapping — heuristic-based assignment of MIDI CCs to node parameters.
 *
 * For generic MIDI controllers, maps CCs 1-8 (or a configurable start) to
 * the first N parameters of the selected node.
 */

import type { NodeData } from "@chord/document-model";
import type { ControllerMapping, ScalingCurve } from "./controller-mapping.js";
import { createMapping } from "./controller-mapping.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for auto-mapping. */
export interface AutoMapOptions {
  /** MIDI channel to use for the mappings (default: 0). */
  midiChannel?: number;
  /** Starting CC number (default: 1). CC 0 is often bank select. */
  startCC?: number;
  /** Maximum number of parameters to map (default: 8). */
  maxMappings?: number;
  /** Default scaling curve (default: "linear"). */
  curve?: ScalingCurve;
  /** Default min value (default: 0). */
  min?: number;
  /** Default max value (default: 1). */
  max?: number;
  /** Parameter names to exclude from auto-mapping. */
  excludeParams?: string[];
}

// ---------------------------------------------------------------------------
// Auto-map function
// ---------------------------------------------------------------------------

/**
 * Generate controller mappings that assign sequential MIDI CCs to the
 * parameters of a node.
 *
 * @param node - The target node whose parameters will be mapped.
 * @param options - Configuration for the mapping.
 * @returns An array of ControllerMapping objects.
 */
export function autoMap(node: NodeData, options?: AutoMapOptions): ControllerMapping[] {
  const channel = options?.midiChannel ?? 0;
  const startCC = options?.startCC ?? 1;
  const maxMappings = options?.maxMappings ?? 8;
  const curve = options?.curve ?? "linear";
  const min = options?.min ?? 0;
  const max = options?.max ?? 1;
  const excludeParams = new Set(options?.excludeParams ?? []);

  const paramNames = Object.keys(node.parameters).filter(
    (name) => !excludeParams.has(name),
  );

  const count = Math.min(paramNames.length, maxMappings);
  const mappings: ControllerMapping[] = [];

  for (let i = 0; i < count; i++) {
    const ccNumber = startCC + i;
    // Don't exceed CC 127
    if (ccNumber > 127) break;

    mappings.push(
      createMapping({
        midiChannel: channel,
        midiCC: ccNumber,
        targetNodeId: node.id,
        targetParam: paramNames[i],
        min,
        max,
        curve,
      }),
    );
  }

  return mappings;
}

/**
 * Auto-map multiple nodes, giving each one a separate block of CCs.
 *
 * For example, with 3 nodes and 8 CCs per node starting at CC 1:
 * - Node 0: CCs 1-8
 * - Node 1: CCs 9-16
 * - Node 2: CCs 17-24
 */
export function autoMapMultiple(
  nodes: NodeData[],
  options?: AutoMapOptions,
): ControllerMapping[] {
  const startCC = options?.startCC ?? 1;
  const maxPerNode = options?.maxMappings ?? 8;

  const allMappings: ControllerMapping[] = [];

  for (let nodeIdx = 0; nodeIdx < nodes.length; nodeIdx++) {
    const nodeStartCC = startCC + nodeIdx * maxPerNode;
    if (nodeStartCC > 127) break;

    const nodeMappings = autoMap(nodes[nodeIdx], {
      ...options,
      startCC: nodeStartCC,
    });
    allMappings.push(...nodeMappings);
  }

  return allMappings;
}
