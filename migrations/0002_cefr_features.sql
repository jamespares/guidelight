-- CEFR features: english_level + reading_speed assessments, RSVP, stories support tables.

-- Widen tasks.subtype CHECK (SQLite requires recreate).
CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('homework', 'assessment')),
  subtype TEXT CHECK (
    subtype IN ('diagnostic', 'formative', 'summative', 'english_level', 'reading_speed')
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
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES teachers(id) ON DELETE CASCADE
);

INSERT INTO tasks_new (
  id, type, subtype, class_id, subject, title, description, difficulty,
  status, time_limit_seconds, content_json, reading_text, past_paper_text,
  created_by, created_at, published_at
)
SELECT
  id, type, subtype, class_id, subject, title, description, difficulty,
  status, time_limit_seconds, content_json, reading_text, past_paper_text,
  created_by, created_at, published_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_class ON tasks(class_id);

ALTER TABLE students ADD COLUMN cefr_level TEXT;
ALTER TABLE students ADD COLUMN latest_wpm INTEGER;

CREATE TABLE reading_materials (
  id TEXT PRIMARY KEY,
  teacher_id TEXT,
  class_id TEXT NOT NULL,
  student_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX idx_reading_materials_class ON reading_materials(class_id);
CREATE INDEX idx_reading_materials_student ON reading_materials(student_id);

CREATE TABLE reading_speed_attempts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  material_id TEXT,
  attempt_id TEXT,
  wpm INTEGER NOT NULL DEFAULT 0,
  word_count INTEGER NOT NULL,
  duration_seconds INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'rejected')),
  checks_correct INTEGER,
  checks_total INTEGER,
  flagged INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_reading_speed_attempts_student ON reading_speed_attempts(student_id);
CREATE INDEX idx_reading_speed_attempts_task ON reading_speed_attempts(task_id);

CREATE TABLE reading_machine_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  wpm_setting INTEGER NOT NULL,
  words_read INTEGER NOT NULL,
  word_count INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES reading_materials(id) ON DELETE CASCADE
);

CREATE INDEX idx_reading_machine_sessions_student ON reading_machine_sessions(student_id);

CREATE TABLE cefr_tests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  task_id TEXT,
  attempt_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'expired')),
  item_ids TEXT NOT NULL,
  form_index INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  time_limit_seconds INTEGER NOT NULL,
  total_score INTEGER,
  max_score INTEGER,
  cefr_level TEXT,
  over_time_seconds INTEGER,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX idx_cefr_tests_student ON cefr_tests(student_id);
CREATE INDEX idx_cefr_tests_task ON cefr_tests(task_id);

CREATE TABLE cefr_test_responses (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_level TEXT NOT NULL,
  item_skill TEXT NOT NULL,
  item_type TEXT NOT NULL,
  response TEXT NOT NULL,
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (test_id) REFERENCES cefr_tests(id) ON DELETE CASCADE
);

CREATE INDEX idx_cefr_responses_test ON cefr_test_responses(test_id);

CREATE TABLE cefr_written_marks (
  id TEXT PRIMARY KEY,
  response_id TEXT NOT NULL UNIQUE,
  ai_score INTEGER NOT NULL,
  ai_max INTEGER NOT NULL,
  feedback TEXT NOT NULL DEFAULT '',
  keyword_score INTEGER NOT NULL,
  model TEXT NOT NULL,
  marked_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (response_id) REFERENCES cefr_test_responses(id) ON DELETE CASCADE
);

CREATE TABLE story_events (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  story_slug TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('open', 'play')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX idx_story_events_student ON story_events(student_id);
