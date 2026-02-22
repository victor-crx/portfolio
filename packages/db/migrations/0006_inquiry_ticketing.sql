PRAGMA foreign_keys = ON;

-- D1/SQLite cannot add a column with non-constant DEFAULT (like CURRENT_TIMESTAMP) via ALTER TABLE.
-- Add columns with no default, then backfill.

ALTER TABLE inquiries ADD COLUMN assigned_to_email TEXT;
ALTER TABLE inquiries ADD COLUMN updated_at TEXT;

-- Backfill updated_at for existing rows
UPDATE inquiries
SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS inquiry_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL,
  note_text TEXT NOT NULL,
  actor_email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inquiries_status_created_at ON inquiries(status, created_at);
CREATE INDEX IF NOT EXISTS idx_inquiries_type_created_at ON inquiries(inquiry_type, created_at);
CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_to_email ON inquiries(assigned_to_email);
CREATE INDEX IF NOT EXISTS idx_inquiry_notes_inquiry_id_created_at ON inquiry_notes(inquiry_id, created_at);