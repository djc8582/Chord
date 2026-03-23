#!/usr/bin/env node
/**
 * Chord CLI — Command-line tool for audio project management.
 *
 * Usage:
 *   npx chord init          Create a new Chord project
 *   npx chord create "..."  Create a patch from description
 *   npx chord list          List patches in the project
 *   npx chord validate      Validate all patches
 *   npx chord build         Build patches for deployment
 *   npx chord edit [patch]  Open visual editor
 */

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'init':
      await init(args.slice(1));
      break;
    case 'create':
    case 'add':
      await create(args.slice(1));
      break;
    case 'list':
    case 'ls':
      await list();
      break;
    case 'validate':
      await validate(args.slice(1));
      break;
    case 'build':
      await build();
      break;
    case 'edit':
      await edit(args.slice(1));
      break;
    case 'info':
      await info(args.slice(1));
      break;
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
  ♪ Chord CLI — Audio for every project

  Usage:
    chord init [--react]         Initialize a Chord project
    chord create <description>   Create a patch from description
    chord list                   List all patches
    chord validate [patch]       Validate patches
    chord build                  Build for deployment
    chord edit [patch]           Open in visual editor
    chord info <patch>           Show patch details

  Examples:
    chord init
    chord create "chill lo-fi beats with vinyl texture"
    chord create "rain sounds for meditation app"
    chord validate
    chord build
  `);
}

// ─── INIT ───
async function init(args: string[]) {
  const fs = await import('fs');
  const path = await import('path');

  const isReact = args.includes('--react');
  const cwd = process.cwd();

  // Create patches directory
  const patchDir = path.join(cwd, 'patches');
  if (!fs.existsSync(patchDir)) {
    fs.mkdirSync(patchDir, { recursive: true });
    console.log('  Created patches/');
  }

  // Create chord.config.ts
  const configContent = `import { defineConfig } from 'chord-audio/config';

