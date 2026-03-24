/**
 * Search routes.
 */

import { Router, Request, Response } from 'express';
import { searchPatches, type SearchParams } from '../services/search.js';

const router = Router();

// GET /api/search
router.get('/', (req: Request, res: Response) => {
  const params: SearchParams = {
    query: req.query.q as string | undefined,
    category: req.query.category as string | undefined,
    minTempo: req.query.minTempo ? parseInt(req.query.minTempo as string) : undefined,
    maxTempo: req.query.maxTempo ? parseInt(req.query.maxTempo as string) : undefined,
    key: req.query.key as string | undefined,
    minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
    sort: req.query.sort as SearchParams['sort'] | undefined,
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
    pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
  };

  const result = searchPatches(params);

  // Transform for API response
  const patches = result.patches.map(p => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
    author: p.username || 'anonymous',
    version: p.version,
    category: p.category,
    tags: JSON.parse(p.tags || '[]'),
    tempo: p.tempo,
    key: p.key_sig,
    nodeCount: p.node_count,
    downloads: p.downloads,
    rating: p.rating_count > 0 ? p.rating_sum / p.rating_count : 0,
    ratingCount: p.rating_count,
    createdAt: p.created_at,
  }));

  res.json({
    patches,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
});

export default router;
