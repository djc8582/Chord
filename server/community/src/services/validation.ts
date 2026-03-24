/**
 * Patch validation service.
 * Ensures uploaded patches are structurally sound and meet quality criteria.
 */

import { z } from 'zod';

const NodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  params: z.record(z.number()).optional().default({}),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const ConnectionSchema = z.object({
  from: z.string(), // "nodeId:port"
  to: z.string(),
});

const PatchJsonSchema = z.object({
  version: z.string(),
  name: z.string(),
  description: z.string().optional().default(''),
  tempo: z.number().min(20).max(300).optional().default(120),
  key: z.string().optional().default('C'),
  scale: z.string().optional().default('minor'),
  nodes: z.array(NodeSchema).min(1),
  connections: z.array(ConnectionSchema).min(1),
  metadata: z.record(z.unknown()).optional(),
});

export type PatchJson = z.infer<typeof PatchJsonSchema>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  nodeCount: number;
  connectionCount: number;
}

const VALID_NODE_TYPES = new Set([
  'oscillator', 'noise', 'filter', 'reverb', 'delay', 'compressor', 'limiter',
  'chorus', 'phaser', 'eq', 'waveshaper', 'granular', 'lfo', 'envelope',
  'gain', 'mixer', 'output', 'kickDrum', 'snareDrum', 'hiHat', 'clap', 'tom',
  'stepSequencer', 'euclidean', 'markovSequencer', 'gravitySequencer',
  'gameOfLife', 'polyrhythm', 'subpatch',
]);

export function validatePatch(patchJsonStr: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Parse JSON
  let raw: unknown;
  try {
    raw = JSON.parse(patchJsonStr);
  } catch {
    return { valid: false, errors: ['Invalid JSON'], warnings: [], nodeCount: 0, connectionCount: 0 };
  }

  // Validate schema
  const result = PatchJsonSchema.safeParse(raw);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      warnings: [],
      nodeCount: 0,
      connectionCount: 0,
    };
  }

  const patch = result.data;
  const nodeIds = new Set(patch.nodes.map(n => n.id));

  // Check node types
  for (const node of patch.nodes) {
    if (!VALID_NODE_TYPES.has(node.type)) {
      errors.push(`Unknown node type: ${node.type}`);
    }
  }

  // Check for output node
  const hasOutput = patch.nodes.some(n => n.type === 'output');
  if (!hasOutput) {
    errors.push('Patch must have at least one output node');
  }

  // Check connections reference valid nodes
  for (const conn of patch.connections) {
    const fromId = conn.from.split(':')[0];
    const toId = conn.to.split(':')[0];
    if (!nodeIds.has(fromId)) errors.push(`Connection from unknown node: ${fromId}`);
    if (!nodeIds.has(toId)) errors.push(`Connection to unknown node: ${toId}`);
  }

  // Check for duplicate node IDs
  if (nodeIds.size !== patch.nodes.length) {
    errors.push('Duplicate node IDs detected');
  }

  // Warnings
  if (patch.nodes.length > 100) {
    warnings.push('Patch has >100 nodes — may impact performance');
  }

  // Check for raw oscillator → output (no filtering)
  const oscNodes = patch.nodes.filter(n => n.type === 'oscillator');
  for (const osc of oscNodes) {
    const directToOutput = patch.connections.some(c => {
      const fromId = c.from.split(':')[0];
      const toId = c.to.split(':')[0];
      return fromId === osc.id && patch.nodes.find(n => n.id === toId)?.type === 'output';
    });
    if (directToOutput) {
      warnings.push(`Oscillator ${osc.id} connected directly to output — consider adding a filter`);
    }
  }

  // Check bundle size
  if (patchJsonStr.length > 500 * 1024) {
    errors.push('Patch JSON exceeds 500KB limit');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    nodeCount: patch.nodes.length,
    connectionCount: patch.connections.length,
  };
}