export default defineConfig({
  patchDir: './patches',
  outDir: './dist/audio',
  target: '${isReact ? 'react' : 'web'}',
  patches: {},
  defaults: {
    sampleRate: 48000,
    masterLimiter: true,
    autoGainStaging: true,
  },${isReact ? `
  react: {
    generateHooks: true,
  },` : ''}
});
`;

  const configPath = path.join(cwd, 'chord.config.ts');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, configContent);
    console.log('  Created chord.config.ts');
  }

  // Create .chordrc
  const chordrc = {
    engine: "chord-audio",
    version: "0.1.0",
    patches: ["./patches/*.chord.json", "./patches/*.chord.ts"],
    config: "./chord.config.ts",
  };
  fs.writeFileSync(path.join(cwd, '.chordrc'), JSON.stringify(chordrc, null, 2));
  console.log('  Created .chordrc');

  console.log(`
  ♪ Chord project initialized!

  Next steps:
    chord create "ambient background music"
    chord list
    chord build
  `);
}

// ─── CREATE ───
async function create(args: string[]) {
  const fs = await import('fs');
  const path = await import('path');

  const description = args.join(' ');
  if (!description) {
    console.error('  Usage: chord create <description>');
    console.error('  Example: chord create "chill lo-fi beats"');
    process.exit(1);
  }

  // Generate a filename from the description
  const slug = description.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const patchDir = path.join(process.cwd(), 'patches');
  if (!fs.existsSync(patchDir)) fs.mkdirSync(patchDir, { recursive: true });

  const filename = `${slug}.chord.json`;
  const filepath = path.join(patchDir, filename);

  // Create a basic patch structure
  // In production this would use the vibe translator via MCP
  const patch = {
    version: "1.0",
    name: slug,
    description: description,
    tempo: 120,
    key: "C",
    scale: "minor",
    nodes: [
      { id: "osc1", type: "oscillator", params: { frequency: 261.6, waveform: 1 }, position: { x: 100, y: 200 } },
      { id: "filter1", type: "filter", params: { cutoff: 2000, resonance: 1.5 }, position: { x: 350, y: 200 } },
      { id: "reverb1", type: "reverb", params: { room_size: 0.6, mix: 0.3 }, position: { x: 600, y: 200 } },
      { id: "output1", type: "output", params: {}, position: { x: 850, y: 200 } },
    ],
    connections: [
      { from: "osc1:out", to: "filter1:in" },
      { from: "filter1:out", to: "reverb1:in" },
      { from: "reverb1:out", to: "output1:in" },
    ],
    metadata: {
      created_by: "chord-cli",
      created_at: new Date().toISOString(),
      tags: description.split(' ').filter((w: string) => w.length > 3),
    },
  };

  fs.writeFileSync(filepath, JSON.stringify(patch, null, 2));

  console.log(`  ♪ Created ${filename}`);
  console.log(`    ${patch.nodes.length} nodes, ${patch.connections.length} connections`);
  console.log(`    ${patch.tempo} BPM, ${patch.key} ${patch.scale}`);
  console.log(`\n  Next: chord edit ${slug}`);
}

// ─── LIST ───
async function list() {
  const fs = await import('fs');
  const path = await import('path');

  const patchDir = path.join(process.cwd(), 'patches');
  if (!fs.existsSync(patchDir)) {
    console.log('  No patches directory. Run: chord init');
    return;
  }

  const files = fs.readdirSync(patchDir).filter((f: string) => f.endsWith('.chord.json') || f.endsWith('.chord.ts'));

  if (files.length === 0) {
    console.log('  No patches found. Run: chord create "description"');
    return;
  }

  console.log(`  ♪ ${files.length} patch${files.length > 1 ? 'es' : ''}:\n`);

  for (const file of files) {
    const filepath = path.join(patchDir, file);
    try {
      if (file.endsWith('.json')) {
        const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        const nodes = content.nodes?.length ?? 0;
        const conns = content.connections?.length ?? 0;
        console.log(`  ${file}`);
        console.log(`    ${content.description || 'No description'}`);
        console.log(`    ${nodes} nodes, ${conns} connections, ${content.tempo || 120} BPM`);
        console.log('');
      } else {
        console.log(`  ${file} (TypeScript DSL)`);
        console.log('');
      }
    } catch {
      console.log(`  ${file} (could not read)`);
    }
  }
}

// ─── VALIDATE ───
async function validate(args: string[]) {
  const fs = await import('fs');
  const path = await import('path');

  const patchDir = path.join(process.cwd(), 'patches');
  if (!fs.existsSync(patchDir)) {
    console.log('  No patches to validate.');
    return;
  }

  const files = args.length > 0
    ? args.map(a => a.endsWith('.json') ? a : `${a}.chord.json`)
    : fs.readdirSync(patchDir).filter((f: string) => f.endsWith('.chord.json'));

  let passed = 0, failed = 0;

  for (const file of files) {
    const filepath = path.join(patchDir, file);
    if (!fs.existsSync(filepath)) {
      console.log(`  ✗ ${file} — not found`);
      failed++;
      continue;
    }

    try {
      const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      const issues: string[] = [];

      if (!content.nodes || content.nodes.length === 0) issues.push('no nodes');
      if (!content.connections || content.connections.length === 0) issues.push('no connections');
      if (!content.version) issues.push('missing version');

      // Check for output node
      const hasOutput = content.nodes?.some((n: any) => n.type === 'output');
      if (!hasOutput) issues.push('no output node');

      // Check all connections reference existing nodes
      const nodeIds = new Set(content.nodes?.map((n: any) => n.id) ?? []);
      for (const conn of content.connections ?? []) {
        const fromId = conn.from?.split(':')[0];
        const toId = conn.to?.split(':')[0];
        if (!nodeIds.has(fromId)) issues.push(`connection from unknown node: ${fromId}`);
        if (!nodeIds.has(toId)) issues.push(`connection to unknown node: ${toId}`);
      }

      if (issues.length === 0) {
        console.log(`  ✓ ${file} — valid (${content.nodes.length} nodes)`);
        passed++;
      } else {
        console.log(`  ✗ ${file} — ${issues.join(', ')}`);
        failed++;
      }
    } catch (e) {
      console.log(`  ✗ ${file} — invalid JSON`);
      failed++;
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
}

// ─── BUILD ───
async function build() {
  console.log('  ♪ Building patches...');
  // In production, this reads chord.config.ts and builds each patch
  // For now, just validate all patches
  await validate([]);
  console.log('  Build complete.');
}

// ─── EDIT ───
async function edit(args: string[]) {
  const patch = args[0];
  if (patch) {
    console.log(`  Opening ${patch} in visual editor...`);
    console.log(`  (Desktop app integration coming soon)`);
    console.log(`  For now, open the Chord desktop app and load the patch manually.`);
  } else {
    console.log(`  Opening Chord visual editor...`);
    console.log(`  (Desktop app integration coming soon)`);
  }
}

// ─── INFO ───
async function info(args: string[]) {
  const fs = await import('fs');
  const path = await import('path');

  const name = args[0];
  if (!name) {
    console.error('  Usage: chord info <patch-name>');
    return;
  }

  const patchDir = path.join(process.cwd(), 'patches');
  const filename = name.endsWith('.json') ? name : `${name}.chord.json`;
  const filepath = path.join(patchDir, filename);

  if (!fs.existsSync(filepath)) {
    console.error(`  Patch not found: ${filename}`);
    return;
  }

  try {
    const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    console.log(`\n  ♪ ${content.name || name}`);
    console.log(`  ─────────────────────────`);
    if (content.description) console.log(`  ${content.description}`);
    console.log(`  Tempo: ${content.tempo || 120} BPM`);
    console.log(`  Key: ${content.key || 'C'} ${content.scale || 'minor'}`);
    console.log(`  Nodes: ${content.nodes?.length ?? 0}`);
    console.log(`  Connections: ${content.connections?.length ?? 0}`);

    if (content.nodes) {
      console.log(`\n  Node types:`);
      const types: Record<string, number> = {};
      for (const n of content.nodes) {
        types[n.type] = (types[n.type] || 0) + 1;
      }
      for (const [type, count] of Object.entries(types)) {
        console.log(`    ${type}: ${count}`);
      }
    }

    if (content.metadata?.tags?.length) {
      console.log(`\n  Tags: ${content.metadata.tags.join(', ')}`);
    }
    console.log('');
  } catch {
    console.error(`  Could not read ${filename}`);
  }
}

main().catch(console.error);
