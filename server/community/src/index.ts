/**
 * Chord Community Library Server
 *
 * REST API for patch sharing, discovery, and collaboration.
 * SQLite-backed, deployable to Railway / Render / Fly.io.
 *
 * Usage:
 *   npm run dev     — development with hot reload
 *   npm run build   — compile TypeScript
 *   npm start       — production
 *   npm run seed    — populate with starter patches
 */

import express from 'express';
import cors from 'cors';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db/client.js';
import { rateLimit } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import patchRoutes from './routes/patches.js';
import searchRoutes from './routes/search.js';
import forkRoutes from './routes/fork.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists
mkdirSync(join(__dirname, '../data'), { recursive: true });

// Initialize database
initDb();

const app = express();
const PORT = parseInt(process.env.PORT || '3847');

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit(100, 60 * 1000)); // 100 req/min global

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/patches', patchRoutes);
app.use('/api/patches', forkRoutes); // fork and rate are sub-routes of patches
app.use('/api/search', searchRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'chord-community' });
});

// Root
app.get('/', (_req, res) => {
  res.json({
    name: 'Chord Community Library',
    version: '0.1.0',
    endpoints: {
      search: 'GET /api/search?q=...',
      patches: 'GET /api/patches',
      patch: 'GET /api/patches/:slug',
      publish: 'POST /api/patches',
      fork: 'POST /api/patches/:slug/fork',
      rate: 'POST /api/patches/:slug/rate',
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
    },
  });
});

app.listen(PORT, () => {
  console.log(`♪ Chord Community Server listening on port ${PORT}`);
  console.log(`  http://localhost:${PORT}`);
});

export default app;
