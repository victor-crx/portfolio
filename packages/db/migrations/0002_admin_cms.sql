PRAGMA foreign_keys = ON;

-- projects
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE projects ADD COLUMN published_at TEXT;
ALTER TABLE projects ADD COLUMN featured_order INTEGER;

-- services
ALTER TABLE services ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE services ADD COLUMN published_at TEXT;
ALTER TABLE services ADD COLUMN featured_order INTEGER;

-- certifications
ALTER TABLE certifications ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE certifications ADD COLUMN published_at TEXT;
ALTER TABLE certifications ADD COLUMN featured_order INTEGER;

-- labs
ALTER TABLE labs ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE labs ADD COLUMN published_at TEXT;
ALTER TABLE labs ADD COLUMN featured_order INTEGER;

-- site_blocks
ALTER TABLE site_blocks ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE site_blocks ADD COLUMN published_at TEXT;
ALTER TABLE site_blocks ADD COLUMN featured_order INTEGER;