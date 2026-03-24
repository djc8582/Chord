/**
 * Fork routes — fork a community patch.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// POST /api/patches/:slug/fork
router.post('/:slug/fork', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const source = db.prepare(`
    SELECT id, slug, name, description, patch_json, version, category, tags,
           tempo, key_sig, scale, node_count, connection_count
    FROM patches WHERE slug = ? AND is_public = 1
  `).get(req.params.slug) as any;

  if (!source) {
    res.status(404).json({ error: 'Patch not found' });
    return;
  }

  const forkName = req.body.name || `${source.name}-fork`;
  const forkSlug = `${source.category}/${forkName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  // Check for slug conflict
  const existing = db.prepare('SELECT id FROM patches WHERE slug = ?').get(forkSlug);
  if (existing) {
    res.status(409).json({ error: `Slug ${forkSlug} already exists. Choose a different name.` });
    return;
  }

  const forkId = uuid();

  db.prepare(`
    INSERT INTO patches (id, slug, author_id, name, description, version, patch_json,
                         tags, category, tempo, key_sig, scale,
                         node_count, connection_count, forked_from, validated)
    VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    forkId, forkSlug, req.user!.userId, forkName,
    req.body.description || `Forked from ${source.slug}`,
    source.patch_json, source.tags, source.category,
    source.tempo, source.key_sig, source.scale,
    source.node_count, source.connection_count, source.id
  );

  // Record the fork
  db.prepare(
    'INSERT INTO forks (id, source_patch_id, forked_patch_id, source_version) VALUES (?, ?, ?, ?)'
  ).run(uuid(), source.id, forkId, source.version);

  // Increment fork count on source
  db.prepare('UPDATE patches SET forks = forks + 1 WHERE id = ?').run(source.id);

  res.status(201).json({
    slug: forkSlug,
    id: forkId,
    forkedFrom: source.slug,
    patchJson: source.patch_json,
  });
});

// POST /api/patches/:slug/rate
router.post('/:slug/rate', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const { score, review } = req.body;

  if (!score || score < 1 || score > 5) {
    res.status(400).json({ error: 'Score must be 1-5' });
    return;
  }

  const patch = db.prepare('SELECT id FROM patches WHERE slug = ? AND is_public = 1').get(req.params.slug) as any;
  if (!patch) {
    res.status(404).json({ error: 'Patch not found' });
    return;
  }

  // Upsert rating
  const existing = db.prepare(
    'SELECT score FROM ratings WHERE user_id = ? AND patch_id = ?'
  ).get(req.user!.userId, patch.id) as any;

  if (existing) {
    const scoreDiff = score - existing.score;
    db.prepare('UPDATE ratings SET score = ?, review = ? WHERE user_id = ? AND patch_id = ?')
      .run(score, review || '', req.user!.userId, patch.id);
    db.prepare('UPDATE patches SET rating_sum = rating_sum + ? WHERE id = ?')
      .run(scoreDiff, patch.id);
  } else {
    db.prepare('INSERT INTO ratings (user_id, patch_id, score, review) VALUES (?, ?, ?, ?)')
      .run(req.user!.userId, patch.id, score, review || '');
    db.prepare('UPDATE patches SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE id = ?')
      .run(score, patch.id);
  }

  res.json({ rated: true });
});

export default router;
