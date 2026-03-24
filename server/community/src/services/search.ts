/**
 * Search service — full-text + filter search over patches.
 * Uses SQLite FTS for text search with additional column filters.
 */

import { getDb } from '../db/client.js';

export interface SearchParams {
  query?: string;
  category?: string;
  minTempo?: number;
  maxTempo?: number;
  key?: string;
  minRating?: number;
  sort?: 'downloads' | 'rating' | 'newest' | 'name';
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  patches: PatchRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface PatchRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  author_id: string;
  version: string;
  category: string;
  tags: string;
  tempo: number | null;
  key_sig: string | null;
  node_count: number;
  connection_count: number;
  downloads: number;
  rating_sum: number;
  rating_count: number;
  created_at: string;
  username?: string;
}

export function searchPatches(params: SearchParams): SearchResult {
  const db = getDb();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));

  const conditions: string[] = ['p.is_public = 1'];
  const bindings: unknown[] = [];

  if (params.query) {
    conditions.push("(p.name LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)");
    const like = `%${params.query}%`;
    bindings.push(like, like, like);
  }

  if (params.category) {
    conditions.push('p.category = ?');
    bindings.push(params.category);
  }

  if (params.minTempo != null) {
    conditions.push('p.tempo >= ?');
    bindings.push(params.minTempo);
  }

  if (params.maxTempo != null) {
    conditions.push('p.tempo <= ?');
    bindings.push(params.maxTempo);
  }

  if (params.key) {
    conditions.push('p.key_sig = ?');
    bindings.push(params.key);
  }

  if (params.minRating != null) {
    conditions.push('(CASE WHEN p.rating_count > 0 THEN CAST(p.rating_sum AS REAL) / p.rating_count ELSE 0 END) >= ?');
    bindings.push(params.minRating);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let orderBy: string;
  switch (params.sort) {
    case 'downloads': orderBy = 'p.downloads DESC'; break;
    case 'rating': orderBy = 'CASE WHEN p.rating_count > 0 THEN CAST(p.rating_sum AS REAL) / p.rating_count ELSE 0 END DESC'; break;
    case 'name': orderBy = 'p.name ASC'; break;
    case 'newest':
    default: orderBy = 'p.created_at DESC'; break;
  }

  // Count total
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM patches p ${where}`);
  const { total } = countStmt.get(...bindings) as { total: number };

  // Fetch page
  const offset = (page - 1) * pageSize;
  const stmt = db.prepare(`
    SELECT p.*, u.username
    FROM patches p
    LEFT JOIN users u ON p.author_id = u.id
    ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `);
  const patches = stmt.all(...bindings, pageSize, offset) as PatchRow[];

  return { patches, total, page, pageSize };
}
