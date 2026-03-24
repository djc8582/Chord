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
 *   npx chord search "..."  Search community library
 *   npx chord fork <slug>   Fork a community patch
 *   npx chord publish <file> Publish to community library
 *   npx chord preview <slug> Preview a community patch
 */

const COMMUNITY_API = process.env.CHORD_COMMUNITY_URL || 'http://localhost:3847';

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
    case 'search':
      await search(args.slice(1));
      break;
    case 'fork':
      await fork(args.slice(1));
      break;
    case 'publish':
      await publish(args.slice(1));
      break;
    case 'preview':
      await preview(args.slice(1));
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

  Local:
    chord init [--react]         Initialize a Chord project
    chord create <description>   Create a patch from description
    chord list                   List all patches
    chord validate [patch]       Validate patches
    chord build                  Build for deployment
    chord edit [patch]           Open in visual editor
    chord info <patch>           Show patch details

  Community:
    chord search <query>         Search community library
    chord search --category ambient
    chord fork <slug>            Fork a community patch
    chord publish <file>         Publish a patch to community
    chord preview <slug>         Preview a community patch

  Examples:
    chord init
    chord create "chill lo-fi beats with vinyl texture"
    chord search "ambient rain"
    chord fork nature/gentle-rain
    chord publish patches/my-patch.chord.json
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

// ─── SEARCH (Community) ───
async function search(args: string[]) {
  const params = new URLSearchParams();

  // Parse flags
  let i = 0;
  const queryParts: string[] = [];
  while (i < args.length) {
    if (args[i] === '--category' && args[i + 1]) {
      params.set('category', args[i + 1]);
      i += 2;
    } else if (args[i] === '--sort' && args[i + 1]) {
      params.set('sort', args[i + 1]);
      i += 2;
    } else if (args[i] === '--min-tempo' && args[i + 1]) {
      params.set('minTempo', args[i + 1]);
      i += 2;
    } else if (args[i] === '--max-tempo' && args[i + 1]) {
      params.set('maxTempo', args[i + 1]);
      i += 2;
    } else {
      queryParts.push(args[i]);
      i++;
    }
  }

  if (queryParts.length > 0) {
    params.set('q', queryParts.join(' '));
  }

  try {
    const res = await fetch(`${COMMUNITY_API}/api/search?${params}`);
    if (!res.ok) {
      console.error(`  Error: ${res.status} ${res.statusText}`);
      return;
    }

    const data = await res.json() as {
      patches: Array<{
        slug: string;
        name: string;
        description: string;
        author: string;
        tempo: number | null;
        downloads: number;
        rating: number;
        nodeCount: number;
      }>;
      total: number;
    };

    if (data.patches.length === 0) {
      console.log('  No patches found.');
      return;
    }

    console.log(`  ♪ ${data.total} result${data.total > 1 ? 's' : ''}:\n`);
    for (const p of data.patches) {
      console.log(`  ${p.slug}`);
      console.log(`    ${p.description.slice(0, 80)}${p.description.length > 80 ? '...' : ''}`);
      console.log(`    by ${p.author} · ${p.nodeCount} nodes · ${p.downloads} downloads${p.tempo ? ` · ${p.tempo} BPM` : ''}`);
      console.log('');
    }
  } catch (e) {
    console.error(`  Could not connect to community server at ${COMMUNITY_API}`);
    console.error('  Is the server running? Set CHORD_COMMUNITY_URL to override.');
  }
}

// ─── FORK (Community) ───
async function fork(args: string[]) {
  const fs = await import('fs');
  const path = await import('path');

  const slug = args[0];
  if (!slug) {
    console.error('  Usage: chord fork <slug>');
    console.error('  Example: chord fork nature/gentle-rain');
    return;
  }

  let name: string | undefined;
  const nameIdx = args.indexOf('--name');
  if (nameIdx >= 0 && args[nameIdx + 1]) {
    name = args[nameIdx + 1];
  }

  try {
    // First fetch the patch details
    const res = await fetch(`${COMMUNITY_API}/api/patches/${slug}`);
    if (!res.ok) {
      if (res.status === 404) {
        console.error(`  Patch not found: ${slug}`);
      } else {
        console.error(`  Error: ${res.status} ${res.statusText}`);
      }
      return;
    }

    const data = await res.json() as {
      name: string;
      description: string;
      patch_json: string;
    };

    // Save locally
    const patchDir = path.join(process.cwd(), 'patches');
    if (!fs.existsSync(patchDir)) fs.mkdirSync(patchDir, { recursive: true });

    const filename = `${(name || data.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.chord.json`;
    const filepath = path.join(patchDir, filename);

    let patchContent: string;
    try {
      // Pretty-print the patch JSON
      const parsed = JSON.parse(data.patch_json);
      patchContent = JSON.stringify(parsed, null, 2);
    } catch {
      patchContent = data.patch_json;
    }

    fs.writeFileSync(filepath, patchContent);

    console.log(`  ♪ Forked ${slug} → patches/${filename}`);
    console.log(`    ${data.description}`);
    console.log(`\n  Edit with: chord edit ${filename.replace('.chord.json', '')}`);
  } catch (e) {
    console.error(`  Could not connect to community server at ${COMMUNITY_API}`);
  }
}

