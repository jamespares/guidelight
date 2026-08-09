-- Exam profiles + mock_exam assessment subtype

CREATE TABLE exam_profiles (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  curriculum TEXT NOT NULL DEFAULT '',
  syllabus_code TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER,
  exam_format_json TEXT NOT NULL DEFAULT '{}',
  grade_boundaries_json TEXT NOT NULL DEFAULT '[]',
  rubric_json TEXT NOT NULL DEFAULT '{}',
  reference_past_paper_text TEXT NOT NULL DEFAULT '',
  source_file_name TEXT NOT NULL DEFAULT '',
  pass_grade TEXT NOT NULL DEFAULT '',
  target_grade TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE INDEX idx_exam_profiles_class ON exam_profiles(class_id);

-- Widen tasks.subtype CHECK and add exam_profile_id (SQLite requires recreate).
CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('homework', 'assessment')),
  subtype TEXT CHECK (
    subtype IN ('diagnostic', 'formative', 'summative', 'english_level', 'reading_speed', 'mock_exam')
    OR subtype IS NULL
  ),
  class_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  time_limit_seconds INTEGER,
  content_json TEXT NOT NULL DEFAULT '{}',
  reading_text TEXT NOT NULL DEFAULT '',
  past_paper_text TEXT NOT NULL DEFAULT '',
  exam_profile_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_profile_id) REFERENCES exam_profiles(id) ON DELETE SET NULL
);

INSERT INTO tasks_new (
  id, type, subtype, class_id, subject, title, description, difficulty,
  status, time_limit_seconds, content_json, reading_text, past_paper_text,
  exam_profile_id, created_by, created_at, published_at
)
SELECT
  id, type, subtype, class_id, subject, title, description, difficulty,
  status, time_limit_seconds, content_json, reading_text, past_paper_text,
  NULL, created_by, created_at, published_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_class ON tasks(class_id);
CREATE INDEX idx_tasks_exam_profile ON tasks(exam_profile_id);
