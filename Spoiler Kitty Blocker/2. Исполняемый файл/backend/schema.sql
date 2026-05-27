PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS settings (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  severity INTEGER NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phrase TEXT NOT NULL,
  normalized_phrase TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'mixed',
  kind TEXT NOT NULL DEFAULT 'phrase' CHECK (kind IN ('word', 'phrase', 'name')),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  scanned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  replacements_count INTEGER NOT NULL DEFAULT 0 CHECK (replacements_count >= 0),
  blocks_count INTEGER NOT NULL DEFAULT 0 CHECK (blocks_count >= 0),
  inline_count INTEGER NOT NULL DEFAULT 0 CHECK (inline_count >= 0),
  images_count INTEGER NOT NULL DEFAULT 0 CHECK (images_count >= 0)
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  keyword_id INTEGER REFERENCES keywords(id) ON DELETE SET NULL,
  matched_text TEXT NOT NULL,
  normalized_match TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT 'content',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE VIEW IF NOT EXISTS active_keywords AS
SELECT
  k.id,
  k.phrase,
  k.normalized_phrase,
  k.language,
  k.kind,
  c.title AS category,
  c.severity
FROM keywords k
LEFT JOIN categories c ON c.id = k.category_id
WHERE k.active = 1;

CREATE INDEX IF NOT EXISTS idx_keywords_normalized ON keywords(normalized_phrase);
CREATE INDEX IF NOT EXISTS idx_keywords_active ON keywords(active);
CREATE INDEX IF NOT EXISTS idx_scans_page_time ON scans(page_id, scanned_at);
CREATE INDEX IF NOT EXISTS idx_matches_keyword ON matches(keyword_id);
CREATE INDEX IF NOT EXISTS idx_matches_text ON matches(normalized_match);
