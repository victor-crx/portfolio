PRAGMA foreign_keys = ON;

ALTER TABLE inquiries ADD COLUMN assigned_to_email TEXT;
ALTER TABLE inquiries ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE inquiries SET updated_at = created_at WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS inquiry_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL,
  note_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_email TEXT NOT NULL,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_to_email ON inquiries(assigned_to_email);
CREATE INDEX IF NOT EXISTS idx_inquiries_updated_at ON inquiries(updated_at);
CREATE INDEX IF NOT EXISTS idx_inquiry_notes_inquiry_id ON inquiry_notes(inquiry_id);
