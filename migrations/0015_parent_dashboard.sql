-- Parent dashboard credentials stored on the student row.
-- Teachers generate/reset parent access from the student detail page.

-- SQLite cannot add a UNIQUE column directly, so add the column then create a unique index.
ALTER TABLE students ADD COLUMN parent_username TEXT COLLATE NOCASE;
ALTER TABLE students ADD COLUMN parent_password_hash TEXT;

CREATE UNIQUE INDEX idx_students_parent_username ON students(parent_username);

-- SQLite cannot alter a CHECK constraint, so recreate sessions to allow the new 'parent' role.
CREATE TABLE sessions_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student', 'parent')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO sessions_new SELECT * FROM sessions;
DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;

CREATE INDEX idx_sessions_user ON sessions(user_id);
