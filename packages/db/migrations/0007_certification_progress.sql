PRAGMA foreign_keys = ON;

ALTER TABLE certifications ADD COLUMN progress_state TEXT NOT NULL DEFAULT 'planned';
ALTER TABLE certifications ADD COLUMN target_date TEXT;

CREATE INDEX IF NOT EXISTS idx_certifications_progress_state ON certifications(progress_state);
CREATE INDEX IF NOT EXISTS idx_certifications_target_date ON certifications(target_date);
