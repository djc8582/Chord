/**
 * Patch CRUD routes.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validatePatch } from '../services/validation.js';

const router = Router();

const PublishSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional().default(''),
  patchJson: z.string(),
  tags: z.array(z.string()).optional().default([]),
  category: z.string().optional().default('other'),
  readme: z.string().optional().default(''),
  license: z.string().optional().default('CC-BY-4.0'),
});

// GET /api/patches — List patches (paginated)
router.get('/', optionalAuth, (req: Request, res: Response) => {
  const db = getDb();
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
  const offset = (page - 1) * pageSize;

  const { total } = db.prepare('SELECT COUNT(*) as total FROM patches WHERE is_public = 1').get() as { total: number };

  const patches = db.prepare(`
    SELECT p.id, p.slug, p.name, p.description, p.version, p.category, p.tags,
           p.tempo, p.key_sig, p.node_count, p.connection_count, p.downloads,
           p.rating_sum, p.rating_count, p.created_at, u.username as author
    FROM patches p
    LEFT JOIN users u ON p.author_id = u.id
    WHERE p.is_public = 1
    ORDER BY p.downloads DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, offset);

  res.json({ patches, total, page, pageSize });
});

// GET /api/patches/:slug — Get patch detail
router.get('/:slug', optionalAuth, (req: Request, res: Response) => {
  const db = getDb();
  const patch = db.prepare(`
    SELECT p.*, u.username as author
    FROM patches p
    LEFT JOIN users u ON p.author_id = u.id
    WHERE p.slug = ? AND p.is_public = 1
  `).get(req.params.slug);

  if (!patch) {
    res.status(404).json({ error: 'Patch not found' });
    return;
  }

  // Increment download count
  db.prepare('UPDATE patches SET downloads = downloads + 1 WHERE slug = ?').run(req.params.slug);

  // Get versions
  const versions = db.prepare(
    'SELECT version, changelog, created_at FROM patch_versions WHERE patch_id = ? ORDER BY created_at DESC'
  ).all((patch as any).id);

  res.json({ ...patch, versions });
});

// POST /api/patches — Publish a new patch
router.post('/', requireAuth, (req: Request, res: Response) => {
  const parsed = PublishSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    return;
  }

  const { name, description, patchJson, tags, category, readme, license } = parsed.data;

  // Validate the patch
  const validation = validatePatch(patchJson);
  if (!validation.valid) {
    res.status(400).json({
      error: 'Patch validation failed',
      validationErrors: validation.errors,
      warnings: validation.warnings,
    });
    return;
  }

  const db = getDb();
  const slug = `${category}/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

  // Check if slug exists
  const existing = db.prepare('SELECT id FROM patches WHERE slug = ?').get(slug);
  if (existing) {
    res.status(409).json({ error: `Patch ${slug} already exists` });
    return;
  }

  let patchData: any;
  try {
    patchData = JSON.parse(patchJson);
  } catch {
    res.status(400).json({ error: 'Invalid patch JSON' });
    return;
  }

  const id = uuid();
  db.prepare(`
    INSERT INTO patches (id, slug, author_id, name, description, version, patch_json,
                         readme, tags, category, tempo, key_sig, scale,
                         node_count, connection_count, license, validated, validation_report)
    VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    id, slug, req.user!.userId, name, description, patchJson,
    readme, JSON.stringify(tags), category,
    patchData.tempo || null, patchData.key || null, patchData.scale || null,
    validation.nodeCount, validation.connectionCount, license,
    JSON.stringify({ errors: [], warnings: validation.warnings })
  );

  // Create initial version
  db.prepare(
    'INSERT INTO patch_versions (id, patch_id, version, patch_json, changelog) VALUES (?, ?, ?, ?, ?)'
  ).run(uuid(), id, '1.0.0', patchJson, 'Initial release');

  res.status(201).json({ slug, id, validation: { warnings: validation.warnings } });
});

// PUT /api/patches/:slug — Update a patch
router.put('/:slug', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const patch = db.prepare('SELECT id, author_id, version FROM patches WHERE slug = ?').get(req.params.slug) as any;

  if (!patch) {
    res.status(404).json({ error: 'Patch not found' });
    return;
  }

  if (patch.author_id !== req.user!.userId) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  const { patchJson, description, changelog } = req.body;

  if (patchJson) {
    const validation = validatePatch(patchJson);
    if (!validation.valid) {
      res.status(400).json({ error: 'Patch validation failed', validationErrors: validation.errors });
      return;
    }

    // Bump version
    const parts = patch.version.split('.').map(Number);
    parts[2]++;
    const newVersion = parts.join('.');

    db.prepare(`
      UPDATE patches SET patch_json = ?, version = ?, node_count = ?, connection_count = ?,
                         validated = 1, updated_at = datetime('now')
      WHERE slug = ?
    `).run(patchJson, newVersion, validation.nodeCount, validation.connectionCount, req.params.slug);

    db.prepare(
      'INSERT INTO patch_versions (id, patch_id, version, patch_json, changelog) VALUES (?, ?, ?, ?, ?)'
    ).run(uuid(), patch.id, newVersion, patchJson, changelog || '');
  }

  if (description !== undefined) {
    db.prepare("UPDATE patches SET description = ?, updated_at = datetime('now') WHERE slug = ?")
      .run(description, req.params.slug);
  }

  res.json({ updated: true });
});

// DELETE /api/patches/:slug — Unpublish
router.delete('/:slug', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const patch = db.prepare('SELECT author_id FROM patches WHERE slug = ?').get(req.params.slug) as any;

  if (!patch) {
    res.status(404).json({ error: 'Patch not found' });
    return;
  }

  if (patch.author_id !== req.user!.userId) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  db.prepare('UPDATE patches SET is_public = 0 WHERE slug = ?').run(req.params.slug);
  res.json({ unpublished: true });
});

export default router;
