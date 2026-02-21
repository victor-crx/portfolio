PRAGMA foreign_keys = ON;

-- Ensure expected role values and default admin account for Access-based auth.
UPDATE users SET role = 'admin' WHERE role IS NULL OR role NOT IN ('admin', 'reviewer');

INSERT INTO users (email, display_name, password_hash, role, is_active, created_at, updated_at)
SELECT 'microsoft@vrstech.dev', 'VRS Tech Admin', 'cloudflare-access', 'admin', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'microsoft@vrstech.dev');

UPDATE users
SET role = 'admin', is_active = 1, updated_at = CURRENT_TIMESTAMP
WHERE email = 'microsoft@vrstech.dev';
