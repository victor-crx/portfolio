PRAGMA foreign_keys = ON;

ALTER TABLE media_assets RENAME TO media_assets_legacy;

CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  alt_text TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO media_assets (id, key, public_url, mime_type, size_bytes, alt_text, visibility, created_at, updated_at)
SELECT
  id,
  path,
  path,
  CASE
    WHEN LOWER(path) LIKE '%.jpg' OR LOWER(path) LIKE '%.jpeg' THEN 'image/jpeg'
    WHEN LOWER(path) LIKE '%.png' THEN 'image/png'
    WHEN LOWER(path) LIKE '%.webp' THEN 'image/webp'
    WHEN LOWER(path) LIKE '%.pdf' THEN 'application/pdf'
    ELSE 'application/octet-stream'
  END,
  0,
  label,
  'public',
  created_at,
  created_at
FROM media_assets_legacy;

DROP TABLE media_assets_legacy;

CREATE INDEX IF NOT EXISTS idx_media_assets_visibility ON media_assets(visibility);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at);
