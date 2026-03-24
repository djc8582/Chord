-- Chord Community Library Database Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'studio')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patches (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  author_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  version TEXT NOT NULL DEFAULT '1.0.0',
  patch_json TEXT NOT NULL,
  readme TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  category TEXT DEFAULT 'other',
  tempo REAL,
  key_sig TEXT,
  scale TEXT,
  node_count INTEGER DEFAULT 0,
  connection_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT 1,
  license TEXT DEFAULT 'CC-BY-4.0',
  downloads INTEGER DEFAULT 0,
  forks INTEGER DEFAULT 0,
  rating_sum INTEGER DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  forked_from TEXT REFERENCES patches(id),
  validated BOOLEAN DEFAULT 0,
  validation_report TEXT,
  preview_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patch_versions (
  id TEXT PRIMARY KEY,
  patch_id TEXT REFERENCES patches(id),
  version TEXT NOT NULL,
  patch_json TEXT NOT NULL,
  changelog TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ratings (
  user_id TEXT REFERENCES users(id),
  patch_id TEXT REFERENCES patches(id),
  score INTEGER CHECK (score >= 1 AND score <= 5),
  review TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, patch_id)
);

CREATE TABLE IF NOT EXISTS forks (
  id TEXT PRIMARY KEY,
  source_patch_id TEXT REFERENCES patches(id),
  forked_patch_id TEXT REFERENCES patches(id),
  source_version TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patches_slug ON patches(slug);
CREATE INDEX IF NOT EXISTS idx_patches_category ON patches(category);
CREATE INDEX IF NOT EXISTS idx_patches_author ON patches(author_id);
CREATE INDEX IF NOT EXISTS idx_patches_downloads ON patches(downloads DESC);
