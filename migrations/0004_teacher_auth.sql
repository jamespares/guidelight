-- Teacher email verification + auth tokens (verify / magic link / password reset)

ALTER TABLE teachers ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teachers ADD COLUMN email_verified_at TEXT;

-- Existing accounts already logged in before verification was required
UPDATE teachers SET email_verified = 1, email_verified_at = datetime('now')
WHERE email_verified = 0;

CREATE TABLE auth_tokens (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'magic_link', 'password_reset')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX idx_auth_tokens_teacher_purpose ON auth_tokens(teacher_id, purpose, created_at);
