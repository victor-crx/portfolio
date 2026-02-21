PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  type TEXT NOT NULL,
  project_date TEXT,
  collections_json TEXT NOT NULL DEFAULT '[]',
  problem TEXT,
  constraints_text TEXT,
  actions_json TEXT NOT NULL DEFAULT '[]',
  results_json TEXT NOT NULL DEFAULT '[]',
  next_steps_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  featured_order INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_tags (
  project_id TEXT NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (project_id, tag_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_tools (
  project_id TEXT NOT NULL,
  tool_id INTEGER NOT NULL,
  PRIMARY KEY (project_id, tool_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_type TEXT NOT NULL,
  label TEXT,
  path TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_media (
  project_id TEXT NOT NULL,
  media_asset_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'artifact',
  PRIMARY KEY (project_id, media_asset_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  featured_order INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS certifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  issuer TEXT,
  credential_id TEXT,
  credential_url TEXT,
  issued_on TEXT,
  expires_on TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  featured_order INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS labs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  published_on TEXT,
  published_at TEXT,
  featured_order INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS site_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  block_key TEXT NOT NULL,
  title TEXT,
  body TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  featured_order INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (page, block_key)
);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_type TEXT NOT NULL,
  name TEXT,
  email TEXT,
  subject TEXT,
  message TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  source TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
CREATE INDEX IF NOT EXISTS idx_projects_date ON projects(project_date);
CREATE INDEX IF NOT EXISTS idx_services_slug ON services(slug);
CREATE INDEX IF NOT EXISTS idx_site_blocks_page ON site_blocks(page);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