// ─── PUBLISH (Community) ───
async function publish(args: string[]) {
  const fs = await import('fs');
  const path = await import('path');

  const file = args[0];
  if (!file) {
    console.error('  Usage: chord publish <patch-file>');
    console.error('  Example: chord publish patches/my-ambient.chord.json');
    return;
  }

  const filepath = path.resolve(file);
  if (!fs.existsSync(filepath)) {
    console.error(`  File not found: ${file}`);
    return;
  }

  let patchJson: string;
  try {
    patchJson = fs.readFileSync(filepath, 'utf-8');
    JSON.parse(patchJson); // validate JSON
  } catch {
    console.error(`  Invalid JSON: ${file}`);
    return;
  }

  const parsed = JSON.parse(patchJson);

  // Check for auth token
  const tokenPath = path.join(process.env.HOME || '~', '.chord-token');
  let token: string | null = null;
  if (fs.existsSync(tokenPath)) {
    token = fs.readFileSync(tokenPath, 'utf-8').trim();
  }

  if (!token) {
    console.error('  Not logged in. Run: chord login');
    console.error('  (Or set a token in ~/.chord-token)');
    return;
  }

  const name = parsed.name || path.basename(file, '.chord.json');
  const description = parsed.description || '';
  const category = parsed.metadata?.category || 'other';
  const tags = parsed.metadata?.tags || [];

  try {
    const res = await fetch(`${COMMUNITY_API}/api/patches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        description,
        patchJson,
        category,
        tags,
      }),
    });

    const data = await res.json() as {
      slug?: string;
      error?: string;
      validationErrors?: string[];
      validation?: { warnings: string[] };
    };

    if (!res.ok) {
      console.error(`  Publish failed: ${data.error}`);
      if (data.validationErrors) {
        for (const err of data.validationErrors) {
          console.error(`    - ${err}`);
        }
      }
      return;
    }

    console.log(`  ♪ Published: ${data.slug}`);
    if (data.validation?.warnings?.length) {
      console.log('  Warnings:');
      for (const w of data.validation.warnings) {
        console.log(`    - ${w}`);
      }
    }
  } catch (e) {
    console.error(`  Could not connect to community server at ${COMMUNITY_API}`);
  }
}

// ─── PREVIEW (Community) ───
async function preview(args: string[]) {
  const slug = args[0];
  if (!slug) {
    console.error('  Usage: chord preview <slug>');
    console.error('  Example: chord preview ambient/breathing-space');
    return;
  }

  try {
    const res = await fetch(`${COMMUNITY_API}/api/patches/${slug}`);
    if (!res.ok) {
      console.error(`  Patch not found: ${slug}`);
      return;
    }

    const data = await res.json() as {
      name: string;
      description: string;
      author: string;
      version: string;
      category: string;
      tags: string;
      tempo: number | null;
      key_sig: string | null;
      scale: string | null;
      node_count: number;
      connection_count: number;
      downloads: number;
      rating_sum: number;
      rating_count: number;
      patch_json: string;
    };

    let parsedTags: string[] = [];
    try { parsedTags = JSON.parse(data.tags); } catch { /* ignore */ }

    console.log(`\n  ♪ ${data.name} (${slug})`);
    console.log(`  ─────────────────────────`);
    console.log(`  ${data.description}`);
    console.log(`  by ${data.author} · v${data.version}`);
    console.log(`  ${data.node_count} nodes, ${data.connection_count} connections`);
    if (data.tempo) console.log(`  ${data.tempo} BPM, ${data.key_sig || '?'} ${data.scale || ''}`);
    console.log(`  ${data.downloads} downloads`);
    if (data.rating_count > 0) {
      console.log(`  Rating: ${(data.rating_sum / data.rating_count).toFixed(1)}/5 (${data.rating_count} ratings)`);
    }
    if (parsedTags.length > 0) console.log(`  Tags: ${parsedTags.join(', ')}`);

    // Show node types from patch JSON
    try {
      const patch = JSON.parse(data.patch_json);
      const types: Record<string, number> = {};
      for (const n of patch.nodes || []) {
        types[n.type] = (types[n.type] || 0) + 1;
      }
      console.log(`\n  Nodes:`);
      for (const [type, count] of Object.entries(types)) {
        console.log(`    ${type}: ${count}`);
      }
    } catch { /* ignore */ }

    console.log(`\n  Fork with: chord fork ${slug}`);
    console.log('');
  } catch (e) {
    console.error(`  Could not connect to community server at ${COMMUNITY_API}`);
  }
}

main().catch(console.error);
