/**
 * Auth routes — register and login.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { signToken } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { createHash } from 'crypto';

const router = Router();

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

const RegisterSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(8),
});

const LoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// POST /api/auth/register
router.post('/register', rateLimit(5, 60 * 1000), (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    return;
  }

  const { username, email, password } = parsed.data;
  const db = getDb();

  // Check if username or email already exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    res.status(409).json({ error: 'Username or email already taken' });
    return;
  }

  const id = uuid();
  const passwordHash = hashPassword(password);

  db.prepare(
    'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)'
  ).run(id, username, email, passwordHash);

  const token = signToken({ userId: id, username });

  res.status(201).json({ token, user: { id, username, email, tier: 'free' } });
});

// POST /api/auth/login
router.post('/login', rateLimit(10, 60 * 1000), (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const { username, password } = parsed.data;
  const db = getDb();
  const passwordHash = hashPassword(password);

  const user = db.prepare(
    'SELECT id, username, email, tier FROM users WHERE username = ? AND password_hash = ?'
  ).get(username, passwordHash) as { id: string; username: string; email: string; tier: string } | undefined;

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = signToken({ userId: user.id, username: user.username });

  res.json({ token, user });
});

export default router;
