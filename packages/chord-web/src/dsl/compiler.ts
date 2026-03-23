import type { PatchDefinition } from './types.js';

/**
 * Compile a DSL PatchDefinition to the portable Chord JSON format.
 */
export function compile(def: PatchDefinition): string {
  const patchJson = {
    version: '1.0',
    name: def.name,
    description: def.config.description ?? '',
    tempo: def.config.tempo ?? 120,
    key: def.config.key ?? 'C',
    scale: def.config.scale ?? 'minor',
    nodes: def.nodes.map(n => ({
      id: n.id,
      type: n.type,
      params: n.params,
      position: { x: 0, y: 0 }, // auto-layout later
    })),
    connections: def.connections.map(c => ({
      from: `${c.fromId}:${c.fromPort}`,
      to: `${c.toId}:${c.toPort}`,
    })),
    exposed_parameters: def.exposedParams.map(e => ({
      name: e.name,
      node_id: e.nodeId,
      param: e.param,
      ...e.options,
    })),
    metadata: {
      created_by: 'chord-dsl',
      created_at: new Date().toISOString(),
    },
  };
  return JSON.stringify(patchJson, null, 2);
}

/**
 * Decompile a Chord JSON patch back to DSL TypeScript code.
 */
export function decompile(json: string): string {
  const patch = JSON.parse(json);
  const lines: string[] = [];

  lines.push(`import { patch, ${getImports(patch.nodes)} } from '@chord/web/dsl';`);
  lines.push('');
  lines.push(`export default patch('${patch.name}', {`);
  if (patch.tempo) lines.push(`  tempo: ${patch.tempo},`);
  if (patch.key) lines.push(`  key: '${patch.key}',`);
  if (patch.scale) lines.push(`  scale: '${patch.scale}',`);
  if (patch.description) lines.push(`  description: '${patch.description}',`);
  lines.push(`}, (p) => {`);

  // Generate node declarations
  for (const node of patch.nodes) {
    const varName = node.id.replace(/[^a-zA-Z0-9]/g, '_');
    const factory = typeToFactory(node.type);
    const params = formatParams(node.type, node.params);
    lines.push(`  const ${varName} = ${factory}(${params});`);
  }

  lines.push('');

  // Generate connections
  for (const conn of patch.connections) {
    const [fromId, _fromPort] = conn.from.split(':');
    const [toId, toPort] = conn.to.split(':');
    const fromVar = fromId.replace(/[^a-zA-Z0-9]/g, '_');
    const toVar = toId.replace(/[^a-zA-Z0-9]/g, '_');
    if (toPort.endsWith('_mod')) {
      lines.push(`  ${toVar}.modulate('${toPort.replace('_mod', '')}', ${fromVar});`);
    } else {
      lines.push(`  ${fromVar}.connect(${toVar});`);
    }
  }

  lines.push(`});`);
  lines.push('');

  return lines.join('\n');
}

function getImports(nodes: { type: string }[]): string {
  const types = new Set(nodes.map((n) => typeToFactory(n.type)));
  return Array.from(types).join(', ');
}

function typeToFactory(type: string): string {
  const map: Record<string, string> = {
    oscillator: 'osc', filter: 'filter', gain: 'gain', delay: 'delay',
    reverb: 'reverb', noise: 'noise', mixer: 'mixer', output: 'output',
    lfo: 'lfo', envelope: 'envelope', kick_drum: 'kickDrum',
    snare_drum: 'snareDrum', hi_hat: 'hiHat', clap: 'clap', tom: 'tom',
    step_sequencer: 'stepSequencer', euclidean: 'euclidean',
    markov_sequencer: 'markovSequencer', gravity_sequencer: 'gravitySequencer',
    game_of_life_sequencer: 'gameOfLife', polyrhythm: 'polyrhythm',
    compressor: 'compressor', eq: 'eq', chorus: 'chorus', phaser: 'phaser',
    waveshaper: 'waveshaper', limiter: 'limiter', granular: 'granular',
  };
  return map[type] ?? type;
}

function formatParams(_type: string, params: Record<string, number>): string {
  if (!params || Object.keys(params).length === 0) return '';
  const entries = Object.entries(params)
    .filter(([, v]) => v !== 0 && v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return entries ? `{ ${entries} }` : '';
}
